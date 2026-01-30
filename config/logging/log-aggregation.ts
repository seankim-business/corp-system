/**
 * Log Aggregation Configuration
 *
 * Configures log shipping to external aggregation services (Datadog, ELK, etc.).
 * Uses HTTP transport to send structured JSON logs to the configured endpoint.
 */
import { logger } from "../../src/utils/logger";

// =============================================================================
// Types
// =============================================================================

export type LogAggregationProvider = "datadog" | "elasticsearch" | "loki" | "custom";

export interface LogAggregationConfig {
  enabled: boolean;
  provider: LogAggregationProvider;
  /** HTTP endpoint to ship logs to */
  endpoint: string;
  /** API key or auth token */
  apiKey?: string;
  /** Batch size before flushing (default: 50) */
  batchSize: number;
  /** Flush interval in ms (default: 5000) */
  flushIntervalMs: number;
  /** Additional tags to attach to all logs */
  tags: Record<string, string>;
  /** Minimum log level to ship (default: "info") */
  minLevel: "debug" | "info" | "warn" | "error";
  /** Whether to include stack traces (default: true) */
  includeStackTraces: boolean;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  service: string;
  environment: string;
  hostname: string;
  tags: Record<string, string>;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Configuration from Environment
// =============================================================================

const LOG_LEVEL_PRIORITY: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function getLogAggregationConfig(): LogAggregationConfig {
  const provider = (process.env.LOG_AGGREGATION_PROVIDER || "datadog") as LogAggregationProvider;

  const endpointMap: Record<LogAggregationProvider, string> = {
    datadog: "https://http-intake.logs.datadoghq.com/api/v2/logs",
    elasticsearch: process.env.ELASTICSEARCH_URL || "http://localhost:9200/_bulk",
    loki: process.env.LOKI_URL || "http://localhost:3100/loki/api/v1/push",
    custom: process.env.LOG_AGGREGATION_ENDPOINT || "",
  };

  return {
    enabled: process.env.LOG_AGGREGATION_ENABLED === "true",
    provider,
    endpoint: process.env.LOG_AGGREGATION_ENDPOINT || endpointMap[provider],
    apiKey: process.env.LOG_AGGREGATION_API_KEY || process.env.DD_API_KEY,
    batchSize: parseInt(process.env.LOG_AGGREGATION_BATCH_SIZE || "50", 10),
    flushIntervalMs: parseInt(process.env.LOG_AGGREGATION_FLUSH_INTERVAL || "5000", 10),
    tags: {
      service: "nubabel",
      env: process.env.NODE_ENV || "development",
      version: process.env.APP_VERSION || "unknown",
      ...(process.env.LOG_TAGS ? JSON.parse(process.env.LOG_TAGS) : {}),
    },
    minLevel: (process.env.LOG_AGGREGATION_MIN_LEVEL || "info") as LogAggregationConfig["minLevel"],
    includeStackTraces: process.env.LOG_AGGREGATION_INCLUDE_STACKS !== "false",
  };
}

// =============================================================================
// Log Shipper
// =============================================================================

class LogShipper {
  private buffer: LogEntry[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private config: LogAggregationConfig;
  private hostname: string;

  constructor(config: LogAggregationConfig) {
    this.config = config;
    this.hostname = process.env.HOSTNAME || process.env.RAILWAY_REPLICA_ID || "unknown";
  }

  start(): void {
    if (!this.config.enabled) {
      logger.debug("Log aggregation disabled");
      return;
    }

    this.timer = setInterval(() => this.flush(), this.config.flushIntervalMs);
    logger.info("Log shipper started", {
      provider: this.config.provider,
      endpoint: this.config.endpoint,
      batchSize: this.config.batchSize,
      flushInterval: this.config.flushIntervalMs,
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Final flush
    if (this.buffer.length > 0) {
      void this.flush();
    }
  }

  addEntry(
    level: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): void {
    if (!this.config.enabled) return;

    const levelPriority = LOG_LEVEL_PRIORITY[level] ?? 1;
    const minPriority = LOG_LEVEL_PRIORITY[this.config.minLevel] ?? 1;
    if (levelPriority < minPriority) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.config.tags.service || "nubabel",
      environment: this.config.tags.env || "development",
      hostname: this.hostname,
      tags: this.config.tags,
      metadata,
    };

    this.buffer.push(entry);

    if (this.buffer.length >= this.config.batchSize) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0, this.config.batchSize);

    try {
      const body = this.formatBatch(batch);
      const headers = this.getHeaders();

      const response = await fetch(this.config.endpoint, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        logger.warn("Log shipping failed", {
          status: response.status,
          provider: this.config.provider,
          batchSize: batch.length,
        });
        // Re-queue failed entries (up to a limit to prevent infinite growth)
        if (this.buffer.length < this.config.batchSize * 10) {
          this.buffer.unshift(...batch);
        }
      }
    } catch (err) {
      logger.warn("Log shipping error", {
        error: String(err),
        provider: this.config.provider,
        batchSize: batch.length,
      });
    }
  }

  private formatBatch(entries: LogEntry[]): string {
    switch (this.config.provider) {
      case "datadog":
        return JSON.stringify(
          entries.map((e) => ({
            ddsource: "nodejs",
            ddtags: Object.entries(e.tags)
              .map(([k, v]) => `${k}:${v}`)
              .join(","),
            hostname: e.hostname,
            message: e.message,
            service: e.service,
            status: e.level,
            timestamp: e.timestamp,
            ...e.metadata,
          })),
        );

      case "elasticsearch":
        // NDJSON format for Elasticsearch _bulk API
        return entries
          .map((e) => {
            const index = JSON.stringify({
              index: { _index: `nubabel-logs-${e.timestamp.substring(0, 10)}` },
            });
            const doc = JSON.stringify({
              "@timestamp": e.timestamp,
              level: e.level,
              message: e.message,
              service: e.service,
              environment: e.environment,
              hostname: e.hostname,
              tags: e.tags,
              ...e.metadata,
            });
            return `${index}\n${doc}`;
          })
          .join("\n") + "\n";

      case "loki":
        // Loki push API format
        return JSON.stringify({
          streams: [
            {
              stream: {
                job: "nubabel",
                ...entries[0]?.tags,
              },
              values: entries.map((e) => [
                String(new Date(e.timestamp).getTime() * 1_000_000), // nanoseconds
                JSON.stringify({ level: e.level, msg: e.message, ...e.metadata }),
              ]),
            },
          ],
        });

      case "custom":
      default:
        return JSON.stringify(entries);
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    switch (this.config.provider) {
      case "datadog":
        if (this.config.apiKey) {
          headers["DD-API-KEY"] = this.config.apiKey;
        }
        break;
      case "elasticsearch":
        headers["Content-Type"] = "application/x-ndjson";
        if (this.config.apiKey) {
          headers["Authorization"] = `ApiKey ${this.config.apiKey}`;
        }
        break;
      case "loki":
        if (this.config.apiKey) {
          headers["Authorization"] = `Bearer ${this.config.apiKey}`;
        }
        break;
      case "custom":
        if (this.config.apiKey) {
          headers["Authorization"] = `Bearer ${this.config.apiKey}`;
        }
        break;
    }

    return headers;
  }

  getStats(): { bufferSize: number; provider: string; enabled: boolean } {
    return {
      bufferSize: this.buffer.length,
      provider: this.config.provider,
      enabled: this.config.enabled,
    };
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

const config = getLogAggregationConfig();
export const logShipper = new LogShipper(config);
