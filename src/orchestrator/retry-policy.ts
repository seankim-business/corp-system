import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";
import { AgentErrorHandler, AgentErrorType } from "./error-handler";

export interface RetryPolicy {
  maxAttempts: number;
  baseDelay: number; // ms
  maxDelay: number; // ms
  backoffMultiplier: number;
  retryableErrors: AgentErrorType[];
  jitterFactor?: number; // 0-1, percentage of delay to add as jitter
}

export const DEFAULT_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableErrors: ["tool_failure", "timeout", "rate_limit", "network_error"],
  jitterFactor: 0.2,
};

export const AGGRESSIVE_POLICY: RetryPolicy = {
  maxAttempts: 5,
  baseDelay: 500,
  maxDelay: 60000,
  backoffMultiplier: 2,
  retryableErrors: ["tool_failure", "timeout", "rate_limit", "network_error"],
  jitterFactor: 0.3,
};

export const CONSERVATIVE_POLICY: RetryPolicy = {
  maxAttempts: 2,
  baseDelay: 2000,
  maxDelay: 15000,
  backoffMultiplier: 1.5,
  retryableErrors: ["timeout", "network_error"],
  jitterFactor: 0.1,
};

export interface RetryContext {
  agentId: string;
  stepId?: string;
  workflowId?: string;
}

interface RetryState {
  attempts: number;
  lastError?: Error;
  totalDelay: number;
}

function calculateDelay(
  attempt: number,
  policy: RetryPolicy,
  overrideDelay?: number,
): number {
  // If override delay is specified (e.g., from rate limit header), use it
  if (overrideDelay && overrideDelay > 0) {
    return Math.min(overrideDelay, policy.maxDelay);
  }

  // Calculate exponential backoff
  const exponentialDelay = policy.baseDelay * Math.pow(policy.backoffMultiplier, attempt - 1);

  // Apply jitter
  const jitter = policy.jitterFactor
    ? exponentialDelay * policy.jitterFactor * Math.random()
    : 0;

  // Cap at max delay
  return Math.min(Math.round(exponentialDelay + jitter), policy.maxDelay);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(
  error: Error,
  policy: RetryPolicy,
  errorHandler: AgentErrorHandler,
  context: RetryContext,
): { retryable: boolean; retryAfter?: number } {
  const classified = errorHandler.classify(error, context.agentId, context.stepId);

  if (!policy.retryableErrors.includes(classified.type)) {
    return { retryable: false };
  }

  return {
    retryable: classified.retryable,
    retryAfter: classified.retryAfter ? classified.retryAfter * 1000 : undefined,
  };
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy = DEFAULT_POLICY,
  context: RetryContext,
): Promise<T> {
  const errorHandler = new AgentErrorHandler({ maxRetryAttempts: policy.maxAttempts });
  const state: RetryState = {
    attempts: 0,
    totalDelay: 0,
  };

  while (state.attempts < policy.maxAttempts) {
    state.attempts++;

    try {
      logger.debug("Executing with retry", {
        ...context,
        attempt: state.attempts,
        maxAttempts: policy.maxAttempts,
      });

      const result = await fn();

      // Success
      if (state.attempts > 1) {
        logger.info("Operation succeeded after retries", {
          ...context,
          attempts: state.attempts,
          totalDelay: state.totalDelay,
        });

        metrics.increment("retry.success_after_retry", {
          agentId: context.agentId,
          attempts: String(state.attempts),
        });
      }

      return result;
    } catch (error) {
      state.lastError = error instanceof Error ? error : new Error(String(error));

      const { retryable, retryAfter } = isRetryableError(
        state.lastError,
        policy,
        errorHandler,
        context,
      );

      logger.warn("Operation failed", {
        ...context,
        attempt: state.attempts,
        maxAttempts: policy.maxAttempts,
        retryable,
        error: state.lastError.message.substring(0, 200),
      });

      metrics.increment("retry.attempt_failed", {
        agentId: context.agentId,
        attempt: String(state.attempts),
        retryable: String(retryable),
      });

      // Check if we should retry
      if (!retryable || state.attempts >= policy.maxAttempts) {
        logger.error("Operation failed permanently", {
          ...context,
          attempts: state.attempts,
          totalDelay: state.totalDelay,
          error: state.lastError.message,
        });

        metrics.increment("retry.exhausted", {
          agentId: context.agentId,
          attempts: String(state.attempts),
        });

        throw state.lastError;
      }

      // Calculate delay and wait
      const delay = calculateDelay(state.attempts, policy, retryAfter);
      state.totalDelay += delay;

      logger.info("Retrying operation", {
        ...context,
        attempt: state.attempts,
        nextAttempt: state.attempts + 1,
        delay,
        totalDelay: state.totalDelay,
      });

      metrics.timing("retry.delay", delay, {
        agentId: context.agentId,
        attempt: String(state.attempts),
      });

      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw state.lastError || new Error("Max retries exceeded");
}

export function createRetryPolicy(overrides: Partial<RetryPolicy>): RetryPolicy {
  return {
    ...DEFAULT_POLICY,
    ...overrides,
  };
}

export function withRetrySync<T>(
  fn: () => T,
  policy: RetryPolicy = DEFAULT_POLICY,
  context: RetryContext,
): T {
  const errorHandler = new AgentErrorHandler({ maxRetryAttempts: policy.maxAttempts });
  let attempts = 0;
  let lastError: Error | undefined;

  while (attempts < policy.maxAttempts) {
    attempts++;

    try {
      return fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const { retryable } = isRetryableError(lastError, policy, errorHandler, context);

      if (!retryable || attempts >= policy.maxAttempts) {
        throw lastError;
      }

      // Note: Sync version cannot delay, so it just retries immediately
      logger.warn("Sync operation failed, retrying immediately", {
        ...context,
        attempt: attempts,
      });
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

export class RetryableOperation<T> {
  private policy: RetryPolicy;
  private context: RetryContext;

  constructor(policy: RetryPolicy = DEFAULT_POLICY, context: RetryContext) {
    this.policy = policy;
    this.context = context;
  }

  async execute(fn: () => Promise<T>): Promise<T> {
    return withRetry(fn, this.policy, this.context);
  }

  withPolicy(policy: Partial<RetryPolicy>): RetryableOperation<T> {
    return new RetryableOperation({ ...this.policy, ...policy }, this.context);
  }

  withContext(context: Partial<RetryContext>): RetryableOperation<T> {
    return new RetryableOperation(this.policy, { ...this.context, ...context });
  }
}
