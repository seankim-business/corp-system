import { redis } from "../db/redis";
import { logger } from "../utils/logger";

// =============================================================================
// Types
// =============================================================================

export interface SkillMetrics {
  skillId: string;
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgDurationMs: number;
  p95DurationMs: number;
  lastExecutedAt: string | null;
}

export interface SkillExecutionRecord {
  skillId: string;
  organizationId: string;
  durationMs: number;
  success: boolean;
  timestamp: number;
}

// =============================================================================
// Constants
// =============================================================================

const METRICS_PREFIX = "skill:metrics:";
const RECENT_PREFIX = "skill:recent:";
const METRICS_TTL = 86400; // 24 hours
const RECENT_TTL = 3600; // 1 hour for recent execution list
const MAX_RECENT_ENTRIES = 100;

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Record a skill execution for performance tracking.
 */
export async function recordSkillExecution(record: SkillExecutionRecord): Promise<void> {
  const { skillId, organizationId, durationMs, success, timestamp } = record;
  const metricsKey = `${METRICS_PREFIX}${organizationId}:${skillId}`;
  const recentKey = `${RECENT_PREFIX}${organizationId}:${skillId}`;

  try {
    // Get current metrics
    const existing = await redis.get(metricsKey);
    let metrics: StoredMetrics;

    if (existing) {
      try {
        metrics = JSON.parse(existing);
      } catch {
        metrics = createEmptyMetrics();
      }
    } else {
      metrics = createEmptyMetrics();
    }

    // Update counters
    metrics.totalExecutions += 1;
    if (success) {
      metrics.successCount += 1;
    } else {
      metrics.failureCount += 1;
    }

    // Update rolling average duration
    metrics.totalDurationMs += durationMs;
    metrics.lastExecutedAt = timestamp;

    // Store recent durations for p95 calculation
    metrics.recentDurations.push(durationMs);
    if (metrics.recentDurations.length > MAX_RECENT_ENTRIES) {
      metrics.recentDurations = metrics.recentDurations.slice(-MAX_RECENT_ENTRIES);
    }

    await redis.set(metricsKey, JSON.stringify(metrics), METRICS_TTL);

    // Store recent execution entry
    const entry = JSON.stringify({ durationMs, success, timestamp });
    const recentData = await redis.get(recentKey);
    let recentList: string[] = [];
    if (recentData) {
      try {
        recentList = JSON.parse(recentData);
      } catch {
        recentList = [];
      }
    }
    recentList.push(entry);
    if (recentList.length > MAX_RECENT_ENTRIES) {
      recentList = recentList.slice(-MAX_RECENT_ENTRIES);
    }
    await redis.set(recentKey, JSON.stringify(recentList), RECENT_TTL);

    logger.debug("Skill execution recorded", {
      skillId,
      organizationId,
      durationMs,
      success,
      totalExecutions: metrics.totalExecutions,
    });
  } catch (err) {
    logger.warn("Failed to record skill execution", {
      skillId,
      organizationId,
      error: String(err),
    });
  }
}

/**
 * Get performance metrics for a specific skill within an organization.
 */
export async function getSkillMetrics(
  skillId: string,
  organizationId: string,
): Promise<SkillMetrics> {
  const metricsKey = `${METRICS_PREFIX}${organizationId}:${skillId}`;

  const data = await redis.get(metricsKey);
  if (!data) {
    return {
      skillId,
      totalExecutions: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 0,
      avgDurationMs: 0,
      p95DurationMs: 0,
      lastExecutedAt: null,
    };
  }

  let metrics: StoredMetrics;
  try {
    metrics = JSON.parse(data);
  } catch {
    return {
      skillId,
      totalExecutions: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 0,
      avgDurationMs: 0,
      p95DurationMs: 0,
      lastExecutedAt: null,
    };
  }

  const successRate =
    metrics.totalExecutions > 0 ? metrics.successCount / metrics.totalExecutions : 0;
  const avgDurationMs =
    metrics.totalExecutions > 0
      ? Math.round(metrics.totalDurationMs / metrics.totalExecutions)
      : 0;
  const p95DurationMs = calculateP95(metrics.recentDurations);

  return {
    skillId,
    totalExecutions: metrics.totalExecutions,
    successCount: metrics.successCount,
    failureCount: metrics.failureCount,
    successRate: Math.round(successRate * 1000) / 1000,
    avgDurationMs,
    p95DurationMs,
    lastExecutedAt: metrics.lastExecutedAt
      ? new Date(metrics.lastExecutedAt).toISOString()
      : null,
  };
}

/**
 * Get metrics for all tracked skills in an organization.
 */
export async function getAllSkillMetrics(organizationId: string): Promise<SkillMetrics[]> {
  // Since we can't use redis.keys(), we maintain a skill index
  const indexKey = `${METRICS_PREFIX}${organizationId}:__index`;
  const indexData = await redis.get(indexKey);

  if (!indexData) {
    return [];
  }

  let skillIds: string[];
  try {
    skillIds = JSON.parse(indexData);
  } catch {
    return [];
  }

  const results: SkillMetrics[] = [];
  for (const skillId of skillIds) {
    const metrics = await getSkillMetrics(skillId, organizationId);
    if (metrics.totalExecutions > 0) {
      results.push(metrics);
    }
  }

  return results.sort((a, b) => b.totalExecutions - a.totalExecutions);
}

/**
 * Register a skill in the organization's index for enumeration.
 */
export async function registerSkillInIndex(
  skillId: string,
  organizationId: string,
): Promise<void> {
  const indexKey = `${METRICS_PREFIX}${organizationId}:__index`;
  const indexData = await redis.get(indexKey);

  let skillIds: string[] = [];
  if (indexData) {
    try {
      skillIds = JSON.parse(indexData);
    } catch {
      skillIds = [];
    }
  }

  if (!skillIds.includes(skillId)) {
    skillIds.push(skillId);
    await redis.set(indexKey, JSON.stringify(skillIds), METRICS_TTL);
  }
}

/**
 * Get the top performing skills by success rate.
 */
export async function getTopSkills(
  organizationId: string,
  limit = 10,
): Promise<SkillMetrics[]> {
  const all = await getAllSkillMetrics(organizationId);
  return all
    .filter((m) => m.totalExecutions >= 3) // Minimum executions for ranking
    .sort((a, b) => b.successRate - a.successRate)
    .slice(0, limit);
}

/**
 * Get skills that are performing poorly (low success rate or high latency).
 */
export async function getPoorlyPerformingSkills(
  organizationId: string,
  successRateThreshold = 0.7,
  latencyThresholdMs = 10000,
): Promise<SkillMetrics[]> {
  const all = await getAllSkillMetrics(organizationId);
  return all.filter(
    (m) =>
      m.totalExecutions >= 3 &&
      (m.successRate < successRateThreshold || m.avgDurationMs > latencyThresholdMs),
  );
}

// =============================================================================
// Internal Types and Helpers
// =============================================================================

interface StoredMetrics {
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  lastExecutedAt: number | null;
  recentDurations: number[];
}

function createEmptyMetrics(): StoredMetrics {
  return {
    totalExecutions: 0,
    successCount: 0,
    failureCount: 0,
    totalDurationMs: 0,
    lastExecutedAt: null,
    recentDurations: [],
  };
}

function calculateP95(durations: number[]): number {
  if (durations.length === 0) return 0;

  const sorted = [...durations].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.min(index, sorted.length - 1)];
}
