/**
 * Sub-Agent Spawner
 *
 * Enables agents to spawn sub-agents for complex subtasks.
 * Provides hierarchical execution tracking and context inheritance.
 */

import { AgentType } from "./agent-registry";
import { executeWithAgent, AgentExecutionContext, AgentExecutionResult } from "./agent-coordinator";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";
import { db as prisma } from "../db/client";
import { Prisma } from "@prisma/client";
import { logSpawnTree, getSpawnTreeSummary } from "./spawn-tree-visualizer";
import { buildInheritedContext } from "./context-inheritance";
import { getSpawnRateLimiter } from "./spawn-rate-limiter";

export interface SubAgentConfig {
  agentType: AgentType;
  task: string;
  contextToPass?: {
    conversationHistory?: boolean; // Last 5 messages
    relevantEntities?: boolean; // Extracted entities
    parentSummary?: boolean; // Summary of parent's task
    customContext?: Record<string, unknown>;
  };
  maxDepth?: number;
  tokenBudget?: number;
  remainingBudget?: number;
}

export interface ChildExecution {
  executionId: string;
  agentType: AgentType;
  success: boolean;
  duration: number;
  tokensUsed: number;
  depth: number;
}

export interface SubAgentResult {
  success: boolean;
  result: string;
  tokensUsed: number;
  executionTime: number;
  childExecutions: ChildExecution[];
  error?: string;
}

export interface AgentContext extends AgentExecutionContext {
  spawnSubAgent: (config: SubAgentConfig) => Promise<SubAgentResult>;
  rootExecutionId: string;
  parentExecutionId?: string;
  executionId: string;
}

const DEFAULT_MAX_DEPTH = 3;
const MAX_SPAWN_DEPTH = 5; // Hard limit
const CHILD_EXECUTION_TIMEOUT_MS = 300000; // 5 minutes
const MINIMUM_REQUIRED_BUDGET = 1000; // Minimum tokens required to spawn

/**
 * Create an agent context with sub-agent spawning capability
 */
export function createAgentContext(
  baseContext: AgentExecutionContext,
  executionId: string,
  rootExecutionId?: string,
): AgentContext {
  const context: AgentContext = {
    ...baseContext,
    executionId,
    rootExecutionId: rootExecutionId || executionId,
    spawnSubAgent: (config: SubAgentConfig) => spawnSubAgent(context, config),
  };

  return context;
}

/**
 * Spawn a sub-agent to handle a subtask
 *
 * @param parentContext - The parent agent's context
 * @param config - Configuration for the sub-agent
 * @returns Result of sub-agent execution
 */
export async function spawnSubAgent(
  parentContext: AgentContext,
  config: SubAgentConfig,
): Promise<SubAgentResult> {
  const startTime = Date.now();
  const childExecutions: ChildExecution[] = [];

  // Validate depth limits
  const maxDepth = config.maxDepth ?? DEFAULT_MAX_DEPTH;
  const nextDepth = parentContext.depth + 1;

  if (nextDepth > maxDepth) {
    logger.warn("Sub-agent spawn rejected: max depth exceeded", {
      currentDepth: parentContext.depth,
      maxDepth,
      requestedAgent: config.agentType,
      parentExecutionId: parentContext.executionId,
    });

    metrics.increment("sub_agent.spawn_rejected", {
      organizationId: parentContext.organizationId,
      reason: "depth_exceeded",
    });

    return {
      success: false,
      result: "",
      tokensUsed: 0,
      executionTime: Date.now() - startTime,
      childExecutions: [],
      error: `SpawnDepthExceededError: Maximum spawn depth (${maxDepth}) exceeded. Current depth: ${parentContext.depth}, attempted depth: ${nextDepth}`,
    };
  }

  if (nextDepth > MAX_SPAWN_DEPTH) {
    logger.error("Sub-agent spawn rejected: hard depth limit exceeded", {
      currentDepth: parentContext.depth,
      hardLimit: MAX_SPAWN_DEPTH,
      requestedAgent: config.agentType,
    });

    metrics.increment("sub_agent.spawn_rejected", {
      organizationId: parentContext.organizationId,
      reason: "hard_limit_exceeded",
    });

    return {
      success: false,
      result: "",
      tokensUsed: 0,
      executionTime: Date.now() - startTime,
      childExecutions: [],
      error: `SpawnDepthExceededError: Hard spawn depth limit (${MAX_SPAWN_DEPTH}) exceeded. This is a system-level safety limit.`,
    };
  }

  // Check rate limits
  const rateLimiter = getSpawnRateLimiter();
  const rateLimitResult = await rateLimiter.checkLimit(
    parentContext.userId,
    parentContext.organizationId,
  );

  if (!rateLimitResult.allowed) {
    logger.warn("Sub-agent spawn rejected: rate limit exceeded", {
      userId: parentContext.userId,
      organizationId: parentContext.organizationId,
      remaining: rateLimitResult.remaining,
      resetAt: rateLimitResult.resetAt,
      reason: rateLimitResult.reason,
    });

    metrics.increment("sub_agent.spawn_rejected", {
      organizationId: parentContext.organizationId,
      reason: "rate_limit_exceeded",
    });

    return {
      success: false,
      result: "",
      tokensUsed: 0,
      executionTime: Date.now() - startTime,
      childExecutions: [],
      error: `RateLimitExceededError: ${rateLimitResult.reason}. Retry after ${rateLimitResult.resetAt.toISOString()}`,
    };
  }

  // Validate token budget
  const remainingBudget = config.remainingBudget;
  if (remainingBudget !== undefined && remainingBudget < MINIMUM_REQUIRED_BUDGET) {
    logger.warn("Sub-agent spawn rejected: insufficient budget", {
      remainingBudget,
      minimumRequired: MINIMUM_REQUIRED_BUDGET,
      requestedAgent: config.agentType,
      parentExecutionId: parentContext.executionId,
    });

    metrics.increment("sub_agent.spawn_rejected", {
      organizationId: parentContext.organizationId,
      reason: "budget_exhausted",
    });

    return {
      success: false,
      result: "",
      tokensUsed: 0,
      executionTime: Date.now() - startTime,
      childExecutions: [],
      error: `BudgetExhaustedError: Insufficient token budget to spawn sub-agent. Remaining: ${remainingBudget}, minimum required: ${MINIMUM_REQUIRED_BUDGET}`,
    };
  }

  logger.info("Spawning sub-agent", {
    parentAgent: parentContext.executionId,
    childAgent: config.agentType,
    depth: nextDepth,
    rootExecutionId: parentContext.rootExecutionId,
    task: config.task.substring(0, 100),
  });

  metrics.increment("sub_agent.spawn_started", {
    organizationId: parentContext.organizationId,
    agentType: config.agentType,
    depth: String(nextDepth),
  });

  let childExecutionId: string | undefined;

  try {
    // Build inherited context from parent
    const inheritedContext = await buildInheritedContext(parentContext, config);

    // Create execution record for the child
    const execution = await prisma.orchestratorExecution.create({
      data: {
        organizationId: parentContext.organizationId,
        userId: parentContext.userId,
        sessionId: parentContext.sessionId,
        category: "sub-agent",
        skills: [],
        status: "running",
        duration: 0,
        inputData: {
          task: config.task,
          agentType: config.agentType,
          context: inheritedContext,
        } as Prisma.InputJsonValue,
        metadata: {
          parentExecutionId: parentContext.executionId,
          rootExecutionId: parentContext.rootExecutionId,
          depth: nextDepth,
          maxDepth,
          tokenBudget: config.tokenBudget,
          remainingBudget: config.remainingBudget,
        } as any,
      },
    });

    childExecutionId = execution.id;

    // Create child agent context
    const childContext: AgentExecutionContext = {
      organizationId: parentContext.organizationId,
      userId: parentContext.userId,
      sessionId: parentContext.sessionId,
      parentTaskId: parentContext.executionId,
      depth: nextDepth,
      maxDepth,
    };

    // Execute sub-agent with timeout
    const result = await Promise.race<AgentExecutionResult>([
      executeWithAgent(config.agentType, config.task, childContext),
      createTimeoutPromise(CHILD_EXECUTION_TIMEOUT_MS),
    ]);

    const executionTime = Date.now() - startTime;

    // Calculate tokens used (if available from result metadata)
    const tokensUsed = result.metadata.tokensUsed ?? 0;

    // Calculate remaining budget after execution
    const updatedRemainingBudget =
      remainingBudget !== undefined ? Math.max(0, remainingBudget - tokensUsed) : undefined;

    // Update execution record with token tracking
    await prisma.orchestratorExecution.update({
      where: { id: execution.id },
      data: {
        status: result.success ? "success" : "failed",
        duration: executionTime,
        outputData: {
          output: result.output,
          model: result.metadata.model,
          tokensUsed,
        },
        errorMessage: result.error,
        metadata: {
          ...((execution.metadata as Record<string, unknown>) || {}),
          tokensUsed,
          remainingBudgetAfter: updatedRemainingBudget,
        } as any,
      },
    });

    // Track child execution
    const childExecution: ChildExecution = {
      executionId: execution.id,
      agentType: config.agentType,
      success: result.success,
      duration: executionTime,
      tokensUsed,
      depth: nextDepth,
    };

    childExecutions.push(childExecution);

    metrics.increment("sub_agent.spawn_completed", {
      organizationId: parentContext.organizationId,
      agentType: config.agentType,
      success: String(result.success),
    });

    metrics.histogram("sub_agent.execution_duration", executionTime, {
      agentType: config.agentType,
      depth: String(nextDepth),
    });

    if (tokensUsed > 0) {
      metrics.histogram("sub_agent.tokens_used", tokensUsed, {
        agentType: config.agentType,
        depth: String(nextDepth),
      });
    }

    logger.info("Sub-agent execution completed", {
      childExecutionId: execution.id,
      agentType: config.agentType,
      success: result.success,
      duration: executionTime,
      tokensUsed,
      depth: nextDepth,
    });

    // Record spawn for rate limiting
    await rateLimiter.recordSpawn(parentContext.userId, parentContext.organizationId);

    return {
      success: result.success,
      result: result.output,
      tokensUsed,
      executionTime,
      childExecutions,
      error: result.error,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      "Sub-agent execution failed",
      {
        childExecutionId,
        agentType: config.agentType,
        depth: nextDepth,
        executionTime,
      },
      error instanceof Error ? error : new Error(errorMessage),
    );

    // Update execution record if it was created
    if (childExecutionId) {
      await prisma.orchestratorExecution
        .update({
          where: { id: childExecutionId },
          data: {
            status: "failed",
            duration: executionTime,
            errorMessage,
          },
        })
        .catch((updateError: unknown) => {
          logger.warn("Failed to update failed execution record", {
            executionId: childExecutionId,
            error: updateError instanceof Error ? updateError.message : String(updateError),
          });
        });
    }

    metrics.increment("sub_agent.spawn_failed", {
      organizationId: parentContext.organizationId,
      agentType: config.agentType,
      depth: String(nextDepth),
    });

    return {
      success: false,
      result: "",
      tokensUsed: 0,
      executionTime,
      childExecutions,
      error: errorMessage,
    };
  }
}

/**
 * Get the spawn tree for a root execution
 *
 * @param rootExecutionId - The root execution ID
 * @returns Array of all executions in the tree
 */
export async function getSpawnTree(rootExecutionId: string) {
  const executions = await prisma.orchestratorExecution.findMany({
    where: {
      OR: [
        { id: rootExecutionId },
        {
          metadata: {
            path: ["rootExecutionId"],
            equals: rootExecutionId,
          },
        },
      ],
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return executions.map((exec) => ({
    id: exec.id,
    agentType: (exec.inputData as Record<string, unknown>)?.agentType || "unknown",
    status: exec.status,
    duration: exec.duration,
    depth: (exec.metadata as Record<string, unknown>)?.depth || 0,
    parentExecutionId: (exec.metadata as Record<string, unknown>)?.parentExecutionId,
    createdAt: exec.createdAt,
  }));
}

/**
 * Get statistics for sub-agent spawning
 */
export async function getSpawnStatistics(organizationId: string, since?: Date) {
  const whereClause: any = {
    organizationId,
    category: "sub-agent",
  };

  if (since) {
    whereClause.createdAt = { gte: since };
  }

  const executions = await prisma.orchestratorExecution.findMany({
    where: whereClause,
    select: {
      status: true,
      duration: true,
      metadata: true,
    },
  });

  const stats = {
    total: executions.length,
    successful: executions.filter((e) => e.status === "success").length,
    failed: executions.filter((e) => e.status === "failed").length,
    averageDuration: 0,
    depthDistribution: {} as Record<number, number>,
    maxDepthReached: 0,
  };

  if (executions.length > 0) {
    stats.averageDuration =
      executions.reduce((sum: number, e: { duration: number }) => sum + e.duration, 0) / executions.length;
  }

  for (const exec of executions) {
    const depth = (exec.metadata as Record<string, unknown>)?.depth || 0;
    stats.depthDistribution[depth as number] = (stats.depthDistribution[depth as number] || 0) + 1;
    stats.maxDepthReached = Math.max(stats.maxDepthReached, depth as number);
  }

  return stats;
}

function createTimeoutPromise(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Sub-agent execution timed out after ${ms}ms`));
    }, ms);
  });
}

/**
 * Log spawn tree for debugging after a root execution completes
 *
 * @param rootExecutionId - The root execution ID
 */
export async function logExecutionTree(rootExecutionId: string): Promise<void> {
  try {
    await logSpawnTree(rootExecutionId);
  } catch (error) {
    logger.warn("Failed to log execution tree", {
      rootExecutionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Get spawn tree summary for including in execution results
 *
 * @param rootExecutionId - The root execution ID
 * @returns Summary text
 */
export async function getExecutionTreeSummary(rootExecutionId: string): Promise<string> {
  return getSpawnTreeSummary(rootExecutionId);
}

/**
 * Update AgentContext type in agent-coordinator.ts to include spawn method
 * This is exported for use in other modules that need to create contexts
 */
export { createAgentContext as createSpawnableContext };
