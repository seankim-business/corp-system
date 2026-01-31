/**
 * Telemetry module for OpenTelemetry tracing, context propagation, and metrics.
 *
 * This module provides:
 * - ErrorPrioritySampler: Custom sampler that prioritizes error traces
 * - Context propagation: W3C Trace Context helpers
 * - Tracing initialization: Enhanced OpenTelemetry setup
 * - Prometheus metrics: prom-client based metrics for Grafana
 * - Sentry integration: Link OTel traces to Sentry errors
 *
 * @example
 * ```typescript
 * import { initTracing, shutdownTracing, getCurrentTraceContext } from './telemetry';
 *
 * // Initialize at application startup
 * initTracing({
 *   serviceName: 'my-service',
 *   samplerConfig: {
 *     successSampleRate: 0.1,
 *     alwaysSamplePaths: ['/api/critical'],
 *   },
 * });
 *
 * // Get current trace context
 * const ctx = getCurrentTraceContext();
 * console.log(`Trace ID: ${ctx.traceId}`);
 *
 * // Shutdown on application exit
 * await shutdownTracing();
 * ```
 */

// Sampling
export {
  ErrorPrioritySampler,
  createErrorPrioritySampler,
  type SamplerConfig,
} from "./sampling";

// Context propagation
export {
  getCurrentTraceContext,
  attachTraceToHeaders,
  extractTraceFromHeaders,
  createContextWithTrace,
  createCorrelationId,
  formatTraceparent,
  type TraceContext,
  type CorrelationId,
} from "./context-propagation";

// Tracing initialization
export {
  initTracing,
  shutdownTracing,
  isTracingEnabled,
  type TracingConfig,
} from "./tracing";

// Prometheus metrics bridge
export {
  recordHttpRequest,
  recordAiRequest,
  recordQueueJob,
  recordCircuitBreakerState,
  getMetricsText,
  register,
} from "./metrics-bridge";

// Sentry-OTel integration
export {
  attachSentryTraceContext,
  createSentrySpan,
  createSentryTransaction,
  captureExceptionWithOTelContext,
  createOTelSpanWithSentry,
  getCurrentTraceContext as getSentryTraceContext,
} from "./sentry-integration";
