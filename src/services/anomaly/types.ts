/**
 * Anomaly Detection Types
 *
 * Core interfaces for the anomaly detection and alerting system.
 */

// =============================================================================
// Anomaly Types
// =============================================================================

export type AnomalyType = 'error_spike' | 'latency' | 'usage' | 'cost';
export type AnomalySeverity = 'warning' | 'critical';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';
export type NotificationChannel = 'slack' | 'email' | 'webhook' | 'sse';

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface Anomaly {
  id: string;
  organizationId: string;
  type: AnomalyType;
  severity: AnomalySeverity;

  // Details
  description: string;
  metric: string;
  expectedValue: number;
  actualValue: number;
  deviation: number; // Standard deviations from normal

  // Context
  agentId?: string;
  timeRange: TimeRange;

  // Actions
  suggestedActions: string[];
  autoResolvable: boolean;

  // Metadata
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface Alert {
  id: string;
  organizationId: string;
  anomalyId: string;
  status: AlertStatus;

  // Notification
  notifiedChannels: NotificationChannel[];
  notifiedUsers: string[];

  // Acknowledgment
  acknowledgedAt?: Date;
  acknowledgedBy?: string;

  // Resolution
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: string;

  // Metadata
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Detector Configuration
// =============================================================================

export interface DetectorConfig {
  enabled: boolean;

  // Thresholds
  warningThreshold: number;    // Standard deviations for warning
  criticalThreshold: number;   // Standard deviations for critical

  // Sampling
  sampleWindowMs: number;      // Time window for data collection
  minSampleSize: number;       // Minimum samples for valid detection

  // Baseline
  baselineWindowMs: number;    // Time window for baseline calculation
}

export interface ErrorSpikeConfig extends DetectorConfig {
  // Error rate thresholds (percentage)
  errorRateWarning: number;
  errorRateCritical: number;
}

export interface LatencyConfig extends DetectorConfig {
  // Latency thresholds (milliseconds)
  p95ThresholdMs: number;
  p99ThresholdMs: number;
}

export interface UsageConfig extends DetectorConfig {
  // Usage spike detection
  requestRateMultiplier: number; // e.g., 3x normal = spike
  minimumRequestsPerMinute: number;
}

export interface CostConfig extends DetectorConfig {
  // Cost thresholds
  dailyBudgetWarningPercent: number;
  hourlySpendMultiplier: number;
}

export interface AnomalyDetectorConfig {
  enabled: boolean;
  checkIntervalMs: number;

  errorSpike: ErrorSpikeConfig;
  latency: LatencyConfig;
  usage: UsageConfig;
  cost: CostConfig;
}

// =============================================================================
// Detector Interfaces
// =============================================================================

export interface DetectorResult {
  detected: boolean;
  anomaly?: Omit<Anomaly, 'id' | 'createdAt'>;
}

export interface AnomalyDetector {
  name: string;
  type: AnomalyType;

  /**
   * Run detection for a specific organization
   */
  detect(organizationId: string): Promise<DetectorResult[]>;

  /**
   * Configure the detector
   */
  configure(config: Partial<DetectorConfig>): void;
}

// =============================================================================
// Time Series / Statistical Types
// =============================================================================

export interface DataPoint {
  timestamp: Date;
  value: number;
  labels?: Record<string, string>;
}

export interface TimeSeries {
  metric: string;
  data: DataPoint[];
}

export interface StatisticalSummary {
  count: number;
  sum: number;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

// =============================================================================
// Alert Manager Types
// =============================================================================

export interface AlertCreateInput {
  organizationId: string;
  anomaly: Omit<Anomaly, 'id' | 'createdAt'>;
}

export interface AlertRouteResult {
  channels: NotificationChannel[];
  users: string[];
  slackChannel?: string;
  webhookUrl?: string;
}

export interface NotificationPayload {
  alert: Alert;
  anomaly: Anomaly;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
}

// =============================================================================
// Notification Types
// =============================================================================

export interface SlackNotificationOptions {
  channel: string;
  botToken: string;
}

export interface EmailNotificationOptions {
  to: string[];
  subject: string;
}

export interface WebhookNotificationOptions {
  url: string;
  headers?: Record<string, string>;
}

export interface NotificationResult {
  channel: NotificationChannel;
  success: boolean;
  error?: string;
  messageId?: string;
}

// =============================================================================
// Detection Job Types
// =============================================================================

export interface AnomalyDetectionJobData {
  organizationId?: string; // Optional - if not specified, run for all orgs
  detectorTypes?: AnomalyType[]; // Optional - if not specified, run all detectors
  triggeredBy?: string; // 'scheduled' | 'manual' | userId
}

export interface AnomalyDetectionJobResult {
  organizationsChecked: number;
  anomaliesDetected: number;
  alertsCreated: number;
  errors: Array<{
    organizationId: string;
    error: string;
  }>;
}
