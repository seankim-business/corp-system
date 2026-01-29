/**
 * Anomaly Detection Types
 */

export interface DetectorConfig {
  threshold?: number;
  windowSize?: number;
  sensitivity?: "low" | "medium" | "high";
  enabled?: boolean;
}

export interface DetectorResult {
  id: string;
  organizationId: string;
  type: "cost" | "error" | "latency" | "usage";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  detectedAt: Date;
  metadata?: Record<string, any>;
  recommendations?: string[];
}

export interface AnomalyDetector {
  name: string;
  type: "cost" | "error" | "latency" | "usage";
  configure(config: Partial<DetectorConfig>): void;
  detect(organizationId: string): Promise<DetectorResult[]>;
}
