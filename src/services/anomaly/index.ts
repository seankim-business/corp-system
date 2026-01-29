/**
 * Anomaly Detection Service
 *
 * Main orchestrator that coordinates all anomaly detectors, alert creation,
 * and notification delivery.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { metrics } from "../../utils/metrics";

// Detectors
import { errorSpikeDetector, ErrorSpikeDetector } from "./detectors/error-spike";
import { latencyAnomalyDetector, LatencyAnomalyDetector } from "./detectors/latency-anomaly";
import { usageAnomalyDetector, UsageAnomalyDetector } from "./detectors/usage-anomaly";
import { costAnomalyDetector, CostAnomalyDetector } from "./detectors/cost-anomaly";

// Services
import { alertManager, AlertManager } from "./alert-manager";
import { notificationSender, NotificationSender } from "./notification-sender";

// Types
import {
  Anomaly,
  Alert,
  AnomalyType,
  AnomalyDetector,
  AnomalyDetectorConfig,
  AnomalyDetectionJobResult,
  NotificationPayload,
} from "./types";

// Re-export types and services
export * from "./types";
export { alertManager } from "./alert-manager";
export { notificationSender } from "./notification-sender";
export { errorSpikeDetector } from "./detectors/error-spike";
export { latencyAnomalyDetector } from "./detectors/latency-anomaly";
export { usageAnomalyDetector } from "./detectors/usage-anomaly";
export { costAnomalyDetector } from "./detectors/cost-anomaly";

const DEFAULT_CONFIG: AnomalyDetectorConfig = {
  enabled: true,
  checkIntervalMs: 5 * 60 * 1000, // 5 minutes
  errorSpike: {
    enabled: true,
    warningThreshold: 2,
    criticalThreshold: 3,
    sampleWindowMs: 5 * 60 * 1000,
    minSampleSize: 10,
    baselineWindowMs: 60 * 60 * 1000,
    errorRateWarning: 10,
    errorRateCritical: 25,
  },
  latency: {
    enabled: true,
    warningThreshold: 2,
    criticalThreshold: 3,
    sampleWindowMs: 5 * 60 * 1000,
    minSampleSize: 10,
    baselineWindowMs: 60 * 60 * 1000,
    p95ThresholdMs: 30000,
    p99ThresholdMs: 60000,
  },
  usage: {
    enabled: true,
    warningThreshold: 2,
    criticalThreshold: 3,
    sampleWindowMs: 5 * 60 * 1000,
    minSampleSize: 5,
    baselineWindowMs: 60 * 60 * 1000,
    requestRateMultiplier: 3,
    minimumRequestsPerMinute: 1,
  },
  cost: {
    enabled: true,
    warningThreshold: 2,
    criticalThreshold: 3,
    sampleWindowMs: 60 * 60 * 1000,
    minSampleSize: 5,
    baselineWindowMs: 24 * 60 * 60 * 1000,
    dailyBudgetWarningPercent: 80,
    hourlySpendMultiplier: 2,
  },
};

export class AnomalyDetectionService {
  private config: AnomalyDetectorConfig;
  private detectors: Map<AnomalyType, AnomalyDetector>;
  private alertManager: AlertManager;
  private notificationSender: NotificationSender;
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<AnomalyDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.alertManager = alertManager;
    this.notificationSender = notificationSender;

    // Initialize detectors
    this.detectors = new Map<AnomalyType, AnomalyDetector>([
      ["error_spike", errorSpikeDetector],
      ["latency", latencyAnomalyDetector],
      ["usage", usageAnomalyDetector],
      ["cost", costAnomalyDetector],
    ]);

    // Apply configuration to detectors
    this.applyConfig();
  }

  /**
   * Configure the service
   */
  configure(config: Partial<AnomalyDetectorConfig>): void {
    this.config = { ...this.config, ...config };
    this.applyConfig();
    logger.info("Anomaly detection configured", { config: this.config });
  }

  /**
   * Start periodic anomaly detection
   */
  start(): void {
    if (!this.config.enabled) {
      logger.info("Anomaly detection is disabled");
      return;
    }

    if (this.checkInterval) {
      logger.warn("Anomaly detection already running");
      return;
    }

    logger.info("Starting anomaly detection", {
      intervalMs: this.config.checkIntervalMs,
    });

    // Run immediately
    this.runDetection().catch((error) => {
      logger.error("Initial anomaly detection failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // Schedule periodic runs
    this.checkInterval = setInterval(() => {
      this.runDetection().catch((error) => {
        logger.error("Scheduled anomaly detection failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop periodic anomaly detection
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info("Anomaly detection stopped");
    }
  }

  /**
   * Run detection for all organizations
   */
  async runDetection(
    organizationId?: string,
    detectorTypes?: AnomalyType[],
  ): Promise<AnomalyDetectionJobResult> {
    const result: AnomalyDetectionJobResult = {
      organizationsChecked: 0,
      anomaliesDetected: 0,
      alertsCreated: 0,
      errors: [],
    };

    try {
      // Get organizations to check
      const orgs = organizationId
        ? [{ id: organizationId }]
        : await prisma.organization.findMany({ select: { id: true } });

      result.organizationsChecked = orgs.length;

      // Run detection for each organization
      const orgResults = await Promise.all(
        orgs.map((org) => this.detectForOrganization(org.id, detectorTypes)),
      );

      // Aggregate results
      for (const orgResult of orgResults) {
        result.anomaliesDetected += orgResult.anomalies;
        result.alertsCreated += orgResult.alerts;
        if (orgResult.error) {
          result.errors.push({
            organizationId: orgResult.organizationId,
            error: orgResult.error,
          });
        }
      }

      // Record metrics
      metrics.increment("anomaly_detection.runs_completed");
      for (let i = 0; i < result.anomaliesDetected; i++) {
        metrics.increment("anomaly_detection.anomalies_detected");
      }
      for (let i = 0; i < result.alertsCreated; i++) {
        metrics.increment("anomaly_detection.alerts_created");
      }

      if (result.anomaliesDetected > 0 || result.alertsCreated > 0) {
        logger.info("Anomaly detection completed", {
          organizations: result.organizationsChecked,
          anomalies: result.anomaliesDetected,
          alerts: result.alertsCreated,
          errors: result.errors.length,
        });
      }
    } catch (error) {
      logger.error("Anomaly detection run failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      metrics.increment("anomaly_detection.run_errors");
    }

    return result;
  }

  /**
   * Run detection for a single organization
   */
  private async detectForOrganization(
    organizationId: string,
    detectorTypes?: AnomalyType[],
  ): Promise<{
    organizationId: string;
    anomalies: number;
    alerts: number;
    error?: string;
  }> {
    const result = {
      organizationId,
      anomalies: 0,
      alerts: 0,
      error: undefined as string | undefined,
    };

    try {
      // Get org info for notifications
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, name: true, slug: true },
      });

      if (!org) {
        result.error = "Organization not found";
        return result;
      }

      // Run enabled detectors
      const detectorsToRun = detectorTypes
        ? Array.from(this.detectors.entries()).filter(([type]) =>
            detectorTypes.includes(type),
          )
        : Array.from(this.detectors.entries());

      for (const [type, detector] of detectorsToRun) {
        try {
          const detectorResults = await detector.detect(organizationId);

          for (const detectorResult of detectorResults) {
            if (detectorResult.detected && detectorResult.anomaly) {
              result.anomalies++;

              // Create alert
              const alert = await this.alertManager.createAlert({
                organizationId,
                anomaly: detectorResult.anomaly,
              });

              if (alert) {
                result.alerts++;

                // Route and send notifications
                const routeResult = await this.alertManager.routeAlert(alert);

                // TODO: Uncomment when anomaly table exists in Prisma schema
                // const anomalyRecord = await prisma.anomaly.findUnique({
                //   where: { id: alert.anomalyId },
                // });
                const anomalyRecord = null; // Stub until anomaly table exists

                if (anomalyRecord) {
                  const payload: NotificationPayload = {
                    alert,
                    anomaly: {
                      ...detectorResult.anomaly,
                      id: (anomalyRecord as { id: string }).id,
                      createdAt: (anomalyRecord as { createdAt: Date }).createdAt,
                    },
                    organization: org,
                  };

                  await this.notificationSender.sendNotification(
                    payload,
                    routeResult.channels,
                  );

                  // Update alert with notified channels
                  await this.alertManager.updateNotifiedChannels(
                    alert.id,
                    routeResult.channels,
                    routeResult.users,
                  );
                }
              }
            }
          }
        } catch (error) {
          logger.error("Detector failed", {
            organizationId,
            detector: type,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }

    return result;
  }

  /**
   * Manually trigger detection for an organization
   */
  async triggerDetection(
    organizationId: string,
    detectorTypes?: AnomalyType[],
  ): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];

    const detectorsToRun = detectorTypes
      ? Array.from(this.detectors.entries()).filter(([type]) =>
          detectorTypes.includes(type),
        )
      : Array.from(this.detectors.entries());

    for (const [_type, detector] of detectorsToRun) {
      const results = await detector.detect(organizationId);

      for (const result of results) {
        if (result.detected && result.anomaly) {
          anomalies.push({
            ...result.anomaly,
            id: `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            createdAt: new Date(),
          });
        }
      }
    }

    return anomalies;
  }

  /**
   * Get active detectors
   */
  getDetectors(): Map<AnomalyType, AnomalyDetector> {
    return this.detectors;
  }

  /**
   * Get current configuration
   */
  getConfig(): AnomalyDetectorConfig {
    return { ...this.config };
  }

  /**
   * Get open alerts for an organization
   */
  async getOpenAlerts(organizationId: string): Promise<Alert[]> {
    return this.alertManager.getOpenAlerts(organizationId);
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<Alert> {
    return this.alertManager.acknowledgeAlert(alertId, userId);
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(
    alertId: string,
    userId: string,
    resolution: string,
  ): Promise<Alert> {
    return this.alertManager.resolveAlert(alertId, userId, resolution);
  }

  private applyConfig(): void {
    // Apply config to each detector
    if (this.detectors.get("error_spike")) {
      (this.detectors.get("error_spike") as ErrorSpikeDetector).configure(
        this.config.errorSpike,
      );
    }
    if (this.detectors.get("latency")) {
      (this.detectors.get("latency") as LatencyAnomalyDetector).configure(
        this.config.latency,
      );
    }
    if (this.detectors.get("usage")) {
      (this.detectors.get("usage") as UsageAnomalyDetector).configure(
        this.config.usage,
      );
    }
    if (this.detectors.get("cost")) {
      (this.detectors.get("cost") as CostAnomalyDetector).configure(
        this.config.cost,
      );
    }
  }
}

// Singleton instance
export const anomalyDetectionService = new AnomalyDetectionService();
