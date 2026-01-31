/**
 * Latency Anomaly Detector - Stub implementation
 * TODO: Implement actual latency anomaly detection logic
 */

import { AnomalyDetector, DetectorConfig, DetectorResult } from '../types';

export class LatencyAnomalyDetector implements AnomalyDetector {
  name = 'latency-anomaly';
  type = 'latency' as const;

  configure(_config: Partial<DetectorConfig>): void {
    // Stub - no-op
  }

  async detect(_organizationId: string): Promise<DetectorResult[]> {
    // Stub - return empty results
    return [];
  }
}

export const latencyAnomalyDetector = new LatencyAnomalyDetector();
