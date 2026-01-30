/**
 * Error Message Templates System
 *
 * Centralized error message templates with error codes.
 * i18n-ready structure with template interpolation for dynamic values.
 *
 * Usage:
 *   getErrorMessage('AUTH_001', { email: 'user@example.com' })
 *   // Returns: "Authentication failed for email: user@example.com"
 */

// ============== Types ==============

export type ErrorCode =
  // Authentication errors (AUTH_xxx)
  | "AUTH_001"
  | "AUTH_002"
  | "AUTH_003"
  | "AUTH_004"
  | "AUTH_005"
  | "AUTH_006"
  // Validation errors (VAL_xxx)
  | "VAL_001"
  | "VAL_002"
  | "VAL_003"
  | "VAL_004"
  | "VAL_005"
  // Database errors (DB_xxx)
  | "DB_001"
  | "DB_002"
  | "DB_003"
  | "DB_004"
  | "DB_005"
  // External service errors (EXT_xxx)
  | "EXT_001"
  | "EXT_002"
  | "EXT_003"
  | "EXT_004"
  // Rate limit errors (RATE_xxx)
  | "RATE_001"
  | "RATE_002"
  | "RATE_003"
  // Permission errors (PERM_xxx)
  | "PERM_001"
  | "PERM_002"
  | "PERM_003"
  | "PERM_004";

export type ErrorCategory =
  | "AUTH"
  | "VALIDATION"
  | "DATABASE"
  | "EXTERNAL_SERVICE"
  | "RATE_LIMIT"
  | "PERMISSION";

export type Locale = "en" | "es" | "fr" | "de" | "ja" | "zh";

export interface ErrorTemplate {
  code: ErrorCode;
  category: ErrorCategory;
  statusCode: number;
  message: string;
  userMessage: string;
  retryable: boolean;
  logLevel: "error" | "warn" | "info";
}

export interface ErrorMessageParams {
  [key: string]: string | number | boolean | undefined;
}

// ============== Error Templates Database ==============

const errorTemplates: Record<Locale, Record<ErrorCode, ErrorTemplate>> = {
  en: {
    // ========== Authentication Errors ==========
    AUTH_001: {
      code: "AUTH_001",
      category: "AUTH",
      statusCode: 401,
      message: "Authentication failed for {{email}}",
      userMessage: "Invalid email or password. Please try again.",
      retryable: true,
      logLevel: "warn",
    },
    AUTH_002: {
      code: "AUTH_002",
      category: "AUTH",
      statusCode: 401,
      message: "Session expired for user {{userId}}",
      userMessage: "Your session has expired. Please sign in again.",
      retryable: false,
      logLevel: "info",
    },
    AUTH_003: {
      code: "AUTH_003",
      category: "AUTH",
      statusCode: 401,
      message: "Invalid token: {{tokenType}}",
      userMessage: "Invalid authentication token. Please sign in again.",
      retryable: false,
      logLevel: "warn",
    },
    AUTH_004: {
      code: "AUTH_004",
      category: "AUTH",
      statusCode: 403,
      message: "Account locked for user {{userId}} due to {{reason}}",
      userMessage: "Your account has been locked. Please contact support.",
      retryable: false,
      logLevel: "warn",
    },
    AUTH_005: {
      code: "AUTH_005",
      category: "AUTH",
      statusCode: 401,
      message: "OAuth authentication failed for provider {{provider}}: {{reason}}",
      userMessage: "Failed to authenticate with {{provider}}. Please try again.",
      retryable: true,
      logLevel: "error",
    },
    AUTH_006: {
      code: "AUTH_006",
      category: "AUTH",
      statusCode: 401,
      message: "MFA verification failed for user {{userId}}",
      userMessage: "Invalid verification code. Please try again.",
      retryable: true,
      logLevel: "warn",
    },

    // ========== Validation Errors ==========
    VAL_001: {
      code: "VAL_001",
      category: "VALIDATION",
      statusCode: 400,
      message: "Required field missing: {{field}}",
      userMessage: "{{field}} is required.",
      retryable: false,
      logLevel: "info",
    },
    VAL_002: {
      code: "VAL_002",
      category: "VALIDATION",
      statusCode: 400,
      message: "Invalid format for field {{field}}: expected {{expectedFormat}}",
      userMessage: "{{field}} format is invalid. Expected format: {{expectedFormat}}",
      retryable: false,
      logLevel: "info",
    },
    VAL_003: {
      code: "VAL_003",
      category: "VALIDATION",
      statusCode: 400,
      message: "Value out of range for {{field}}: {{value}} (allowed: {{min}}-{{max}})",
      userMessage: "{{field}} must be between {{min}} and {{max}}.",
      retryable: false,
      logLevel: "info",
    },
    VAL_004: {
      code: "VAL_004",
      category: "VALIDATION",
      statusCode: 409,
      message: "Duplicate value for unique field {{field}}: {{value}}",
      userMessage: "{{field}} '{{value}}' already exists.",
      retryable: false,
      logLevel: "info",
    },
    VAL_005: {
      code: "VAL_005",
      category: "VALIDATION",
      statusCode: 400,
      message: "Invalid reference: {{field}} with id {{id}} not found",
      userMessage: "Referenced {{field}} does not exist.",
      retryable: false,
      logLevel: "info",
    },

    // ========== Database Errors ==========
    DB_001: {
      code: "DB_001",
      category: "DATABASE",
      statusCode: 503,
      message: "Database connection failed: {{reason}}",
      userMessage: "Database temporarily unavailable. Please try again in a moment.",
      retryable: true,
      logLevel: "error",
    },
    DB_002: {
      code: "DB_002",
      category: "DATABASE",
      statusCode: 504,
      message: "Database query timeout after {{timeoutMs}}ms: {{query}}",
      userMessage: "Request took too long to complete. Please try again.",
      retryable: true,
      logLevel: "error",
    },
    DB_003: {
      code: "DB_003",
      category: "DATABASE",
      statusCode: 500,
      message: "Database transaction failed: {{reason}}",
      userMessage: "Operation could not be completed. Please try again.",
      retryable: true,
      logLevel: "error",
    },
    DB_004: {
      code: "DB_004",
      category: "DATABASE",
      statusCode: 404,
      message: "Record not found: {{resource}} with {{field}}={{value}}",
      userMessage: "{{resource}} not found.",
      retryable: false,
      logLevel: "info",
    },
    DB_005: {
      code: "DB_005",
      category: "DATABASE",
      statusCode: 409,
      message: "Concurrent update conflict for {{resource}} with id {{id}}",
      userMessage: "This item was modified by another user. Please refresh and try again.",
      retryable: true,
      logLevel: "warn",
    },

    // ========== External Service Errors ==========
    EXT_001: {
      code: "EXT_001",
      category: "EXTERNAL_SERVICE",
      statusCode: 503,
      message: "External service {{service}} unavailable: {{reason}}",
      userMessage: "{{service}} is temporarily unavailable. Please try again later.",
      retryable: true,
      logLevel: "error",
    },
    EXT_002: {
      code: "EXT_002",
      category: "EXTERNAL_SERVICE",
      statusCode: 504,
      message: "External service {{service}} timeout after {{timeoutMs}}ms",
      userMessage: "{{service}} took too long to respond. Please try again.",
      retryable: true,
      logLevel: "error",
    },
    EXT_003: {
      code: "EXT_003",
      category: "EXTERNAL_SERVICE",
      statusCode: 502,
      message: "External service {{service}} returned invalid response: {{reason}}",
      userMessage: "{{service}} returned an unexpected response. Please try again.",
      retryable: true,
      logLevel: "error",
    },
    EXT_004: {
      code: "EXT_004",
      category: "EXTERNAL_SERVICE",
      statusCode: 503,
      message: "External service {{service}} rate limit exceeded: {{limit}} requests per {{window}}",
      userMessage: "{{service}} rate limit exceeded. Please wait before trying again.",
      retryable: true,
      logLevel: "warn",
    },

    // ========== Rate Limit Errors ==========
    RATE_001: {
      code: "RATE_001",
      category: "RATE_LIMIT",
      statusCode: 429,
      message: "Rate limit exceeded for {{resource}}: {{count}} requests in {{window}}",
      userMessage: "Too many requests. Please wait {{retryAfter}} before trying again.",
      retryable: true,
      logLevel: "warn",
    },
    RATE_002: {
      code: "RATE_002",
      category: "RATE_LIMIT",
      statusCode: 429,
      message: "API quota exceeded for organization {{organizationId}}: {{used}}/{{limit}}",
      userMessage: "API quota exceeded. Please upgrade your plan or wait until {{resetTime}}.",
      retryable: false,
      logLevel: "warn",
    },
    RATE_003: {
      code: "RATE_003",
      category: "RATE_LIMIT",
      statusCode: 429,
      message: "Concurrent request limit exceeded: {{count}}/{{limit}} concurrent requests",
      userMessage:
        "Too many simultaneous requests. Please complete ongoing requests before starting new ones.",
      retryable: true,
      logLevel: "warn",
    },

    // ========== Permission Errors ==========
    PERM_001: {
      code: "PERM_001",
      category: "PERMISSION",
      statusCode: 403,
      message: "Insufficient permissions for user {{userId}}: requires {{requiredPermission}}",
      userMessage: "You don't have permission to perform this action.",
      retryable: false,
      logLevel: "warn",
    },
    PERM_002: {
      code: "PERM_002",
      category: "PERMISSION",
      statusCode: 403,
      message: "Resource access denied: {{resource}} with id {{resourceId}} for user {{userId}}",
      userMessage: "You don't have access to this resource.",
      retryable: false,
      logLevel: "warn",
    },
    PERM_003: {
      code: "PERM_003",
      category: "PERMISSION",
      statusCode: 403,
      message: "Organization {{organizationId}} feature {{feature}} not enabled",
      userMessage: "This feature is not available on your current plan.",
      retryable: false,
      logLevel: "info",
    },
    PERM_004: {
      code: "PERM_004",
      category: "PERMISSION",
      statusCode: 403,
      message:
        "IP address {{ipAddress}} blocked for organization {{organizationId}}: {{reason}}",
      userMessage: "Access from your location is restricted. Please contact support.",
      retryable: false,
      logLevel: "warn",
    },
  },

  // ========== Future Locale Support (placeholder templates) ==========
  es: {} as Record<ErrorCode, ErrorTemplate>, // Spanish
  fr: {} as Record<ErrorCode, ErrorTemplate>, // French
  de: {} as Record<ErrorCode, ErrorTemplate>, // German
  ja: {} as Record<ErrorCode, ErrorTemplate>, // Japanese
  zh: {} as Record<ErrorCode, ErrorTemplate>, // Chinese
};

// Copy English templates to other locales as fallback
// TODO: Replace with proper translations
for (const locale of ["es", "fr", "de", "ja", "zh"] as Locale[]) {
  errorTemplates[locale] = errorTemplates.en;
}

// ============== Template Interpolation ==============

/**
 * Interpolate template variables with provided values
 * Supports {{variable}} syntax
 */
function interpolate(template: string, params?: ErrorMessageParams): string {
  if (!params) return template;

  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = params[key];
    return value !== undefined ? String(value) : match;
  });
}

// ============== Public API ==============

/**
 * Get error message for a specific error code
 *
 * @param code - Error code (e.g., 'AUTH_001')
 * @param params - Optional parameters for template interpolation
 * @param locale - Target locale (default: 'en')
 * @returns Interpolated error message
 *
 * @example
 * getErrorMessage('AUTH_001', { email: 'user@example.com' })
 * // Returns: "Authentication failed for user@example.com"
 */
export function getErrorMessage(
  code: ErrorCode,
  params?: ErrorMessageParams,
  locale: Locale = "en",
): string {
  const template = errorTemplates[locale]?.[code];
  if (!template) {
    return `Unknown error: ${code}`;
  }

  return interpolate(template.message, params);
}

/**
 * Get user-facing error message for a specific error code
 *
 * @param code - Error code (e.g., 'AUTH_001')
 * @param params - Optional parameters for template interpolation
 * @param locale - Target locale (default: 'en')
 * @returns Interpolated user-friendly error message
 *
 * @example
 * getUserErrorMessage('AUTH_001', { email: 'user@example.com' })
 * // Returns: "Invalid email or password. Please try again."
 */
export function getUserErrorMessage(
  code: ErrorCode,
  params?: ErrorMessageParams,
  locale: Locale = "en",
): string {
  const template = errorTemplates[locale]?.[code];
  if (!template) {
    return "An unexpected error occurred. Please try again.";
  }

  return interpolate(template.userMessage, params);
}

/**
 * Get complete error template for a specific error code
 *
 * @param code - Error code (e.g., 'AUTH_001')
 * @param locale - Target locale (default: 'en')
 * @returns Complete error template object
 */
export function getErrorTemplate(code: ErrorCode, locale: Locale = "en"): ErrorTemplate | null {
  return errorTemplates[locale]?.[code] || null;
}

/**
 * Get all error codes for a specific category
 *
 * @param category - Error category (e.g., 'AUTH')
 * @param locale - Target locale (default: 'en')
 * @returns Array of error codes in that category
 */
export function getErrorCodesByCategory(
  category: ErrorCategory,
  locale: Locale = "en",
): ErrorCode[] {
  const templates = errorTemplates[locale];
  return Object.entries(templates)
    .filter(([, template]) => template.category === category)
    .map(([code]) => code as ErrorCode);
}

/**
 * Check if an error code is retryable
 *
 * @param code - Error code (e.g., 'AUTH_001')
 * @param locale - Target locale (default: 'en')
 * @returns True if the error is retryable
 */
export function isRetryable(code: ErrorCode, locale: Locale = "en"): boolean {
  const template = errorTemplates[locale]?.[code];
  return template?.retryable ?? false;
}

/**
 * Create a structured error object with template data
 *
 * @param code - Error code (e.g., 'AUTH_001')
 * @param params - Optional parameters for template interpolation
 * @param locale - Target locale (default: 'en')
 * @returns Structured error object
 */
export interface StructuredError {
  code: ErrorCode;
  category: ErrorCategory;
  statusCode: number;
  message: string;
  userMessage: string;
  retryable: boolean;
  logLevel: "error" | "warn" | "info";
}

export function createStructuredError(
  code: ErrorCode,
  params?: ErrorMessageParams,
  locale: Locale = "en",
): StructuredError {
  const template = errorTemplates[locale]?.[code];

  if (!template) {
    return {
      code,
      category: "DATABASE",
      statusCode: 500,
      message: `Unknown error: ${code}`,
      userMessage: "An unexpected error occurred. Please try again.",
      retryable: false,
      logLevel: "error",
    };
  }

  return {
    code: template.code,
    category: template.category,
    statusCode: template.statusCode,
    message: interpolate(template.message, params),
    userMessage: interpolate(template.userMessage, params),
    retryable: template.retryable,
    logLevel: template.logLevel,
  };
}

// ============== Exports ==============

export { errorTemplates };
