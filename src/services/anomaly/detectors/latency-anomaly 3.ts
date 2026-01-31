/**
 * Latency Anomaly Detector
 * Stub implementation
 */

import type { AnomalyDetector, DetectorResult, AnomalyType, DetectorConfig } from "../types";

export class LatencyAnomalyDetector implements AnomalyDetector {
  name = "latency";
  type: AnomalyType = "latency";

  async detect(_organizationId: string): Promise<DetectorResult[]> {
    return [];
  }

  configure(_config: Partial<DetectorConfig>): void {
    // Stub - no-op
  }
}

export const latencyAnomalyDetector = new LatencyAnomalyDetector();
