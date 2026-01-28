/**
 * Multi-Agent Orchestrator
 *
 * This module integrates the new agent system with the existing orchestrator:
 * - Agent Registry: 8 specialized agents (data, report, comms, search, task, approval, analytics, orchestrator)
 * - Agent Coordinator: Multi-agent coordination with parallel execution
 * - Task Decomposer: Break complex requests into subtasks
 * - Proactive Monitor: Risk detection and alerts
 * - Task Prioritizer: Auto-prioritization using Eisenhower matrix
 */

import { agentRegistry, AgentType } from "./agent-registry";
import {
  coordinateAgents,
  coordinateParallel,
  aggregateResults,
  AgentExecutionContext,
  AgentExecutionResult,
} from "./agent-coordinator";
import { decomposeTask, DecompositionResult, estimateTaskComplexity } from "./task-decomposer";
import { OrchestrationRequest, OrchestrationResult } from "./types";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";
import { db as prisma } from "../db/client";

export interface MultiAgentRequest extends OrchestrationRequest {
  enableMultiAgent?: boolean;
  maxAgents?: number;
  enableParallel?: boolean;
  timeout?: number;
}

export interface MultiAgentResult extends OrchestrationResult {
  multiAgentMetadata?: {
    agentsUsed: AgentType[];
    decomposition?: DecompositionResult;
    executionMode: "single" | "sequential" | "parallel";
    subtaskResults?: Map<string, AgentExecutionResult>;
  };
}

const MAX_AGENTS_PER_REQUEST = 5;
const DEFAULT_TIMEOUT_MS = 120000;

/**
 * Orchestrate a request using the multi-agent system
 *
 * This function:
 * 1. Analyzes the request complexity
 * 2. Decomposes into subtasks if multi-agent is beneficial
 * 3. Executes with appropriate agents (single, sequential, or parallel)
 * 4. Aggregates and returns results
 */
export async function orchestrateMultiAgent(request: MultiAgentRequest): Promise<MultiAgentResult> {
  const startTime = Date.now();
  const {
    userRequest,
    sessionId,
    organizationId,
    userId,
    enableMultiAgent = true,
    maxAgents = MAX_AGENTS_PER_REQUEST,
    enableParallel = true,
    timeout = DEFAULT_TIMEOUT_MS,
  } = request;

  logger.info("Multi-agent orchestration started", {
    sessionId,
    organizationId,
    enableMultiAgent,
    enableParallel,
    requestLength: userRequest.length,
  });

  metrics.increment("multi_agent.orchestration_started", { organizationId });

  try {
    const complexity = estimateTaskComplexity(userRequest);

    if (!enableMultiAgent || complexity === "low") {
      logger.debug("Using single-agent execution", { complexity });
      return executeSingleAgent(request);
    }

    const decomposition = decomposeTask(userRequest);

    if (!decomposition.requiresMultiAgent) {
      logger.debug("Task does not require multi-agent", {
        subtaskCount: decomposition.subtasks.length,
      });
      return executeSingleAgent(request);
    }

    const limitedSubtasks = decomposition.subtasks.slice(0, maxAgents);

    logger.info("Multi-agent decomposition complete", {
      originalSubtasks: decomposition.subtasks.length,
      limitedSubtasks: limitedSubtasks.length,
      complexity: decomposition.estimatedComplexity,
      parallelGroups: decomposition.suggestedParallelization.length,
    });

    const context: AgentExecutionContext = {
      organizationId,
      userId,
      sessionId,
      depth: 0,
      maxDepth: 3,
    };

    let results: Map<string, AgentExecutionResult>;
    let executionMode: "sequential" | "parallel";

    if (enableParallel && canExecuteInParallel(decomposition)) {
      executionMode = "parallel";
      const parallelTasks = limitedSubtasks.map((subtask) => ({
        agentType: subtask.assignedAgent,
        prompt: subtask.description,
      }));

      const parallelResults = await Promise.race([
        coordinateParallel(parallelTasks, context),
        createTimeoutPromise<AgentExecutionResult[]>(timeout),
      ]);

      results = new Map();
      parallelResults.forEach((result, index) => {
        results.set(limitedSubtasks[index].id, result);
      });
    } else {
      executionMode = "sequential";
      results = await Promise.race([
        coordinateAgents(userRequest, limitedSubtasks, context),
        createTimeoutPromise<Map<string, AgentExecutionResult>>(timeout),
      ]);
    }

    const aggregatedOutput = aggregateResults(results);

    const successCount = Array.from(results.values()).filter((r) => r.success).length;
    const failedCount = results.size - successCount;

    const duration = Date.now() - startTime;

    await saveMultiAgentExecution({
      organizationId,
      userId,
      sessionId,
      request: userRequest,
      decomposition,
      results,
      duration,
      executionMode,
    });

    metrics.increment("multi_agent.orchestration_completed", {
      organizationId,
      executionMode,
      success: String(failedCount === 0),
    });

    metrics.histogram("multi_agent.orchestration_duration", duration, {
      executionMode,
      agentCount: String(results.size),
    });

    logger.info("Multi-agent orchestration completed", {
      duration,
      executionMode,
      agentsUsed: Array.from(results.values()).map((r) => r.agentId),
      successCount,
      failedCount,
    });

    return {
      output: aggregatedOutput,
      status: failedCount === 0 ? "success" : "failed",
      metadata: {
        category: "unspecified-high",
        skills: [],
        duration,
        model: "multi-agent",
        sessionId,
      },
      multiAgentMetadata: {
        agentsUsed: Array.from(results.values()).map((r) => r.agentId),
        decomposition,
        executionMode,
        subtaskResults: results,
      },
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      "Multi-agent orchestration failed",
      { sessionId, organizationId, duration },
      error instanceof Error ? error : new Error(errorMessage),
    );

    metrics.increment("multi_agent.orchestration_failed", { organizationId });

    return {
      output: `Multi-agent orchestration failed: ${errorMessage}`,
      status: "failed",
      metadata: {
        category: "unspecified-high",
        skills: [],
        duration,
        model: "multi-agent",
        sessionId,
      },
    };
  }
}

async function executeSingleAgent(request: MultiAgentRequest): Promise<MultiAgentResult> {
  const { userRequest, sessionId, organizationId, userId } = request;

  const keywords = userRequest.toLowerCase().split(/\s+/);
  const selectedAgent = agentRegistry.selectAgentForTask(userRequest, keywords);
  const agent = agentRegistry.getAgent(selectedAgent);

  logger.debug("Single agent selected", {
    agent: selectedAgent,
    agentName: agent?.name,
  });

  const { orchestrate } = await import("./index");

  const result = await orchestrate({
    userRequest,
    sessionId,
    organizationId,
    userId,
  });

  return {
    ...result,
    multiAgentMetadata: {
      agentsUsed: [selectedAgent],
      executionMode: "single",
    },
  };
}

function canExecuteInParallel(decomposition: DecompositionResult): boolean {
  const firstGroup = decomposition.suggestedParallelization[0];
  if (!firstGroup) return false;

  return firstGroup.length > 1 || decomposition.suggestedParallelization.length === 1;
}

function createTimeoutPromise<T>(ms: number): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);
  });
}

async function saveMultiAgentExecution(data: {
  organizationId: string;
  userId: string;
  sessionId: string;
  request: string;
  decomposition: DecompositionResult;
  results: Map<string, AgentExecutionResult>;
  duration: number;
  executionMode: string;
}): Promise<void> {
  try {
    const resultsArray = Array.from(data.results.entries()).map(([taskId, result]) => ({
      taskId,
      agentId: result.agentId,
      success: result.success,
      output: result.output.substring(0, 1000),
      duration: result.metadata.duration,
    }));

    await prisma.orchestratorExecution.create({
      data: {
        organizationId: data.organizationId,
        userId: data.userId,
        sessionId: data.sessionId,
        category: "multi-agent",
        skills: [],
        status: resultsArray.every((r) => r.success) ? "success" : "failed",
        duration: data.duration,
        inputData: {
          prompt: data.request,
          decomposition: {
            requiresMultiAgent: data.decomposition.requiresMultiAgent,
            estimatedComplexity: data.decomposition.estimatedComplexity,
            subtaskCount: data.decomposition.subtasks.length,
          },
        },
        outputData: {
          results: resultsArray,
        },
        metadata: {
          executionMode: data.executionMode,
          agentsUsed: resultsArray.map((r) => r.agentId),
          subtaskCount: data.decomposition.subtasks.length,
        },
      },
    });
  } catch (error) {
    logger.warn("Failed to save multi-agent execution", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Check if a request should use multi-agent orchestration
 */
export function shouldUseMultiAgent(request: string): boolean {
  const complexity = estimateTaskComplexity(request);
  const decomposition = decomposeTask(request);

  return complexity !== "low" && decomposition.requiresMultiAgent;
}

/**
 * Get suggested agents for a request
 */
export function getSuggestedAgents(request: string): AgentType[] {
  const decomposition = decomposeTask(request);
  return decomposition.subtasks.map((t) => t.assignedAgent);
}

/**
 * Get all available agents
 */
export function getAvailableAgents() {
  return agentRegistry.getAllAgents().map((agent) => ({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    emoji: agent.emoji,
    capabilities: agent.capabilities.map((c) => c.name),
  }));
}
