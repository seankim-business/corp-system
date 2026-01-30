/**
 * Lightweight Distributed Tracing Service
 *
 * OpenTelemetry-compatible distributed tracing without the heavy OTel SDK dependency.
 * Implements core tracing concepts manually:
 * - W3C Trace Context propagation (traceparent header)
 * - Span creation with parent-child relationships
 * - AsyncLocalStorage-based active span tracking
 * - Structured span export via logger
 */

import * as crypto from "crypto";
import { AsyncLocalStorage } from "async_hooks";
import { logger } from "../utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpanContext {
  traceId: string; // 32-char hex
  spanId: string; // 16-char hex
  traceFlags: number;
  traceState?: string;
}

export type SpanStatus = "OK" | "ERROR" | "UNSET";

export type SpanKind = "INTERNAL" | "SERVER" | "CLIENT" | "PRODUCER" | "CONSUMER";

export type SpanAttributes = Record<string, string | number | boolean>;

interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: SpanAttributes;
}

interface StartSpanOptions {
  parent?: Span;
  kind?: SpanKind;
  attributes?: SpanAttributes;
}

// ---------------------------------------------------------------------------
// Span
// ---------------------------------------------------------------------------

export class Span {
  public readonly name: string;
  public readonly context: SpanContext;
  public readonly parentSpanId: string | undefined;
  public readonly kind: SpanKind;
  public status: SpanStatus;
  public attributes: SpanAttributes;
  public readonly startTime: number;
  public endTime: number | undefined;

  private events: SpanEvent[] = [];

  constructor(
    name: string,
    context: SpanContext,
    kind: SpanKind,
    parentSpanId?: string,
    attributes?: SpanAttributes,
  ) {
    this.name = name;
    this.context = context;
    this.parentSpanId = parentSpanId;
    this.kind = kind;
    this.status = "UNSET";
    this.attributes = attributes ? { ...attributes } : {};
    this.startTime = Date.now();
  }

  setStatus(status: SpanStatus): void {
    this.status = status;
  }

  setAttribute(key: string, value: string | number | boolean): void {
    this.attributes[key] = value;
  }

  addEvent(name: string, attributes?: SpanAttributes): void {
    this.events.push({
      name,
      timestamp: Date.now(),
      attributes,
    });
  }

  end(): void {
    if (this.endTime === undefined) {
      this.endTime = Date.now();
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      traceId: this.context.traceId,
      spanId: this.context.spanId,
      parentSpanId: this.parentSpanId ?? null,
      kind: this.kind,
      status: this.status,
      attributes: this.attributes,
      startTime: this.startTime,
      endTime: this.endTime ?? null,
      durationMs: this.endTime !== undefined ? this.endTime - this.startTime : null,
      events: this.events,
      traceFlags: this.context.traceFlags,
      traceState: this.context.traceState ?? null,
    };
  }
}

// ---------------------------------------------------------------------------
// Tracer (singleton)
// ---------------------------------------------------------------------------

class Tracer {
  private asyncLocalStorage = new AsyncLocalStorage<Span>();

  /**
   * Generate a random hex string of the given byte length.
   */
  private randomHex(bytes: number): string {
    return crypto.randomBytes(bytes).toString("hex");
  }

  /**
   * Start a new span. If a parent is provided, the child inherits the
   * parent's traceId; otherwise a fresh traceId is generated.
   */
  startSpan(name: string, options?: StartSpanOptions): Span {
    const parent = options?.parent ?? this.getActiveSpan();
    const traceId = parent ? parent.context.traceId : this.randomHex(16);
    const spanId = this.randomHex(8);
    const traceFlags = parent ? parent.context.traceFlags : 1; // sampled

    const context: SpanContext = {
      traceId,
      spanId,
      traceFlags,
      traceState: parent?.context.traceState,
    };

    return new Span(
      name,
      context,
      options?.kind ?? "INTERNAL",
      parent?.context.spanId,
      options?.attributes,
    );
  }

  /**
   * Extract a SpanContext from incoming HTTP headers using the
   * W3C Trace Context `traceparent` format:
   *   {version}-{traceId}-{spanId}-{traceFlags}
   *   e.g. 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
   */
  extractContext(headers: Record<string, string | undefined>): SpanContext | null {
    const traceparent = headers["traceparent"] || headers["Traceparent"];
    if (!traceparent) {
      return null;
    }

    const parts = traceparent.split("-");
    if (parts.length < 4) {
      return null;
    }

    const [, traceId, spanId, flagsHex] = parts;

    // Validate lengths
    if (!traceId || traceId.length !== 32 || !spanId || spanId.length !== 16) {
      return null;
    }

    const traceFlags = parseInt(flagsHex ?? "00", 16);
    if (isNaN(traceFlags)) {
      return null;
    }

    const traceState = headers["tracestate"] || headers["Tracestate"];

    return { traceId, spanId, traceFlags, traceState };
  }

  /**
   * Produce a W3C `traceparent` header value from a span.
   */
  injectContext(span: Span): Record<string, string> {
    const flags = span.context.traceFlags.toString(16).padStart(2, "0");
    const traceparent = `00-${span.context.traceId}-${span.context.spanId}-${flags}`;
    const result: Record<string, string> = { traceparent };

    if (span.context.traceState) {
      result["tracestate"] = span.context.traceState;
    }

    return result;
  }

  /**
   * Get the currently active span from AsyncLocalStorage, or null.
   */
  getActiveSpan(): Span | null {
    return this.asyncLocalStorage.getStore() ?? null;
  }

  /**
   * Execute an async function with the given span set as the active span
   * in AsyncLocalStorage, so that `getActiveSpan()` returns it inside `fn`.
   */
  async withSpan<T>(span: Span, fn: () => Promise<T>): Promise<T> {
    return this.asyncLocalStorage.run(span, fn);
  }

  /**
   * End a span and log its data for export / debugging.
   */
  endSpan(span: Span): void {
    span.end();
    logger.debug("Span completed", span.toJSON() as Record<string, string | number | boolean>);
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const tracer = new Tracer();
