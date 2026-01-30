import { Router, Request, Response } from "express";
import { z } from "zod";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { validate } from "../middleware/validation.middleware";
import { logger } from "../utils/logger";
import { OrgChangeTracker } from "../services/org-change-tracker";

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

const linkPRSchema = z.object({
  prUrl: z.string().url().regex(/github\.com.*\/pull\/\d+/, {
    message: "Must be a valid GitHub PR URL",
  }),
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

router.post(
  "/org-changes/:id/link-pr",
  requireAuth,
  requirePermission(Permission.AUDIT_READ),
  validate({ body: linkPRSchema }),
  async (req: Request, res: Response) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { prUrl } = req.body;
      const { organizationId } = req.user!;

      const orgChange = await prisma.organizationChange.findFirst({
        where: { id, organizationId },
      });

      if (!orgChange) {
        return res.status(404).json({ error: "Organization change not found" });
      }

      const tracker = new OrgChangeTracker();
      await tracker.linkPR(id, prUrl);

      const updatedChange = await prisma.organizationChange.findUnique({
        where: { id },
      });

      logger.info("PR linked to organization change", {
        changeId: id,
        prUrl,
        organizationId,
      });

      return res.json(updatedChange);
    } catch (error) {
      logger.error("Failed to link PR to organization change", { error });
      return res.status(500).json({ error: "Failed to link PR" });
    }
  },
);

router.get(
  "/org-changes/:id/pr-status",
  requireAuth,
  requirePermission(Permission.AUDIT_READ),
  async (req: Request, res: Response) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { organizationId } = req.user!;

      const orgChange = await prisma.organizationChange.findFirst({
        where: { id, organizationId },
        select: { prUrl: true, metadata: true },
      });

      if (!orgChange) {
        return res.status(404).json({ error: "Organization change not found" });
      }

      if (!orgChange.prUrl) {
        return res.status(404).json({ error: "No PR linked to this change" });
      }

      const tracker = new OrgChangeTracker();
      const status = await tracker.syncPRStatus(id);

      return res.json(status);
    } catch (error) {
      logger.error("Failed to get PR status", { error });
      return res.status(500).json({ error: "Failed to get PR status" });
    }
  },
);

export default router;
