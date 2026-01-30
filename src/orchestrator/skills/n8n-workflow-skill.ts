import { db } from "../../db/client";
import { logger } from "../../utils/logger";
import { n8nPermissionService } from "../../services/n8n/permission-service";
import type { RequestAnalysis } from "../types";

export interface WorkflowSkillInfo {
  workflowId: string;
  name: string;
  description: string;
  category: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface SkillContext {
  organizationId: string;
  userId: string;
  sessionId: string;
  userRequest: string;
  entities?: Record<string, unknown>;
}

export interface SkillResult {
  success: boolean;
  output: string;
  data?: Record<string, unknown>;
  executionId?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface AnalyzedRequest extends RequestAnalysis {
  intent: string;
  entities: {
    target?: string;
    action?: string;
    object?: string;
  };
  keywords: string[];
}

interface WorkflowRecord {
  id: string;
  name: string;
  description: string | null;
  category: string;
  tags: string[];
  workflowJson: unknown;
}

interface ExecutionRecord {
  id: string;
  status: string;
  outputData: unknown;
  errorMessage: string | null;
}

const WORKFLOW_KEYWORDS = [
  "workflow",
  "automation",
  "n8n",
  "run",
  "execute",
  "trigger",
  "워크플로우",
  "자동화",
  "실행",
];

const TERMINAL_STATUSES = ["success", "error", "canceled"];
const POLL_INTERVAL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 30000;

export class N8nWorkflowSkill {
  readonly name = "n8n-workflow";
  readonly description = "Execute n8n workflows registered as orchestrator skills";

  matches(request: AnalyzedRequest): boolean {
    const keywords = request.keywords.map((k) => k.toLowerCase());
    const intentLower = request.intent.toLowerCase();

    return (
      WORKFLOW_KEYWORDS.some((kw) => keywords.includes(kw)) ||
      WORKFLOW_KEYWORDS.some((kw) => intentLower.includes(kw))
    );
  }

  async execute(context: SkillContext): Promise<SkillResult> {
    const { organizationId, userId, userRequest, sessionId } = context;

    try {
      logger.info("N8n workflow skill invoked", {
        organizationId,
        userId,
        requestLength: userRequest.length,
      });

      const matchResult = await this.findMatchingWorkflow(organizationId, userRequest);

      if (!matchResult) {
        return {
          success: false,
          output: "No matching n8n workflow found for this request.",
          error: {
            code: "WORKFLOW_NOT_FOUND",
            message: "No registered n8n workflow matches the user request.",
          },
        };
      }

      const { workflow, matchType, score } = matchResult;

      logger.info("Matched n8n workflow", {
        workflowId: workflow.id,
        workflowName: workflow.name,
        matchType,
        score,
      });

      const hasPermission = await n8nPermissionService.checkPermission({
        userId,
        workflowId: workflow.id,
        permission: "execute",
      });

      if (!hasPermission) {
        return {
          success: false,
          output: `You do not have permission to execute the "${workflow.name}" workflow.`,
          error: {
            code: "PERMISSION_DENIED",
            message: `User ${userId} lacks execute permission for workflow ${workflow.id}.`,
          },
        };
      }

      const inputData = this.extractInputParameters(userRequest);

      const prismaClient = db as unknown as Record<string, unknown>;
      const n8nExecution = prismaClient.n8nExecution as {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
        findUnique: (args: {
          where: { id: string };
          select: Record<string, boolean>;
        }) => Promise<ExecutionRecord | null>;
      };

      const execution = await n8nExecution.create({
        data: {
          workflowId: workflow.id,
          n8nExecutionId: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          status: "waiting",
          mode: "manual",
          startedAt: new Date(),
          inputData,
          triggeredBy: userId,
        },
      });

      logger.info("N8n workflow execution started", {
        workflowId: workflow.id,
        executionId: execution.id,
        sessionId,
      });

      const result = await this.waitForCompletion(execution.id);

      if (result.status === "success") {
        return {
          success: true,
          output: `Workflow "${workflow.name}" executed successfully.`,
          data: result.outputData as Record<string, unknown> | undefined,
          executionId: execution.id,
        };
      } else if (result.status === "error") {
        return {
          success: false,
          output: `Workflow "${workflow.name}" failed: ${result.errorMessage || "Unknown error"}`,
          executionId: execution.id,
          error: {
            code: "EXECUTION_FAILED",
            message: result.errorMessage || "Workflow execution failed.",
          },
        };
      } else {
        return {
          success: true,
          output: `Workflow "${workflow.name}" is still running. Execution ID: ${execution.id}`,
          executionId: execution.id,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("N8n workflow skill execution failed", {
        error: errorMessage,
        organizationId,
      });

      return {
        success: false,
        output: "Failed to execute n8n workflow.",
        error: {
          code: "EXECUTION_ERROR",
          message: errorMessage,
        },
      };
    }
  }

  async getAvailableWorkflows(organizationId: string): Promise<WorkflowSkillInfo[]> {
    const prismaClient = db as unknown as Record<string, unknown>;
    const n8nWorkflow = prismaClient.n8nWorkflow as {
      findMany: (args: Record<string, unknown>) => Promise<WorkflowRecord[]>;
    };

    const workflows = await n8nWorkflow.findMany({
      where: {
        organizationId,
        isSkill: true,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        workflowJson: true,
      },
      orderBy: { name: "asc" },
    });

    return workflows.map((w: WorkflowRecord) => ({
      workflowId: w.id,
      name: w.name,
      description: w.description || "",
      category: w.category,
      inputSchema: this.extractInputSchema(w.workflowJson as Record<string, unknown>),
      outputSchema: this.extractOutputSchema(w.workflowJson as Record<string, unknown>),
    }));
  }

  private async findMatchingWorkflow(
    organizationId: string,
    userRequest: string,
  ): Promise<{
    workflow: WorkflowRecord;
    matchType: "exact_name" | "description" | "category" | "keywords";
    score: number;
  } | null> {
    const requestLower = userRequest.toLowerCase();
    const requestWords = requestLower.split(/\s+/).filter((w) => w.length > 2);

    const prismaClient = db as unknown as Record<string, unknown>;
    const n8nWorkflow = prismaClient.n8nWorkflow as {
      findMany: (args: Record<string, unknown>) => Promise<WorkflowRecord[]>;
    };

    const workflows = await n8nWorkflow.findMany({
      where: {
        organizationId,
        isSkill: true,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        tags: true,
        workflowJson: true,
      },
    });

    if (workflows.length === 0) {
      return null;
    }

    let bestMatch: {
      workflow: WorkflowRecord;
      matchType: "exact_name" | "description" | "category" | "keywords";
      score: number;
    } | null = null;

    for (const workflow of workflows) {
      const nameLower = workflow.name.toLowerCase();
      const descLower = (workflow.description || "").toLowerCase();
      const categoryLower = workflow.category.toLowerCase();
      const tagsLower = workflow.tags.map((t: string) => t.toLowerCase());

      if (requestLower.includes(nameLower) || nameLower.includes(requestLower)) {
        const score = 1.0;
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { workflow, matchType: "exact_name", score };
        }
        continue;
      }

      const descriptionMatchScore = this.calculateKeywordScore(requestWords, descLower);
      if (descriptionMatchScore > 0.5) {
        const score = 0.8 * descriptionMatchScore;
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { workflow, matchType: "description", score };
        }
        continue;
      }

      if (requestLower.includes(categoryLower) || categoryLower.includes(requestLower)) {
        const score = 0.6;
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { workflow, matchType: "category", score };
        }
        continue;
      }

      const tagsMatchScore = this.calculateKeywordScore(requestWords, tagsLower.join(" "));
      if (tagsMatchScore > 0.3) {
        const score = 0.5 * tagsMatchScore;
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { workflow, matchType: "keywords", score };
        }
      }
    }

    return bestMatch;
  }

  private calculateKeywordScore(requestWords: string[], targetText: string): number {
    if (requestWords.length === 0) return 0;

    let matchCount = 0;
    for (const word of requestWords) {
      if (targetText.includes(word)) {
        matchCount++;
      }
    }

    return matchCount / requestWords.length;
  }

  private extractInputParameters(userRequest: string): Record<string, unknown> {
    const inputData: Record<string, unknown> = {
      userRequest,
      triggeredAt: new Date().toISOString(),
    };

    const emailMatch = userRequest.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    if (emailMatch) {
      inputData.email = emailMatch[0];
    }

    const urlMatch = userRequest.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      inputData.url = urlMatch[0];
    }

    const datePatterns = [/\d{4}-\d{2}-\d{2}/, /\d{2}\/\d{2}\/\d{4}/, /today|tomorrow|yesterday/i];
    for (const pattern of datePatterns) {
      const dateMatch = userRequest.match(pattern);
      if (dateMatch) {
        inputData.date = dateMatch[0];
        break;
      }
    }

    const numberMatch = userRequest.match(/\b\d+(?:\.\d+)?\b/);
    if (numberMatch) {
      inputData.number = parseFloat(numberMatch[0]);
    }

    return inputData;
  }

  private extractInputSchema(
    workflowJson: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    try {
      const nodes = workflowJson.nodes as Array<Record<string, unknown>> | undefined;
      if (!nodes) return undefined;

      const triggerNode = nodes.find(
        (n) =>
          (n.type as string)?.includes("webhook") || (n.type as string)?.includes("manualTrigger"),
      );

      if (triggerNode?.parameters) {
        return triggerNode.parameters as Record<string, unknown>;
      }

      return undefined;
    } catch {
      return undefined;
    }
  }

  private extractOutputSchema(
    workflowJson: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    try {
      const nodes = workflowJson.nodes as Array<Record<string, unknown>> | undefined;
      if (!nodes || nodes.length === 0) return undefined;

      const lastNode = nodes[nodes.length - 1];
      if (lastNode?.parameters) {
        return { type: lastNode.type, parameters: lastNode.parameters };
      }

      return undefined;
    } catch {
      return undefined;
    }
  }

  private async waitForCompletion(executionId: string): Promise<{
    status: string;
    outputData?: unknown;
    errorMessage?: string | null;
  }> {
    const startTime = Date.now();

    const prismaClient = db as unknown as Record<string, unknown>;
    const n8nExecution = prismaClient.n8nExecution as {
      findUnique: (args: {
        where: { id: string };
        select: Record<string, boolean>;
      }) => Promise<ExecutionRecord | null>;
    };

    while (Date.now() - startTime < DEFAULT_TIMEOUT_MS) {
      const execution = await n8nExecution.findUnique({
        where: { id: executionId },
        select: {
          status: true,
          outputData: true,
          errorMessage: true,
        },
      });

      if (!execution) {
        return {
          status: "error",
          errorMessage: "Execution not found",
        };
      }

      if (TERMINAL_STATUSES.includes(execution.status)) {
        return {
          status: execution.status,
          outputData: execution.outputData,
          errorMessage: execution.errorMessage,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    const execution = await n8nExecution.findUnique({
      where: { id: executionId },
      select: { status: true, outputData: false, errorMessage: false },
    });

    return {
      status: execution?.status || "unknown",
    };
  }
}

export function isN8nWorkflowRequest(userRequest: string): boolean {
  const lowerRequest = userRequest.toLowerCase();
  const keywords = [
    "workflow",
    "automation",
    "n8n",
    "run workflow",
    "execute workflow",
    "trigger workflow",
    "start workflow",
    "워크플로우",
    "자동화",
    "워크플로우 실행",
    "워크플로우 시작",
  ];

  return keywords.some((keyword) => lowerRequest.includes(keyword));
}

export const n8nWorkflowSkill = new N8nWorkflowSkill();
