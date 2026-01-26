import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { PrismaInstrumentation } from "@prisma/instrumentation";

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

let sdk: NodeSDK | null = null;

if (otlpEndpoint) {
  try {
    const exporter = new OTLPTraceExporter({
      url: otlpEndpoint,
      headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
        ? Object.fromEntries(
            process.env.OTEL_EXPORTER_OTLP_HEADERS.split(",")
              .map((kv) => kv.trim())
              .filter(Boolean)
              .map((kv) => {
                const [k, ...rest] = kv.split("=");
                return [k, rest.join("=")];
              }),
          )
        : undefined,
    });

    sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || "nubabel-backend",
        [ATTR_SERVICE_VERSION]: process.env.npm_package_version || "1.0.0",
        "deployment.environment": process.env.NODE_ENV || "development",
      }),
      spanProcessor: new BatchSpanProcessor(exporter, {
        maxQueueSize: 2048,
        scheduledDelayMillis: 5000,
        exportTimeoutMillis: 30000,
        maxExportBatchSize: 512,
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          "@opentelemetry/instrumentation-fs": { enabled: false },
          "@opentelemetry/instrumentation-express": { enabled: true },
          "@opentelemetry/instrumentation-http": { enabled: true },
          "@opentelemetry/instrumentation-ioredis": {
            enabled: true,
            requireParentSpan: true,
          },
        }),
        new PrismaInstrumentation(),
      ],
    });

    sdk.start();
    console.log("✅ OpenTelemetry instrumentation started");
  } catch (error) {
    console.warn("⚠️  OpenTelemetry initialization failed (non-fatal):", error);
    sdk = null;
  }
}

export async function shutdownOpenTelemetry() {
  if (!sdk) return;
  await sdk.shutdown();
}
