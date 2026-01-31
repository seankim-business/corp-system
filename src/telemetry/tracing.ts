import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";

import { createErrorPrioritySampler, SamplerConfig } from "./sampling";

/**
 * Configuration for OpenTelemetry tracing initialization
 */
export interface TracingConfig {
  /** Service name for telemetry identification */
  serviceName: string;
  /** Service version */
  serviceVersion: string;
  /** Deployment environment (development, staging, production) */
  environment: string;
  /** OTLP exporter endpoint URL */
  otlpEndpoint?: string;
  /** Optional OTLP headers (comma-separated key=value pairs) */
  otlpHeaders?: string;
  /** Sampler configuration */
  samplerConfig?: Partial<SamplerConfig>;
  /** Enable debug logging for OpenTelemetry */
  debug?: boolean;
  /** Batch span processor configuration */
  batchConfig?: {
    maxQueueSize?: number;
    scheduledDelayMillis?: number;
    exportTimeoutMillis?: number;
    maxExportBatchSize?: number;
  };
}

const DEFAULT_BATCH_CONFIG = {
  maxQueueSize: 2048,
  scheduledDelayMillis: 5000,
  exportTimeoutMillis: 30000,
  maxExportBatchSize: 512,
};

let sdk: NodeSDK | null = null;
let isInitialized = false;

/**
 * Initialize OpenTelemetry tracing with enhanced configuration.
 * Uses ErrorPrioritySampler for intelligent trace sampling.
 *
 * @param config - Tracing configuration options
 * @returns true if initialization succeeded, false otherwise
 */
export function initTracing(config: Partial<TracingConfig> = {}): boolean {
  if (isInitialized) {
    console.warn("OpenTelemetry tracing already initialized");
    return true;
  }

  const otlpEndpoint =
    config.otlpEndpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!otlpEndpoint) {
    console.log("OTEL_EXPORTER_OTLP_ENDPOINT not set, tracing disabled");
    return false;
  }

  // Enable debug logging if requested
  if (config.debug || process.env.OTEL_DEBUG === "true") {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  try {
    const exporter = createExporter(otlpEndpoint, config.otlpHeaders);
    const sampler = createErrorPrioritySampler(config.samplerConfig);
    const batchConfig = { ...DEFAULT_BATCH_CONFIG, ...config.batchConfig };

    sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]:
          config.serviceName ||
          process.env.OTEL_SERVICE_NAME ||
          "nubabel-backend",
        [ATTR_SERVICE_VERSION]:
          config.serviceVersion ||
          process.env.npm_package_version ||
          "1.0.0",
        "deployment.environment":
          config.environment || process.env.NODE_ENV || "development",
      }),
      sampler,
      spanProcessor: new BatchSpanProcessor(exporter, batchConfig),
      instrumentations: [
        getNodeAutoInstrumentations({
          // Disable noisy file system instrumentation
          "@opentelemetry/instrumentation-fs": { enabled: false },
          // Enable Express instrumentation
          "@opentelemetry/instrumentation-express": { enabled: true },
          // Enable HTTP instrumentation for all HTTP requests
          "@opentelemetry/instrumentation-http": { enabled: true },
          // Enable ioredis instrumentation with parent span requirement
          "@opentelemetry/instrumentation-ioredis": {
            enabled: true,
            requireParentSpan: true,
          },
        }),
        // Add Prisma instrumentation for database tracing
        new PrismaInstrumentation(),
      ],
    });

    sdk.start();
    isInitialized = true;
    console.log("OpenTelemetry tracing initialized with ErrorPrioritySampler");
    return true;
  } catch (error) {
    console.warn("OpenTelemetry initialization failed (non-fatal):", error);
    sdk = null;
    return false;
  }
}

/**
 * Shutdown OpenTelemetry tracing gracefully.
 * Flushes pending spans and closes connections.
 */
export async function shutdownTracing(): Promise<void> {
  if (!sdk) {
    return;
  }

  try {
    await sdk.shutdown();
    isInitialized = false;
    console.log("OpenTelemetry tracing shut down");
  } catch (error) {
    console.error("Error shutting down OpenTelemetry:", error);
    throw error;
  }
}

/**
 * Check if tracing is currently initialized and active.
 */
export function isTracingEnabled(): boolean {
  return isInitialized && sdk !== null;
}

/**
 * Create OTLP exporter with proper header parsing.
 */
function createExporter(
  endpoint: string,
  headersString?: string
): OTLPTraceExporter {
  const headers = parseHeaders(
    headersString || process.env.OTEL_EXPORTER_OTLP_HEADERS
  );

  return new OTLPTraceExporter({
    url: endpoint,
    headers: headers || undefined,
  });
}

/**
 * Parse comma-separated headers string into an object.
 * Format: "key1=value1,key2=value2"
 */
function parseHeaders(
  headersString?: string
): Record<string, string> | undefined {
  if (!headersString) {
    return undefined;
  }

  const headers: Record<string, string> = {};

  const pairs = headersString
    .split(",")
    .map((kv) => kv.trim())
    .filter(Boolean);

  for (const pair of pairs) {
    const [key, ...rest] = pair.split("=");
    if (key && rest.length > 0) {
      headers[key.trim()] = rest.join("=").trim();
    }
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}
