/**
 * Time Pattern Detector
 * Detects recurring time-based patterns in user actions
 */

import { v4 as uuidv4 } from "uuid";
import { logger } from "../../utils/logger";
import type { SequencePattern, TimePattern, TimePatternOptions } from "./types";

interface TimestampedPattern {
  pattern: SequencePattern;
  timestamps: Date[];
}

export class TimePatternDetector {
  /**
   * Detect recurring time patterns in sequence patterns
   */
  async detectTimePatterns(
    patterns: TimestampedPattern[],
    options: TimePatternOptions,
  ): Promise<TimePattern[]> {
    const { minOccurrences, toleranceHours } = options;

    logger.debug("Starting time pattern detection", {
      patternCount: patterns.length,
      minOccurrences,
      toleranceHours,
    });

    const timePatterns: TimePattern[] = [];

    for (const { pattern, timestamps } of patterns) {
      if (timestamps.length < minOccurrences) continue;

      // Check for daily patterns
      const dailyPattern = this.detectDailyPattern(pattern, timestamps, toleranceHours);
      if (dailyPattern && dailyPattern.occurrences >= minOccurrences) {
        timePatterns.push(dailyPattern);
      }

      // Check for weekly patterns
      const weeklyPattern = this.detectWeeklyPattern(pattern, timestamps, toleranceHours);
      if (weeklyPattern && weeklyPattern.occurrences >= minOccurrences) {
        timePatterns.push(weeklyPattern);
      }

      // Check for monthly patterns
      const monthlyPattern = this.detectMonthlyPattern(pattern, timestamps, toleranceHours);
      if (monthlyPattern && monthlyPattern.occurrences >= minOccurrences) {
        timePatterns.push(monthlyPattern);
      }
    }

    logger.info("Time pattern detection completed", {
      inputPatterns: patterns.length,
      timePatternsFound: timePatterns.length,
    });

    return timePatterns;
  }

  /**
   * Predict the next occurrence of a time pattern
   */
  predictNextOccurrence(pattern: TimePattern): Date {
    const now = new Date();
    const next = new Date(now);

    switch (pattern.type) {
      case "daily":
        // Set to pattern's hour, if already passed today, set to tomorrow
        next.setHours(pattern.hourOfDay ?? 0, pattern.minute ?? 0, 0, 0);
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
        break;

      case "weekly":
        // Set to pattern's day of week and hour
        const targetDay = pattern.dayOfWeek ?? 0;
        const currentDay = next.getDay();
        let daysUntil = targetDay - currentDay;
        if (daysUntil < 0 || (daysUntil === 0 && next.getHours() >= (pattern.hourOfDay ?? 0))) {
          daysUntil += 7;
        }
        next.setDate(next.getDate() + daysUntil);
        next.setHours(pattern.hourOfDay ?? 0, pattern.minute ?? 0, 0, 0);
        break;

      case "monthly":
        // Set to pattern's day of month and hour
        next.setDate(pattern.dayOfMonth ?? 1);
        next.setHours(pattern.hourOfDay ?? 0, pattern.minute ?? 0, 0, 0);
        if (next <= now) {
          next.setMonth(next.getMonth() + 1);
        }
        break;

      case "quarterly":
        // Set to next quarter start
        const currentMonth = next.getMonth();
        const nextQuarterMonth = Math.floor(currentMonth / 3) * 3 + 3;
        next.setMonth(nextQuarterMonth, pattern.dayOfMonth ?? 1);
        next.setHours(pattern.hourOfDay ?? 0, pattern.minute ?? 0, 0, 0);
        if (next <= now) {
          next.setMonth(next.getMonth() + 3);
        }
        break;
    }

    return next;
  }

  /**
   * Generate a human-readable description of the time pattern
   */
  generateDescription(pattern: TimePattern): string {
    const hour = pattern.hourOfDay ?? 0;
    const minute = pattern.minute ?? 0;
    const timeStr = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    switch (pattern.type) {
      case "daily":
        return `Every day at ${timeStr}`;

      case "weekly":
        const dayName = dayNames[pattern.dayOfWeek ?? 0];
        return `Every ${dayName} at ${timeStr}`;

      case "monthly":
        const dayOfMonth = pattern.dayOfMonth ?? 1;
        const suffix = this.getOrdinalSuffix(dayOfMonth);
        return `Every month on the ${dayOfMonth}${suffix} at ${timeStr}`;

      case "quarterly":
        return `Quarterly on day ${pattern.dayOfMonth ?? 1} at ${timeStr}`;

      default:
        return "Unknown time pattern";
    }
  }

  /**
   * Detect daily pattern (same time each day)
   */
  private detectDailyPattern(
    pattern: SequencePattern,
    timestamps: Date[],
    toleranceHours: number,
  ): TimePattern | null {
    // Group by hour of day
    const hourCounts = new Map<number, number>();

    for (const ts of timestamps) {
      const hour = ts.getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    }

    // Find most common hour
    let maxHour = 0;
    let maxCount = 0;
    for (const [hour, count] of hourCounts) {
      if (count > maxCount) {
        maxHour = hour;
        maxCount = count;
      }
    }

    // Check if pattern is consistent (majority of occurrences in same hour window)
    const withinTolerance = timestamps.filter((ts) => {
      const hour = ts.getHours();
      return (
        Math.abs(hour - maxHour) <= toleranceHours ||
        Math.abs(hour - maxHour - 24) <= toleranceHours
      );
    }).length;

    if (withinTolerance < timestamps.length * 0.6) {
      return null; // Not consistent enough for daily pattern
    }

    // Calculate average minute
    const minutes = timestamps
      .filter((ts) => Math.abs(ts.getHours() - maxHour) <= toleranceHours)
      .map((ts) => ts.getMinutes());
    const avgMinute = Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length);

    const confidence = withinTolerance / timestamps.length;

    return {
      id: uuidv4(),
      type: "daily",
      description: "",
      hourOfDay: maxHour,
      minute: avgMinute,
      actionPattern: pattern,
      occurrences: withinTolerance,
      confidence,
    };
  }

  /**
   * Detect weekly pattern (same day and time each week)
   */
  private detectWeeklyPattern(
    pattern: SequencePattern,
    timestamps: Date[],
    toleranceHours: number,
  ): TimePattern | null {
    // Group by day of week and hour
    const dayCounts = new Map<number, { count: number; hours: number[] }>();

    for (const ts of timestamps) {
      const day = ts.getDay();
      const hour = ts.getHours();
      const existing = dayCounts.get(day) || { count: 0, hours: [] };
      existing.count++;
      existing.hours.push(hour);
      dayCounts.set(day, existing);
    }

    // Find most common day
    let maxDay = 0;
    let maxData = { count: 0, hours: [] as number[] };
    for (const [day, data] of dayCounts) {
      if (data.count > maxData.count) {
        maxDay = day;
        maxData = data;
      }
    }

    // Need at least 3 occurrences on same day
    if (maxData.count < 3) return null;

    // Check hour consistency
    const avgHour = Math.round(maxData.hours.reduce((a, b) => a + b, 0) / maxData.hours.length);
    const withinTolerance = maxData.hours.filter(
      (h) => Math.abs(h - avgHour) <= toleranceHours,
    ).length;

    if (withinTolerance < maxData.count * 0.6) {
      return null; // Hours not consistent enough
    }

    const confidence = (withinTolerance / timestamps.length) * 0.9; // Slightly lower than daily

    return {
      id: uuidv4(),
      type: "weekly",
      description: "",
      dayOfWeek: maxDay,
      hourOfDay: avgHour,
      minute: 0,
      actionPattern: pattern,
      occurrences: withinTolerance,
      confidence,
    };
  }

  /**
   * Detect monthly pattern (same day of month)
   */
  private detectMonthlyPattern(
    pattern: SequencePattern,
    timestamps: Date[],
    _toleranceHours: number,
  ): TimePattern | null {
    // Group by day of month
    const dayCounts = new Map<number, { count: number; hours: number[] }>();

    for (const ts of timestamps) {
      const day = ts.getDate();
      const hour = ts.getHours();
      const existing = dayCounts.get(day) || { count: 0, hours: [] };
      existing.count++;
      existing.hours.push(hour);
      dayCounts.set(day, existing);
    }

    // Find most common day of month
    let maxDay = 1;
    let maxData = { count: 0, hours: [] as number[] };
    for (const [day, data] of dayCounts) {
      if (data.count > maxData.count) {
        maxDay = day;
        maxData = data;
      }
    }

    // Need at least 2 months of data (2 occurrences)
    if (maxData.count < 2) return null;

    // Check hour consistency
    const avgHour = Math.round(maxData.hours.reduce((a, b) => a + b, 0) / maxData.hours.length);

    const confidence = (maxData.count / timestamps.length) * 0.8; // Lower confidence for monthly

    return {
      id: uuidv4(),
      type: "monthly",
      description: "",
      dayOfMonth: maxDay,
      hourOfDay: avgHour,
      minute: 0,
      actionPattern: pattern,
      occurrences: maxData.count,
      confidence,
    };
  }

  /**
   * Get ordinal suffix for a number (1st, 2nd, 3rd, etc.)
   */
  private getOrdinalSuffix(n: number): string {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }
}

// Export singleton instance
export const timePatternDetector = new TimePatternDetector();
