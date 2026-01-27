import { analyzeRequest } from "./request-analyzer";
import { selectCategoryWithBudget } from "./category-selector";
import { selectSkillsEnhanced } from "./skill-selector";
import {
  getSessionState,
  updateSessionState,
  isFollowUpQuery,
  applyContextBoost,
} from "./session-state";
import { OrchestrationRequest, OrchestrationResult } from "./types";
import { db as prisma } from "../db/client";
import { logger } from "../utils/logger";
import { metrics, measureTime } from "../utils/metrics";
import { getActiveMCPConnections } from "../services/mcp-registry";
import { delegateTask } from "./delegate-task";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import {
  calculateActualCostCents,
  checkBudgetSufficient,
  getBudgetRemaining,
  isBudgetExhausted,
  updateSpend,
} from "../services/budget-enforcer";
import { recordBudgetDowngrade, recordBudgetRejection, recordAiRequest } from "../services/metrics";

const tracer = trace.getTracer("orchestrator");

export async function orchestrate(request: OrchestrationRequest): Promise<OrchestrationResult> {
  return await tracer.startActiveSpan("orchestrator.orchestrate", async (span) => {
    const { userRequest, sessionId, organizationId, userId } = request;
    const environment = process.env.NODE_ENV || "development";

    try {
      span.setAttribute("organization.id", organizationId);
      span.setAttribute("user.id", userId);
      span.setAttribute("environment", environment);
      span.setAttribute("request.type", "orchestrate");
      span.setAttribute("request.length", userRequest.length);

      logger.info("Orchestration started", {
        sessionId,
        organizationId,
        userId,
        requestLength: userRequest.length,
      });

      metrics.increment("orchestration.started", {
        organizationId,
      });

      const sessionState = await getSessionState(sessionId);
      const isFollowUp = isFollowUpQuery(userRequest);

      const analysis = await tracer.startActiveSpan(
        "orchestrator.analyze_request",
        async (analysisSpan) => {
          try {
            const result = await measureTime("orchestration.analysis", () =>
              analyzeRequest(userRequest),
            );
            analysisSpan.setAttribute("intent", result.intent);
            analysisSpan.setAttribute("complexity", result.complexity);
            return result;
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error";
            analysisSpan.recordException(error as Error);
            analysisSpan.setStatus({ code: SpanStatusCode.ERROR, message });
            throw error;
          } finally {
            analysisSpan.end();
          }
        },
      );

      const categorySelection = await tracer.startActiveSpan(
        "orchestrator.select_category",
        async (categorySpan) => {
          try {
            let selection = await selectCategoryWithBudget(organizationId, userRequest, analysis, {
              minConfidence: 0.7,
              enableLLM: true,
              enableCache: true,
            });

            if (isFollowUp) {
              const boostedConfidence = applyContextBoost(
                selection.confidence,
                sessionState,
                isFollowUp,
              );
              if (boostedConfidence !== selection.confidence) {
                logger.debug("Applied context boost", {
                  originalConfidence: selection.confidence,
                  boostedConfidence,
                  lastCategory: sessionState?.lastCategory,
                });
                selection = {
                  ...selection,
                  confidence: boostedConfidence,
                };
              }
            }

            categorySpan.setAttribute("category", selection.category);
            categorySpan.setAttribute("category.base", selection.baseCategory);
            categorySpan.setAttribute("confidence", selection.confidence);
            categorySpan.setAttribute("method", selection.method);
            categorySpan.setAttribute("budget.downgraded", selection.downgraded);
            return selection;
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error";
            categorySpan.recordException(error as Error);
            categorySpan.setStatus({ code: SpanStatusCode.ERROR, message });
            throw error;
          } finally {
            categorySpan.end();
          }
        },
      );

      const skillSelection = await tracer.startActiveSpan(
        "orchestrator.select_skills",
        async (skillSpan) => {
          try {
            const selection = selectSkillsEnhanced(userRequest, {
              minScore: 1,
              includeDependencies: true,
            });
            const skillsList = selection.skills;
            skillSpan.setAttribute("skills.count", skillsList.length);
            skillSpan.setAttribute("skills.names", skillsList.join(","));
            return selection;
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown error";
            skillSpan.recordException(error as Error);
            skillSpan.setStatus({ code: SpanStatusCode.ERROR, message });
            throw error;
          } finally {
            skillSpan.end();
          }
        },
      );

      const skills = skillSelection.skills;

      span.setAttribute("intent", analysis.intent);
      span.setAttribute("complexity", analysis.complexity);
      span.setAttribute("category", categorySelection.category);
      span.setAttribute("skills.names", skills.join(","));

      logger.debug("Request analyzed", {
        sessionDepth: sessionState?.conversationDepth || 0,
        isFollowUp,
        lastCategory: sessionState?.lastCategory,
        category: categorySelection.category,
        baseCategory: categorySelection.baseCategory,
        categoryDowngraded: categorySelection.downgraded,
        estimatedCostCents: categorySelection.estimatedCostCents,
        budgetRemainingCents: categorySelection.budgetRemainingCents,
        categoryConfidence: categorySelection.confidence,
        categoryMethod: categorySelection.method,
        categoryKeywords: categorySelection.matchedKeywords,
        skills: skillSelection.skills,
        skillScores: skillSelection.scores,
        skillDependencies: skillSelection.dependencies,
        skillConflicts: skillSelection.conflicts,
        intent: analysis.intent,
        complexity: analysis.complexity,
      });

      metrics.increment("orchestration.category_selected", {
        category: categorySelection.category,
        method: categorySelection.method,
      });

      metrics.histogram("orchestration.category_confidence", categorySelection.confidence, {
        category: categorySelection.category,
      });

      if (categorySelection.downgraded) {
        const reason = categorySelection.downgradeReason || "budget_threshold";
        recordBudgetDowngrade(organizationId, reason);
        logger.info("Category downgraded due to budget", {
          organizationId,
          baseCategory: categorySelection.baseCategory,
          downgradedCategory: categorySelection.category,
          reason,
          budgetRemainingCents: categorySelection.budgetRemainingCents,
          estimatedCostCents: categorySelection.estimatedCostCents,
        });
      }

      const mcpConnections = await getActiveMCPConnections(organizationId);

      const context = {
        availableMCPs: mcpConnections.map((conn) => ({
          provider: conn.provider,
          name: conn.name,
          enabled: conn.enabled,
        })),
        organizationId,
        userId,
      };

      // Decision: hard-block requests when budget is exhausted or estimated cost exceeds remaining.
      // Alerts are emitted via logs + metrics (no email notifications yet).
      const budgetRemaining = categorySelection.budgetRemainingCents;
      if (isBudgetExhausted(budgetRemaining)) {
        recordBudgetRejection(organizationId);
        logger.warn("Organization budget exhausted", {
          organizationId,
          budgetRemainingCents: budgetRemaining,
        });

        await saveExecution({
          organizationId,
          userId,
          sessionId,
          category: categorySelection.category,
          skills,
          prompt: userRequest,
          result: "Budget exhausted",
          status: "failed",
          duration: 0,
          metadata: {
            reason: "budget_exhausted",
            baseCategory: categorySelection.baseCategory,
            budgetRemainingCents: budgetRemaining,
            estimatedCostCents: categorySelection.estimatedCostCents,
          },
        });

        const failureResult: OrchestrationResult = {
          output: "Organization budget exhausted. Please increase your budget or try again later.",
          status: "failed",
          metadata: {
            category: categorySelection.category,
            skills,
            duration: 0,
            model: "none",
            sessionId,
          },
        };
        return failureResult;
      }

      const budgetSufficient = await checkBudgetSufficient(
        organizationId,
        categorySelection.estimatedCostCents,
      );

      if (!budgetSufficient) {
        recordBudgetRejection(organizationId);
        logger.warn("Insufficient budget for estimated cost", {
          organizationId,
          budgetRemainingCents: budgetRemaining,
          estimatedCostCents: categorySelection.estimatedCostCents,
        });

        await saveExecution({
          organizationId,
          userId,
          sessionId,
          category: categorySelection.category,
          skills,
          prompt: userRequest,
          result: "Insufficient budget",
          status: "failed",
          duration: 0,
          metadata: {
            reason: "budget_insufficient",
            baseCategory: categorySelection.baseCategory,
            budgetRemainingCents: budgetRemaining,
            estimatedCostCents: categorySelection.estimatedCostCents,
          },
        });

        const failureResult: OrchestrationResult = {
          output:
            "Insufficient organization budget for this request. Please adjust budget or retry with a smaller task.",
          status: "failed",
          metadata: {
            category: categorySelection.category,
            skills,
            duration: 0,
            model: "none",
            sessionId,
          },
        };
        return failureResult;
      }

      const result = await tracer.startActiveSpan("orchestrator.execute", async (execSpan) => {
        const startTime = Date.now();
        try {
          const execution = await delegateTask({
            category: categorySelection.category,
            load_skills: skills,
            prompt: userRequest,
            session_id: sessionId,
            organizationId,
            userId,
            context,
          });
          const duration = Date.now() - startTime;
          execSpan.setAttribute("result.status", execution.status);
          execSpan.setAttribute("result.duration", duration);
          return { execution, duration };
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : "Unknown error";
          execSpan.recordException(error as Error);
          execSpan.setStatus({ code: SpanStatusCode.ERROR, message });
          throw error;
        } finally {
          execSpan.end();
        }
      });

      await updateSessionState(sessionId, {
        lastCategory: categorySelection.category,
        lastIntent: analysis.intent,
        metadata: {
          lastSkills: skills,
          lastComplexity: analysis.complexity,
        },
      });

      const inputTokens = result.execution.metadata.inputTokens ?? 0;
      const outputTokens = result.execution.metadata.outputTokens ?? 0;
      if (
        Number.isFinite(inputTokens) &&
        Number.isFinite(outputTokens) &&
        result.execution.metadata.model
      ) {
        const actualCostCents = calculateActualCostCents(
          result.execution.metadata.model,
          inputTokens,
          outputTokens,
        );
        await updateSpend(organizationId, actualCostCents);
        await getBudgetRemaining(organizationId);

        recordAiRequest({
          model: result.execution.metadata.model,
          category: categorySelection.category,
          success: result.execution.status === "success",
          duration: result.duration,
          inputTokens,
          outputTokens,
        });
      }

      await saveExecution({
        organizationId,
        userId,
        sessionId,
        category: categorySelection.category,
        skills,
        prompt: userRequest,
        result: result.execution.output,
        status: result.execution.status,
        duration: result.duration,
        metadata: {
          ...result.execution.metadata,
          categoryConfidence: categorySelection.confidence,
          categoryMethod: categorySelection.method,
          sessionDepth: sessionState?.conversationDepth || 0,
          isFollowUp,
          baseCategory: categorySelection.baseCategory,
          downgraded: categorySelection.downgraded,
          downgradeReason: categorySelection.downgradeReason,
          budgetRemainingCents: categorySelection.budgetRemainingCents,
          estimatedCostCents: categorySelection.estimatedCostCents,
        },
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return {
        output: result.execution.output,
        status: result.execution.status,
        metadata: {
          category: categorySelection.category,
          skills,
          duration: result.duration,
          model: result.execution.metadata.model,
          sessionId,
        },
      };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : "Unknown error";
      span.recordException(error instanceof Error ? error : new Error(message));
      span.setStatus({ code: SpanStatusCode.ERROR, message });

      await saveExecution({
        organizationId: request.organizationId,
        userId: request.userId,
        sessionId: request.sessionId,
        category: "error",
        skills: [],
        prompt: request.userRequest,
        result: message,
        status: "failed",
        duration: 0,
        metadata: { error: error?.stack },
      });

      throw error;
    } finally {
      span.end();
    }
  });
}

export async function orchestrateMulti(
  request: OrchestrationRequest,
): Promise<OrchestrationResult> {
  const tasks = parseMultiAgentTasks(request.userRequest);

  const results = await Promise.all(
    tasks.map((task) =>
      orchestrate({
        ...request,
        userRequest: task,
      }),
    ),
  );

  return {
    output: results.map((r) => r.output).join("\n\n"),
    status: results.every((r) => r.status === "success") ? "success" : "failed",
    metadata: {
      category: "unspecified-high",
      skills: Array.from(new Set(results.flatMap((r) => r.metadata.skills))),
      duration: results.reduce((sum, r) => sum + r.metadata.duration, 0),
      model: results[0]?.metadata.model || "unknown",
      sessionId: request.sessionId,
    },
  };
}

function parseMultiAgentTasks(userRequest: string): string[] {
  const splitPatterns = [/하고.*해/, /그리고/, /and.*then/, /,/];

  for (const pattern of splitPatterns) {
    if (pattern.test(userRequest)) {
      return userRequest
        .split(pattern)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
  }

  return [userRequest];
}

async function saveExecution(data: any) {
  await prisma.orchestratorExecution.create({
    data: {
      organizationId: data.organizationId,
      userId: data.userId,
      sessionId: data.sessionId,
      category: data.category,
      skills: Array.isArray(data.skills) ? data.skills : [],
      status: data.status,
      duration: typeof data.duration === "number" ? data.duration : 0,
      inputData: {
        prompt: data.prompt,
      },
      outputData: {
        result: data.result,
      },
      errorMessage: data.error,
      metadata: data.metadata || {},
    },
  });
}
