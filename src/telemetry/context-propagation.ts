import {
  context,
  trace,
  SpanContext,
  TraceFlags,
  propagation,
} from "@opentelemetry/api";
import { IncomingHttpHeaders, OutgoingHttpHeaders } from "http";

/**
 * W3C Trace Context format constants
 * @see https://www.w3.org/TR/trace-context/
 */
const TRACEPARENT_HEADER = "traceparent";
const TRACESTATE_HEADER = "tracestate";
const TRACEPARENT_VERSION = "00";

/**
 * Represents extracted trace context information
 */
export interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
  traceState?: string;
  isValid: boolean;
}

/**
 * Represents a correlation ID derived from trace context
 */
export interface CorrelationId {
  id: string;
  traceId: string;
  spanId: string;
}

/**
 * Get the current trace context from the active span.
 * Returns trace and span IDs along with sampling decision.
 */
export function getCurrentTraceContext(): TraceContext {
  const span = trace.getActiveSpan();

  if (!span) {
    return {
      traceId: "",
      spanId: "",
      traceFlags: TraceFlags.NONE,
      isValid: false,
    };
  }

  const spanContext = span.spanContext();

  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    traceFlags: spanContext.traceFlags,
    traceState: spanContext.traceState?.serialize(),
    isValid: trace.isSpanContextValid(spanContext),
  };
}

/**
 * Attach W3C trace context headers to outgoing request headers.
 * Use this when making HTTP requests to downstream services.
 *
 * @param headers - Existing headers object to modify
 * @returns Headers with traceparent and optionally tracestate added
 */
export function attachTraceToHeaders<
  T extends OutgoingHttpHeaders | Record<string, string>,
>(headers: T = {} as T): T {
  const ctx = context.active();

  // Use OpenTelemetry's built-in propagation
  propagation.inject(ctx, headers);

  return headers;
}

/**
 * Extract trace context from incoming request headers.
 * Parses W3C Trace Context format (traceparent header).
 *
 * @param headers - Incoming HTTP headers
 * @returns Extracted trace context or null if not present/invalid
 */
export function extractTraceFromHeaders(
  headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>
): TraceContext | null {
  const traceparent = getHeaderValue(headers, TRACEPARENT_HEADER);

  if (!traceparent) {
    return null;
  }

  const parsed = parseTraceparent(traceparent);

  if (!parsed) {
    return null;
  }

  const traceState = getHeaderValue(headers, TRACESTATE_HEADER);

  return {
    ...parsed,
    traceState: traceState || undefined,
    isValid: true,
  };
}

/**
 * Create a context with the extracted trace context attached.
 * Use this to propagate trace context to child operations.
 *
 * @param traceContext - Previously extracted trace context
 * @returns A new context with trace context attached
 */
export function createContextWithTrace(traceContext: TraceContext) {
  if (!traceContext.isValid) {
    return context.active();
  }

  const spanContext: SpanContext = {
    traceId: traceContext.traceId,
    spanId: traceContext.spanId,
    traceFlags: traceContext.traceFlags,
    isRemote: true,
  };

  return trace.setSpanContext(context.active(), spanContext);
}

/**
 * Generate a correlation ID from the current trace context.
 * This can be used for logging and error tracking.
 *
 * Format: {traceId}-{spanId} (truncated for readability)
 */
export function createCorrelationId(): CorrelationId {
  const ctx = getCurrentTraceContext();

  if (!ctx.isValid) {
    // Generate a random correlation ID if no trace context
    const randomId = generateRandomHex(16);
    return {
      id: randomId,
      traceId: randomId,
      spanId: randomId.slice(0, 16),
    };
  }

  // Use first 8 chars of trace ID and full span ID for correlation
  const shortTraceId = ctx.traceId.slice(0, 8);
  const id = `${shortTraceId}-${ctx.spanId}`;

  return {
    id,
    traceId: ctx.traceId,
    spanId: ctx.spanId,
  };
}

/**
 * Format trace context as a traceparent header value.
 */
export function formatTraceparent(ctx: TraceContext): string {
  if (!ctx.isValid) {
    return "";
  }

  const flags = ctx.traceFlags.toString(16).padStart(2, "0");
  return `${TRACEPARENT_VERSION}-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

/**
 * Parse a traceparent header value into its components.
 *
 * Format: {version}-{trace-id}-{parent-id}-{trace-flags}
 * Example: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
 */
function parseTraceparent(
  traceparent: string
): Omit<TraceContext, "traceState" | "isValid"> | null {
  const parts = traceparent.trim().split("-");

  if (parts.length !== 4) {
    return null;
  }

  const [version, traceId, spanId, flags] = parts;

  // Validate version
  if (version !== TRACEPARENT_VERSION) {
    // We only support version 00, but should still parse if possible
    if (!/^[0-9a-f]{2}$/.test(version)) {
      return null;
    }
  }

  // Validate trace ID (32 hex chars, not all zeros)
  if (!/^[0-9a-f]{32}$/.test(traceId) || traceId === "0".repeat(32)) {
    return null;
  }

  // Validate span ID (16 hex chars, not all zeros)
  if (!/^[0-9a-f]{16}$/.test(spanId) || spanId === "0".repeat(16)) {
    return null;
  }

  // Validate flags (2 hex chars)
  if (!/^[0-9a-f]{2}$/.test(flags)) {
    return null;
  }

  return {
    traceId,
    spanId,
    traceFlags: parseInt(flags, 16),
  };
}

/**
 * Get a header value, handling both single and array values.
 */
function getHeaderValue(
  headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>,
  name: string
): string | null {
  const value = headers[name] || headers[name.toLowerCase()];

  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] : value;
}

/**
 * Generate a random hex string of specified length.
 */
function generateRandomHex(length: number): string {
  const bytes = new Uint8Array(length / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
