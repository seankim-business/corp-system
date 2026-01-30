import { logger } from "../utils/logger";
import { createHash } from "crypto";

export interface LoopDetectorConfig {
  maxDepth: number;
  maxRepeats: number;
  maxDuration: number; // ms
}

export interface ExecutionStep {
  skillId: string;
  timestamp: number;
  inputHash: string;
}

export interface LoopCheckResult {
  detected: boolean;
  reason?: string;
}

const DEFAULT_CONFIG: LoopDetectorConfig = {
  maxDepth: 10,
  maxRepeats: 3,
  maxDuration: 60000,
};

/**
 * Detects and prevents infinite loops in agent execution chains.
 *
 * Uses in-memory storage (Map) since tracking is per-session and ephemeral.
 * Detection methods:
 * - Depth check: total steps exceed maxDepth
 * - Cycle detection: same skillId called more than maxRepeats times
 * - Pattern detection: same sequence of 2+ skills repeating
 * - Duration check: total elapsed time exceeds maxDuration
 */
export class LoopDetector {
  private sessions: Map<string, ExecutionStep[]>;
  private config: LoopDetectorConfig;

  constructor(config?: Partial<LoopDetectorConfig>) {
    this.sessions = new Map();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Record an execution step for a session.
   */
  recordStep(sessionId: string, step: ExecutionStep): void {
    const steps = this.sessions.get(sessionId) ?? [];
    steps.push(step);
    this.sessions.set(sessionId, steps);

    logger.debug("Recorded execution step", {
      sessionId,
      skillId: step.skillId,
      stepCount: steps.length,
    });
  }

  /**
   * Check whether the session's execution path contains a loop.
   * Returns a result indicating whether a loop was detected, and why.
   */
  checkForLoop(sessionId: string): LoopCheckResult {
    const steps = this.sessions.get(sessionId);

    if (!steps || steps.length === 0) {
      return { detected: false };
    }

    // 1. Depth check
    const depthResult = this.checkDepth(steps);
    if (depthResult.detected) {
      logger.warn("Loop detected: depth exceeded", {
        sessionId,
        stepCount: steps.length,
        maxDepth: this.config.maxDepth,
      });
      return depthResult;
    }

    // 2. Cycle detection: same skillId called too many times
    const cycleResult = this.checkCycles(steps);
    if (cycleResult.detected) {
      logger.warn("Loop detected: cycle found", {
        sessionId,
        reason: cycleResult.reason,
      });
      return cycleResult;
    }

    // 3. Pattern detection: repeating sequences
    const patternResult = this.checkPatterns(steps);
    if (patternResult.detected) {
      logger.warn("Loop detected: repeating pattern", {
        sessionId,
        reason: patternResult.reason,
      });
      return patternResult;
    }

    // 4. Duration check
    const durationResult = this.checkDuration(steps);
    if (durationResult.detected) {
      logger.warn("Loop detected: duration exceeded", {
        sessionId,
        reason: durationResult.reason,
      });
      return durationResult;
    }

    return { detected: false };
  }

  /**
   * Return the ordered list of execution steps for a session.
   */
  getExecutionPath(sessionId: string): ExecutionStep[] {
    return this.sessions.get(sessionId) ?? [];
  }

  /**
   * Clear tracking data for a session.
   */
  reset(sessionId: string): void {
    this.sessions.delete(sessionId);
    logger.debug("Loop detector reset for session", { sessionId });
  }

  /**
   * Check if the execution depth exceeds the maximum allowed.
   */
  private checkDepth(steps: ExecutionStep[]): LoopCheckResult {
    if (steps.length > this.config.maxDepth) {
      return {
        detected: true,
        reason: `Execution depth ${steps.length} exceeds maximum of ${this.config.maxDepth}`,
      };
    }
    return { detected: false };
  }

  /**
   * Check if any single skillId has been called more than maxRepeats times.
   */
  private checkCycles(steps: ExecutionStep[]): LoopCheckResult {
    const counts = new Map<string, number>();

    for (const step of steps) {
      const count = (counts.get(step.skillId) ?? 0) + 1;
      counts.set(step.skillId, count);

      if (count > this.config.maxRepeats) {
        return {
          detected: true,
          reason: `Skill "${step.skillId}" called ${count} times, exceeds maximum of ${this.config.maxRepeats}`,
        };
      }
    }

    return { detected: false };
  }

  /**
   * Check for repeating sequences of 2 or more skills.
   * Looks for a subsequence that repeats consecutively.
   */
  private checkPatterns(steps: ExecutionStep[]): LoopCheckResult {
    const ids = steps.map((s) => s.skillId);

    // Check sequences of length 2 through half the total steps
    const maxPatternLen = Math.floor(ids.length / 2);

    for (let patternLen = 2; patternLen <= maxPatternLen; patternLen++) {
      const repeatCount = this.countConsecutiveRepeats(ids, patternLen);

      if (repeatCount >= this.config.maxRepeats) {
        const pattern = ids.slice(ids.length - patternLen).join(" -> ");
        return {
          detected: true,
          reason: `Sequence [${pattern}] repeated ${repeatCount} times`,
        };
      }
    }

    return { detected: false };
  }

  /**
   * Count how many times the last `patternLen` elements repeat
   * consecutively from the end of the array.
   */
  private countConsecutiveRepeats(ids: string[], patternLen: number): number {
    if (ids.length < patternLen * 2) {
      return 1;
    }

    const pattern = ids.slice(ids.length - patternLen);
    let repeats = 1;
    let pos = ids.length - patternLen * 2;

    while (pos >= 0) {
      const segment = ids.slice(pos, pos + patternLen);
      const matches = segment.every((id, i) => id === pattern[i]);

      if (!matches) {
        break;
      }

      repeats++;
      pos -= patternLen;
    }

    return repeats;
  }

  /**
   * Check if the total elapsed time from the first to the last step
   * exceeds the maximum duration.
   */
  private checkDuration(steps: ExecutionStep[]): LoopCheckResult {
    if (steps.length < 2) {
      return { detected: false };
    }

    const firstTimestamp = steps[0].timestamp;
    const lastTimestamp = steps[steps.length - 1].timestamp;
    const elapsed = lastTimestamp - firstTimestamp;

    if (elapsed > this.config.maxDuration) {
      return {
        detected: true,
        reason: `Execution duration ${elapsed}ms exceeds maximum of ${this.config.maxDuration}ms`,
      };
    }

    return { detected: false };
  }
}

/**
 * Utility to generate an input hash for an execution step.
 * Produces a short SHA-256 hex digest from arbitrary input data.
 */
export function hashInput(input: unknown): string {
  const serialized = JSON.stringify(input);
  return createHash("sha256").update(serialized).digest("hex").substring(0, 16);
}
