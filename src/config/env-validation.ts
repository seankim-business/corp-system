import { logger } from "../utils/logger";

// =============================================================================
// Environment Variable Definitions
// =============================================================================

interface EnvVar {
  key: string;
  required: boolean;
  description: string;
  default?: string;
  validate?: (value: string) => boolean;
  sensitive?: boolean; // Don't log the value
}

const ENV_VARS: EnvVar[] = [
  // Database
  {
    key: "DATABASE_URL",
    required: true,
    description: "PostgreSQL connection string",
    sensitive: true,
  },

  // Redis
  {
    key: "REDIS_URL",
    required: true,
    description: "Redis connection string",
    sensitive: true,
  },
  {
    key: "BULLMQ_REDIS_URL",
    required: false,
    description: "Separate Redis URL for BullMQ (defaults to REDIS_URL)",
    sensitive: true,
  },

  // Server
  {
    key: "PORT",
    required: false,
    description: "HTTP server port",
    default: "3000",
    validate: (v) => !isNaN(Number(v)) && Number(v) > 0 && Number(v) < 65536,
  },
  {
    key: "NODE_ENV",
    required: false,
    description: "Node environment",
    default: "development",
    validate: (v) => ["development", "production", "test", "staging"].includes(v),
  },

  // Authentication
  {
    key: "JWT_SECRET",
    required: true,
    description: "JWT signing secret",
    sensitive: true,
    validate: (v) => v.length >= 32,
  },
  {
    key: "GOOGLE_CLIENT_ID",
    required: false,
    description: "Google OAuth client ID",
  },
  {
    key: "GOOGLE_CLIENT_SECRET",
    required: false,
    description: "Google OAuth client secret",
    sensitive: true,
  },

  // AI Providers
  {
    key: "ANTHROPIC_API_KEY",
    required: false,
    description: "Anthropic API key for LLM routing and classification",
    sensitive: true,
    validate: (v) => v.startsWith("sk-ant-"),
  },
  {
    key: "OPENAI_API_KEY",
    required: false,
    description: "OpenAI API key (optional provider)",
    sensitive: true,
  },

  // Slack
  {
    key: "SLACK_BOT_TOKEN",
    required: false,
    description: "Slack Bot OAuth token",
    sensitive: true,
    validate: (v) => v.startsWith("xoxb-"),
  },
  {
    key: "SLACK_SIGNING_SECRET",
    required: false,
    description: "Slack request signing secret",
    sensitive: true,
  },
  {
    key: "SLACK_APP_TOKEN",
    required: false,
    description: "Slack App-level token for Socket Mode",
    sensitive: true,
    validate: (v) => v.startsWith("xapp-"),
  },

  // Encryption
  {
    key: "ACCOUNT_ENCRYPTION_KEY",
    required: false,
    description: "AES-256 key for account credential encryption (hex-encoded)",
    sensitive: true,
    validate: (v) => /^[0-9a-fA-F]{64}$/.test(v),
  },

  // URLs
  {
    key: "FRONTEND_URL",
    required: false,
    description: "Frontend application URL for CORS",
    default: "http://localhost:5173",
  },
  {
    key: "API_BASE_URL",
    required: false,
    description: "Public API base URL",
    default: "http://localhost:3000",
  },

  // Observability
  {
    key: "SENTRY_DSN",
    required: false,
    description: "Sentry error tracking DSN",
  },
  {
    key: "OTEL_EXPORTER_OTLP_ENDPOINT",
    required: false,
    description: "OpenTelemetry collector endpoint",
  },
];

// =============================================================================
// Validation
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    total: number;
    required: number;
    present: number;
    missing: number;
    invalid: number;
  };
}

export function validateEnvironment(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let present = 0;
  let missing = 0;
  let invalid = 0;

  for (const envVar of ENV_VARS) {
    const value = process.env[envVar.key];

    if (!value) {
      if (envVar.required) {
        errors.push(`Missing required env var: ${envVar.key} - ${envVar.description}`);
        missing++;
      } else if (!envVar.default) {
        warnings.push(`Optional env var not set: ${envVar.key} - ${envVar.description}`);
      } else {
        // Has default, that's fine
        present++;
      }
      continue;
    }

    present++;

    if (envVar.validate && !envVar.validate(value)) {
      const msg = `Invalid value for ${envVar.key}: ${envVar.sensitive ? "[REDACTED]" : value}`;
      if (envVar.required) {
        errors.push(msg);
        invalid++;
      } else {
        warnings.push(msg);
      }
    }
  }

  const result: ValidationResult = {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      total: ENV_VARS.length,
      required: ENV_VARS.filter((v) => v.required).length,
      present,
      missing,
      invalid,
    },
  };

  return result;
}

/**
 * Validate environment and log results. Throws if required vars are missing.
 * Call this at application startup.
 */
export function validateAndReport(): void {
  const result = validateEnvironment();

  logger.info("Environment validation", {
    valid: result.valid,
    total: result.summary.total,
    present: result.summary.present,
    missing: result.summary.missing,
    invalid: result.summary.invalid,
    errorCount: result.errors.length,
    warningCount: result.warnings.length,
  });

  for (const warning of result.warnings) {
    logger.warn(warning);
  }

  if (!result.valid) {
    for (const error of result.errors) {
      logger.error(error);
    }
    throw new Error(
      `Environment validation failed with ${result.errors.length} error(s):\n${result.errors.join("\n")}`,
    );
  }
}

/**
 * Get a required environment variable or throw.
 */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable not set: ${key}`);
  }
  return value;
}

/**
 * Get an optional environment variable with a default.
 */
export function getEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * Get an optional environment variable as a number.
 */
export function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Get an optional environment variable as a boolean.
 */
export function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value === "true" || value === "1" || value === "yes";
}
