/**
 * Result Merger
 *
 * Merges results from hybrid execution (OMC + Nubabel) with multiple strategies:
 * - concat: Concatenate all results
 * - dedupe: Remove duplicate results
 * - priority: Use results based on source priority
 * - custom: User-defined merge function
 */

import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";
import { TaskResult, TaskSource } from "./hybrid-executor";

// ============================================
// TYPES
// ============================================

export type MergeMode = "concat" | "dedupe" | "priority" | "custom";

export interface MergeStrategy {
  mode: MergeMode;
  priorityOrder?: TaskSource[];
  customMerger?: (results: TaskResult[]) => unknown;
  dedupeKey?: (result: TaskResult) => string;
  filterFailed?: boolean;
}

export interface MergedResult {
  output: unknown;
  sources: TaskSource[];
  mergeMode: MergeMode;
  resultCount: number;
  successCount: number;
  failedCount: number;
  metadata: {
    totalDuration: number;
    averageDuration: number;
    mergeTimestamp: number;
  };
}

export interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
}

interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  elements?: Array<{
    type: string;
    text: string;
  }>;
}

interface SlackAttachment {
  color?: string;
  text?: string;
  fallback?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  meta: {
    sources: TaskSource[];
    resultCount: number;
    duration: number;
    timestamp: string;
  };
  errors?: Array<{
    taskId: string;
    source: TaskSource;
    message: string;
  }>;
}

// ============================================
// RESULT MERGER
// ============================================

export class ResultMerger {
  /**
   * Merge results using the specified strategy
   */
  merge(results: TaskResult[], strategy: MergeStrategy): MergedResult {
    const startTime = Date.now();

    logger.debug("Merging results", {
      mode: strategy.mode,
      resultCount: results.length,
      priorityOrder: strategy.priorityOrder,
    });

    // Filter failed results if requested
    const filteredResults = strategy.filterFailed
      ? results.filter((r) => r.success)
      : results;

    let output: unknown;

    switch (strategy.mode) {
      case "concat":
        output = this.mergeConcat(filteredResults);
        break;
      case "dedupe":
        output = this.mergeDedupe(filteredResults, strategy.dedupeKey);
        break;
      case "priority":
        output = this.mergePriority(filteredResults, strategy.priorityOrder);
        break;
      case "custom":
        if (!strategy.customMerger) {
          throw new Error("Custom merge mode requires customMerger function");
        }
        output = strategy.customMerger(filteredResults);
        break;
      default:
        output = this.mergeConcat(filteredResults);
    }

    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const successCount = results.filter((r) => r.success).length;
    const sources = Array.from(new Set(results.map((r) => r.source)));

    const mergedResult: MergedResult = {
      output,
      sources,
      mergeMode: strategy.mode,
      resultCount: results.length,
      successCount,
      failedCount: results.length - successCount,
      metadata: {
        totalDuration,
        averageDuration: results.length > 0 ? totalDuration / results.length : 0,
        mergeTimestamp: Date.now(),
      },
    };

    metrics.increment("result_merger.merge_completed", {
      mode: strategy.mode,
      resultCount: String(results.length),
    });

    metrics.timing("result_merger.merge_duration", Date.now() - startTime, {
      mode: strategy.mode,
    });

    return mergedResult;
  }

  /**
   * Format merged result for Slack message
   */
  formatForSlack(result: MergedResult): SlackMessage {
    const output = result.output;
    let text: string;

    if (typeof output === "string") {
      text = output;
    } else if (Array.isArray(output)) {
      text = output.map((item) => this.formatOutputItem(item)).join("\n\n");
    } else {
      text = JSON.stringify(output, null, 2);
    }

    // Truncate if too long for Slack
    const maxLength = 3000;
    if (text.length > maxLength) {
      text = text.substring(0, maxLength - 100) + "\n\n... (truncated)";
    }

    const blocks: SlackBlock[] = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text,
        },
      },
    ];

    // Add metadata footer
    const footerParts = [
      `Sources: ${result.sources.join(", ")}`,
      `Results: ${result.successCount}/${result.resultCount} succeeded`,
      `Duration: ${result.metadata.totalDuration}ms`,
    ];

    blocks.push({
      type: "context",
      elements: footerParts.map((text) => ({
        type: "mrkdwn",
        text,
      })),
    });

    // Add warning attachment if there were failures
    const attachments: SlackAttachment[] = [];
    if (result.failedCount > 0) {
      attachments.push({
        color: "warning",
        text: `${result.failedCount} task(s) failed during execution`,
        fallback: `${result.failedCount} task(s) failed`,
      });
    }

    return {
      text: text.substring(0, 150) + (text.length > 150 ? "..." : ""),
      blocks,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
  }

  /**
   * Format merged result for API response
   */
  formatForApi<T = unknown>(result: MergedResult, results?: TaskResult[]): ApiResponse<T> {
    const errors = results
      ?.filter((r) => !r.success && r.error)
      .map((r) => ({
        taskId: r.taskId,
        source: r.source,
        message: r.error?.message || "Unknown error",
      }));

    return {
      success: result.failedCount === 0,
      data: result.output as T,
      meta: {
        sources: result.sources,
        resultCount: result.resultCount,
        duration: result.metadata.totalDuration,
        timestamp: new Date(result.metadata.mergeTimestamp).toISOString(),
      },
      errors: errors && errors.length > 0 ? errors : undefined,
    };
  }

  // ============================================
  // PRIVATE MERGE STRATEGIES
  // ============================================

  /**
   * Concatenate all results
   */
  private mergeConcat(results: TaskResult[]): unknown[] {
    return results.map((r) => ({
      taskId: r.taskId,
      source: r.source,
      output: r.output,
      success: r.success,
    }));
  }

  /**
   * Deduplicate results based on key
   */
  private mergeDedupe(
    results: TaskResult[],
    dedupeKey?: (result: TaskResult) => string,
  ): unknown[] {
    const keyFn = dedupeKey || ((r: TaskResult) => JSON.stringify(r.output));
    const seen = new Set<string>();
    const deduped: TaskResult[] = [];

    for (const result of results) {
      const key = keyFn(result);
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(result);
      }
    }

    logger.debug("Deduplicated results", {
      original: results.length,
      deduped: deduped.length,
      removed: results.length - deduped.length,
    });

    return deduped.map((r) => r.output);
  }

  /**
   * Merge based on source priority
   */
  private mergePriority(
    results: TaskResult[],
    priorityOrder?: TaskSource[],
  ): unknown {
    const order = priorityOrder || ["omc", "nubabel"];

    // Sort by priority
    const sorted = [...results].sort((a, b) => {
      const aIndex = order.indexOf(a.source);
      const bIndex = order.indexOf(b.source);
      return (aIndex === -1 ? Infinity : aIndex) - (bIndex === -1 ? Infinity : bIndex);
    });

    // Return output from highest priority successful result
    for (const result of sorted) {
      if (result.success) {
        return result.output;
      }
    }

    // If no successful results, return first failed with priority
    if (sorted.length > 0) {
      return sorted[0].output;
    }

    return null;
  }

  /**
   * Format a single output item for display
   */
  private formatOutputItem(item: unknown): string {
    if (typeof item === "string") {
      return item;
    }

    if (typeof item === "object" && item !== null) {
      const obj = item as Record<string, unknown>;
      if (obj.output) {
        return String(obj.output);
      }
      return JSON.stringify(obj, null, 2);
    }

    return String(item);
  }
}

// ============================================
// PRESET STRATEGIES
// ============================================

export const MERGE_STRATEGIES = {
  /**
   * Default: concatenate all results
   */
  DEFAULT: {
    mode: "concat" as MergeMode,
    filterFailed: false,
  },

  /**
   * Success only: concatenate only successful results
   */
  SUCCESS_ONLY: {
    mode: "concat" as MergeMode,
    filterFailed: true,
  },

  /**
   * OMC first: prioritize OMC results
   */
  OMC_PRIORITY: {
    mode: "priority" as MergeMode,
    priorityOrder: ["omc", "nubabel"] as TaskSource[],
    filterFailed: false,
  },

  /**
   * Nubabel first: prioritize Nubabel results
   */
  NUBABEL_PRIORITY: {
    mode: "priority" as MergeMode,
    priorityOrder: ["nubabel", "omc"] as TaskSource[],
    filterFailed: false,
  },

  /**
   * Dedupe by content
   */
  DEDUPE: {
    mode: "dedupe" as MergeMode,
    filterFailed: true,
  },
} as const;

// ============================================
// FACTORY FUNCTIONS
// ============================================

/**
 * Create a result merger instance
 */
export function createResultMerger(): ResultMerger {
  return new ResultMerger();
}

/**
 * Merge results with default strategy
 */
export function mergeResults(
  results: TaskResult[],
  strategy: MergeStrategy = MERGE_STRATEGIES.DEFAULT,
): MergedResult {
  const merger = new ResultMerger();
  return merger.merge(results, strategy);
}

/**
 * Create a custom merge strategy
 */
export function createMergeStrategy(
  mode: MergeMode,
  options?: Omit<MergeStrategy, "mode">,
): MergeStrategy {
  return {
    mode,
    ...options,
  };
}

/**
 * Create a priority-based merge strategy
 */
export function createPriorityStrategy(
  priorityOrder: TaskSource[],
  filterFailed = false,
): MergeStrategy {
  return {
    mode: "priority",
    priorityOrder,
    filterFailed,
  };
}

/**
 * Create a custom merger strategy
 */
export function createCustomStrategy(
  merger: (results: TaskResult[]) => unknown,
  filterFailed = false,
): MergeStrategy {
  return {
    mode: "custom",
    customMerger: merger,
    filterFailed,
  };
}
