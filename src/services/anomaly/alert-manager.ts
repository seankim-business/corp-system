/**
 * Alert Manager Service
 *
 * Creates alerts from anomalies, routes them to appropriate channels,
 * and manages acknowledgment/resolution workflows.
 *
 * TODO: This service uses Prisma tables (Anomaly, Alert) that don't exist yet.
 * All methods are stubbed until schema migration is complete.
 */

// import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
// import { redis } from "../../db/redis";
import {
  Alert,
  Anomaly,
  AlertCreateInput,
  AlertRouteResult,
  AlertStatus,
  NotificationChannel,
  // AnomalySeverity,
} from "./types";

// const ALERT_DEDUP_PREFIX = "anomaly_alert:";
// const ALERT_DEDUP_TTL = 3600; // 1 hour

export class AlertManager {
  /**
   * Create an alert from an anomaly
   * TODO: Implement when Anomaly and Alert tables exist in schema
   */
  async createAlert(_input: AlertCreateInput): Promise<Alert | null> {
    logger.warn("AlertManager.createAlert called but not implemented - tables don't exist yet");
    return null;
  }

  /**
   * Route alert to appropriate channels based on org settings and severity
   * TODO: Implement when Alert and Anomaly tables exist in schema
   */
  async routeAlert(_alert: Alert): Promise<AlertRouteResult> {
    logger.warn("AlertManager.routeAlert called but not implemented - tables don't exist yet");
    return {
      channels: ["sse"],
      users: [],
      slackChannel: "#nubabel-alerts",
      webhookUrl: undefined,
    };
  }

  /**
   * Acknowledge an alert
   * TODO: Implement when Alert table exists in schema
   */
  async acknowledgeAlert(alertId: string, _userId: string): Promise<Alert> {
    logger.warn("AlertManager.acknowledgeAlert called but not implemented - tables don't exist yet");
    // Return mock Alert
    return {
      id: alertId,
      organizationId: "",
      anomalyId: "",
      status: "acknowledged",
      notifiedChannels: [],
      notifiedUsers: [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Resolve an alert with optional resolution notes
   * TODO: Implement when Alert table exists in schema
   */
  async resolveAlert(
    alertId: string,
    _userId: string,
    _resolution: string,
  ): Promise<Alert> {
    logger.warn("AlertManager.resolveAlert called but not implemented - tables don't exist yet");
    // Return mock Alert
    return {
      id: alertId,
      organizationId: "",
      anomalyId: "",
      status: "resolved",
      notifiedChannels: [],
      notifiedUsers: [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Get all open alerts for an organization
   * TODO: Implement when Alert table exists in schema
   */
  async getOpenAlerts(_organizationId: string): Promise<Alert[]> {
    logger.warn("AlertManager.getOpenAlerts called but not implemented - tables don't exist yet");
    return [];
  }

  /**
   * Get alert with its anomaly data
   * TODO: Implement when Alert and Anomaly tables exist in schema
   */
  async getAlertWithAnomaly(
    _alertId: string,
  ): Promise<{ alert: Alert; anomaly: Anomaly } | null> {
    logger.warn("AlertManager.getAlertWithAnomaly called but not implemented - tables don't exist yet");
    return null;
  }

  /**
   * Get alerts by status
   * TODO: Implement when Alert table exists in schema
   */
  async getAlertsByStatus(
    _organizationId: string,
    _status: AlertStatus,
    _limit: number = 50,
  ): Promise<Alert[]> {
    logger.warn("AlertManager.getAlertsByStatus called but not implemented - tables don't exist yet");
    return [];
  }

  /**
   * Get recent alerts with anomaly data
   * TODO: Implement when Alert and Anomaly tables exist in schema
   */
  async getRecentAlerts(
    _organizationId: string,
    _hours: number = 24,
    _limit: number = 100,
  ): Promise<Array<{ alert: Alert; anomaly: Anomaly }>> {
    logger.warn("AlertManager.getRecentAlerts called but not implemented - tables don't exist yet");
    return [];
  }

  /**
   * Update notification tracking
   * TODO: Implement when Alert table exists in schema
   */
  async updateNotifiedChannels(
    _alertId: string,
    _channels: NotificationChannel[],
    _users: string[] = [],
  ): Promise<void> {
    logger.warn("AlertManager.updateNotifiedChannels called but not implemented - tables don't exist yet");
    return;
  }

  /**
   * Auto-resolve old alerts that are auto-resolvable
   * TODO: Implement when Alert and Anomaly tables exist in schema
   */
  async autoResolveStaleAlerts(_maxAgeHours: number = 24): Promise<number> {
    logger.warn("AlertManager.autoResolveStaleAlerts called but not implemented - tables don't exist yet");
    return 0;
  }

  // TODO: Uncomment when implementing
  // private getDedupKey(
  //   organizationId: string,
  //   anomaly: Omit<Anomaly, "id" | "createdAt">,
  // ): string {
  //   const agentPart = anomaly.agentId || "global";
  //   return `${ALERT_DEDUP_PREFIX}${organizationId}:${anomaly.type}:${anomaly.metric}:${agentPart}`;
  // }

  // TODO: Uncomment when implementing
  // private mapAlertFromDb(record: {
  //   id: string;
  //   organizationId: string;
  //   anomalyId: string;
  //   status: string;
  //   notifiedChannels: string[];
  //   notifiedUsers: string[];
  //   acknowledgedAt: Date | null;
  //   acknowledgedBy: string | null;
  //   resolvedAt: Date | null;
  //   resolvedBy: string | null;
  //   resolution: string | null;
  //   metadata: unknown;
  //   createdAt: Date;
  //   updatedAt: Date;
  // }): Alert {
  //   return {
  //     id: record.id,
  //     organizationId: record.organizationId,
  //     anomalyId: record.anomalyId,
  //     status: record.status as AlertStatus,
  //     notifiedChannels: record.notifiedChannels as NotificationChannel[],
  //     notifiedUsers: record.notifiedUsers,
  //     acknowledgedAt: record.acknowledgedAt || undefined,
  //     acknowledgedBy: record.acknowledgedBy || undefined,
  //     resolvedAt: record.resolvedAt || undefined,
  //     resolvedBy: record.resolvedBy || undefined,
  //     resolution: record.resolution || undefined,
  //     metadata: record.metadata as Record<string, unknown>,
  //     createdAt: record.createdAt,
  //     updatedAt: record.updatedAt,
  //   };
  // }

  // TODO: Uncomment when implementing
  // private mapAnomalyFromDb(record: {
  //   id: string;
  //   organizationId: string;
  //   type: string;
  //   severity: string;
  //   description: string;
  //   metric: string;
  //   expectedValue: number;
  //   actualValue: number;
  //   deviation: number;
  //   agentId: string | null;
  //   timeRangeStart: Date;
  //   timeRangeEnd: Date;
  //   suggestedActions: string[];
  //   autoResolvable: boolean;
  //   metadata: unknown;
  //   createdAt: Date;
  // }): Anomaly {
  //   return {
  //     id: record.id,
  //     organizationId: record.organizationId,
  //     type: record.type as Anomaly["type"],
  //     severity: record.severity as Anomaly["severity"],
  //     description: record.description,
  //     metric: record.metric,
  //     expectedValue: record.expectedValue,
  //     actualValue: record.actualValue,
  //     deviation: record.deviation,
  //     agentId: record.agentId || undefined,
  //     timeRange: {
  //       start: record.timeRangeStart,
  //       end: record.timeRangeEnd,
  //     },
  //     suggestedActions: record.suggestedActions,
  //     autoResolvable: record.autoResolvable,
  //     metadata: record.metadata as Record<string, unknown>,
  //     createdAt: record.createdAt,
  //   };
  // }
}

export const alertManager = new AlertManager();
