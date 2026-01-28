import { Router, Request, Response } from "express";
import { db as prisma } from "../db/client";
import { evaluateFeatureFlag, invalidateFeatureFlagCache } from "../features/feature-flags";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/require-permission";
import { Role } from "../auth/rbac";

export const featureFlagsRouter = Router();
export const featureFlagsAdminRouter = Router();

featureFlagsAdminRouter.use(requireAuth, requireRole(Role.ADMIN));

// Evaluate one or more flags for the current organization.
// GET /api/flags?keys=a,b,c
featureFlagsRouter.get("/flags", async (req: Request, res: Response) => {
  const organizationId = req.organization?.id;
  const userId = req.user?.id;
  if (!organizationId) return res.status(400).json({ error: "Organization required" });

  const keysParam = String(req.query.keys || "").trim();
  const keys = keysParam
    ? keysParam
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
    : [];

  if (keys.length === 0) {
    return res.status(400).json({ error: "keys query param required" });
  }

  const results = await Promise.all(
    keys.map(async (key) => {
      const r = await evaluateFeatureFlag({ key, organizationId, userId });
      return [key, r] as const;
    }),
  );

  return res.json({
    organizationId,
    flags: Object.fromEntries(results),
  });
});

// Admin CRUD
featureFlagsAdminRouter.post("/admin/feature-flags", async (req: Request, res: Response) => {
  const { key, name, description, enabled } = req.body as {
    key?: string;
    name?: string;
    description?: string;
    enabled?: boolean;
  };

  if (!key || !name) return res.status(400).json({ error: "key and name are required" });

  const flag = await prisma.featureFlag.create({
    data: {
      key,
      name,
      description,
      enabled: Boolean(enabled),
    },
  });

  return res.status(201).json({ flag });
});

featureFlagsAdminRouter.patch("/admin/feature-flags/:key", async (req: Request, res: Response) => {
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
  return res.json({ flag });
});

featureFlagsAdminRouter.post(
  "/admin/feature-flags/:key/rules",
  async (req: Request, res: Response) => {
    const key = String(req.params.key);
    const { type, organizationIds, percentage, priority, enabled } = req.body as {
      type?: string;
      organizationIds?: string[];
      percentage?: number;
      priority?: number;
      enabled?: boolean;
    };

    if (!type) return res.status(400).json({ error: "type is required" });

    const flag = await prisma.featureFlag.findUnique({ where: { key } });
    if (!flag) return res.status(404).json({ error: "Flag not found" });

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
    return res.status(201).json({ rule });
  },
);

featureFlagsAdminRouter.post(
  "/admin/feature-flags/:key/overrides",
  async (req: Request, res: Response) => {
    const key = String(req.params.key);
    const { organizationId, enabled, reason, expiresAt } = req.body as {
      organizationId?: string;
      enabled?: boolean;
      reason?: string;
      expiresAt?: string;
    };

    if (!organizationId || typeof enabled !== "boolean") {
      return res.status(400).json({ error: "organizationId and enabled are required" });
    }

    const flag = await prisma.featureFlag.findUnique({ where: { key } });
    if (!flag) return res.status(404).json({ error: "Flag not found" });

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
    return res.status(201).json({ override });
  },
);
