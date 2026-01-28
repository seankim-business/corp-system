/**
 * Usage Anomaly Detector - Stub implementation
 * TODO: Implement actual usage anomaly detection logic
 */

import { AnomalyDetector, DetectorConfig, DetectorResult } from '../types';

export class UsageAnomalyDetector implements AnomalyDetector {
  name = 'usage-anomaly';
  type = 'usage' as const;

  configure(_config: Partial<DetectorConfig>): void {
    // Stub - no-op
  }

  async detect(_organizationId: string): Promise<DetectorResult[]> {
    // Stub - return empty results
    return [];
  }
}

export const usageAnomalyDetector = new UsageAnomalyDetector();
