/**
 * Cost Anomaly Detector
 * Stub implementation
 */

import type { AnomalyDetector, DetectorResult, AnomalyType, DetectorConfig } from "../types";

export class CostAnomalyDetector implements AnomalyDetector {
  name = "cost";
  type: AnomalyType = "cost";

  async detect(_organizationId: string): Promise<DetectorResult[]> {
    return [];
  }

  configure(_config: Partial<DetectorConfig>): void {
    // Stub - no-op
  }
}

export const costAnomalyDetector = new CostAnomalyDetector();
