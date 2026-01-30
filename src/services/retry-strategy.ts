import { logger } from "../utils/logger";

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  jitterFactor: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIGS: Record<string, RetryConfig> = {
  orchestration: {
    maxRetries: 2,
    baseDelay: 5000,
    maxDelay: 30000,
    jitterFactor: 0.1,
    backoffMultiplier: 2,
  },
  notification: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    jitterFactor: 0.2,
    backoffMultiplier: 2,
  },
  webhook: {
    maxRetries: 5,
    baseDelay: 2000,
    maxDelay: 60000,
    jitterFactor: 0.3,
    backoffMultiplier: 2,
  },
  "slack-event": {
    maxRetries: 2,
    baseDelay: 3000,
    maxDelay: 15000,
    jitterFactor: 0.1,
    backoffMultiplier: 2,
  },
  "scheduled-task": {
    maxRetries: 3,
    baseDelay: 10000,
    maxDelay: 120000,
    jitterFactor: 0.2,
    backoffMultiplier: 2,
  },
};

const FALLBACK_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 5000,
  maxDelay: 30000,
  jitterFactor: 0.1,
  backoffMultiplier: 2,
};

const NON_RETRIABLE_PATTERNS: string[] = [
  "unauthorized",
  "forbidden",
  "invalid",
  "not found",
  "validation",
];

/**
 * Calculate delay for a given retry attempt using exponential backoff with jitter.
 *
 * Formula: min(baseDelay * backoffMultiplier^attempt + jitter, maxDelay)
 * where jitter = delay * jitterFactor * random(-1, 1)
 */
export function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt);
  const jitter = exponentialDelay * config.jitterFactor * (Math.random() * 2 - 1);
  const delay = Math.min(exponentialDelay + jitter, config.maxDelay);
  return Math.max(0, Math.round(delay));
}

/**
 * Get the retry configuration for a given queue name.
 * Falls back to a sensible default if the queue name is not recognized.
 */
export function getRetryConfig(queueName: string): RetryConfig {
  const config = DEFAULT_RETRY_CONFIGS[queueName];
  if (!config) {
    logger.warn(`No retry config found for queue "${queueName}", using fallback`, {
      queueName,
    });
    return { ...FALLBACK_RETRY_CONFIG };
  }
  return { ...config };
}

/**
 * Determine whether a failed job should be retried based on the current attempt,
 * the error, and the queue-specific configuration.
 *
 * Returns false if:
 * - The attempt number has reached or exceeded maxRetries
 * - The error message matches a non-retriable pattern (auth, validation, etc.)
 */
export function shouldRetry(attempt: number, error: Error, queueName: string): boolean {
  const config = getRetryConfig(queueName);

  if (attempt >= config.maxRetries) {
    logger.info(`Max retries (${config.maxRetries}) reached for queue "${queueName}"`, {
      queueName,
      attempt,
    });
    return false;
  }

  const errorMessage = error.message.toLowerCase();
  for (const pattern of NON_RETRIABLE_PATTERNS) {
    if (errorMessage.includes(pattern)) {
      logger.info(
        `Non-retriable error detected for queue "${queueName}": matched pattern "${pattern}"`,
        {
          queueName,
          attempt,
          errorMessage: error.message,
          pattern,
        },
      );
      return false;
    }
  }

  return true;
}
