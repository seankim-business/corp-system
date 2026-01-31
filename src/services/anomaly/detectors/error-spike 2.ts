/**
 * Error Spike Detector - Stub implementation
 * TODO: Implement actual error spike detection logic
 */

import { AnomalyDetector, DetectorConfig, DetectorResult } from '../types';

export class ErrorSpikeDetector implements AnomalyDetector {
  name = 'error-spike';
  type = 'error_spike' as const;

  configure(_config: Partial<DetectorConfig>): void {
    // Stub - no-op
  }

  async detect(_organizationId: string): Promise<DetectorResult[]> {
    // Stub - return empty results
    return [];
  }
}

export const errorSpikeDetector = new ErrorSpikeDetector();
