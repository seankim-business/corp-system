import * as Sentry from "@sentry/node";
import { trace, context as otelContext, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { logger } from "../utils/logger";

/**
 * Attach OpenTelemetry trace context to the current Sentry scope.
 * This links Sentry errors and transactions to OTel traces.
 */
export function attachSentryTraceContext(): void {
  try {
    const activeContext = otelContext.active();
    const activeSpan = trace.getSpan(activeContext);

    if (activeSpan) {
      const spanContext = activeSpan.spanContext();

      // Set Sentry tags with OTel trace information
      Sentry.setTag("otel.trace_id", spanContext.traceId);
      Sentry.setTag("otel.span_id", spanContext.spanId);

      // Set Sentry context with full span details
      Sentry.setContext("opentelemetry", {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
        traceFlags: spanContext.traceFlags,
      });

      logger.debug("Attached OTel trace context to Sentry", {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
      });
    }
  } catch (error) {
    logger.error("Failed to attach Sentry trace context", { error });
  }
}

/**
 * Create a Sentry span that is linked to the current OpenTelemetry trace.
 * This creates a child span in Sentry that maintains correlation with OTel.
 *
 * @param operation - The operation name for the span
 * @param description - A human-readable description of the operation
 * @param callback - The function to execute within the span
 * @returns The result of the callback function
 */
export async function createSentrySpan<T>(
  operation: string,
  description: string,
  callback: (span: ReturnType<typeof Sentry.startSpan>) => Promise<T>,
): Promise<T> {
  // Attach current OTel context before creating the Sentry span
  attachSentryTraceContext();

  // Create Sentry span with OTel context
  return await Sentry.startSpan(
    {
      op: operation,
      name: description,
    },
    async (span) => {
      try {
        // Execute the callback with the Sentry span
        const result = await callback(span);

        // Mark span as successful
        span.setStatus({ code: 1 }); // OK status

        return result;
      } catch (error) {
        // Mark span as failed
        span.setStatus({ code: 2 }); // ERROR status

        // Capture exception in Sentry with linked context
        Sentry.captureException(error);

        throw error;
      }
    },
  );
}

/**
 * Create a Sentry transaction that is linked to an OpenTelemetry span.
 * This is useful for tracking larger operations that span multiple functions.
 *
 * @param name - The name of the transaction
 * @param operation - The operation type (e.g., "http.server", "db.query")
 * @param callback - The function to execute within the transaction
 * @returns The result of the callback function
 */
export async function createSentryTransaction<T>(
  name: string,
  operation: string,
  callback: (transaction: ReturnType<typeof Sentry.startSpan>) => Promise<T>,
): Promise<T> {
  // Attach current OTel context
  attachSentryTraceContext();

  return await Sentry.startSpan(
    {
      op: operation,
      name,
    },
    async (transaction) => {
      try {
        const result = await callback(transaction);
        transaction.setStatus({ code: 1 }); // OK
        return result;
      } catch (error) {
        transaction.setStatus({ code: 2 }); // ERROR
        Sentry.captureException(error);
        throw error;
      }
    },
  );
}

/**
 * Link a Sentry event to the current OpenTelemetry trace.
 * Use this when manually capturing exceptions or messages.
 *
 * @param error - The error to capture
 * @param context - Additional context to attach to the event
 */
export function captureExceptionWithOTelContext(error: Error, context?: Record<string, any>): void {
  // Attach current OTel trace context
  attachSentryTraceContext();

  // Add additional context if provided
  if (context) {
    Sentry.setContext("additional", context);
  }

  // Capture the exception
  Sentry.captureException(error);
}

/**
 * Create an OpenTelemetry span and automatically link it to Sentry.
 * This is the reverse of createSentrySpan - it creates an OTel span first,
 * then ensures Sentry can see it.
 *
 * @param spanName - The name of the OTel span
 * @param callback - The function to execute within the span
 * @returns The result of the callback function
 */
export async function createOTelSpanWithSentry<T>(
  spanName: string,
  callback: (span: ReturnType<typeof trace.getTracer>) => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer("nubabel");

  return await tracer.startActiveSpan(spanName, { kind: SpanKind.INTERNAL }, async (span) => {
    try {
      // Attach the new OTel span to Sentry
      attachSentryTraceContext();

      // Execute callback
      const result = await callback(span as any);

      // Mark span as successful
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();

      return result;
    } catch (error) {
      // Mark span as failed
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : "Unknown error",
      });

      // Record exception in OTel span
      span.recordException(error as Error);

      // Capture in Sentry with linked context
      captureExceptionWithOTelContext(error as Error);

      span.end();
      throw error;
    }
  });
}

/**
 * Get the current OpenTelemetry trace ID and span ID.
 * Useful for logging and debugging.
 */
export function getCurrentTraceContext(): { traceId: string; spanId: string } | null {
  try {
    const activeContext = otelContext.active();
    const activeSpan = trace.getSpan(activeContext);

    if (activeSpan) {
      const spanContext = activeSpan.spanContext();
      return {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
      };
    }

    return null;
  } catch (error) {
    logger.error("Failed to get current trace context", { error });
    return null;
  }
}
