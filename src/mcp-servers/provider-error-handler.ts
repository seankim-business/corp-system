/**
 * MCP Provider Error Handler
 *
 * Provider-specific error classification, retry logic, and standardized
 * error response formatting for all MCP provider integrations.
 */

import { logger } from "../utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export enum ProviderErrorType {
  RATE_LIMITED = "RATE_LIMITED",
  AUTH_EXPIRED = "AUTH_EXPIRED",
  AUTH_INVALID = "AUTH_INVALID",
  NOT_FOUND = "NOT_FOUND",
  CONFLICT = "CONFLICT",
  VALIDATION = "VALIDATION",
  SERVER_ERROR = "SERVER_ERROR",
  NETWORK_ERROR = "NETWORK_ERROR",
  TIMEOUT = "TIMEOUT",
  UNKNOWN = "UNKNOWN",
}

export interface FormattedErrorResponse {
  success: false;
  error: {
    type: ProviderErrorType;
    message: string;
    providerId: string;
    toolName: string;
    statusCode: number | null;
    retryable: boolean;
    retryAfterMs: number | null;
  };
}

// ---------------------------------------------------------------------------
// ProviderError
// ---------------------------------------------------------------------------

export class ProviderError extends Error {
  readonly providerId: string;
  readonly statusCode: number;
  readonly errorCode: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    options: {
      providerId: string;
      statusCode: number;
      errorCode: string;
      retryable: boolean;
      retryAfterMs?: number;
    },
  ) {
    super(message);
    this.name = "ProviderError";
    this.providerId = options.providerId;
    this.statusCode = options.statusCode;
    this.errorCode = options.errorCode;
    this.retryable = options.retryable;
    this.retryAfterMs = options.retryAfterMs;
  }
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/**
 * Classify an error into a ProviderErrorType based on status code and
 * common error patterns.
 */
export function classifyError(
  error: unknown,
  providerId: string,
): ProviderErrorType {
  if (error instanceof ProviderError) {
    return classifyByStatusCode(error.statusCode);
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    // Network-level errors
    if (
      msg.includes("econnrefused") ||
      msg.includes("econnreset") ||
      msg.includes("enotfound") ||
      msg.includes("network") ||
      msg.includes("socket hang up") ||
      msg.includes("fetch failed")
    ) {
      return ProviderErrorType.NETWORK_ERROR;
    }

    // Timeout errors
    if (
      msg.includes("timeout") ||
      msg.includes("etimedout") ||
      msg.includes("timed out") ||
      msg.includes("aborted")
    ) {
      return ProviderErrorType.TIMEOUT;
    }

    // Rate limit patterns
    if (msg.includes("rate limit") || msg.includes("too many requests")) {
      return ProviderErrorType.RATE_LIMITED;
    }

    // Auth patterns
    if (msg.includes("token expired") || msg.includes("token has expired")) {
      return ProviderErrorType.AUTH_EXPIRED;
    }

    if (
      msg.includes("unauthorized") ||
      msg.includes("invalid token") ||
      msg.includes("forbidden") ||
      msg.includes("invalid api key")
    ) {
      return ProviderErrorType.AUTH_INVALID;
    }

    // Check for status code embedded in error objects
    const statusCode = extractStatusCode(error);
    if (statusCode !== null) {
      return classifyByStatusCode(statusCode);
    }
  }

  logger.warn("Could not classify provider error, defaulting to UNKNOWN", {
    providerId,
    error: error instanceof Error ? error.message : String(error),
  });

  return ProviderErrorType.UNKNOWN;
}

/**
 * Classify by HTTP status code.
 */
function classifyByStatusCode(statusCode: number): ProviderErrorType {
  switch (statusCode) {
    case 401:
      return ProviderErrorType.AUTH_INVALID;
    case 403:
      return ProviderErrorType.AUTH_EXPIRED;
    case 404:
      return ProviderErrorType.NOT_FOUND;
    case 409:
      return ProviderErrorType.CONFLICT;
    case 422:
      return ProviderErrorType.VALIDATION;
    case 429:
      return ProviderErrorType.RATE_LIMITED;
    default:
      if (statusCode >= 500) {
        return ProviderErrorType.SERVER_ERROR;
      }
      if (statusCode >= 400) {
        return ProviderErrorType.VALIDATION;
      }
      return ProviderErrorType.UNKNOWN;
  }
}

/**
 * Extract status code from error objects that may have it as a property.
 */
function extractStatusCode(error: Error): number | null {
  const errWithStatus = error as Error & {
    statusCode?: number;
    status?: number;
    response?: { status?: number };
  };

  if (typeof errWithStatus.statusCode === "number") {
    return errWithStatus.statusCode;
  }
  if (typeof errWithStatus.status === "number") {
    return errWithStatus.status;
  }
  if (typeof errWithStatus.response?.status === "number") {
    return errWithStatus.response.status;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Retry helpers
// ---------------------------------------------------------------------------

/** Whether the given error type is retryable. */
export function isRetryable(errorType: ProviderErrorType): boolean {
  switch (errorType) {
    case ProviderErrorType.RATE_LIMITED:
    case ProviderErrorType.SERVER_ERROR:
    case ProviderErrorType.NETWORK_ERROR:
    case ProviderErrorType.TIMEOUT:
      return true;

    case ProviderErrorType.AUTH_EXPIRED:
    case ProviderErrorType.AUTH_INVALID:
    case ProviderErrorType.NOT_FOUND:
    case ProviderErrorType.CONFLICT:
    case ProviderErrorType.VALIDATION:
    case ProviderErrorType.UNKNOWN:
      return false;
  }
}

/**
 * Calculate retry delay in milliseconds using exponential backoff.
 *
 * - RATE_LIMITED: base 1000ms with exponential backoff
 * - SERVER_ERROR: base 2000ms with exponential backoff
 * - NETWORK_ERROR: base 500ms with exponential backoff
 * - TIMEOUT: base 1000ms with exponential backoff
 * - Others: 0 (not retryable)
 */
export function getRetryDelay(
  errorType: ProviderErrorType,
  attempt: number,
): number {
  if (!isRetryable(errorType)) {
    return 0;
  }

  let baseMs: number;
  switch (errorType) {
    case ProviderErrorType.RATE_LIMITED:
      baseMs = 1000;
      break;
    case ProviderErrorType.SERVER_ERROR:
      baseMs = 2000;
      break;
    case ProviderErrorType.NETWORK_ERROR:
      baseMs = 500;
      break;
    case ProviderErrorType.TIMEOUT:
      baseMs = 1000;
      break;
    default:
      return 0;
  }

  // Exponential backoff with jitter, capped at 30 seconds
  const exponential = baseMs * Math.pow(2, attempt);
  const jitter = Math.random() * baseMs * 0.5;
  return Math.min(exponential + jitter, 30_000);
}

// ---------------------------------------------------------------------------
// Error response formatting
// ---------------------------------------------------------------------------

/**
 * Format an error into a standardized response object for consumers.
 */
export function formatErrorResponse(
  error: unknown,
  providerId: string,
  toolName: string,
): FormattedErrorResponse {
  const errorType = classifyError(error, providerId);
  const retryable = isRetryable(errorType);

  let message: string;
  let statusCode: number | null = null;
  let retryAfterMs: number | null = null;

  if (error instanceof ProviderError) {
    message = error.message;
    statusCode = error.statusCode;
    if (error.retryAfterMs !== undefined) {
      retryAfterMs = error.retryAfterMs;
    }
  } else if (error instanceof Error) {
    message = error.message;
    statusCode = extractStatusCode(error);
  } else {
    message = String(error);
  }

  if (retryable && retryAfterMs === null) {
    retryAfterMs = getRetryDelay(errorType, 0);
  }

  logger.error("Provider error formatted", {
    providerId,
    toolName,
    errorType,
    statusCode,
    retryable,
    retryAfterMs,
  });

  return {
    success: false,
    error: {
      type: errorType,
      message,
      providerId,
      toolName,
      statusCode,
      retryable,
      retryAfterMs,
    },
  };
}
