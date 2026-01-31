/**
 * Error Spike Detector
 * Stub implementation
 */

import type { AnomalyDetector, DetectorResult, AnomalyType, DetectorConfig } from "../types";

export class ErrorSpikeDetector implements AnomalyDetector {
  name = "error_spike";
  type: AnomalyType = "error_spike";

  async detect(_organizationId: string): Promise<DetectorResult[]> {
    return [];
  }

  configure(_config: Partial<DetectorConfig>): void {
    // Stub - no-op
  }
}

export const errorSpikeDetector = new ErrorSpikeDetector();
