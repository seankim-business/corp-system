/**
 * Cost Anomaly Detector - Stub implementation
 * TODO: Implement actual cost anomaly detection logic
 */

import { AnomalyDetector, DetectorConfig, DetectorResult } from '../types';

export class CostAnomalyDetector implements AnomalyDetector {
  name = 'cost-anomaly';
  type = 'cost' as const;

  configure(_config: Partial<DetectorConfig>): void {
    // Stub - no-op
  }

  async detect(_organizationId: string): Promise<DetectorResult[]> {
    // Stub - return empty results
    return [];
  }
}

export const costAnomalyDetector = new CostAnomalyDetector();
