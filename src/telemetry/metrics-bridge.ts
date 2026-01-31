import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from "prom-client";
import { logger } from "../utils/logger";

// Create a global registry for all metrics
const register = new Registry();

// Collect default Node.js metrics with nubabel_ prefix
collectDefaultMetrics({
  register,
  prefix: "nubabel_",
});

// =============================================================================
// HTTP Metrics
// =============================================================================

const httpRequestsTotal = new Counter({
  name: "nubabel_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "path", "status"],
  registers: [register],
});

const httpRequestDurationSeconds = new Histogram({
  name: "nubabel_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "path"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// =============================================================================
// AI Metrics
// =============================================================================

const aiRequestsTotal = new Counter({
  name: "nubabel_ai_requests_total",
  help: "Total number of AI requests",
  labelNames: ["model", "category", "success"],
  registers: [register],
});

const aiTokensTotal = new Counter({
  name: "nubabel_ai_tokens_total",
  help: "Total number of AI tokens consumed",
  labelNames: ["model", "type"],
  registers: [register],
});

const aiRequestDurationSeconds = new Histogram({
  name: "nubabel_ai_request_duration_seconds",
  help: "AI request duration in seconds",
  labelNames: ["model", "category"],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
  registers: [register],
});

// =============================================================================
// Queue Metrics
// =============================================================================

const queueJobs = new Gauge({
  name: "nubabel_queue_jobs",
  help: "Number of jobs in queue by state",
  labelNames: ["queue", "state"],
  registers: [register],
});

// =============================================================================
// Circuit Breaker Metrics
// =============================================================================

const circuitBreakerState = new Gauge({
  name: "nubabel_circuit_breaker_state",
  help: "Circuit breaker state (0=closed, 1=half_open, 2=open)",
  labelNames: ["name"],
  registers: [register],
});

// =============================================================================
// Recording Functions
// =============================================================================

export function recordHttpRequest(params: {
  method: string;
  path: string;
  statusCode: number;
  duration: number;
}): void {
  const { method, path, statusCode, duration } = params;

  try {
    httpRequestsTotal.inc({
      method,
      path: normalizePath(path),
      status: String(statusCode),
    });

    httpRequestDurationSeconds.observe(
      {
        method,
        path: normalizePath(path),
      },
      duration / 1000,
    );
  } catch (error) {
    logger.error("Failed to record HTTP request metric", { error, params });
  }
}

export function recordAiRequest(params: {
  model: string;
  category: string;
  success: boolean;
  duration: number;
  inputTokens: number;
  outputTokens: number;
}): void {
  const { model, category, success, duration, inputTokens, outputTokens } = params;

  try {
    aiRequestsTotal.inc({
      model,
      category,
      success: String(success),
    });

    aiRequestDurationSeconds.observe(
      {
        model,
        category,
      },
      duration / 1000,
    );

    aiTokensTotal.inc(
      {
        model,
        type: "input",
      },
      inputTokens,
    );

    aiTokensTotal.inc(
      {
        model,
        type: "output",
      },
      outputTokens,
    );

    aiTokensTotal.inc(
      {
        model,
        type: "total",
      },
      inputTokens + outputTokens,
    );
  } catch (error) {
    logger.error("Failed to record AI request metric", { error, params });
  }
}

export function recordQueueJob(queue: string, state: string, count: number): void {
  try {
    queueJobs.set({ queue, state }, count);
  } catch (error) {
    logger.error("Failed to record queue job metric", { error, queue, state, count });
  }
}

export function recordCircuitBreakerState(name: string, state: "CLOSED" | "HALF_OPEN" | "OPEN"): void {
  try {
    const stateValue = state === "CLOSED" ? 0 : state === "HALF_OPEN" ? 1 : 2;
    circuitBreakerState.set({ name }, stateValue);
  } catch (error) {
    logger.error("Failed to record circuit breaker state metric", { error, name, state });
  }
}

// =============================================================================
// Metrics Endpoint
// =============================================================================

export async function getMetricsText(): Promise<string> {
  try {
    return await register.metrics();
  } catch (error) {
    logger.error("Failed to get metrics text", { error });
    throw error;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

function normalizePath(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
    .replace(/\/\d+/g, "/:id");
}

// Export the registry for advanced use cases
export { register };
