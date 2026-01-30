import { logger } from "../utils/logger";

export interface AgentResult {
  agentId: string;
  skillId: string;
  success: boolean;
  data: unknown;
  durationMs: number;
  error?: string;
  confidence: number;
}

export type AggregationStrategy = "merge" | "priority" | "voting" | "best_confidence" | "weighted_merge";

export interface AggregatedResult {
  success: boolean;
  data: unknown;
  strategy: AggregationStrategy;
  sourceCount: number;
  confidence: number;
  conflicts: ConflictInfo[];
}

export interface ConflictInfo {
  field: string;
  values: unknown[];
  agentIds: string[];
}

/**
 * Deep-merge two objects. Arrays are concatenated, primitives from
 * the second object win. Handles nested objects recursively.
 */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    const targetVal = target[key];
    const sourceVal = source[key];

    if (
      targetVal !== null &&
      sourceVal !== null &&
      typeof targetVal === "object" &&
      typeof sourceVal === "object" &&
      !Array.isArray(targetVal) &&
      !Array.isArray(sourceVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else if (Array.isArray(targetVal) && Array.isArray(sourceVal)) {
      result[key] = [...targetVal, ...sourceVal];
    } else {
      result[key] = sourceVal;
    }
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Aggregate results from parallel agents using the specified strategy.
 */
export function aggregateResults(
  results: AgentResult[],
  strategy: AggregationStrategy,
): AggregatedResult {
  if (results.length === 0) {
    logger.warn("No results to aggregate");
    return {
      success: false,
      data: null,
      strategy,
      sourceCount: 0,
      confidence: 0,
      conflicts: [],
    };
  }

  logger.debug("Aggregating results", {
    strategy,
    resultCount: results.length,
    agentIds: results.map((r) => r.agentId),
  });

  const conflicts = detectConflicts(results);

  switch (strategy) {
    case "merge":
      return aggregateMerge(results, conflicts);
    case "priority":
      return aggregatePriority(results, conflicts);
    case "voting":
      return aggregateVoting(results, conflicts);
    case "best_confidence":
      return aggregateBestConfidence(results, conflicts);
    case "weighted_merge":
      return aggregateWeightedMerge(results, conflicts);
  }
}

/**
 * Merge strategy: deep-merge all successful result data objects.
 */
function aggregateMerge(
  results: AgentResult[],
  conflicts: ConflictInfo[],
): AggregatedResult {
  const successful = results.filter((r) => r.success);

  if (successful.length === 0) {
    return {
      success: false,
      data: null,
      strategy: "merge",
      sourceCount: results.length,
      confidence: 0,
      conflicts,
    };
  }

  let merged: Record<string, unknown> = {};

  for (const result of successful) {
    if (isRecord(result.data)) {
      merged = deepMerge(merged, result.data);
    }
  }

  const avgConfidence =
    successful.reduce((sum, r) => sum + r.confidence, 0) / successful.length;

  logger.debug("Merge aggregation complete", {
    successCount: successful.length,
    totalCount: results.length,
    confidence: avgConfidence,
  });

  return {
    success: true,
    data: merged,
    strategy: "merge",
    sourceCount: results.length,
    confidence: avgConfidence,
    conflicts,
  };
}

/**
 * Priority strategy: return the first successful result in array order.
 */
function aggregatePriority(
  results: AgentResult[],
  conflicts: ConflictInfo[],
): AggregatedResult {
  const firstSuccess = results.find((r) => r.success);

  if (!firstSuccess) {
    return {
      success: false,
      data: null,
      strategy: "priority",
      sourceCount: results.length,
      confidence: 0,
      conflicts,
    };
  }

  logger.debug("Priority aggregation selected result", {
    agentId: firstSuccess.agentId,
    confidence: firstSuccess.confidence,
  });

  return {
    success: true,
    data: firstSuccess.data,
    strategy: "priority",
    sourceCount: results.length,
    confidence: firstSuccess.confidence,
    conflicts,
  };
}

/**
 * Voting strategy: majority rules on success/failure.
 * Merges data from the winning side.
 */
function aggregateVoting(
  results: AgentResult[],
  conflicts: ConflictInfo[],
): AggregatedResult {
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.length - successCount;
  const majoritySuccess = successCount >= failCount;

  const winningResults = results.filter((r) => r.success === majoritySuccess);

  let data: unknown = null;
  if (winningResults.length > 0) {
    let merged: Record<string, unknown> = {};
    for (const result of winningResults) {
      if (isRecord(result.data)) {
        merged = deepMerge(merged, result.data);
      }
    }
    data = Object.keys(merged).length > 0 ? merged : winningResults[0].data;
  }

  const avgConfidence =
    winningResults.reduce((sum, r) => sum + r.confidence, 0) /
    winningResults.length;

  logger.debug("Voting aggregation complete", {
    successCount,
    failCount,
    majoritySuccess,
    confidence: avgConfidence,
  });

  return {
    success: majoritySuccess,
    data,
    strategy: "voting",
    sourceCount: results.length,
    confidence: avgConfidence,
    conflicts,
  };
}

/**
 * Best-confidence strategy: return the result with the highest confidence score.
 */
function aggregateBestConfidence(
  results: AgentResult[],
  conflicts: ConflictInfo[],
): AggregatedResult {
  let best = results[0];
  for (const result of results) {
    if (result.confidence > best.confidence) {
      best = result;
    }
  }

  logger.debug("Best-confidence aggregation selected result", {
    agentId: best.agentId,
    confidence: best.confidence,
  });

  return {
    success: best.success,
    data: best.data,
    strategy: "best_confidence",
    sourceCount: results.length,
    confidence: best.confidence,
    conflicts,
  };
}

/**
 * Weighted-merge strategy: merge results with higher confidence having
 * proportionally more influence. Numeric fields are weighted-averaged,
 * text fields use the highest confidence result.
 */
function aggregateWeightedMerge(
  results: AgentResult[],
  conflicts: ConflictInfo[],
): AggregatedResult {
  const successful = results.filter((r) => r.success);

  if (successful.length === 0) {
    return {
      success: false,
      data: null,
      strategy: "weighted_merge",
      sourceCount: results.length,
      confidence: 0,
      conflicts,
    };
  }

  // Normalize confidence scores to sum to 1
  const totalConfidence = successful.reduce((sum, r) => sum + r.confidence, 0);
  const weights = successful.map((r) => r.confidence / totalConfidence);

  // Collect all top-level keys
  const allKeys = new Set<string>();
  for (const result of successful) {
    if (isRecord(result.data)) {
      for (const key of Object.keys(result.data)) {
        allKeys.add(key);
      }
    }
  }

  const merged: Record<string, unknown> = {};

  // Process each key
  for (const key of allKeys) {
    const values: Array<{ value: unknown; weight: number }> = [];

    for (let i = 0; i < successful.length; i++) {
      const result = successful[i];
      if (isRecord(result.data) && key in result.data) {
        values.push({ value: result.data[key], weight: weights[i] });
      }
    }

    if (values.length === 0) continue;

    // Check if all values are numeric
    const allNumeric = values.every(
      (v) => typeof v.value === "number" && !isNaN(v.value),
    );

    if (allNumeric) {
      // Weighted average for numeric fields
      const weightedSum = values.reduce(
        (sum, v) => sum + (v.value as number) * v.weight,
        0,
      );
      merged[key] = weightedSum;
    } else {
      // For non-numeric fields, use the value from the highest confidence result
      const maxWeightValue = values.reduce((max, v) =>
        v.weight > max.weight ? v : max,
      );
      merged[key] = maxWeightValue.value;
    }
  }

  // Weighted average confidence
  const weightedConfidence = successful.reduce(
    (sum, r, i) => sum + r.confidence * weights[i],
    0,
  );

  logger.debug("Weighted-merge aggregation complete", {
    successCount: successful.length,
    totalCount: results.length,
    confidence: weightedConfidence,
  });

  return {
    success: true,
    data: merged,
    strategy: "weighted_merge",
    sourceCount: results.length,
    confidence: weightedConfidence,
    conflicts,
  };
}

/**
 * Detect conflicting results across agents by comparing top-level
 * fields of data objects. Fields with differing values are reported.
 */
export function detectConflicts(results: AgentResult[]): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];
  const successful = results.filter((r) => r.success && isRecord(r.data));

  if (successful.length < 2) {
    return conflicts;
  }

  // Collect all top-level keys across results
  const allKeys = new Set<string>();
  for (const result of successful) {
    const data = result.data as Record<string, unknown>;
    for (const key of Object.keys(data)) {
      allKeys.add(key);
    }
  }

  // Check each key for conflicting values
  for (const key of allKeys) {
    const valuesByAgent: Array<{ agentId: string; value: unknown }> = [];

    for (const result of successful) {
      const data = result.data as Record<string, unknown>;
      if (key in data) {
        valuesByAgent.push({ agentId: result.agentId, value: data[key] });
      }
    }

    if (valuesByAgent.length < 2) {
      continue;
    }

    // Compare values using JSON serialization for deep equality
    const serialized = valuesByAgent.map((v) => JSON.stringify(v.value));
    const uniqueValues = new Set(serialized);

    if (uniqueValues.size > 1) {
      conflicts.push({
        field: key,
        values: valuesByAgent.map((v) => v.value),
        agentIds: valuesByAgent.map((v) => v.agentId),
      });
    }
  }

  if (conflicts.length > 0) {
    logger.warn("Conflicts detected in agent results", {
      conflictCount: conflicts.length,
      fields: conflicts.map((c) => c.field),
    });
  }

  return conflicts;
}

/**
 * Resolve conflicts by re-aggregating results with the given strategy.
 * This is a convenience wrapper that detects conflicts and then
 * applies the aggregation strategy as the resolution mechanism.
 */
export function resolveConflicts(
  results: AgentResult[],
  strategy: AggregationStrategy,
): AggregatedResult {
  const conflicts = detectConflicts(results);

  if (conflicts.length === 0) {
    logger.debug("No conflicts to resolve");
    return aggregateResults(results, strategy);
  }

  logger.info("Resolving conflicts with strategy", {
    strategy,
    conflictCount: conflicts.length,
    fields: conflicts.map((c) => c.field),
  });

  return aggregateResults(results, strategy);
}

/**
 * Generate a human-readable summary of aggregated results.
 * Provides an overview of agent count, key findings, and confidence level.
 */
export function generateSummary(results: AgentResult[]): string {
  if (results.length === 0) {
    return "No agent results to summarize.";
  }

  const successful = results.filter((r) => r.success);
  const avgConfidence =
    results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

  const confidenceLevel =
    avgConfidence >= 0.8 ? "high" : avgConfidence >= 0.5 ? "moderate" : "low";

  let summary = `Aggregated results from ${results.length} agent${results.length > 1 ? "s" : ""}. `;

  if (successful.length === results.length) {
    summary += `All agents completed successfully with ${confidenceLevel} confidence (${(avgConfidence * 100).toFixed(0)}%). `;
  } else if (successful.length > 0) {
    summary += `${successful.length} succeeded, ${results.length - successful.length} failed, with ${confidenceLevel} overall confidence (${(avgConfidence * 100).toFixed(0)}%). `;
  } else {
    summary += `All agents failed with ${confidenceLevel} confidence (${(avgConfidence * 100).toFixed(0)}%). `;
  }

  // Add key findings if data is available
  const firstSuccessful = successful[0];
  if (firstSuccessful && isRecord(firstSuccessful.data)) {
    const keyCount = Object.keys(firstSuccessful.data).length;
    summary += `Results contain ${keyCount} key finding${keyCount > 1 ? "s" : ""}.`;
  }

  return summary;
}
