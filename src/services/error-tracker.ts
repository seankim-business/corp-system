import { logger } from "../utils/logger";

// =============================================================================
// Types
// =============================================================================

export interface ErrorContext {
  userId?: string;
  organizationId?: string;
  requestPath?: string;
  requestMethod?: string;
  sessionId?: string;
  traceId?: string;
  extra?: Record<string, unknown>;
}

export interface Breadcrumb {
  category: string;
  message: string;
  level: "debug" | "info" | "warning" | "error";
  data?: Record<string, unknown>;
  timestamp: number;
}

interface SentryEnvelope {
  event_id: string;
  timestamp: string;
  platform: string;
  level: string;
  logger: string;
  server_name: string;
  environment: string;
  exception?: {
    values: Array<{
      type: string;
      value: string;
      stacktrace?: { frames: Array<{ filename: string; lineno?: number; function?: string }> };
    }>;
  };
  message?: { formatted: string };
  breadcrumbs?: { values: Breadcrumb[] };
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: { id?: string };
}

// =============================================================================
// Constants
// =============================================================================

const MAX_BREADCRUMBS = 20;
const FLUSH_INTERVAL_MS = 5000;
const MAX_QUEUE_SIZE = 50;

// =============================================================================
// Error Tracker
// =============================================================================

class ErrorTracker {
  private dsn: string | null;
  private breadcrumbs: Breadcrumb[] = [];
  private queue: SentryEnvelope[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private serverName: string;
  private environment: string;

  constructor() {
    this.dsn = process.env.SENTRY_DSN || null;
    this.serverName = process.env.HOSTNAME || process.env.RAILWAY_SERVICE_NAME || "nubabel";
    this.environment = process.env.NODE_ENV || "development";

    if (this.dsn) {
      this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
      this.flushTimer.unref?.();
      logger.info("Error tracker initialized with Sentry DSN", { environment: this.environment });
    } else {
      logger.info("Error tracker initialized in log-only mode (no SENTRY_DSN)");
    }
  }

  /**
   * Capture an exception for error tracking.
   */
  captureException(error: Error, context?: ErrorContext): string {
    const eventId = generateEventId();

    // Always log the error
    logger.error("Exception captured", {
      eventId,
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack?.split("\n").slice(0, 10).join("\n"),
      ...flattenContext(context),
    });

    if (this.dsn) {
      const envelope = this.buildEnvelope(eventId, "error", context);
      envelope.exception = {
        values: [
          {
            type: error.name,
            value: error.message,
            stacktrace: error.stack ? parseStackTrace(error.stack) : undefined,
          },
        ],
      };
      this.enqueue(envelope);
    }

    return eventId;
  }

  /**
   * Capture a message for error tracking.
   */
  captureMessage(
    message: string,
    level: "debug" | "info" | "warning" | "error" | "fatal" = "info",
    context?: ErrorContext,
  ): string {
    const eventId = generateEventId();

    const logData = { eventId, message, ...flattenContext(context) };
    if (level === "fatal" || level === "error") {
      logger.error("Message captured", logData);
    } else if (level === "warning") {
      logger.warn("Message captured", logData);
    } else if (level === "debug") {
      logger.debug("Message captured", logData);
    } else {
      logger.info("Message captured", logData);
    }

    if (this.dsn) {
      const envelope = this.buildEnvelope(eventId, level, context);
      envelope.message = { formatted: message };
      this.enqueue(envelope);
    }

    return eventId;
  }

  /**
   * Add a breadcrumb for context in future error reports.
   */
  addBreadcrumb(category: string, message: string, data?: Record<string, unknown>, level: Breadcrumb["level"] = "info"): void {
    this.breadcrumbs.push({
      category,
      message,
      level,
      data,
      timestamp: Date.now() / 1000,
    });

    // Keep only the most recent breadcrumbs
    if (this.breadcrumbs.length > MAX_BREADCRUMBS) {
      this.breadcrumbs = this.breadcrumbs.slice(-MAX_BREADCRUMBS);
    }
  }

  /**
   * Get current breadcrumbs (for debugging/inspection).
   */
  getBreadcrumbs(): ReadonlyArray<Breadcrumb> {
    return this.breadcrumbs;
  }

  /**
   * Clear breadcrumbs.
   */
  clearBreadcrumbs(): void {
    this.breadcrumbs = [];
  }

  /**
   * Flush queued events to Sentry.
   */
  async flush(): Promise<void> {
    if (this.queue.length === 0 || !this.dsn) return;

    const batch = this.queue.splice(0, this.queue.length);
    const parsed = parseDSN(this.dsn);
    if (!parsed) {
      logger.warn("Invalid Sentry DSN, discarding events", { count: batch.length });
      return;
    }

    for (const envelope of batch) {
      try {
        const url = `${parsed.protocol}://${parsed.host}/api/${parsed.projectId}/store/`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=nubabel/1.0, sentry_key=${parsed.publicKey}`,
          },
          body: JSON.stringify(envelope),
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
          logger.warn("Sentry event submission failed", {
            status: response.status,
            eventId: envelope.event_id,
          });
        }
      } catch (err) {
        logger.debug("Failed to send event to Sentry", {
          eventId: envelope.event_id,
          error: String(err),
        });
      }
    }
  }

  /**
   * Shutdown: flush remaining events and stop timer.
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
    logger.info("Error tracker shut down");
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private buildEnvelope(eventId: string, level: string, context?: ErrorContext): SentryEnvelope {
    return {
      event_id: eventId,
      timestamp: new Date().toISOString(),
      platform: "node",
      level,
      logger: "nubabel",
      server_name: this.serverName,
      environment: this.environment,
      breadcrumbs: { values: [...this.breadcrumbs] },
      tags: {
        ...(context?.organizationId ? { organization_id: context.organizationId } : {}),
        ...(context?.requestMethod ? { http_method: context.requestMethod } : {}),
        ...(context?.sessionId ? { session_id: context.sessionId } : {}),
      },
      extra: context?.extra,
      user: context?.userId ? { id: context.userId } : undefined,
    };
  }

  private enqueue(envelope: SentryEnvelope): void {
    this.queue.push(envelope);
    if (this.queue.length > MAX_QUEUE_SIZE) {
      this.queue.shift(); // Drop oldest
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

function generateEventId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface ParsedDSN {
  protocol: string;
  publicKey: string;
  host: string;
  projectId: string;
}

function parseDSN(dsn: string): ParsedDSN | null {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/\//g, "");
    return {
      protocol: url.protocol.replace(":", ""),
      publicKey: url.username,
      host: url.host,
      projectId,
    };
  } catch {
    return null;
  }
}

function parseStackTrace(stack: string): { frames: Array<{ filename: string; lineno?: number; function?: string }> } {
  const lines = stack.split("\n").slice(1); // Skip the error message line
  const frames = lines
    .map((line) => {
      const match = line.match(/at\s+(?:(.+?)\s+)?\(?(.+?):(\d+)(?::(\d+))?\)?/);
      if (!match) return null;
      return {
        function: match[1] || "<anonymous>",
        filename: match[2],
        lineno: parseInt(match[3], 10),
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null)
    .reverse(); // Sentry expects newest frame last

  return { frames };
}

function flattenContext(context?: ErrorContext): Record<string, string | undefined> {
  if (!context) return {};
  return {
    userId: context.userId,
    organizationId: context.organizationId,
    requestPath: context.requestPath,
    requestMethod: context.requestMethod,
    sessionId: context.sessionId,
    traceId: context.traceId,
  };
}

// =============================================================================
// Export
// =============================================================================

export const errorTracker = new ErrorTracker();
