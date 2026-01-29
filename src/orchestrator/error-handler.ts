import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";

export type AgentErrorType =
  | "tool_failure"
  | "timeout"
  | "rate_limit"
  | "auth_error"
  | "budget_exceeded"
  | "approval_timeout"
  | "network_error"
  | "unknown";

export interface AgentError {
  type: AgentErrorType;
  agentId: string;
  stepId?: string;
  originalError: Error;
  retryable: boolean;
  retryAfter?: number; // seconds
  context?: Record<string, unknown>;
}

export type ErrorResolutionAction = "retry" | "skip" | "abort" | "fallback";

export interface ErrorResolution {
  action: ErrorResolutionAction;
  fallbackAgent?: string;
  message: string;
  shouldNotify: boolean;
}

export interface ExecutionContext {
  workflowId?: string;
  sessionId: string;
  organizationId: string;
  userId: string;
  currentStep?: string;
  attemptCount: number;
}

const ERROR_PATTERNS: Array<{
  pattern: RegExp | ((error: Error) => boolean);
  type: AgentErrorType;
  retryable: boolean;
  retryAfter?: number;
}> = [
  {
    pattern: /timeout|timed out|ETIMEDOUT/i,
    type: "timeout",
    retryable: true,
    retryAfter: 5,
  },
  {
    pattern: /rate.?limit|429|too many requests/i,
    type: "rate_limit",
    retryable: true,
    retryAfter: 60,
  },
  {
    pattern: /auth|unauthorized|401|403|forbidden|invalid.?token/i,
    type: "auth_error",
    retryable: false,
  },
  {
    pattern: /budget|quota|exceeded|insufficient.*budget/i,
    type: "budget_exceeded",
    retryable: false,
  },
  {
    pattern: /approval.*timeout|pending.*approval/i,
    type: "approval_timeout",
    retryable: false,
  },
  {
    pattern: /ECONNREFUSED|ENOTFOUND|ENETUNREACH|network/i,
    type: "network_error",
    retryable: true,
    retryAfter: 10,
  },
  {
    pattern: /tool.*fail|execution.*fail|agent.*fail/i,
    type: "tool_failure",
    retryable: true,
    retryAfter: 2,
  },
];

const FALLBACK_AGENTS: Record<string, string[]> = {
  "code-executor": ["code-executor-lite", "code-analyzer"],
  "data-analyzer": ["data-summarizer"],
  "web-scraper": ["api-fetcher"],
};

export class AgentErrorHandler {
  private maxRetryAttempts: number;
  private notificationThreshold: number;

  constructor(options?: { maxRetryAttempts?: number; notificationThreshold?: number }) {
    this.maxRetryAttempts = options?.maxRetryAttempts ?? 3;
    this.notificationThreshold = options?.notificationThreshold ?? 2;
  }

  classify(error: Error, agentId: string, stepId?: string): AgentError {
    const errorMessage = error.message || String(error);
    const errorStack = error.stack || "";

    for (const { pattern, type, retryable, retryAfter } of ERROR_PATTERNS) {
      const matches =
        typeof pattern === "function"
          ? pattern(error)
          : pattern.test(errorMessage) || pattern.test(errorStack);

      if (matches) {
        const agentError: AgentError = {
          type,
          agentId,
          stepId,
          originalError: error,
          retryable,
          retryAfter,
        };

        logger.debug("Error classified", {
          type,
          agentId,
          stepId,
          retryable,
          message: errorMessage.substring(0, 200),
        });

        metrics.increment("agent.error.classified", {
          type,
          agentId,
          retryable: String(retryable),
        });

        return agentError;
      }
    }

    // Default: unknown error, not retryable
    const agentError: AgentError = {
      type: "unknown",
      agentId,
      stepId,
      originalError: error,
      retryable: false,
    };

    logger.warn("Unknown error type", {
      agentId,
      stepId,
      message: errorMessage.substring(0, 200),
    });

    metrics.increment("agent.error.classified", {
      type: "unknown",
      agentId,
      retryable: "false",
    });

    return agentError;
  }

  shouldRetry(error: AgentError, attempts: number): boolean {
    if (!error.retryable) {
      return false;
    }

    if (attempts >= this.maxRetryAttempts) {
      logger.info("Max retry attempts reached", {
        agentId: error.agentId,
        stepId: error.stepId,
        type: error.type,
        attempts,
        maxAttempts: this.maxRetryAttempts,
      });
      return false;
    }

    return true;
  }

  getRetryDelay(error: AgentError, attempts: number): number {
    // Use retryAfter if specified (e.g., from rate limit headers)
    if (error.retryAfter && error.retryAfter > 0) {
      return error.retryAfter * 1000;
    }

    // Exponential backoff with jitter
    const baseDelay = this.getBaseDelayForType(error.type);
    const exponentialDelay = baseDelay * Math.pow(2, attempts - 1);
    const jitter = Math.random() * 1000; // 0-1000ms jitter
    const delay = Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds

    return Math.round(delay);
  }

  private getBaseDelayForType(type: AgentErrorType): number {
    switch (type) {
      case "rate_limit":
        return 5000;
      case "timeout":
        return 2000;
      case "network_error":
        return 3000;
      case "tool_failure":
        return 1000;
      default:
        return 1000;
    }
  }

  async handle(error: AgentError, context: ExecutionContext): Promise<ErrorResolution> {
    const { agentId, type, retryable, stepId } = error;
    const { attemptCount, sessionId, organizationId } = context;

    logger.error("Handling agent error", {
      type,
      agentId,
      stepId,
      sessionId,
      organizationId,
      attemptCount,
      retryable,
      message: error.originalError.message.substring(0, 200),
    });

    metrics.increment("agent.error.handled", {
      type,
      agentId,
      action: this.determineAction(error, attemptCount),
    });

    // Check if we should retry
    if (this.shouldRetry(error, attemptCount)) {
      const delay = this.getRetryDelay(error, attemptCount);
      return {
        action: "retry",
        message: `Retrying after ${delay}ms (attempt ${attemptCount + 1}/${this.maxRetryAttempts})`,
        shouldNotify: attemptCount >= this.notificationThreshold,
      };
    }

    // Check for fallback agent
    const fallbackAgent = this.getFallbackAgent(agentId);
    if (fallbackAgent) {
      return {
        action: "fallback",
        fallbackAgent,
        message: `Falling back to ${fallbackAgent} after ${type} error`,
        shouldNotify: true,
      };
    }

    // Determine if we should skip or abort based on error type
    if (this.isSkippableError(error)) {
      return {
        action: "skip",
        message: `Skipping step due to ${type} error`,
        shouldNotify: true,
      };
    }

    // Critical error - abort workflow
    return {
      action: "abort",
      message: `Aborting workflow due to ${type} error: ${error.originalError.message}`,
      shouldNotify: true,
    };
  }

  private determineAction(error: AgentError, attemptCount: number): ErrorResolutionAction {
    if (this.shouldRetry(error, attemptCount)) return "retry";
    if (this.getFallbackAgent(error.agentId)) return "fallback";
    if (this.isSkippableError(error)) return "skip";
    return "abort";
  }

  private getFallbackAgent(agentId: string): string | undefined {
    const fallbacks = FALLBACK_AGENTS[agentId];
    return fallbacks?.[0];
  }

  private isSkippableError(error: AgentError): boolean {
    // Some error types allow the workflow to continue with partial results
    const skippableTypes: AgentErrorType[] = ["timeout", "tool_failure"];
    return skippableTypes.includes(error.type);
  }

  static isRetryableError(error: Error): boolean {
    const handler = new AgentErrorHandler();
    const classified = handler.classify(error, "unknown");
    return classified.retryable;
  }
}

export const agentErrorHandler = new AgentErrorHandler();
