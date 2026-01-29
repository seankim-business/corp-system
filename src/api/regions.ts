/**
 * Region Management API
 *
 * Provides endpoints for:
 * - Listing available regions
 * - Getting region details
 * - Updating organization region
 * - Health checks per region
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import {
  REGIONS,
  getRegionById,
  getAvailableRegions,
  Region,
  ComplianceCertification,
} from "../config/regions";
import { regionRouter } from "../services/region-router";
import { db } from "../db/client";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";

const router = Router();

// Schema definitions
const UpdateRegionSchema = z.object({
  regionId: z.string().min(1),
  dataResidency: z
    .object({
      primary: z.string(),
      backup: z.string().optional(),
      compliance: z.array(z.string()).optional(),
    })
    .optional(),
});

const RegionQuerySchema = z.object({
  compliance: z.string().optional(),
  available: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

/**
 * GET /api/regions
 * List all available regions
 */
router.get(
  "/",
  requireAuth,
  validate({ query: RegionQuerySchema }),
  async (req: Request, res: Response) => {
    try {
      const { compliance, available } = req.query as {
        compliance?: string;
        available?: boolean;
      };

      let regions: Region[] = REGIONS;

      if (available) {
        regions = getAvailableRegions();
      }

      if (compliance) {
        const requiredCompliance = compliance.split(",") as ComplianceCertification[];
        regions = regions.filter((r) =>
          requiredCompliance.every((cert) => r.features.compliance.includes(cert)),
        );
      }

      const regionsWithHealth = await Promise.all(
        regions.map(async (region) => {
          const isHealthy = regionRouter.isAvailable(region.id);
          const healthDetails = await getRegionHealth(region.id);

          return {
            ...region,
            health: {
              available: isHealthy,
              ...healthDetails,
            },
          };
        }),
      );

      return res.json({
        regions: regionsWithHealth,
        total: regionsWithHealth.length,
      });
    } catch (error) {
      logger.error("Failed to list regions", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to list regions" });
    }
  },
);

/**
 * GET /api/regions/:regionId
 * Get details for a specific region
 */
router.get("/:regionId", requireAuth, async (req: Request, res: Response) => {
  try {
    const regionId = req.params.regionId as string;
    const region = getRegionById(regionId);

    if (!region) {
      return res.status(404).json({ error: "Region not found" });
    }

    const isHealthy = regionRouter.isAvailable(regionId);
    const healthDetails = await getRegionHealth(regionId);

    return res.json({
      ...region,
      health: {
        available: isHealthy,
        ...healthDetails,
      },
    });
  } catch (error) {
    logger.error("Failed to get region", {
      regionId: req.params.regionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to get region details" });
  }
});

/**
 * GET /api/regions/:regionId/health
 * Get detailed health status for a region
 */
router.get(
  "/:regionId/health",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const regionId = req.params.regionId as string;
      const region = getRegionById(regionId);

      if (!region) {
        return res.status(404).json({ error: "Region not found" });
      }

      const healthDetails = await getRegionHealth(regionId);

      return res.json({
        regionId,
        ...healthDetails,
        checkedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to get region health", {
        regionId: req.params.regionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to get region health" });
    }
  },
);

/**
 * GET /api/regions/organization/current
 * Get the current organization's region
 */
router.get(
  "/organization/current",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const orgId = req.currentOrganizationId;
      if (!orgId) {
        return res.status(400).json({ error: "Organization context required" });
      }

      const region = await regionRouter.getRegionForOrg(orgId);

      if (!region) {
        return res.status(404).json({ error: "Region not found for organization" });
      }

      const org = await db.organization.findUnique({
        where: { id: orgId },
        select: { settings: true },
      });

      const settings = org?.settings as { regionId?: string; dataResidency?: unknown } | null;
      const healthDetails = await getRegionHealth(region.id);

      return res.json({
        region: {
          ...region,
          health: {
            available: regionRouter.isAvailable(region.id),
            ...healthDetails,
          },
        },
        dataResidency: settings?.dataResidency || {},
      });
    } catch (error) {
      logger.error("Failed to get organization region", {
        orgId: req.currentOrganizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to get organization region" });
    }
  },
);

/**
 * PUT /api/regions/organization
 * Update the organization's region (admin only)
 */
router.put(
  "/organization",
  requireAuth,
  requireAdmin,
  validate({ body: UpdateRegionSchema }),
  async (req: Request, res: Response) => {
    try {
      const orgId = req.currentOrganizationId;
      if (!orgId) {
        return res.status(400).json({ error: "Organization context required" });
      }

      const { regionId, dataResidency } = req.body;

      const region = getRegionById(regionId);
      if (!region) {
        return res.status(400).json({ error: "Invalid region ID" });
      }

      if (!region.features.available) {
        return res.status(400).json({ error: "Region is not available" });
      }

      const currentOrg = await db.organization.findUnique({
        where: { id: orgId },
        select: { settings: true },
      });

      const currentSettings = currentOrg?.settings as { regionId?: string } | null;
      const previousRegionId = currentSettings?.regionId;

      const updatedOrg = await db.organization.update({
        where: { id: orgId },
        data: {
          settings: {
            ...(currentOrg?.settings as object || {}),
            regionId,
            dataResidency: dataResidency || {},
          },
        },
      });

      regionRouter.clearOrgCache(orgId);

      logger.info("Organization region updated", {
        orgId,
        previousRegion: previousRegionId,
        newRegion: regionId,
        userId: req.user?.id,
      });

      metrics.increment("region.organization_updated", {
        from: previousRegionId || "none",
        to: regionId,
      });

      const updatedSettings = updatedOrg.settings as { regionId?: string; dataResidency?: unknown };

      return res.json({
        success: true,
        organization: {
          id: orgId,
          regionId: updatedSettings.regionId,
          dataResidency: updatedSettings.dataResidency,
        },
        region,
      });
    } catch (error) {
      logger.error("Failed to update organization region", {
        orgId: req.currentOrganizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to update organization region" });
    }
  },
);

/**
 * POST /api/regions/:regionId/failover
 * Trigger manual failover to backup region (admin only)
 */
router.post(
  "/:regionId/failover",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const orgId = req.currentOrganizationId;
      const regionId = req.params.regionId as string;
      const { targetRegion, reason } = req.body;

      if (!orgId) {
        return res.status(400).json({ error: "Organization context required" });
      }

      const target = getRegionById(targetRegion);
      if (!target) {
        return res.status(400).json({ error: "Invalid target region" });
      }

      if (!target.features.available) {
        return res.status(400).json({ error: "Target region is not available" });
      }

      const currentOrg = await db.organization.findUnique({
        where: { id: orgId },
        select: { settings: true },
      });

      await db.organization.update({
        where: { id: orgId },
        data: {
          settings: {
            ...(currentOrg?.settings as object || {}),
            regionId: targetRegion,
          },
        },
      });

      regionRouter.clearOrgCache(orgId);

      logger.info("Manual failover completed", {
        orgId,
        fromRegion: regionId,
        toRegion: targetRegion,
        reason: reason || "Manual failover by admin",
        userId: req.user?.id,
      });

      metrics.increment("region.manual_failover", {
        from: regionId,
        to: targetRegion,
      });

      return res.json({
        success: true,
        fromRegion: regionId,
        toRegion: targetRegion,
        failedOverAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to perform failover", {
        regionId: req.params.regionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to perform failover" });
    }
  },
);

/**
 * GET /api/regions/failover-history
 * Get failover history for the organization (placeholder - returns empty for now)
 */
router.get(
  "/failover-history",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const orgId = req.currentOrganizationId;
      if (!orgId) {
        return res.status(400).json({ error: "Organization context required" });
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;

      // Failover events would be tracked once the migration is applied
      return res.json({
        events: [],
        pagination: {
          total: 0,
          limit,
          offset,
          hasMore: false,
        },
      });
    } catch (error) {
      logger.error("Failed to get failover history", {
        orgId: req.currentOrganizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to get failover history" });
    }
  },
);

/**
 * Helper function to get region health details
 */
async function getRegionHealth(_regionId: string): Promise<{
  status: string;
  databaseHealthy: boolean;
  redisHealthy: boolean;
  storageHealthy: boolean;
  latencyMs?: number;
  lastChecked?: string;
}> {
  // Region health would be tracked once the migration is applied
  return {
    status: "unknown",
    databaseHealthy: true,
    redisHealthy: true,
    storageHealthy: true,
  };
}

export default router;
