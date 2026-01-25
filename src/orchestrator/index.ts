import { analyzeRequest } from "./request-analyzer";
import { selectCategory } from "./category-selector";
import { selectSkills } from "./skill-selector";
import { OrchestrationRequest, OrchestrationResult } from "./types";
import { db as prisma } from "../db/client";
import { logger } from "../utils/logger";
import { metrics, measureTime } from "../utils/metrics";
import { getActiveMCPConnections } from "../services/mcp-registry";

interface DelegateTaskParams {
  category: string;
  load_skills: string[];
  prompt: string;
  session_id: string;
  context?: Record<string, any>;
}

declare function delegate_task(params: DelegateTaskParams): Promise<any>;

export async function orchestrate(
  request: OrchestrationRequest,
): Promise<OrchestrationResult> {
  const { userRequest, sessionId, organizationId, userId } = request;

  logger.info("Orchestration started", {
    sessionId,
    organizationId,
    userId,
    requestLength: userRequest.length,
  });

  metrics.increment("orchestration.started", {
    organizationId,
  });

  try {
    const analysis = await measureTime("orchestration.analysis", () =>
      analyzeRequest(userRequest),
    );

    const category = selectCategory(userRequest, analysis);
    const skills = selectSkills(userRequest);

    logger.debug("Request analyzed", {
      category,
      skills,
      intent: analysis.intent,
      complexity: analysis.complexity,
    });

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

    const startTime = Date.now();
    const result = await delegate_task({
      category,
      load_skills: skills,
      prompt: userRequest,
      session_id: sessionId,
      context,
    });
    const duration = Date.now() - startTime;

    await saveExecution({
      organizationId,
      userId,
      sessionId,
      category,
      skills,
      prompt: userRequest,
      result: result.output,
      status: result.status,
      duration,
      metadata: result.metadata,
    });

    return {
      output: result.output,
      status: result.status,
      metadata: {
        category,
        skills,
        duration,
        model: result.metadata.model,
        sessionId,
      },
    };
  } catch (error: any) {
    await saveExecution({
      organizationId,
      userId,
      sessionId,
      category: "error",
      skills: [],
      prompt: userRequest,
      result: error.message,
      status: "failed",
      duration: 0,
      metadata: { error: error.stack },
    });

    throw error;
  }
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
  // Create a dummy workflow if needed for tracking orchestrator executions
  // In the future, this should reference an actual workflow or have a separate OrchestratorExecution table
  const dummyWorkflow = await prisma.workflow.findFirst({
    where: {
      organizationId: data.organizationId,
      name: "Slack Orchestrator (Auto-created)",
    },
  });

  let workflowId = dummyWorkflow?.id;

  if (!workflowId) {
    const newWorkflow = await prisma.workflow.create({
      data: {
        organizationId: data.organizationId,
        name: "Slack Orchestrator (Auto-created)",
        description:
          "Auto-created workflow for tracking orchestrator executions",
        config: {
          type: "orchestrator",
          source: "slack",
        },
        enabled: true,
      },
    });
    workflowId = newWorkflow.id;
  }

  await prisma.workflowExecution.create({
    data: {
      workflowId: workflowId,
      status: data.status,
      inputData: {
        prompt: data.prompt,
        organizationId: data.organizationId,
        userId: data.userId,
      },
      outputData: { result: data.result },
      startedAt: new Date(Date.now() - data.duration),
      completedAt: new Date(),
      errorMessage: data.error,
    },
  });
}
