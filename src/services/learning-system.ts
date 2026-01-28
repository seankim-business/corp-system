/**
 * Learning System - Observation Service
 *
 * Tracks user patterns and behaviors to enable AI agents to learn and improve.
 * Implements the "Human as Training Data" concept from the landing page.
 *
 * Key Features:
 * - Observation tracking: Records user actions (workflow executions, approvals, Slack commands)
 * - Pattern detection: Identifies recurring behaviors and workflows
 * - Learning data storage: Persists patterns for agent improvement
 */

import Redis from "ioredis";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";
import { db as prisma } from "../db/client";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

// ============================================================================
// TYPES
// ============================================================================

export type ObservationType =
  | "workflow_execution"
  | "approval_response"
  | "slack_command"
  | "task_creation"
  | "task_completion"
  | "search_query"
  | "document_access"
  | "manual_override";

export interface Observation {
  id: string;
  organizationId: string;
  userId: string;
  type: ObservationType;
  action: string;
  context: Record<string, unknown>;
  timestamp: Date;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface DetectedPattern {
  id: string;
  organizationId: string;
  type: PatternType;
  name: string;
  description: string;
  frequency: number;
  confidence: number;
  observations: string[]; // Observation IDs that contributed to this pattern
  suggestedAction?: string;
  lastDetected: Date;
  createdAt: Date;
}

export type PatternType =
  | "recurring_workflow"
  | "time_based_action"
  | "approval_sequence"
  | "search_pattern"
  | "task_sequence"
  | "preference";

export interface LearningInsight {
  id: string;
  organizationId: string;
  patternId: string;
  insight: string;
  actionable: boolean;
  suggestedAutomation?: string;
  createdAt: Date;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

interface LearningConfig {
  enabled: boolean;
  observationRetentionDays: number;
  patternDetectionThreshold: number; // Minimum occurrences to detect a pattern
  confidenceThreshold: number; // Minimum confidence (0-1) to report a pattern
  batchSize: number;
  analysisIntervalMs: number;
}

const DEFAULT_CONFIG: LearningConfig = {
  enabled: true,
  observationRetentionDays: 90,
  patternDetectionThreshold: 3,
  confidenceThreshold: 0.7,
  batchSize: 100,
  analysisIntervalMs: 60 * 60 * 1000, // 1 hour
};

let config: LearningConfig = DEFAULT_CONFIG;
let analysisInterval: ReturnType<typeof setInterval> | null = null;

// Redis keys
const OBSERVATION_LIST_PREFIX = "learning:observations:";
const PATTERN_HASH_PREFIX = "learning:patterns:";
const OBSERVATION_BUFFER_KEY = "learning:observation_buffer";

// ============================================================================
// CONFIGURATION
// ============================================================================

export function configureLearningSystem(customConfig: Partial<LearningConfig>): void {
  config = { ...DEFAULT_CONFIG, ...customConfig };
  logger.info("Learning system configured", { config });
}

export async function startLearningSystem(): Promise<void> {
  if (!config.enabled) {
    logger.info("Learning system is disabled");
    return;
  }

  if (analysisInterval) {
    logger.warn("Learning system already running");
    return;
  }

  logger.info("Starting learning system", { intervalMs: config.analysisIntervalMs });

  // Run initial analysis
  await runPatternAnalysis();

  // Schedule periodic analysis
  analysisInterval = setInterval(runPatternAnalysis, config.analysisIntervalMs);
}

export function stopLearningSystem(): void {
  if (analysisInterval) {
    clearInterval(analysisInterval);
    analysisInterval = null;
    logger.info("Learning system stopped");
  }
}

// ============================================================================
// OBSERVATION TRACKING
// ============================================================================

/**
 * Record a user observation for pattern learning
 */
export async function recordObservation(
  observation: Omit<Observation, "id" | "timestamp">,
): Promise<string> {
  const id = generateObservationId();
  const fullObservation: Observation = {
    ...observation,
    id,
    timestamp: new Date(),
  };

  try {
    // Store in Redis buffer for batch processing
    await redis.lpush(OBSERVATION_BUFFER_KEY, JSON.stringify(fullObservation));

    // Also store in org-specific list for querying
    const orgListKey = `${OBSERVATION_LIST_PREFIX}${observation.organizationId}`;
    await redis.lpush(orgListKey, JSON.stringify(fullObservation));
    await redis.ltrim(orgListKey, 0, 999); // Keep last 1000 observations
    await redis.expire(orgListKey, config.observationRetentionDays * 24 * 60 * 60);

    metrics.increment("learning.observation_recorded", { type: observation.type });

    logger.debug("Observation recorded", {
      observationId: id,
      type: observation.type,
      action: observation.action,
    });

    return id;
  } catch (error) {
    logger.error(
      "Failed to record observation",
      { observationId: id },
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}

/**
 * Record workflow execution observation
 */
export async function recordWorkflowExecution(
  organizationId: string,
  userId: string,
  workflowId: string,
  workflowName: string,
  input: Record<string, unknown>,
  success: boolean,
  durationMs: number,
): Promise<string> {
  return recordObservation({
    organizationId,
    userId,
    type: "workflow_execution",
    action: `execute:${workflowName}`,
    context: {
      workflowId,
      workflowName,
      input,
      success,
      durationMs,
    },
  });
}

/**
 * Record approval response observation
 */
export async function recordApprovalResponse(
  organizationId: string,
  userId: string,
  approvalId: string,
  approvalType: string,
  decision: "approved" | "rejected",
  responseTimeMs: number,
): Promise<string> {
  return recordObservation({
    organizationId,
    userId,
    type: "approval_response",
    action: `${decision}:${approvalType}`,
    context: {
      approvalId,
      approvalType,
      decision,
      responseTimeMs,
    },
  });
}

/**
 * Record Slack command observation
 */
export async function recordSlackCommand(
  organizationId: string,
  userId: string,
  command: string,
  args: string[],
  channelId: string,
  success: boolean,
): Promise<string> {
  return recordObservation({
    organizationId,
    userId,
    type: "slack_command",
    action: `slack:${command}`,
    context: {
      command,
      args,
      channelId,
      success,
    },
  });
}

/**
 * Record task creation observation
 */
export async function recordTaskCreation(
  organizationId: string,
  userId: string,
  taskId: string,
  taskName: string,
  project?: string,
  priority?: string,
): Promise<string> {
  return recordObservation({
    organizationId,
    userId,
    type: "task_creation",
    action: "create_task",
    context: {
      taskId,
      taskName,
      project,
      priority,
    },
  });
}

/**
 * Record search query observation
 */
export async function recordSearchQuery(
  organizationId: string,
  userId: string,
  query: string,
  source: string,
  resultCount: number,
): Promise<string> {
  return recordObservation({
    organizationId,
    userId,
    type: "search_query",
    action: `search:${source}`,
    context: {
      query,
      source,
      resultCount,
    },
  });
}

/**
 * Record manual override observation (when user corrects AI)
 */
export async function recordManualOverride(
  organizationId: string,
  userId: string,
  originalAction: string,
  correctedAction: string,
  reason?: string,
): Promise<string> {
  return recordObservation({
    organizationId,
    userId,
    type: "manual_override",
    action: "override",
    context: {
      originalAction,
      correctedAction,
      reason,
    },
  });
}

// ============================================================================
// PATTERN DETECTION
// ============================================================================

/**
 * Run pattern analysis on collected observations
 */
async function runPatternAnalysis(): Promise<void> {
  logger.debug("Running pattern analysis");

  try {
    const organizations = await getActiveOrganizations();

    for (const orgId of organizations) {
      const patterns = await detectPatternsForOrg(orgId);

      for (const pattern of patterns) {
        await storePattern(pattern);
      }

      if (patterns.length > 0) {
        logger.info("Patterns detected", {
          organizationId: orgId,
          patternCount: patterns.length,
        });
      }
    }

    metrics.increment("learning.pattern_analysis_completed");
  } catch (error) {
    logger.error(
      "Pattern analysis failed",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    metrics.increment("learning.pattern_analysis_errors");
  }
}

/**
 * Detect patterns for a specific organization
 */
async function detectPatternsForOrg(organizationId: string): Promise<DetectedPattern[]> {
  const observations = await getObservationsForOrg(organizationId);
  const patterns: DetectedPattern[] = [];

  // Detect recurring workflows
  const workflowPatterns = detectRecurringWorkflows(organizationId, observations);
  patterns.push(...workflowPatterns);

  // Detect time-based patterns
  const timePatterns = detectTimeBasedPatterns(organizationId, observations);
  patterns.push(...timePatterns);

  // Detect approval sequences
  const approvalPatterns = detectApprovalSequences(organizationId, observations);
  patterns.push(...approvalPatterns);

  // Detect search patterns
  const searchPatterns = detectSearchPatterns(organizationId, observations);
  patterns.push(...searchPatterns);

  // Filter by confidence threshold
  return patterns.filter((p) => p.confidence >= config.confidenceThreshold);
}

/**
 * Detect recurring workflow patterns
 */
function detectRecurringWorkflows(
  organizationId: string,
  observations: Observation[],
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const workflowObservations = observations.filter((o) => o.type === "workflow_execution");

  // Group by action (workflow name)
  const byAction = groupBy(workflowObservations, (o) => o.action);

  for (const [action, obs] of Object.entries(byAction)) {
    if (obs.length >= config.patternDetectionThreshold) {
      // Calculate average time between executions
      const timestamps = obs.map((o) => o.timestamp.getTime()).sort();
      const intervals: number[] = [];
      for (let i = 1; i < timestamps.length; i++) {
        intervals.push(timestamps[i] - timestamps[i - 1]);
      }

      const avgInterval =
        intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0;
      const confidence = calculateConfidence(obs.length, intervals);

      patterns.push({
        id: generatePatternId(),
        organizationId,
        type: "recurring_workflow",
        name: action.replace("execute:", ""),
        description: `Workflow "${action.replace("execute:", "")}" executed ${obs.length} times`,
        frequency: obs.length,
        confidence,
        observations: obs.map((o) => o.id),
        suggestedAction:
          avgInterval > 0 && avgInterval < 7 * 24 * 60 * 60 * 1000
            ? `Consider scheduling this workflow automatically (avg interval: ${Math.round(avgInterval / (60 * 60 * 1000))} hours)`
            : undefined,
        lastDetected: new Date(),
        createdAt: new Date(),
      });
    }
  }

  return patterns;
}

/**
 * Detect time-based action patterns (e.g., always runs at 9am Monday)
 */
function detectTimeBasedPatterns(
  organizationId: string,
  observations: Observation[],
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // Group by action and hour of day
  const byActionAndHour = new Map<string, Map<number, Observation[]>>();

  for (const obs of observations) {
    const hour = obs.timestamp.getHours();
    const key = obs.action;

    if (!byActionAndHour.has(key)) {
      byActionAndHour.set(key, new Map());
    }

    const hourMap = byActionAndHour.get(key)!;
    if (!hourMap.has(hour)) {
      hourMap.set(hour, []);
    }
    hourMap.get(hour)!.push(obs);
  }

  for (const [action, hourMap] of byActionAndHour) {
    for (const [hour, obs] of hourMap) {
      if (obs.length >= config.patternDetectionThreshold) {
        const confidence = obs.length / observations.filter((o) => o.action === action).length;

        if (confidence >= config.confidenceThreshold) {
          patterns.push({
            id: generatePatternId(),
            organizationId,
            type: "time_based_action",
            name: `${action} at ${hour}:00`,
            description: `Action "${action}" typically occurs around ${hour}:00`,
            frequency: obs.length,
            confidence,
            observations: obs.map((o) => o.id),
            suggestedAction: `Consider automating "${action}" at ${hour}:00 daily`,
            lastDetected: new Date(),
            createdAt: new Date(),
          });
        }
      }
    }
  }

  return patterns;
}

/**
 * Detect approval sequence patterns
 */
function detectApprovalSequences(
  organizationId: string,
  observations: Observation[],
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const approvalObs = observations.filter((o) => o.type === "approval_response");

  // Group by approval type and decision
  const byTypeAndDecision = new Map<string, Observation[]>();

  for (const obs of approvalObs) {
    const context = obs.context as { approvalType: string; decision: string };
    const key = `${context.approvalType}:${context.decision}`;

    if (!byTypeAndDecision.has(key)) {
      byTypeAndDecision.set(key, []);
    }
    byTypeAndDecision.get(key)!.push(obs);
  }

  for (const [key, obs] of byTypeAndDecision) {
    if (obs.length >= config.patternDetectionThreshold) {
      const [type, decision] = key.split(":");
      const totalForType = approvalObs.filter(
        (o) => (o.context as { approvalType: string }).approvalType === type,
      ).length;
      const confidence = obs.length / totalForType;

      if (confidence >= config.confidenceThreshold) {
        patterns.push({
          id: generatePatternId(),
          organizationId,
          type: "approval_sequence",
          name: `${type} usually ${decision}`,
          description: `${type} approvals are ${decision} ${Math.round(confidence * 100)}% of the time`,
          frequency: obs.length,
          confidence,
          observations: obs.map((o) => o.id),
          suggestedAction:
            confidence > 0.9 && decision === "approved"
              ? `Consider auto-approving ${type} requests (${Math.round(confidence * 100)}% approval rate)`
              : undefined,
          lastDetected: new Date(),
          createdAt: new Date(),
        });
      }
    }
  }

  return patterns;
}

/**
 * Detect search patterns
 */
function detectSearchPatterns(
  organizationId: string,
  observations: Observation[],
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const searchObs = observations.filter((o) => o.type === "search_query");

  // Group by similar queries (basic similarity)
  const queryGroups = new Map<string, Observation[]>();

  for (const obs of searchObs) {
    const query = ((obs.context as { query: string }).query || "").toLowerCase();
    const normalizedQuery = normalizeQuery(query);

    if (!queryGroups.has(normalizedQuery)) {
      queryGroups.set(normalizedQuery, []);
    }
    queryGroups.get(normalizedQuery)!.push(obs);
  }

  for (const [query, obs] of queryGroups) {
    if (obs.length >= config.patternDetectionThreshold) {
      const confidence = calculateConfidence(obs.length, []);

      patterns.push({
        id: generatePatternId(),
        organizationId,
        type: "search_pattern",
        name: `Frequent search: "${query}"`,
        description: `Users frequently search for "${query}" (${obs.length} times)`,
        frequency: obs.length,
        confidence,
        observations: obs.map((o) => o.id),
        suggestedAction: `Consider creating a quick-access shortcut for "${query}"`,
        lastDetected: new Date(),
        createdAt: new Date(),
      });
    }
  }

  return patterns;
}

// ============================================================================
// STORAGE & RETRIEVAL
// ============================================================================

/**
 * Store a detected pattern
 */
async function storePattern(pattern: DetectedPattern): Promise<void> {
  const patternKey = `${PATTERN_HASH_PREFIX}${pattern.organizationId}:${pattern.id}`;

  await redis.hset(patternKey, {
    id: pattern.id,
    organizationId: pattern.organizationId,
    type: pattern.type,
    name: pattern.name,
    description: pattern.description,
    frequency: pattern.frequency.toString(),
    confidence: pattern.confidence.toString(),
    observations: JSON.stringify(pattern.observations),
    suggestedAction: pattern.suggestedAction || "",
    lastDetected: pattern.lastDetected.toISOString(),
    createdAt: pattern.createdAt.toISOString(),
  });

  await redis.expire(patternKey, config.observationRetentionDays * 24 * 60 * 60);

  // Add to org pattern index
  const indexKey = `${PATTERN_HASH_PREFIX}${pattern.organizationId}:index`;
  await redis.sadd(indexKey, pattern.id);
  await redis.expire(indexKey, config.observationRetentionDays * 24 * 60 * 60);

  metrics.increment("learning.pattern_stored", { type: pattern.type });
}

/**
 * Get patterns for an organization
 */
export async function getPatternsForOrg(organizationId: string): Promise<DetectedPattern[]> {
  const indexKey = `${PATTERN_HASH_PREFIX}${organizationId}:index`;
  const patternIds = await redis.smembers(indexKey);

  const patterns: DetectedPattern[] = [];

  for (const patternId of patternIds) {
    const patternKey = `${PATTERN_HASH_PREFIX}${organizationId}:${patternId}`;
    const data = await redis.hgetall(patternKey);

    if (data && data.id) {
      patterns.push({
        id: data.id,
        organizationId: data.organizationId,
        type: data.type as PatternType,
        name: data.name,
        description: data.description,
        frequency: parseInt(data.frequency, 10),
        confidence: parseFloat(data.confidence),
        observations: JSON.parse(data.observations || "[]"),
        suggestedAction: data.suggestedAction || undefined,
        lastDetected: new Date(data.lastDetected),
        createdAt: new Date(data.createdAt),
      });
    }
  }

  return patterns.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get observations for an organization
 */
async function getObservationsForOrg(organizationId: string): Promise<Observation[]> {
  const orgListKey = `${OBSERVATION_LIST_PREFIX}${organizationId}`;
  const observationStrings = await redis.lrange(orgListKey, 0, config.batchSize - 1);

  return observationStrings.map((s) => {
    const parsed = JSON.parse(s);
    return {
      ...parsed,
      timestamp: new Date(parsed.timestamp),
    };
  });
}

/**
 * Get learning insights for an organization
 */
export async function getLearningInsights(organizationId: string): Promise<LearningInsight[]> {
  const patterns = await getPatternsForOrg(organizationId);

  return patterns
    .filter((p) => p.suggestedAction)
    .map((p) => ({
      id: `insight_${p.id}`,
      organizationId,
      patternId: p.id,
      insight: p.suggestedAction!,
      actionable: true,
      suggestedAutomation: generateAutomationSuggestion(p),
      createdAt: p.lastDetected,
    }));
}

/**
 * Get observation statistics for an organization
 */
export async function getObservationStats(organizationId: string): Promise<{
  totalObservations: number;
  byType: Record<ObservationType, number>;
  lastObservation: Date | null;
  patternsDetected: number;
}> {
  const observations = await getObservationsForOrg(organizationId);
  const patterns = await getPatternsForOrg(organizationId);

  const byType: Record<string, number> = {};
  for (const obs of observations) {
    byType[obs.type] = (byType[obs.type] || 0) + 1;
  }

  return {
    totalObservations: observations.length,
    byType: byType as Record<ObservationType, number>,
    lastObservation: observations.length > 0 ? observations[0].timestamp : null,
    patternsDetected: patterns.length,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

async function getActiveOrganizations(): Promise<string[]> {
  const orgs = await prisma.organization.findMany({
    select: { id: true },
  });
  return orgs.map((org: { id: string }) => org.id);
}

function generateObservationId(): string {
  return `obs_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function generatePatternId(): string {
  return `pat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(item);
  }
  return result;
}

function calculateConfidence(occurrences: number, intervals: number[]): number {
  // Base confidence from occurrence count
  let confidence = Math.min(0.5 + occurrences * 0.05, 0.9);

  // Adjust for consistency of intervals (if available)
  if (intervals.length > 1) {
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avg, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const cv = avg > 0 ? stdDev / avg : 1; // Coefficient of variation

    // Lower CV = more consistent = higher confidence
    if (cv < 0.2) confidence = Math.min(confidence + 0.1, 0.95);
    else if (cv > 0.5) confidence = Math.max(confidence - 0.1, 0.5);
  }

  return confidence;
}

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 2)
    .sort()
    .join(" ");
}

function generateAutomationSuggestion(pattern: DetectedPattern): string | undefined {
  switch (pattern.type) {
    case "recurring_workflow":
      return `Create scheduled workflow for "${pattern.name}"`;
    case "time_based_action":
      return `Set up daily trigger for "${pattern.name}"`;
    case "approval_sequence":
      return pattern.confidence > 0.9 ? `Enable auto-approval rule for ${pattern.name}` : undefined;
    case "search_pattern":
      return `Create saved search or dashboard widget for "${pattern.name}"`;
    default:
      return undefined;
  }
}

// ============================================================================
// EXPORTS FOR EXTERNAL INTEGRATION
// ============================================================================

export { runPatternAnalysis as triggerPatternAnalysis };
