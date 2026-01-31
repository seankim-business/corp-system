/**
 * Usage Anomaly Detector
 * Stub implementation
 */

import type { AnomalyDetector, DetectorResult, AnomalyType, DetectorConfig } from "../types";

export class UsageAnomalyDetector implements AnomalyDetector {
  name = "usage";
  type: AnomalyType = "usage";

  async detect(_organizationId: string): Promise<DetectorResult[]> {
    return [];
  }

  configure(_config: Partial<DetectorConfig>): void {
    // Stub - no-op
  }
}

export const usageAnomalyDetector = new UsageAnomalyDetector();
