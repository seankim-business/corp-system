/**
 * Alerts API
 *
 * REST endpoints for managing anomaly alerts.
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { logger } from "../utils/logger";
import { alertManager } from "../services/anomaly/alert-manager";
import { anomalyDetectionService } from "../services/anomaly";

const router = Router();

// Validation schemas
const acknowledgeSchema = z.object({
  userId: z.string().uuid(),
});

const resolveSchema = z.object({
  userId: z.string().uuid(),
  resolution: z.string().min(1).max(2000),
});

const triggerDetectionSchema = z.object({
  detectorTypes: z.array(z.enum(["error_spike", "latency", "usage", "cost"])).optional(),
});

/**
 * GET /api/alerts
 * Get all open alerts for the organization
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const organizationId = req.organization?.id;
    if (!organizationId) {
      return res.status(401).json({ error: "Organization not found" });
    }

    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    let alerts;
    if (status && ["open", "acknowledged", "resolved"].includes(status)) {
      alerts = await alertManager.getAlertsByStatus(
        organizationId,
        status as "open" | "acknowledged" | "resolved",
        limit,
      );
    } else {
      alerts = await alertManager.getOpenAlerts(organizationId);
    }

    return res.json({ alerts });
  } catch (error) {
    logger.error("Failed to get alerts", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to get alerts" });
  }
});

/**
 * GET /api/alerts/recent
 * Get recent alerts with anomaly data
 */
router.get("/recent", async (req: Request, res: Response) => {
  try {
    const organizationId = req.organization?.id;
    if (!organizationId) {
      return res.status(401).json({ error: "Organization not found" });
    }

    const hours = parseInt(req.query.hours as string) || 24;
    const limit = parseInt(req.query.limit as string) || 100;

    const alerts = await alertManager.getRecentAlerts(organizationId, hours, limit);

    return res.json({ alerts });
  } catch (error) {
    logger.error("Failed to get recent alerts", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to get recent alerts" });
  }
});

/**
 * GET /api/alerts/:alertId
 * Get a specific alert with its anomaly data
 */
router.get("/:alertId", async (req: Request, res: Response) => {
  try {
    const alertId = req.params.alertId as string;
    const organizationId = req.organization?.id;

    if (!organizationId) {
      return res.status(401).json({ error: "Organization not found" });
    }

    const result = await alertManager.getAlertWithAnomaly(alertId);

    if (!result) {
      return res.status(404).json({ error: "Alert not found" });
    }

    // Verify the alert belongs to the organization
    if (result.alert.organizationId !== organizationId) {
      return res.status(403).json({ error: "Access denied" });
    }

    return res.json(result);
  } catch (error) {
    logger.error("Failed to get alert", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to get alert" });
  }
});

/**
 * POST /api/alerts/:alertId/acknowledge
 * Acknowledge an alert
 */
router.post("/:alertId/acknowledge", async (req: Request, res: Response) => {
  try {
    const alertId = req.params.alertId as string;
    const organizationId = req.organization?.id;

    if (!organizationId) {
      return res.status(401).json({ error: "Organization not found" });
    }

    const validation = acknowledgeSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: validation.error.errors,
      });
    }

    const { userId } = validation.data;

    // Verify the alert exists and belongs to the organization
    const existing = await alertManager.getAlertWithAnomaly(alertId);
    if (!existing) {
      return res.status(404).json({ error: "Alert not found" });
    }
    if (existing.alert.organizationId !== organizationId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const alert = await alertManager.acknowledgeAlert(alertId, userId);

    logger.info("Alert acknowledged via API", { alertId, userId });

    return res.json({ alert });
  } catch (error) {
    logger.error("Failed to acknowledge alert", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to acknowledge alert" });
  }
});

/**
 * POST /api/alerts/:alertId/resolve
 * Resolve an alert
 */
router.post("/:alertId/resolve", async (req: Request, res: Response) => {
  try {
    const alertId = req.params.alertId as string;
    const organizationId = req.organization?.id;

    if (!organizationId) {
      return res.status(401).json({ error: "Organization not found" });
    }

    const validation = resolveSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: validation.error.errors,
      });
    }

    const { userId, resolution } = validation.data;

    // Verify the alert exists and belongs to the organization
    const existing = await alertManager.getAlertWithAnomaly(alertId);
    if (!existing) {
      return res.status(404).json({ error: "Alert not found" });
    }
    if (existing.alert.organizationId !== organizationId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const alert = await alertManager.resolveAlert(alertId, userId, resolution);

    logger.info("Alert resolved via API", { alertId, userId, resolution });

    return res.json({ alert });
  } catch (error) {
    logger.error("Failed to resolve alert", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to resolve alert" });
  }
});

/**
 * POST /api/alerts/trigger-detection
 * Manually trigger anomaly detection
 */
router.post("/trigger-detection", async (req: Request, res: Response) => {
  try {
    const organizationId = req.organization?.id;

    if (!organizationId) {
      return res.status(401).json({ error: "Organization not found" });
    }

    const validation = triggerDetectionSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: validation.error.errors,
      });
    }

    const { detectorTypes } = validation.data;

    logger.info("Manual anomaly detection triggered", {
      organizationId,
      detectorTypes: detectorTypes || "all",
    });

    const result = await anomalyDetectionService.runDetection(
      organizationId,
      detectorTypes,
    );

    return res.json({
      success: true,
      result: {
        anomaliesDetected: result.anomaliesDetected,
        alertsCreated: result.alertsCreated,
        errors: result.errors,
      },
    });
  } catch (error) {
    logger.error("Failed to trigger detection", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to trigger detection" });
  }
});

/**
 * GET /api/alerts/anomalies/history
 * Get anomaly history for the organization
 */
router.get("/anomalies/history", async (req: Request, res: Response) => {
  try {
    const organizationId = req.organization?.id;

    if (!organizationId) {
      return res.status(401).json({ error: "Organization not found" });
    }

    const hours = parseInt(req.query.hours as string) || 24;
    const limit = parseInt(req.query.limit as string) || 100;

    const alerts = await alertManager.getRecentAlerts(organizationId, hours, limit);

    // Extract anomalies from alerts
    const anomalies = alerts.map((a) => a.anomaly);

    return res.json({ anomalies });
  } catch (error) {
    logger.error("Failed to get anomaly history", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to get anomaly history" });
  }
});

/**
 * GET /api/alerts/stats
 * Get alert statistics for the organization
 */
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const organizationId = req.organization?.id;

    if (!organizationId) {
      return res.status(401).json({ error: "Organization not found" });
    }

    const [openAlerts, acknowledgedAlerts, recentAlerts] = await Promise.all([
      alertManager.getAlertsByStatus(organizationId, "open", 1000),
      alertManager.getAlertsByStatus(organizationId, "acknowledged", 1000),
      alertManager.getRecentAlerts(organizationId, 24, 1000),
    ]);

    // Count by type and severity
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const { anomaly } of recentAlerts) {
      byType[anomaly.type] = (byType[anomaly.type] || 0) + 1;
      bySeverity[anomaly.severity] = (bySeverity[anomaly.severity] || 0) + 1;
    }

    return res.json({
      stats: {
        open: openAlerts.length,
        acknowledged: acknowledgedAlerts.length,
        last24Hours: recentAlerts.length,
        byType,
        bySeverity,
      },
    });
  } catch (error) {
    logger.error("Failed to get alert stats", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to get alert stats" });
  }
});

export default router;
