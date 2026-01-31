/**
 * Performance Tracker
 *
 * Tracks performance metrics for categories and skills in the orchestration system.
 * Collects success rates, response times, and other operational metrics.
 */

import { Category, Skill } from "./types";

// ============================================
// TYPES
// ============================================

/**
 * Individual performance metric record
 */
export interface PerformanceMetric {
  id: string;
  timestamp: Date;

  // Request context
  sessionId: string;
  userId: string;
  organizationId?: string;

  // Routing info
  category: Category;
  skills: Skill[];
  model?: string;

  // Outcome
  success: boolean;
  errorCode?: string;
  errorMessage?: string;

  // Timing
  responseTimeMs: number;
  selectionTimeMs?: number;
  executionTimeMs?: number;

  // Cost
  costCents?: number;
  inputTokens?: number;
  outputTokens?: number;

  // Additional context
  metadata?: Record<string, any>;
}

/**
 * Aggregated statistics for a skill
 */
export interface SkillStats {
  skill: Skill;
  totalRequests: number;

  // Success metrics
  successCount: number;
  failureCount: number;
  successRate: number;

  // Response time metrics
  avgResponseTimeMs: number;
  minResponseTimeMs: number;
  maxResponseTimeMs: number;
  medianResponseTimeMs: number;
  p95ResponseTimeMs: number;
  p99ResponseTimeMs: number;

  // Cost metrics
  avgCostCents: number;
  totalCostCents: number;
  avgInputTokens: number;
  avgOutputTokens: number;

  // Error breakdown
  errorCodes: Record<string, number>;

  // Time range
  firstSeen?: Date;
  lastSeen?: Date;
}

/**
 * Aggregated statistics for a category
 */
export interface CategoryStats {
  category: Category;
  totalRequests: number;

  // Success metrics
  successCount: number;
  failureCount: number;
  successRate: number;

  // Response time metrics
  avgResponseTimeMs: number;
  minResponseTimeMs: number;
  maxResponseTimeMs: number;
  medianResponseTimeMs: number;
  p95ResponseTimeMs: number;
  p99ResponseTimeMs: number;

  // Cost metrics
  avgCostCents: number;
  totalCostCents: number;

  // Skill breakdown
  skillDistribution: Record<Skill, number>;

  // Model breakdown
  modelDistribution: Record<string, number>;

  // Time range
  firstSeen?: Date;
  lastSeen?: Date;
}

/**
 * Overall system statistics
 */
export interface SystemStats {
  totalRequests: number;
  totalSuccesses: number;
  totalFailures: number;
  overallSuccessRate: number;

  avgResponseTimeMs: number;
  totalCostCents: number;

  categoryBreakdown: Record<Category, number>;
  skillBreakdown: Record<Skill, number>;
  modelBreakdown: Record<string, number>;

  requestsPerHour: number;
  requestsPerDay: number;

  // Time range
  trackingStarted?: Date;
  lastMetric?: Date;
}

/**
 * Time window for queries
 */
export type TimeWindow = "1h" | "6h" | "24h" | "7d" | "30d" | "all";

/**
 * Persistence hooks for external storage
 */
export interface PersistenceHooks {
  onMetricAdded?: (metric: PerformanceMetric) => Promise<void>;
  loadMetrics?: (since?: Date) => Promise<PerformanceMetric[]>;
  saveMetrics?: (metrics: PerformanceMetric[]) => Promise<void>;
}

// ============================================
// PERFORMANCE TRACKER
// ============================================

export class PerformanceTracker {
  private metrics: PerformanceMetric[] = [];
  private maxMetricsInMemory: number;
  private persistenceHooks?: PersistenceHooks;

  constructor(options?: { maxMetricsInMemory?: number; persistenceHooks?: PersistenceHooks }) {
    this.maxMetricsInMemory = options?.maxMetricsInMemory || 10000;
    this.persistenceHooks = options?.persistenceHooks;
  }

  /**
   * Record a new performance metric
   */
  async recordMetric(metric: Omit<PerformanceMetric, "id" | "timestamp">): Promise<void> {
    const fullMetric: PerformanceMetric = {
      ...metric,
      id: this.generateId(),
      timestamp: new Date(),
    };

    this.metrics.push(fullMetric);

    // Trim if over limit
    if (this.metrics.length > this.maxMetricsInMemory) {
      const trimCount = this.metrics.length - this.maxMetricsInMemory;
      this.metrics.splice(0, trimCount);
    }

    // Call persistence hook
    if (this.persistenceHooks?.onMetricAdded) {
      try {
        await this.persistenceHooks.onMetricAdded(fullMetric);
      } catch (err) {
        console.error("Failed to persist metric:", err);
      }
    }
  }

  /**
   * Record a metric synchronously (no persistence hook)
   */
  recordMetricSync(metric: Omit<PerformanceMetric, "id" | "timestamp">): void {
    const fullMetric: PerformanceMetric = {
      ...metric,
      id: this.generateId(),
      timestamp: new Date(),
    };

    this.metrics.push(fullMetric);

    if (this.metrics.length > this.maxMetricsInMemory) {
      const trimCount = this.metrics.length - this.maxMetricsInMemory;
      this.metrics.splice(0, trimCount);
    }
  }

  /**
   * Get statistics for a specific skill
   */
  getSkillStats(skill: Skill, window: TimeWindow = "24h"): SkillStats {
    const since = this.getWindowStart(window);
    const filtered = this.metrics.filter(
      (m) => m.skills.includes(skill) && (!since || m.timestamp >= since)
    );

    return this.calculateSkillStats(skill, filtered);
  }

  /**
   * Get statistics for all skills
   */
  getAllSkillStats(window: TimeWindow = "24h"): SkillStats[] {
    const skills = this.getUniqueSkills();
    return skills.map((skill) => this.getSkillStats(skill, window));
  }

  /**
   * Get statistics for a specific category
   */
  getCategoryStats(category: Category, window: TimeWindow = "24h"): CategoryStats {
    const since = this.getWindowStart(window);
    const filtered = this.metrics.filter(
      (m) => m.category === category && (!since || m.timestamp >= since)
    );

    return this.calculateCategoryStats(category, filtered);
  }

  /**
   * Get statistics for all categories
   */
  getAllCategoryStats(window: TimeWindow = "24h"): CategoryStats[] {
    const categories = this.getUniqueCategories();
    return categories.map((category) => this.getCategoryStats(category, window));
  }

  /**
   * Get overall system statistics
   */
  getSystemStats(window: TimeWindow = "24h"): SystemStats {
    const since = this.getWindowStart(window);
    const filtered = this.metrics.filter((m) => !since || m.timestamp >= since);

    if (filtered.length === 0) {
      return {
        totalRequests: 0,
        totalSuccesses: 0,
        totalFailures: 0,
        overallSuccessRate: 0,
        avgResponseTimeMs: 0,
        totalCostCents: 0,
        categoryBreakdown: {} as Record<Category, number>,
        skillBreakdown: {} as Record<Skill, number>,
        modelBreakdown: {},
        requestsPerHour: 0,
        requestsPerDay: 0,
      };
    }

    const successes = filtered.filter((m) => m.success).length;
    const failures = filtered.length - successes;
    const totalCost = filtered.reduce((sum, m) => sum + (m.costCents || 0), 0);
    const avgResponseTime =
      filtered.reduce((sum, m) => sum + m.responseTimeMs, 0) / filtered.length;

    // Category breakdown
    const categoryBreakdown: Record<string, number> = {};
    for (const m of filtered) {
      categoryBreakdown[m.category] = (categoryBreakdown[m.category] || 0) + 1;
    }

    // Skill breakdown
    const skillBreakdown: Record<string, number> = {};
    for (const m of filtered) {
      for (const skill of m.skills) {
        skillBreakdown[skill] = (skillBreakdown[skill] || 0) + 1;
      }
    }

    // Model breakdown
    const modelBreakdown: Record<string, number> = {};
    for (const m of filtered) {
      if (m.model) {
        modelBreakdown[m.model] = (modelBreakdown[m.model] || 0) + 1;
      }
    }

    // Calculate request rates
    const timeSpanMs = Date.now() - filtered[0].timestamp.getTime();
    const hoursSpan = Math.max(timeSpanMs / (1000 * 60 * 60), 1);
    const daysSpan = Math.max(timeSpanMs / (1000 * 60 * 60 * 24), 1);

    return {
      totalRequests: filtered.length,
      totalSuccesses: successes,
      totalFailures: failures,
      overallSuccessRate: successes / filtered.length,
      avgResponseTimeMs: avgResponseTime,
      totalCostCents: totalCost,
      categoryBreakdown: categoryBreakdown as Record<Category, number>,
      skillBreakdown: skillBreakdown as Record<Skill, number>,
      modelBreakdown,
      requestsPerHour: filtered.length / hoursSpan,
      requestsPerDay: filtered.length / daysSpan,
      trackingStarted: filtered[0]?.timestamp,
      lastMetric: filtered[filtered.length - 1]?.timestamp,
    };
  }

  /**
   * Get recent metrics for debugging
   */
  getRecentMetrics(limit = 100): PerformanceMetric[] {
    return this.metrics.slice(-limit);
  }

  /**
   * Get metrics by session
   */
  getMetricsBySession(sessionId: string): PerformanceMetric[] {
    return this.metrics.filter((m) => m.sessionId === sessionId);
  }

  /**
   * Get metrics by user
   */
  getMetricsByUser(userId: string, window: TimeWindow = "24h"): PerformanceMetric[] {
    const since = this.getWindowStart(window);
    return this.metrics.filter(
      (m) => m.userId === userId && (!since || m.timestamp >= since)
    );
  }

  /**
   * Get failed requests for analysis
   */
  getFailures(window: TimeWindow = "24h", limit = 100): PerformanceMetric[] {
    const since = this.getWindowStart(window);
    return this.metrics
      .filter((m) => !m.success && (!since || m.timestamp >= since))
      .slice(-limit);
  }

  /**
   * Get slow requests (above threshold)
   */
  getSlowRequests(thresholdMs: number, window: TimeWindow = "24h", limit = 100): PerformanceMetric[] {
    const since = this.getWindowStart(window);
    return this.metrics
      .filter(
        (m) => m.responseTimeMs > thresholdMs && (!since || m.timestamp >= since)
      )
      .slice(-limit);
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Get total metric count
   */
  getMetricCount(): number {
    return this.metrics.length;
  }

  /**
   * Export all metrics (for persistence)
   */
  exportMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Import metrics (from persistence)
   */
  importMetrics(metrics: PerformanceMetric[]): void {
    this.metrics = [...metrics];
    // Sort by timestamp
    this.metrics.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    // Trim if needed
    if (this.metrics.length > this.maxMetricsInMemory) {
      this.metrics = this.metrics.slice(-this.maxMetricsInMemory);
    }
  }

  /**
   * Load metrics from persistence
   */
  async loadFromPersistence(since?: Date): Promise<void> {
    if (!this.persistenceHooks?.loadMetrics) {
      return;
    }

    try {
      const loaded = await this.persistenceHooks.loadMetrics(since);
      this.importMetrics(loaded);
    } catch (err) {
      console.error("Failed to load metrics from persistence:", err);
    }
  }

  /**
   * Save metrics to persistence
   */
  async saveToPersistence(): Promise<void> {
    if (!this.persistenceHooks?.saveMetrics) {
      return;
    }

    try {
      await this.persistenceHooks.saveMetrics(this.metrics);
    } catch (err) {
      console.error("Failed to save metrics to persistence:", err);
    }
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private generateId(): string {
    return `pm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getWindowStart(window: TimeWindow): Date | null {
    const now = Date.now();
    switch (window) {
      case "1h":
        return new Date(now - 60 * 60 * 1000);
      case "6h":
        return new Date(now - 6 * 60 * 60 * 1000);
      case "24h":
        return new Date(now - 24 * 60 * 60 * 1000);
      case "7d":
        return new Date(now - 7 * 24 * 60 * 60 * 1000);
      case "30d":
        return new Date(now - 30 * 24 * 60 * 60 * 1000);
      case "all":
        return null;
    }
  }

  private getUniqueSkills(): Skill[] {
    const skills = new Set<Skill>();
    for (const m of this.metrics) {
      for (const skill of m.skills) {
        skills.add(skill);
      }
    }
    return Array.from(skills);
  }

  private getUniqueCategories(): Category[] {
    const categories = new Set<Category>();
    for (const m of this.metrics) {
      categories.add(m.category);
    }
    return Array.from(categories);
  }

  private calculateSkillStats(skill: Skill, metrics: PerformanceMetric[]): SkillStats {
    if (metrics.length === 0) {
      return {
        skill,
        totalRequests: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        avgResponseTimeMs: 0,
        minResponseTimeMs: 0,
        maxResponseTimeMs: 0,
        medianResponseTimeMs: 0,
        p95ResponseTimeMs: 0,
        p99ResponseTimeMs: 0,
        avgCostCents: 0,
        totalCostCents: 0,
        avgInputTokens: 0,
        avgOutputTokens: 0,
        errorCodes: {},
      };
    }

    const n = metrics.length;
    const successes = metrics.filter((m) => m.success).length;
    const failures = n - successes;

    // Response time stats
    const responseTimes = metrics.map((m) => m.responseTimeMs).sort((a, b) => a - b);
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / n;

    // Cost stats
    const costs = metrics.map((m) => m.costCents || 0);
    const totalCost = costs.reduce((a, b) => a + b, 0);
    const inputTokens = metrics.map((m) => m.inputTokens || 0);
    const outputTokens = metrics.map((m) => m.outputTokens || 0);

    // Error codes
    const errorCodes: Record<string, number> = {};
    for (const m of metrics) {
      if (!m.success && m.errorCode) {
        errorCodes[m.errorCode] = (errorCodes[m.errorCode] || 0) + 1;
      }
    }

    return {
      skill,
      totalRequests: n,
      successCount: successes,
      failureCount: failures,
      successRate: successes / n,
      avgResponseTimeMs: avgResponseTime,
      minResponseTimeMs: responseTimes[0],
      maxResponseTimeMs: responseTimes[n - 1],
      medianResponseTimeMs: responseTimes[Math.floor(n / 2)],
      p95ResponseTimeMs: responseTimes[Math.floor(n * 0.95)],
      p99ResponseTimeMs: responseTimes[Math.floor(n * 0.99)],
      avgCostCents: totalCost / n,
      totalCostCents: totalCost,
      avgInputTokens: inputTokens.reduce((a, b) => a + b, 0) / n,
      avgOutputTokens: outputTokens.reduce((a, b) => a + b, 0) / n,
      errorCodes,
      firstSeen: metrics[0]?.timestamp,
      lastSeen: metrics[n - 1]?.timestamp,
    };
  }

  private calculateCategoryStats(category: Category, metrics: PerformanceMetric[]): CategoryStats {
    if (metrics.length === 0) {
      return {
        category,
        totalRequests: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        avgResponseTimeMs: 0,
        minResponseTimeMs: 0,
        maxResponseTimeMs: 0,
        medianResponseTimeMs: 0,
        p95ResponseTimeMs: 0,
        p99ResponseTimeMs: 0,
        avgCostCents: 0,
        totalCostCents: 0,
        skillDistribution: {} as Record<Skill, number>,
        modelDistribution: {},
      };
    }

    const n = metrics.length;
    const successes = metrics.filter((m) => m.success).length;
    const failures = n - successes;

    // Response time stats
    const responseTimes = metrics.map((m) => m.responseTimeMs).sort((a, b) => a - b);
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / n;

    // Cost stats
    const costs = metrics.map((m) => m.costCents || 0);
    const totalCost = costs.reduce((a, b) => a + b, 0);

    // Skill distribution
    const skillDist: Record<string, number> = {};
    for (const m of metrics) {
      for (const skill of m.skills) {
        skillDist[skill] = (skillDist[skill] || 0) + 1;
      }
    }

    // Model distribution
    const modelDist: Record<string, number> = {};
    for (const m of metrics) {
      if (m.model) {
        modelDist[m.model] = (modelDist[m.model] || 0) + 1;
      }
    }

    return {
      category,
      totalRequests: n,
      successCount: successes,
      failureCount: failures,
      successRate: successes / n,
      avgResponseTimeMs: avgResponseTime,
      minResponseTimeMs: responseTimes[0],
      maxResponseTimeMs: responseTimes[n - 1],
      medianResponseTimeMs: responseTimes[Math.floor(n / 2)],
      p95ResponseTimeMs: responseTimes[Math.floor(n * 0.95)],
      p99ResponseTimeMs: responseTimes[Math.floor(n * 0.99)],
      avgCostCents: totalCost / n,
      totalCostCents: totalCost,
      skillDistribution: skillDist as Record<Skill, number>,
      modelDistribution: modelDist,
      firstSeen: metrics[0]?.timestamp,
      lastSeen: metrics[n - 1]?.timestamp,
    };
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const performanceTracker = new PerformanceTracker();

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Quick record with minimal info
 */
export function trackRequest(
  sessionId: string,
  userId: string,
  category: Category,
  skills: Skill[],
  success: boolean,
  responseTimeMs: number,
  options?: {
    organizationId?: string;
    model?: string;
    costCents?: number;
    errorCode?: string;
    errorMessage?: string;
    metadata?: Record<string, any>;
  }
): void {
  performanceTracker.recordMetricSync({
    sessionId,
    userId,
    category,
    skills,
    success,
    responseTimeMs,
    ...options,
  });
}

/**
 * Create a timer to track request duration
 */
export function createRequestTimer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}

/**
 * Wrap an async function with performance tracking
 */
export function withTracking<T>(
  fn: () => Promise<T>,
  context: {
    sessionId: string;
    userId: string;
    category: Category;
    skills: Skill[];
    organizationId?: string;
    model?: string;
  }
): Promise<T> {
  const getElapsed = createRequestTimer();

  return fn()
    .then((result) => {
      trackRequest(
        context.sessionId,
        context.userId,
        context.category,
        context.skills,
        true,
        getElapsed(),
        {
          organizationId: context.organizationId,
          model: context.model,
        }
      );
      return result;
    })
    .catch((error) => {
      trackRequest(
        context.sessionId,
        context.userId,
        context.category,
        context.skills,
        false,
        getElapsed(),
        {
          organizationId: context.organizationId,
          model: context.model,
          errorCode: error.code || "UNKNOWN",
          errorMessage: error.message,
        }
      );
      throw error;
    });
}
