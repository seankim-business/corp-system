/**
 * Parallel Coordinator
 *
 * Manages parallel execution of tasks with:
 * - Promise.allSettled based parallelization
 * - Per-task timeout management
 * - Partial failure handling
 * - Progress streaming via SSE
 * - Max concurrency limit
 */

import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";
import { emitOrgEvent } from "../services/sse-service";

// ============================================
// TYPES
// ============================================

export type ParallelTaskStatus = "pending" | "running" | "fulfilled" | "rejected" | "timeout";

export interface ParallelTask<T = unknown> {
  id: string;
  execute: () => Promise<T>;
  timeout?: number;
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface ParallelTaskResult<T = unknown> {
  taskId: string;
  status: ParallelTaskStatus;
  result?: T;
  error?: Error;
  duration: number;
  startedAt: number;
  completedAt: number;
}

export interface ParallelCoordinatorOptions {
  maxConcurrency?: number;
  defaultTimeout?: number;
  enableProgressStreaming?: boolean;
  organizationId?: string;
  onProgress?: (taskId: string, status: ParallelTaskStatus, progress?: number) => void;
}

export interface ParallelExecutionSummary {
  totalTasks: number;
  completed: number;
  fulfilled: number;
  rejected: number;
  timedOut: number;
  duration: number;
}

// ============================================
// PARALLEL COORDINATOR
// ============================================

export class ParallelCoordinator {
  private options: Required<ParallelCoordinatorOptions>;
  private activeTaskCount = 0;

  constructor(options?: ParallelCoordinatorOptions) {
    this.options = {
      maxConcurrency: options?.maxConcurrency ?? 5,
      defaultTimeout: options?.defaultTimeout ?? 120000,
      enableProgressStreaming: options?.enableProgressStreaming ?? true,
      organizationId: options?.organizationId ?? "",
      onProgress: options?.onProgress ?? (() => {}),
    };
  }

  /**
   * Execute multiple tasks in parallel with concurrency control
   */
  async execute<T>(tasks: ParallelTask<T>[]): Promise<ParallelTaskResult<T>[]> {
    const startTime = Date.now();

    if (tasks.length === 0) {
      return [];
    }

    logger.info("Starting parallel execution", {
      taskCount: tasks.length,
      maxConcurrency: this.options.maxConcurrency,
      organizationId: this.options.organizationId,
    });

    metrics.increment("parallel_coordinator.execution_started", {
      organizationId: this.options.organizationId,
    });

    // Emit initial progress
    this.emitProgress("parallel_execution_started", {
      taskCount: tasks.length,
      maxConcurrency: this.options.maxConcurrency,
    });

    // Sort by priority if specified
    const sortedTasks = [...tasks].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    // Execute with concurrency control using Promise.allSettled pattern
    const results = await this.executeWithConcurrencyControl(sortedTasks);

    const duration = Date.now() - startTime;
    const summary = this.calculateSummary(results, duration);

    logger.info("Parallel execution completed", {
      ...summary,
      organizationId: this.options.organizationId,
    });

    metrics.histogram("parallel_coordinator.execution_duration", duration, {
      organizationId: this.options.organizationId,
      taskCount: String(tasks.length),
    });

    metrics.increment("parallel_coordinator.execution_completed", {
      organizationId: this.options.organizationId,
      success: String(summary.rejected === 0 && summary.timedOut === 0),
    });

    // Emit completion progress
    this.emitProgress("parallel_execution_completed", summary);

    return results;
  }

  /**
   * Execute a single task with timeout
   */
  async executeOne<T>(task: ParallelTask<T>): Promise<ParallelTaskResult<T>> {
    const timeout = task.timeout ?? this.options.defaultTimeout;
    const startedAt = Date.now();

    this.emitTaskProgress(task.id, "running");
    this.options.onProgress(task.id, "running");

    try {
      const result = await this.executeWithTimeout(task.execute, timeout, task.id);
      const completedAt = Date.now();

      this.emitTaskProgress(task.id, "fulfilled");
      this.options.onProgress(task.id, "fulfilled");

      return {
        taskId: task.id,
        status: "fulfilled",
        result,
        duration: completedAt - startedAt,
        startedAt,
        completedAt,
      };
    } catch (error) {
      const completedAt = Date.now();
      const isTimeout = error instanceof Error && error.message.includes("timeout");
      const status: ParallelTaskStatus = isTimeout ? "timeout" : "rejected";

      this.emitTaskProgress(task.id, status, error instanceof Error ? error.message : String(error));
      this.options.onProgress(task.id, status);

      return {
        taskId: task.id,
        status,
        error: error instanceof Error ? error : new Error(String(error)),
        duration: completedAt - startedAt,
        startedAt,
        completedAt,
      };
    }
  }

  /**
   * Execute with timeout wrapper
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number,
    taskId: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        logger.warn("Task timed out", { taskId, timeout });
        metrics.increment("parallel_coordinator.task_timeout", {
          organizationId: this.options.organizationId,
        });
        reject(new Error(`Task ${taskId} timed out after ${timeout}ms`));
      }, timeout);

      fn()
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Execute tasks with concurrency control
   */
  private async executeWithConcurrencyControl<T>(
    tasks: ParallelTask<T>[],
  ): Promise<ParallelTaskResult<T>[]> {
    const results: ParallelTaskResult<T>[] = new Array(tasks.length);
    let currentIndex = 0;
    let completedCount = 0;

    // Start workers for concurrent execution
    const workers = Array.from(
      { length: Math.min(this.options.maxConcurrency, tasks.length) },
      () => this.runWorker(tasks, results, () => currentIndex++, () => completedCount++),
    );

    await Promise.all(workers);

    return results;
  }

  /**
   * Worker function for concurrent execution
   */
  private async runWorker<T>(
    tasks: ParallelTask<T>[],
    results: ParallelTaskResult<T>[],
    getNextIndex: () => number,
    incrementCompleted: () => void,
  ): Promise<void> {
    while (true) {
      const index = getNextIndex();
      if (index >= tasks.length) break;

      const task = tasks[index];
      this.activeTaskCount++;

      try {
        const result = await this.executeOne(task);
        results[index] = result;
      } finally {
        this.activeTaskCount--;
        incrementCompleted();
      }
    }
  }

  /**
   * Calculate execution summary
   */
  private calculateSummary(results: ParallelTaskResult[], duration: number): ParallelExecutionSummary {
    return {
      totalTasks: results.length,
      completed: results.length,
      fulfilled: results.filter((r) => r.status === "fulfilled").length,
      rejected: results.filter((r) => r.status === "rejected").length,
      timedOut: results.filter((r) => r.status === "timeout").length,
      duration,
    };
  }

  /**
   * Emit progress event via SSE
   */
  private emitProgress(event: string, data: unknown): void {
    if (!this.options.enableProgressStreaming || !this.options.organizationId) {
      return;
    }

    try {
      emitOrgEvent(this.options.organizationId, event, data);
    } catch (error) {
      logger.debug("Failed to emit progress event", {
        event,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Emit task-specific progress
   */
  private emitTaskProgress(
    taskId: string,
    status: ParallelTaskStatus,
    error?: string,
    progress?: number,
  ): void {
    this.emitProgress("parallel_task_progress", {
      taskId,
      status,
      error,
      progress,
      timestamp: Date.now(),
    });
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Chunk an array into smaller arrays of specified size
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Execute tasks in batches with progress callback
 */
export async function executeInBatches<T, R>(
  items: T[],
  batchSize: number,
  executor: (item: T) => Promise<R>,
  onBatchComplete?: (completed: number, total: number) => void,
): Promise<R[]> {
  const results: R[] = [];
  const batches = chunkArray(items, batchSize);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchResults = await Promise.all(batch.map(executor));
    results.push(...batchResults);

    if (onBatchComplete) {
      const completed = Math.min((i + 1) * batchSize, items.length);
      onBatchComplete(completed, items.length);
    }
  }

  return results;
}

/**
 * Create a parallel coordinator with default options
 */
export function createParallelCoordinator(
  options?: ParallelCoordinatorOptions,
): ParallelCoordinator {
  return new ParallelCoordinator(options);
}

/**
 * Execute tasks with automatic concurrency control
 */
export async function executeParallel<T>(
  tasks: ParallelTask<T>[],
  options?: ParallelCoordinatorOptions,
): Promise<ParallelTaskResult<T>[]> {
  const coordinator = new ParallelCoordinator(options);
  return coordinator.execute(tasks);
}
