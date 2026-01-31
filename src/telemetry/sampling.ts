import {
  Sampler,
  SamplingDecision,
  SamplingResult,
} from "@opentelemetry/sdk-trace-base";
import { Context, SpanKind, Attributes, Link } from "@opentelemetry/api";

export interface SamplerConfig {
  /** Sample rate for errors (status >= 400), default 1.0 (100%) */
  errorSampleRate: number;
  /** Sample rate for successful requests, default 0.1 (10%) */
  successSampleRate: number;
  /** Paths that should always be sampled */
  alwaysSamplePaths: string[];
}

const DEFAULT_CONFIG: SamplerConfig = {
  errorSampleRate: 1.0,
  successSampleRate: parseFloat(process.env.OTEL_SUCCESS_SAMPLE_RATE || "0.1"),
  alwaysSamplePaths: ["/api/slack/events", "/api/webhooks"],
};

/**
 * Custom sampler that prioritizes error traces over success traces.
 * This helps reduce telemetry volume while ensuring errors are always captured.
 *
 * Sampling decisions are made at span creation time based on:
 * 1. Always sample paths (e.g., /api/slack/events) - 100%
 * 2. Error responses (determined post-hoc, so we sample conservatively) - configured rate
 * 3. Successful responses - lower configured rate
 *
 * Note: Since we don't know the response status at span creation time,
 * we use a head-based sampling approach that samples at the configured
 * success rate, and rely on the parent span's sampling decision for child spans.
 */
export class ErrorPrioritySampler implements Sampler {
  private readonly config: SamplerConfig;

  constructor(config: Partial<SamplerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  shouldSample(
    _context: Context,
    traceId: string,
    _spanName: string,
    _spanKind: SpanKind,
    attributes: Attributes,
    _links: Link[]
  ): SamplingResult {
    // Check if this is an always-sample path
    const httpTarget = attributes["http.target"] as string | undefined;
    const httpRoute = attributes["http.route"] as string | undefined;
    const urlPath = attributes["url.path"] as string | undefined;
    const path = httpTarget || httpRoute || urlPath;

    if (path) {
      for (const alwaysSamplePath of this.config.alwaysSamplePaths) {
        if (path.startsWith(alwaysSamplePath)) {
          return {
            decision: SamplingDecision.RECORD_AND_SAMPLED,
            attributes: {
              "sampling.reason": "always_sample_path",
              "sampling.path": alwaysSamplePath,
            },
          };
        }
      }
    }

    // Check for error indicators in attributes (when available at span creation)
    const httpStatusCode = attributes["http.status_code"] as number | undefined;
    const httpResponseStatusCode = attributes["http.response.status_code"] as
      | number
      | undefined;
    const statusCode = httpStatusCode || httpResponseStatusCode;

    if (statusCode !== undefined && statusCode >= 400) {
      // Error response - sample based on error rate
      if (Math.random() < this.config.errorSampleRate) {
        return {
          decision: SamplingDecision.RECORD_AND_SAMPLED,
          attributes: {
            "sampling.reason": "error_status",
            "sampling.status_code": statusCode,
          },
        };
      }
    }

    // Use deterministic sampling based on trace ID for consistency
    // This ensures all spans in a trace get the same sampling decision
    const sampleDecision = this.shouldSampleByTraceId(
      traceId,
      this.config.successSampleRate
    );

    if (sampleDecision) {
      return {
        decision: SamplingDecision.RECORD_AND_SAMPLED,
        attributes: {
          "sampling.reason": "probability",
          "sampling.rate": this.config.successSampleRate,
        },
      };
    }

    return {
      decision: SamplingDecision.NOT_RECORD,
      attributes: {},
    };
  }

  /**
   * Deterministic sampling based on trace ID.
   * This ensures consistent sampling decisions across all spans in a trace.
   */
  private shouldSampleByTraceId(traceId: string, rate: number): boolean {
    if (rate >= 1.0) return true;
    if (rate <= 0.0) return false;

    // Use last 8 characters of trace ID as a deterministic seed
    const seed = parseInt(traceId.slice(-8), 16);
    const threshold = rate * 0xffffffff;
    return seed < threshold;
  }

  toString(): string {
    return `ErrorPrioritySampler{errorRate=${this.config.errorSampleRate}, successRate=${this.config.successSampleRate}}`;
  }
}

/**
 * Creates a sampler that marks spans for error status post-hoc.
 * Use with span processors that can update sampling decisions based on span status.
 */
export function createErrorPrioritySampler(
  config: Partial<SamplerConfig> = {}
): Sampler {
  return new ErrorPrioritySampler(config);
}
