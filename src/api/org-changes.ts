import { Router, Request, Response } from "express";
import { z } from "zod";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { validate } from "../middleware/validation.middleware";
import { logger } from "../utils/logger";

const router = Router();

const createChangeSchema = z.object({
  title: z.string().min(1).max(500),
  type: z.string().min(1).max(50),
  description: z.string().min(1).max(1000),
  impactLevel: z.enum(["low", "medium", "high"]).default("low"),
});

const listChangesSchema = z.object({
  type: z.string().optional(),
  impactLevel: z.enum(["low", "medium", "high"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

router.post(
  "/org-changes",
  requireAuth,
  requirePermission(Permission.AUDIT_READ),
  validate({ body: createChangeSchema }),
  async (req: Request, res: Response) => {
    try {
      const { title, type, description, impactLevel } = req.body;
      const organizationId = req.user!.organizationId;
      const userId = req.user!.id;

      const change = await prisma.organizationChange.create({
        data: {
          organizationId,
          title,
          type,
          description,
          impactLevel,
          requestedBy: userId,
        },
      });

      logger.info("Organization change logged", {
        changeId: change.id,
        organizationId,
        type,
        impactLevel,
      });

      res.status(201).json(change);
    } catch (error) {
      logger.error("Failed to create organization change", { error });
      res.status(500).json({ error: "Failed to create organization change" });
    }
  },
);

router.get(
  "/org-changes",
  requireAuth,
  requirePermission(Permission.AUDIT_READ),
  validate({ query: listChangesSchema }),
  async (req: Request, res: Response) => {
    try {
      const { type, impactLevel, limit, offset } = req.query as unknown as {
        type?: string;
        impactLevel?: "low" | "medium" | "high";
        limit: number;
        offset: number;
      };
      const { organizationId } = req.user!;

      const where: any = { organizationId };
      if (type) where.type = type;
      if (impactLevel) where.impactLevel = impactLevel;

      const total = await prisma.organizationChange.count({ where });

      const changes = await prisma.organizationChange.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      });

      res.json({
        data: changes,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      });
    } catch (error) {
      logger.error("Failed to list organization changes", { error });
      res.status(500).json({ error: "Failed to list organization changes" });
    }
  },
);

export default router;
