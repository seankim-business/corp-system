/**
 * Pattern Analyzer Service
 * Analyzes user work patterns to calculate task-user fit scores.
 * Considers: time of day productivity, day of week patterns, task type affinity.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";

export interface PatternScoreResult {
  score: number; // 0-100
  patterns: UserPattern[];
  optimalSlot: TimeSlot | null;
  reasoning: string;
}

export interface UserPattern {
  type: PatternType;
  confidence: number; // 0-1
  value: string | number;
  description: string;
}

export type PatternType =
  | "peak_hour"
  | "peak_day"
  | "task_type_affinity"
  | "completion_rate"
  | "velocity";

export interface TimeSlot {
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  hourOfDay: number; // 0-23
  productivity: number; // 0-1
}

interface PatternConfig {
  lookbackDays: number;
  minCompletedTasks: number;
  weights: {
    timeMatch: number;
    taskTypeAffinity: number;
    velocityFit: number;
    completionRate: number;
  };
}

const DEFAULT_CONFIG: PatternConfig = {
  lookbackDays: 30,
  minCompletedTasks: 5,
  weights: {
    timeMatch: 0.3,
    taskTypeAffinity: 0.25,
    velocityFit: 0.25,
    completionRate: 0.2,
  },
};

interface TaskCompletion {
  id: string;
  name: string;
  projectId: string | null;
  completedAt: Date;
  createdAt: Date;
}

export async function analyzeUserPatterns(
  userId: string,
  organizationId: string,
  config: Partial<PatternConfig> = {},
): Promise<UserPattern[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const patterns: UserPattern[] = [];

  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - cfg.lookbackDays);

  // Fetch completed tasks by user (via responsible/accountable fields)
  const completedTasks = await prisma.$queryRaw<TaskCompletion[]>`
    SELECT t.id, t.name, t.project_id as "projectId",
           t.updated_at as "completedAt", t.created_at as "createdAt"
    FROM tasks t
    WHERE t.organization_id = ${organizationId}::uuid
      AND t.status = '5_Done'
      AND t.updated_at >= ${lookbackDate}
      AND (
        ${userId}::uuid = ANY(t.responsible)
        OR ${userId}::uuid = ANY(t.accountable)
      )
    ORDER BY t.updated_at DESC
    LIMIT 100
  `;

  if (completedTasks.length < cfg.minCompletedTasks) {
    patterns.push({
      type: "completion_rate",
      confidence: 0.3,
      value: completedTasks.length,
      description: `Only ${completedTasks.length} completed tasks - limited pattern data`,
    });
    return patterns;
  }

  // Analyze peak hours
  const hourCounts = new Map<number, number>();
  for (const task of completedTasks) {
    const hour = new Date(task.completedAt).getHours();
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
  }

  const peakHour = [...hourCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (peakHour) {
    patterns.push({
      type: "peak_hour",
      confidence: peakHour[1] / completedTasks.length,
      value: peakHour[0],
      description: `Most productive around ${formatHour(peakHour[0])}`,
    });
  }

  // Analyze peak days
  const dayCounts = new Map<number, number>();
  for (const task of completedTasks) {
    const day = new Date(task.completedAt).getDay();
    dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
  }

  const peakDay = [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (peakDay) {
    patterns.push({
      type: "peak_day",
      confidence: peakDay[1] / completedTasks.length,
      value: peakDay[0],
      description: `Most productive on ${formatDay(peakDay[0])}`,
    });
  }

  // Calculate velocity (tasks per day)
  const uniqueDays = new Set(
    completedTasks.map((t) => new Date(t.completedAt).toDateString()),
  ).size;
  const velocity = completedTasks.length / Math.max(uniqueDays, 1);
  patterns.push({
    type: "velocity",
    confidence: Math.min(1, uniqueDays / 14), // More confident with more data points
    value: Math.round(velocity * 10) / 10,
    description: `Completes ~${Math.round(velocity * 10) / 10} tasks per active day`,
  });

  // Completion rate (for tasks started)
  const totalTasks = await prisma.task.count({
    where: {
      organizationId,
      createdAt: { gte: lookbackDate },
      OR: [
        { responsible: { has: userId } },
        { accountable: { has: userId } },
      ],
    },
  });

  const completionRate = totalTasks > 0 ? completedTasks.length / totalTasks : 0;
  patterns.push({
    type: "completion_rate",
    confidence: Math.min(1, totalTasks / 10),
    value: Math.round(completionRate * 100),
    description: `${Math.round(completionRate * 100)}% completion rate`,
  });

  logger.debug("User patterns analyzed", {
    userId,
    organizationId,
    patternCount: patterns.length,
    tasksSampled: completedTasks.length,
  });

  return patterns;
}

export async function calculatePatternScore(
  _taskId: string,
  userId: string,
  organizationId: string,
  currentTime: Date = new Date(),
  config: Partial<PatternConfig> = {},
): Promise<PatternScoreResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const patterns = await analyzeUserPatterns(userId, organizationId, cfg);

  if (patterns.length === 0) {
    return {
      score: 50, // Neutral score when no patterns
      patterns: [],
      optimalSlot: null,
      reasoning: "Insufficient data to analyze work patterns",
    };
  }

  let totalScore = 0;
  let totalWeight = 0;

  // Time match score
  const peakHourPattern = patterns.find((p) => p.type === "peak_hour");
  if (peakHourPattern && typeof peakHourPattern.value === "number") {
    const currentHour = currentTime.getHours();
    const hourDiff = Math.abs(currentHour - peakHourPattern.value);
    const normalizedDiff = Math.min(hourDiff, 24 - hourDiff);
    const timeScore = Math.max(0, 100 - normalizedDiff * 8);
    totalScore += timeScore * cfg.weights.timeMatch * peakHourPattern.confidence;
    totalWeight += cfg.weights.timeMatch;
  }

  // Day match score
  const peakDayPattern = patterns.find((p) => p.type === "peak_day");
  if (peakDayPattern && typeof peakDayPattern.value === "number") {
    const currentDay = currentTime.getDay();
    const dayMatch = currentDay === peakDayPattern.value;
    const dayScore = dayMatch ? 100 : 50;
    totalScore += dayScore * cfg.weights.taskTypeAffinity * peakDayPattern.confidence;
    totalWeight += cfg.weights.taskTypeAffinity;
  }

  // Velocity fit
  const velocityPattern = patterns.find((p) => p.type === "velocity");
  if (velocityPattern && typeof velocityPattern.value === "number") {
    const velocityScore = Math.min(100, velocityPattern.value * 30);
    totalScore += velocityScore * cfg.weights.velocityFit * velocityPattern.confidence;
    totalWeight += cfg.weights.velocityFit;
  }

  // Completion rate factor
  const completionPattern = patterns.find((p) => p.type === "completion_rate");
  if (completionPattern && typeof completionPattern.value === "number") {
    totalScore +=
      completionPattern.value * cfg.weights.completionRate * completionPattern.confidence;
    totalWeight += cfg.weights.completionRate;
  }

  const finalScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 50;

  // Determine optimal slot
  let optimalSlot: TimeSlot | null = null;
  if (peakHourPattern && peakDayPattern) {
    optimalSlot = {
      dayOfWeek: peakDayPattern.value as number,
      hourOfDay: peakHourPattern.value as number,
      productivity: Math.max(peakHourPattern.confidence, peakDayPattern.confidence),
    };
  }

  const reasoning = generatePatternReasoning(patterns, currentTime);

  return {
    score: finalScore,
    patterns,
    optimalSlot,
    reasoning,
  };
}

function generatePatternReasoning(patterns: UserPattern[], currentTime: Date): string {
  const parts: string[] = [];

  const peakHour = patterns.find((p) => p.type === "peak_hour");
  const peakDay = patterns.find((p) => p.type === "peak_day");
  const completionRate = patterns.find((p) => p.type === "completion_rate");

  if (peakHour && peakHour.confidence > 0.3) {
    const currentHour = currentTime.getHours();
    if (Math.abs(currentHour - (peakHour.value as number)) <= 2) {
      parts.push("Currently in peak productivity hours");
    }
  }

  if (peakDay && peakDay.confidence > 0.3) {
    const currentDay = currentTime.getDay();
    if (currentDay === peakDay.value) {
      parts.push(`${formatDay(peakDay.value as number)} is a high-productivity day`);
    }
  }

  if (completionRate && completionRate.confidence > 0.5) {
    if ((completionRate.value as number) >= 80) {
      parts.push("High completion rate");
    } else if ((completionRate.value as number) < 50) {
      parts.push("Consider workload - completion rate is below 50%");
    }
  }

  return parts.length > 0 ? parts.join(". ") : "Work patterns within normal range";
}

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function formatDay(day: number): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[day];
}

export async function calculateBatchPatternScores(
  taskIds: string[],
  userId: string,
  organizationId: string,
): Promise<Map<string, PatternScoreResult>> {
  const results = new Map<string, PatternScoreResult>();

  if (taskIds.length === 0) {
    return results;
  }

  // Patterns are user-based, so calculate once and apply to all tasks
  const currentTime = new Date();
  const baseResult = await calculatePatternScore(taskIds[0], userId, organizationId, currentTime);

  // All tasks get the same pattern score since it's user-based
  for (const id of taskIds) {
    results.set(id, baseResult);
  }

  return results;
}
