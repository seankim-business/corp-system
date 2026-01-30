import { redis } from "../db/redis";
import { logger } from "../utils/logger";

// =============================================================================
// Types
// =============================================================================

export type CategorySource = "keyword" | "llm" | "hybrid";

export interface CategoryStats {
  categoryId: string;
  totalSelections: number;
  accuracyRate: number;
  avgLatencyMs: number;
  sourceBreakdown: {
    keyword: number;
    llm: number;
    hybrid: number;
  };
}

export interface CategoryAccuracy {
  categoryId: string;
  totalSelections: number;
  correctCount: number;
  incorrectCount: number;
  unratedCount: number;
  accuracyRate: number;
  accuracyBySource: {
    keyword: { total: number; correct: number; rate: number };
    llm: { total: number; correct: number; rate: number };
    hybrid: { total: number; correct: number; rate: number };
  };
}

export interface DailyTrendEntry {
  date: string;
  totalSelections: number;
  correctCount: number;
  incorrectCount: number;
  avgLatencyMs: number;
  sourceBreakdown: {
    keyword: number;
    llm: number;
    hybrid: number;
  };
}

export interface TopCategory {
  categoryId: string;
  totalSelections: number;
  accuracyRate: number;
  avgLatencyMs: number;
}

// =============================================================================
// Constants
// =============================================================================

const STATS_PREFIX = "cat:stats";
const DAILY_PREFIX = "cat:daily";
const INDEX_KEY_SUFFIX = "__index";

const STATS_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const DAILY_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

// Hash field names for per-category counters
const FIELD_TOTAL = "total";
const FIELD_CORRECT = "correct";
const FIELD_INCORRECT = "incorrect";
const FIELD_KEYWORD_COUNT = "keyword_count";
const FIELD_LLM_COUNT = "llm_count";
const FIELD_HYBRID_COUNT = "hybrid_count";
const FIELD_TOTAL_DURATION_MS = "total_duration_ms";

// =============================================================================
// Helpers
// =============================================================================

function statsKey(orgId: string, categoryId: string): string {
  return `${STATS_PREFIX}:${orgId}:${categoryId}`;
}

function dailyKey(orgId: string, categoryId: string, date: string): string {
  return `${DAILY_PREFIX}:${orgId}:${categoryId}:${date}`;
}

function indexKey(orgId: string): string {
  return `${STATS_PREFIX}:${orgId}:${INDEX_KEY_SUFFIX}`;
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function sourceField(source: CategorySource): string {
  switch (source) {
    case "keyword":
      return FIELD_KEYWORD_COUNT;
    case "llm":
      return FIELD_LLM_COUNT;
    case "hybrid":
      return FIELD_HYBRID_COUNT;
  }
}

function parseIntSafe(value: string | undefined, fallback: number = 0): number {
  if (value === undefined || value === "") return fallback;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}

async function ensureCategoryIndexed(orgId: string, categoryId: string): Promise<void> {
  const key = indexKey(orgId);
  const existing = await redis.get(key);

  let categoryIds: string[] = [];
  if (existing) {
    try {
      categoryIds = JSON.parse(existing);
    } catch {
      categoryIds = [];
    }
  }

  if (!categoryIds.includes(categoryId)) {
    categoryIds.push(categoryId);
    await redis.set(key, JSON.stringify(categoryIds), STATS_TTL_SECONDS);
  }
}

async function getAllCategoryIds(orgId: string): Promise<string[]> {
  const key = indexKey(orgId);
  const data = await redis.get(key);
  if (!data) return [];

  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Record a routing category selection.
 *
 * Increments per-category hash counters and stores a daily trend entry.
 */
export async function recordCategorySelection(
  orgId: string,
  categoryId: string,
  source: CategorySource,
  durationMs: number,
  correct?: boolean,
): Promise<void> {
  try {
    const key = statsKey(orgId, categoryId);

    // Increment aggregate counters in the hash
    await redis.hincrby(key, FIELD_TOTAL, 1);
    await redis.hincrby(key, sourceField(source), 1);
    await redis.hincrby(key, FIELD_TOTAL_DURATION_MS, Math.round(durationMs));

    if (correct === true) {
      await redis.hincrby(key, FIELD_CORRECT, 1);
    } else if (correct === false) {
      await redis.hincrby(key, FIELD_INCORRECT, 1);
    }

    // Set TTL (refresh on each write)
    await redis.expire(key, STATS_TTL_SECONDS);

    // Update daily trend
    const date = todayDateString();
    const dKey = dailyKey(orgId, categoryId, date);
    const dailyRaw = await redis.get(dKey);

    let daily: DailyTrendEntry;
    if (dailyRaw) {
      try {
        daily = JSON.parse(dailyRaw);
      } catch {
        daily = createEmptyDailyEntry(date);
      }
    } else {
      daily = createEmptyDailyEntry(date);
    }

    daily.totalSelections += 1;
    if (correct === true) daily.correctCount += 1;
    if (correct === false) daily.incorrectCount += 1;

    // Recompute rolling average latency
    const prevTotal = daily.totalSelections - 1;
    daily.avgLatencyMs =
      prevTotal > 0
        ? Math.round((daily.avgLatencyMs * prevTotal + durationMs) / daily.totalSelections)
        : Math.round(durationMs);

    daily.sourceBreakdown[source] += 1;

    await redis.set(dKey, JSON.stringify(daily), DAILY_TTL_SECONDS);

    // Ensure category is in the org index
    await ensureCategoryIndexed(orgId, categoryId);

    logger.debug("Category selection recorded", {
      orgId,
      categoryId,
      source,
      durationMs,
      correct: correct ?? null,
    });
  } catch (err) {
    logger.warn("Failed to record category selection", {
      orgId,
      categoryId,
      error: String(err),
    });
  }
}

/**
 * Get aggregated stats for all categories in an organization.
 */
export async function getCategoryStats(orgId: string): Promise<CategoryStats[]> {
  const categoryIds = await getAllCategoryIds(orgId);
  if (categoryIds.length === 0) return [];

  const results: CategoryStats[] = [];

  for (const categoryId of categoryIds) {
    const key = statsKey(orgId, categoryId);
    const fields = await redis.hgetall(key);

    if (!fields || Object.keys(fields).length === 0) continue;

    const total = parseIntSafe(fields[FIELD_TOTAL]);
    if (total === 0) continue;

    const correct = parseIntSafe(fields[FIELD_CORRECT]);
    const incorrect = parseIntSafe(fields[FIELD_INCORRECT]);
    const rated = correct + incorrect;
    const totalDurationMs = parseIntSafe(fields[FIELD_TOTAL_DURATION_MS]);

    results.push({
      categoryId,
      totalSelections: total,
      accuracyRate: rated > 0 ? Math.round((correct / rated) * 1000) / 1000 : 0,
      avgLatencyMs: Math.round(totalDurationMs / total),
      sourceBreakdown: {
        keyword: parseIntSafe(fields[FIELD_KEYWORD_COUNT]),
        llm: parseIntSafe(fields[FIELD_LLM_COUNT]),
        hybrid: parseIntSafe(fields[FIELD_HYBRID_COUNT]),
      },
    });
  }

  return results.sort((a, b) => b.totalSelections - a.totalSelections);
}

/**
 * Get detailed accuracy information for a single category.
 */
export async function getCategoryAccuracy(
  orgId: string,
  categoryId: string,
): Promise<CategoryAccuracy> {
  const key = statsKey(orgId, categoryId);
  const fields = await redis.hgetall(key);

  const total = parseIntSafe(fields[FIELD_TOTAL]);
  const correct = parseIntSafe(fields[FIELD_CORRECT]);
  const incorrect = parseIntSafe(fields[FIELD_INCORRECT]);
  const rated = correct + incorrect;
  const unrated = Math.max(0, total - rated);

  // Per-source accuracy requires daily trend data for detailed breakdowns.
  // For the hash-based approach we track aggregate source counts but not
  // per-source correct/incorrect in the hash. We compute what we can:
  // source totals from the hash, per-source accuracy from daily data.
  const keywordTotal = parseIntSafe(fields[FIELD_KEYWORD_COUNT]);
  const llmTotal = parseIntSafe(fields[FIELD_LLM_COUNT]);
  const hybridTotal = parseIntSafe(fields[FIELD_HYBRID_COUNT]);

  // Aggregate daily data for per-source accuracy
  const dailyEntries = await fetchDailyEntries(orgId, categoryId, 30);
  const sourceAccuracy = computeSourceAccuracy(dailyEntries, keywordTotal, llmTotal, hybridTotal);

  return {
    categoryId,
    totalSelections: total,
    correctCount: correct,
    incorrectCount: incorrect,
    unratedCount: unrated,
    accuracyRate: rated > 0 ? Math.round((correct / rated) * 1000) / 1000 : 0,
    accuracyBySource: sourceAccuracy,
  };
}

/**
 * Get daily aggregated trend data for an organization over a number of days.
 */
export async function getCategoryTrends(
  orgId: string,
  days: number,
): Promise<DailyTrendEntry[]> {
  const categoryIds = await getAllCategoryIds(orgId);
  if (categoryIds.length === 0) return [];

  const dates = generateDateRange(days);
  const aggregatedByDate = new Map<string, DailyTrendEntry>();

  // Initialize empty entries for each date
  for (const date of dates) {
    aggregatedByDate.set(date, createEmptyDailyEntry(date));
  }

  // Aggregate across all categories
  for (const categoryId of categoryIds) {
    for (const date of dates) {
      const dKey = dailyKey(orgId, categoryId, date);
      const raw = await redis.get(dKey);
      if (!raw) continue;

      let entry: DailyTrendEntry;
      try {
        entry = JSON.parse(raw);
      } catch {
        continue;
      }

      const agg = aggregatedByDate.get(date)!;
      const prevTotal = agg.totalSelections;
      const newTotal = prevTotal + entry.totalSelections;

      // Weighted average for latency
      if (newTotal > 0) {
        agg.avgLatencyMs = Math.round(
          (agg.avgLatencyMs * prevTotal + entry.avgLatencyMs * entry.totalSelections) / newTotal,
        );
      }

      agg.totalSelections = newTotal;
      agg.correctCount += entry.correctCount;
      agg.incorrectCount += entry.incorrectCount;
      agg.sourceBreakdown.keyword += entry.sourceBreakdown.keyword;
      agg.sourceBreakdown.llm += entry.sourceBreakdown.llm;
      agg.sourceBreakdown.hybrid += entry.sourceBreakdown.hybrid;
    }
  }

  return dates
    .map((date) => aggregatedByDate.get(date)!)
    .filter((entry) => entry.totalSelections > 0);
}

/**
 * Record user feedback on a routing decision's accuracy.
 *
 * Updates both the aggregate hash counters and the daily trend for today.
 */
export async function recordFeedback(
  orgId: string,
  categoryId: string,
  _sessionId: string,
  correct: boolean,
): Promise<void> {
  try {
    const key = statsKey(orgId, categoryId);

    if (correct) {
      await redis.hincrby(key, FIELD_CORRECT, 1);
    } else {
      await redis.hincrby(key, FIELD_INCORRECT, 1);
    }

    await redis.expire(key, STATS_TTL_SECONDS);

    // Update daily trend
    const date = todayDateString();
    const dKey = dailyKey(orgId, categoryId, date);
    const dailyRaw = await redis.get(dKey);

    let daily: DailyTrendEntry;
    if (dailyRaw) {
      try {
        daily = JSON.parse(dailyRaw);
      } catch {
        daily = createEmptyDailyEntry(date);
      }
    } else {
      daily = createEmptyDailyEntry(date);
    }

    if (correct) {
      daily.correctCount += 1;
    } else {
      daily.incorrectCount += 1;
    }

    await redis.set(dKey, JSON.stringify(daily), DAILY_TTL_SECONDS);

    logger.debug("Category feedback recorded", {
      orgId,
      categoryId,
      correct,
    });
  } catch (err) {
    logger.warn("Failed to record category feedback", {
      orgId,
      categoryId,
      error: String(err),
    });
  }
}

/**
 * Get the most-used categories ranked by total selection count.
 */
export async function getTopCategories(
  orgId: string,
  limit: number,
): Promise<TopCategory[]> {
  const stats = await getCategoryStats(orgId);
  return stats.slice(0, limit).map((s) => ({
    categoryId: s.categoryId,
    totalSelections: s.totalSelections,
    accuracyRate: s.accuracyRate,
    avgLatencyMs: s.avgLatencyMs,
  }));
}

// =============================================================================
// Internal Helpers
// =============================================================================

function createEmptyDailyEntry(date: string): DailyTrendEntry {
  return {
    date,
    totalSelections: 0,
    correctCount: 0,
    incorrectCount: 0,
    avgLatencyMs: 0,
    sourceBreakdown: {
      keyword: 0,
      llm: 0,
      hybrid: 0,
    },
  };
}

function generateDateRange(days: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

async function fetchDailyEntries(
  orgId: string,
  categoryId: string,
  days: number,
): Promise<DailyTrendEntry[]> {
  const dates = generateDateRange(days);
  const entries: DailyTrendEntry[] = [];

  for (const date of dates) {
    const dKey = dailyKey(orgId, categoryId, date);
    const raw = await redis.get(dKey);
    if (!raw) continue;

    try {
      entries.push(JSON.parse(raw));
    } catch {
      // Skip malformed entries
    }
  }

  return entries;
}

function computeSourceAccuracy(
  dailyEntries: DailyTrendEntry[],
  keywordTotal: number,
  llmTotal: number,
  hybridTotal: number,
): CategoryAccuracy["accuracyBySource"] {
  // Aggregate correct counts per source from daily data.
  // Daily entries store source breakdown counts but not per-source correct/incorrect
  // individually, so we estimate proportionally from overall daily correct/incorrect
  // relative to source counts for that day.
  let keywordCorrect = 0;
  let llmCorrect = 0;
  let hybridCorrect = 0;

  for (const entry of dailyEntries) {
    const dayTotal = entry.totalSelections;
    if (dayTotal === 0) continue;

    const dayCorrectRate = entry.correctCount / dayTotal;

    // Proportional estimate: assume accuracy is uniform across sources in a given day
    keywordCorrect += Math.round(entry.sourceBreakdown.keyword * dayCorrectRate);
    llmCorrect += Math.round(entry.sourceBreakdown.llm * dayCorrectRate);
    hybridCorrect += Math.round(entry.sourceBreakdown.hybrid * dayCorrectRate);
  }

  return {
    keyword: {
      total: keywordTotal,
      correct: Math.min(keywordCorrect, keywordTotal),
      rate: keywordTotal > 0 ? Math.round((Math.min(keywordCorrect, keywordTotal) / keywordTotal) * 1000) / 1000 : 0,
    },
    llm: {
      total: llmTotal,
      correct: Math.min(llmCorrect, llmTotal),
      rate: llmTotal > 0 ? Math.round((Math.min(llmCorrect, llmTotal) / llmTotal) * 1000) / 1000 : 0,
    },
    hybrid: {
      total: hybridTotal,
      correct: Math.min(hybridCorrect, hybridTotal),
      rate: hybridTotal > 0 ? Math.round((Math.min(hybridCorrect, hybridTotal) / hybridTotal) * 1000) / 1000 : 0,
    },
  };
}
