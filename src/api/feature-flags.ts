import { Router, Request, Response } from "express";
import { db as prisma } from "../db/client";
import { evaluateFeatureFlag, invalidateFeatureFlagCache } from "../features/feature-flags";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/require-permission";
import { Role } from "../auth/rbac";
import { logger } from "../utils/logger";

export const featureFlagsRouter = Router();
export const featureFlagsAdminRouter = Router();

featureFlagsAdminRouter.use(requireAuth, requireRole(Role.ADMIN));

// Evaluate one or more flags for the current organization.
// GET /api/flags?keys=a,b,c
featureFlagsRouter.get(
  "/flags",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organization?.id;
      const userId = req.user?.id;
      if (!organizationId) {
        res.status(400).json({ error: "Organization required" });
        return;
      }

      const keysParam = String(req.query.keys || "").trim();
      const keys = keysParam
        ? keysParam
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean)
        : [];

      if (keys.length === 0) {
        res.status(400).json({ error: "keys query param required" });
        return;
      }

      const results = await Promise.all(
        keys.map(async (key) => {
          const r = await evaluateFeatureFlag({ key, organizationId, userId });
          return [key, r] as const;
        }),
      );

      res.json({
        organizationId,
        flags: Object.fromEntries(results),
      });
    } catch (error) {
      logger.error(
        "Failed to evaluate feature flags",
        { organizationId: req.organization?.id },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        error: "Failed to evaluate feature flags",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

// Admin CRUD
featureFlagsAdminRouter.post(
  "/admin/feature-flags",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { key, name, description, enabled } = req.body as {
        key?: string;
        name?: string;
        description?: string;
        enabled?: boolean;
      };

      if (!key || !name) {
        res.status(400).json({ error: "key and name are required" });
        return;
      }

      const flag = await prisma.featureFlag.create({
        data: {
          key,
          name,
          description,
          enabled: Boolean(enabled),
        },
      });

      res.status(201).json({ flag });
    } catch (error) {
      logger.error(
        "Failed to create feature flag",
        { key: req.body?.key },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        error: "Failed to create feature flag",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

featureFlagsAdminRouter.patch(
  "/admin/feature-flags/:key",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const key = String(req.params.key);
      const { name, description, enabled } = req.body as {
        name?: string;
        description?: string;
        enabled?: boolean;
      };

      const flag = await prisma.featureFlag.update({
        where: { key },
        data: {
          name,
          description,
          enabled,
        },
      });

      await invalidateFeatureFlagCache(key);
      res.json({ flag });
    } catch (error) {
      logger.error(
        "Failed to update feature flag",
        { key: req.params.key },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        error: "Failed to update feature flag",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

featureFlagsAdminRouter.post(
  "/admin/feature-flags/:key/rules",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const key = String(req.params.key);
      const { type, organizationIds, percentage, priority, enabled } = req.body as {
        type?: string;
        organizationIds?: string[];
        percentage?: number;
        priority?: number;
        enabled?: boolean;
      };

      if (!type) {
        res.status(400).json({ error: "type is required" });
        return;
      }

      const flag = await prisma.featureFlag.findUnique({ where: { key } });
      if (!flag) {
        res.status(404).json({ error: "Flag not found" });
        return;
      }

      const rule = await prisma.featureFlagRule.create({
        data: {
          featureFlagId: flag.id,
          type,
          organizationIds: Array.isArray(organizationIds) ? organizationIds : [],
          percentage: typeof percentage === "number" ? percentage : 0,
          priority: typeof priority === "number" ? priority : 100,
          enabled: enabled !== false,
        },
      });

      await invalidateFeatureFlagCache(key);
      res.status(201).json({ rule });
    } catch (error) {
      logger.error(
        "Failed to create feature flag rule",
        { key: req.params.key },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        error: "Failed to create feature flag rule",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

featureFlagsAdminRouter.post(
  "/admin/feature-flags/:key/overrides",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const key = String(req.params.key);
      const { organizationId, enabled, reason, expiresAt } = req.body as {
        organizationId?: string;
        enabled?: boolean;
        reason?: string;
        expiresAt?: string;
      };

      if (!organizationId || typeof enabled !== "boolean") {
        res.status(400).json({ error: "organizationId and enabled are required" });
        return;
      }

      const flag = await prisma.featureFlag.findUnique({ where: { key } });
      if (!flag) {
        res.status(404).json({ error: "Flag not found" });
        return;
      }

      const override = await prisma.featureFlagOverride.upsert({
        where: { featureFlagId_organizationId: { featureFlagId: flag.id, organizationId } },
        create: {
          featureFlagId: flag.id,
          organizationId,
          enabled,
          reason,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        },
        update: {
          enabled,
          reason,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        },
      });

      await invalidateFeatureFlagCache(key);
      res.status(201).json({ override });
    } catch (error) {
      logger.error(
        "Failed to create feature flag override",
        { key: req.params.key },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        error: "Failed to create feature flag override",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);
