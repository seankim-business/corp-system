/**
 * Hybrid Executor
 *
 * Orchestrates execution across OMC (oh-my-claudecode) and Nubabel agents,
 * handling parallel execution, dependency management, and unified result handling.
 */

import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";
import { AgentType } from "./agent-registry";
import { executeWithAgent, AgentExecutionContext, AgentExecutionResult } from "./agent-coordinator";
import { withRetry, RetryPolicy, DEFAULT_POLICY } from "./retry-policy";
import { ParallelCoordinator } from "./parallel-coordinator";
import { ResultMerger, MergeStrategy, MergedResult } from "./result-merger";
// Simple error interface for task results
export interface TaskError {
  code: string;
  message: string;
  retryable: boolean;
}

// Type alias for backward compatibility
export type NubabelError = TaskError;

// Map error to TaskError format
function mapOmcError(error: unknown, _taskId: string): TaskError {
  const message = error instanceof Error ? error.message : String(error);
  return {
    code: "OMC_ERROR",
    message,
    retryable: false,
  };
}

// ============================================
// TYPES
// ============================================

export type TaskSource = "omc" | "nubabel";

export interface HybridTask {
  id: string;
  source: TaskSource;
  skill?: string;
  agent?: AgentType;
  tool?: string;
  params: Record<string, unknown>;
  timeout?: number;
  retryPolicy?: Partial<RetryPolicy>;
}

export interface HybridExecutionPlan {
  id: string;
  tasks: HybridTask[];
  parallelGroups: string[][];
  dependencies: Record<string, string[]>;
  mergeStrategy?: MergeStrategy;
  timeout?: number;
}

export interface TaskResult {
  taskId: string;
  source: TaskSource;
  success: boolean;
  output: unknown;
  error?: TaskError;
  duration: number;
  metadata: Record<string, unknown>;
}

export interface HybridExecutionResult {
  planId: string;
  success: boolean;
  results: Map<string, TaskResult>;
  mergedResult?: MergedResult;
  duration: number;
  metadata: {
    omcTaskCount: number;
    nubabelTaskCount: number;
    parallelGroupCount: number;
    failedTasks: string[];
    retriedTasks: string[];
  };
}

export interface HybridExecutorOptions {
  maxConcurrency?: number;
  defaultTimeout?: number;
  enableRetry?: boolean;
  retryPolicy?: Partial<RetryPolicy>;
  enableProgressStreaming?: boolean;
  organizationId?: string;
  userId?: string;
  sessionId?: string;
}

// ============================================
// HYBRID EXECUTOR
// ============================================

export class HybridExecutor {
  private parallelCoordinator: ParallelCoordinator;
  private resultMerger: ResultMerger;
  private options: Required<HybridExecutorOptions>;

  constructor(options?: HybridExecutorOptions) {
    this.options = {
      maxConcurrency: options?.maxConcurrency ?? 5,
      defaultTimeout: options?.defaultTimeout ?? 120000,
      enableRetry: options?.enableRetry ?? true,
      retryPolicy: options?.retryPolicy ?? {},
      enableProgressStreaming: options?.enableProgressStreaming ?? true,
      organizationId: options?.organizationId ?? "",
      userId: options?.userId ?? "",
      sessionId: options?.sessionId ?? "",
    };

    this.parallelCoordinator = new ParallelCoordinator({
      maxConcurrency: this.options.maxConcurrency,
      defaultTimeout: this.options.defaultTimeout,
      enableProgressStreaming: this.options.enableProgressStreaming,
      organizationId: this.options.organizationId,
    });

    this.resultMerger = new ResultMerger();
  }

  /**
   * Execute a hybrid execution plan
   */
  async execute(plan: HybridExecutionPlan): Promise<HybridExecutionResult> {
    const startTime = Date.now();
    const results = new Map<string, TaskResult>();
    const failedTasks: string[] = [];
    const retriedTasks: string[] = [];

    logger.info("Starting hybrid execution", {
      planId: plan.id,
      taskCount: plan.tasks.length,
      parallelGroupCount: plan.parallelGroups.length,
      organizationId: this.options.organizationId,
    });

    metrics.increment("hybrid_executor.execution_started", {
      organizationId: this.options.organizationId,
    });

    try {
      // Build task map for quick lookup
      const taskMap = new Map(plan.tasks.map((t) => [t.id, t]));

      // Execute parallel groups in order
      for (let groupIndex = 0; groupIndex < plan.parallelGroups.length; groupIndex++) {
        const groupTaskIds = plan.parallelGroups[groupIndex];
        const groupTasks = groupTaskIds
          .map((id) => taskMap.get(id))
          .filter((t): t is HybridTask => t !== undefined);

        // Check dependencies for this group
        const dependenciesMet = this.checkDependencies(groupTaskIds, plan.dependencies, results);
        if (!dependenciesMet.allMet) {
          logger.warn("Skipping parallel group due to unmet dependencies", {
            groupIndex,
            unmetDependencies: dependenciesMet.unmet,
          });

          // Mark tasks as failed
          for (const task of groupTasks) {
            const failResult: TaskResult = {
              taskId: task.id,
              source: task.source,
              success: false,
              output: null,
              error: {
                code: "DEPENDENCY_FAILED",
                message: `Dependencies not met: ${dependenciesMet.unmet.join(", ")}`,
                retryable: false,
              },
              duration: 0,
              metadata: {},
            };
            results.set(task.id, failResult);
            failedTasks.push(task.id);
          }
          continue;
        }

        // Build dependency context for the group
        const dependencyContext = this.buildDependencyContext(groupTaskIds, plan.dependencies, results);

        // Execute tasks in this parallel group
        const groupResults = await this.executeParallelGroup(groupTasks, dependencyContext);

        // Process results
        for (const result of groupResults) {
          results.set(result.taskId, result);
          if (!result.success) {
            failedTasks.push(result.taskId);
          }
          if (result.metadata.retried) {
            retriedTasks.push(result.taskId);
          }
        }

        logger.debug("Parallel group completed", {
          groupIndex,
          taskCount: groupTasks.length,
          successCount: groupResults.filter((r) => r.success).length,
        });
      }

      // Merge results if strategy is provided
      let mergedResult: MergedResult | undefined;
      if (plan.mergeStrategy) {
        const resultArray = Array.from(results.values());
        mergedResult = this.resultMerger.merge(resultArray, plan.mergeStrategy);
      }

      const duration = Date.now() - startTime;
      const omcTaskCount = plan.tasks.filter((t) => t.source === "omc").length;
      const nubabelTaskCount = plan.tasks.filter((t) => t.source === "nubabel").length;

      logger.info("Hybrid execution completed", {
        planId: plan.id,
        duration,
        totalTasks: plan.tasks.length,
        failedTasks: failedTasks.length,
        retriedTasks: retriedTasks.length,
      });

      metrics.histogram("hybrid_executor.execution_duration", duration, {
        organizationId: this.options.organizationId,
        success: String(failedTasks.length === 0),
      });

      metrics.increment("hybrid_executor.execution_completed", {
        organizationId: this.options.organizationId,
        success: String(failedTasks.length === 0),
      });

      return {
        planId: plan.id,
        success: failedTasks.length === 0,
        results,
        mergedResult,
        duration,
        metadata: {
          omcTaskCount,
          nubabelTaskCount,
          parallelGroupCount: plan.parallelGroups.length,
          failedTasks,
          retriedTasks,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error("Hybrid execution failed", {
        planId: plan.id,
        duration,
        error: errorMessage,
      });

      metrics.increment("hybrid_executor.execution_failed", {
        organizationId: this.options.organizationId,
      });

      throw error;
    }
  }

  /**
   * Execute an OMC task (skill/agent from oh-my-claudecode)
   */
  async executeOmcTask(task: HybridTask, context?: Record<string, unknown>): Promise<TaskResult> {
    const startTime = Date.now();

    logger.debug("Executing OMC task", {
      taskId: task.id,
      skill: task.skill,
      agent: task.agent,
    });

    try {
      // For OMC tasks, we use the delegateTask or executeWithAgent based on type
      const executionContext: AgentExecutionContext = {
        organizationId: this.options.organizationId,
        userId: this.options.userId,
        sessionId: this.options.sessionId,
        depth: 0,
        maxDepth: 3,
      };

      const executeTask = async (): Promise<AgentExecutionResult> => {
        if (task.agent) {
          return executeWithAgent(
            task.agent,
            String(task.params.prompt || ""),
            executionContext,
          );
        }

        // For skills, delegate to appropriate agent
        const agent = this.mapSkillToAgent(task.skill);
        return executeWithAgent(
          agent,
          String(task.params.prompt || ""),
          executionContext,
        );
      };

      let result: AgentExecutionResult;
      let retried = false;

      if (this.options.enableRetry) {
        const policy: RetryPolicy = {
          ...DEFAULT_POLICY,
          ...this.options.retryPolicy,
          ...task.retryPolicy,
        };

        try {
          result = await withRetry(executeTask, policy, {
            agentId: task.agent || task.skill || "omc",
            stepId: task.id,
          });
        } catch (error) {
          retried = true;
          throw error;
        }
      } else {
        result = await executeTask();
      }

      const duration = Date.now() - startTime;

      return {
        taskId: task.id,
        source: "omc",
        success: result.success,
        output: result.output,
        error: result.error
          ? { code: "OMC_ERROR", message: result.error, retryable: false }
          : undefined,
        duration,
        metadata: {
          ...result.metadata,
          retried,
          context,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const nubabelError = mapOmcError(error, task.id);

      return {
        taskId: task.id,
        source: "omc",
        success: false,
        output: null,
        error: nubabelError,
        duration,
        metadata: { context },
      };
    }
  }

  /**
   * Execute a Nubabel task (internal orchestrator task)
   */
  async executeNubabelTask(task: HybridTask, context?: Record<string, unknown>): Promise<TaskResult> {
    const startTime = Date.now();

    logger.debug("Executing Nubabel task", {
      taskId: task.id,
      tool: task.tool,
      agent: task.agent,
    });

    try {
      const executionContext: AgentExecutionContext = {
        organizationId: this.options.organizationId,
        userId: this.options.userId,
        sessionId: this.options.sessionId,
        depth: 0,
        maxDepth: 3,
      };

      const executeTask = async (): Promise<AgentExecutionResult> => {
        if (task.agent) {
          return executeWithAgent(
            task.agent,
            String(task.params.prompt || ""),
            executionContext,
          );
        }

        // For tool-based tasks, use the appropriate handler
        if (task.tool) {
          return this.executeToolTask(task.tool, task.params, executionContext);
        }

        throw new Error("Nubabel task requires either agent or tool");
      };

      let result: AgentExecutionResult;
      let retried = false;

      if (this.options.enableRetry) {
        const policy: RetryPolicy = {
          ...DEFAULT_POLICY,
          ...this.options.retryPolicy,
          ...task.retryPolicy,
        };

        try {
          result = await withRetry(executeTask, policy, {
            agentId: task.agent || task.tool || "nubabel",
            stepId: task.id,
          });
        } catch (error) {
          retried = true;
          throw error;
        }
      } else {
        result = await executeTask();
      }

      const duration = Date.now() - startTime;

      return {
        taskId: task.id,
        source: "nubabel",
        success: result.success,
        output: result.output,
        error: result.error
          ? { code: "NUBABEL_ERROR", message: result.error, retryable: false }
          : undefined,
        duration,
        metadata: {
          ...result.metadata,
          retried,
          context,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        taskId: task.id,
        source: "nubabel",
        success: false,
        output: null,
        error: {
          code: "NUBABEL_ERROR",
          message: errorMessage,
          retryable: false,
        },
        duration,
        metadata: { context },
      };
    }
  }

  /**
   * Execute a parallel group of tasks
   */
  async executeParallelGroup(
    tasks: HybridTask[],
    dependencyContext?: Record<string, unknown>,
  ): Promise<TaskResult[]> {
    const parallelTasks = tasks.map((task) => ({
      id: task.id,
      execute: async () => {
        if (task.source === "omc") {
          return this.executeOmcTask(task, dependencyContext);
        }
        return this.executeNubabelTask(task, dependencyContext);
      },
      timeout: task.timeout || this.options.defaultTimeout,
    }));

    const parallelResults = await this.parallelCoordinator.execute(parallelTasks);

    return parallelResults.map((pr) => {
      if (pr.status === "fulfilled") {
        return pr.result as TaskResult;
      }

      // Handle rejected task
      const task = tasks.find((t) => t.id === pr.taskId);
      return {
        taskId: pr.taskId,
        source: task?.source || "nubabel",
        success: false,
        output: null,
        error: {
          code: pr.status === "timeout" ? "TIMEOUT" : "EXECUTION_FAILED",
          message: pr.error?.message || "Unknown error",
          retryable: pr.status === "timeout",
        },
        duration: pr.duration,
        metadata: {},
      };
    });
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private checkDependencies(
    taskIds: string[],
    dependencies: Record<string, string[]>,
    results: Map<string, TaskResult>,
  ): { allMet: boolean; unmet: string[] } {
    const unmet: string[] = [];

    for (const taskId of taskIds) {
      const deps = dependencies[taskId] || [];
      for (const dep of deps) {
        const depResult = results.get(dep);
        if (!depResult || !depResult.success) {
          unmet.push(dep);
        }
      }
    }

    return {
      allMet: unmet.length === 0,
      unmet: Array.from(new Set(unmet)),
    };
  }

  private buildDependencyContext(
    taskIds: string[],
    dependencies: Record<string, string[]>,
    results: Map<string, TaskResult>,
  ): Record<string, unknown> {
    const context: Record<string, unknown> = {};

    for (const taskId of taskIds) {
      const deps = dependencies[taskId] || [];
      for (const dep of deps) {
        const depResult = results.get(dep);
        if (depResult?.success) {
          context[dep] = depResult.output;
        }
      }
    }

    return context;
  }

  private mapSkillToAgent(skill?: string): AgentType {
    // Map OMC skills to appropriate agents
    const skillToAgentMap: Record<string, AgentType> = {
      "git-master": "data",
      "frontend-ui-ux": "report",
      playwright: "search",
      "mcp-integration": "task",
      autopilot: "orchestrator",
      ralph: "orchestrator",
      ultrawork: "orchestrator",
      plan: "analytics",
      analyze: "analytics",
      deepsearch: "search",
    };

    return skillToAgentMap[skill || ""] || "orchestrator";
  }

  private async executeToolTask(
    tool: string,
    params: Record<string, unknown>,
    _context: AgentExecutionContext,
  ): Promise<AgentExecutionResult> {
    // Execute tool-based tasks
    // This is a placeholder - actual implementation would route to specific tool handlers
    logger.debug("Executing tool task", { tool, params });

    return {
      agentId: "orchestrator",
      success: true,
      output: `Tool ${tool} executed with params: ${JSON.stringify(params)}`,
      metadata: {
        duration: 0,
        model: "tool",
      },
    };
  }
}

// ============================================
// FACTORY FUNCTIONS
// ============================================

/**
 * Create a hybrid execution plan from tasks with automatic dependency inference
 */
export function createHybridPlan(
  tasks: HybridTask[],
  options?: {
    mergeStrategy?: MergeStrategy;
    timeout?: number;
  },
): HybridExecutionPlan {
  const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Simple parallelization: all tasks in one group if no dependencies
  // More sophisticated dependency inference can be added later
  const parallelGroups = [tasks.map((t) => t.id)];
  const dependencies: Record<string, string[]> = {};

  return {
    id: planId,
    tasks,
    parallelGroups,
    dependencies,
    mergeStrategy: options?.mergeStrategy,
    timeout: options?.timeout,
  };
}

/**
 * Create a hybrid executor with default options
 */
export function createHybridExecutor(options?: HybridExecutorOptions): HybridExecutor {
  return new HybridExecutor(options);
}
