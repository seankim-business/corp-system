import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { logger } from "../utils/logger";
import { NODE_ENV, SENTRY_DSN } from "../utils/env";

export function initSentry(): void {
  if (!SENTRY_DSN) {
    logger.warn("SENTRY_DSN not configured, error tracking disabled");
    return;
  }

  const integrations: any[] = [nodeProfilingIntegration()];
  const sentryAny = Sentry as any;

  if (sentryAny.Integrations?.Http) {
    integrations.push(new sentryAny.Integrations.Http({ tracing: true }));
  }

  if (sentryAny.Integrations?.Express) {
    integrations.push(new sentryAny.Integrations.Express({ app: undefined as any }));
  }

  if (sentryAny.Integrations?.Prisma) {
    integrations.push(new sentryAny.Integrations.Prisma({ client: undefined as any }));
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: NODE_ENV,
    tracesSampleRate: NODE_ENV === "production" ? 0.1 : 1.0,
    profilesSampleRate: NODE_ENV === "production" ? 0.1 : 1.0,
    integrations,
    release: process.env.RAILWAY_GIT_COMMIT_SHA || "dev",
    beforeSend(event, hint) {
      if (NODE_ENV === "development") {
        logger.debug("Sentry event (dev mode):", event);
        return null;
      }

      const error = hint.originalException;
      if (error instanceof Error) {
        if (error.message.includes("ECONNREFUSED")) {
          return null;
        }
      }

      return event;
    },
  });

  Sentry.setTag("environment", NODE_ENV);
  logger.info("Sentry initialized", { environment: NODE_ENV });
}

export function setSentryUser(userId: string, organizationId: string, email?: string): void {
  Sentry.setUser({
    id: userId,
    email,
    organizationId,
  });

  Sentry.setTag("userId", userId);
  Sentry.setTag("organizationId", organizationId);
}

export function setSentryContext(key: string, value: any): void {
  Sentry.setContext(key, value);
}

export function captureException(error: Error, context?: Record<string, any>): void {
  if (context) {
    Sentry.setContext("additional", context);
  }
  Sentry.captureException(error);
}
