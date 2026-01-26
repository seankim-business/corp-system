import { z } from "zod";
import { logger } from "./logger";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional().default("development"),
  PORT: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  BASE_URL: z.string().optional(),
  BASE_DOMAIN: z.string().optional(),
  COOKIE_DOMAIN: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_APP_TOKEN: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  CREDENTIAL_ENCRYPTION_KEY: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().optional(),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),
  OPENCODE_SIDECAR_URL: z.string().url().optional(),
  OPENCODE_SIDECAR_TIMEOUT: z.coerce.number().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

export function getEnv(): AppEnv {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    logger.error("Invalid environment variables", {
      errorCount: parsed.error.issues.length,
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
    logger.error("Note: Webhook secrets follow the pattern WEBHOOK_SECRET_<PROVIDER>");
    logger.error("Example: WEBHOOK_SECRET_STRIPE, WEBHOOK_SECRET_GITHUB");
    throw new Error(
      `Invalid environment variables: ${parsed.error.issues.length} validation error(s)`,
    );
  }

  const data = parsed.data;

  if (data.NODE_ENV === "production") {
    if (!data.OTEL_EXPORTER_OTLP_ENDPOINT) {
      logger.warn(
        "OTEL_EXPORTER_OTLP_ENDPOINT not set - OpenTelemetry traces will not be exported",
      );
    }

    if (!data.GOOGLE_CLIENT_ID || !data.GOOGLE_CLIENT_SECRET) {
      logger.warn(
        "Google OAuth not configured - authentication will fail. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET",
      );
    }
  }

  return data;
}
