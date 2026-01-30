/**
 * Feature Request API
 *
 * REST endpoints for the Feature Request Pipeline:
 * - Submitting feature requests (Web, Widget, API)
 * - Listing/searching requests with filters
 * - Tracking request status and history
 * - Admin management (merge, update, link)
 * - Voting/priority boosting
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/client";
import { logger } from "../utils/logger";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { createAuditLog } from "../services/audit-logger";
import type {
  FeatureRequestCapture,
  WebCaptureData,
} from "../services/mega-app/feature-request-pipeline/types";

const router = Router();

// =============================================================================
// Validation Schemas
// =============================================================================

const CreateFeatureRequestSchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().min(10).max(5000),
  category: z.string().optional(),
  urgency: z.enum(["low", "medium", "high"]).optional(),
  attachments: z.array(z.string()).optional(),
  moduleContext: z.string().optional(), // Current module user was viewing
});

const UpdateFeatureRequestSchema = z.object({
  status: z
    .enum(["new", "analyzing", "backlog", "planning", "developing", "released", "merged", "rejected"])
    .optional(),
  priority: z.number().min(0).max(3).optional(),
  linkedModuleId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  relatedModules: z.array(z.string()).optional(),
});

const ListFeatureRequestsQuerySchema = z.object({
  status: z.string().optional(),
  priority: z.string().transform(Number).optional(),
  moduleId: z.string().optional(),
  source: z.string().optional(),
  search: z.string().optional(),
  limit: z
    .string()
    .default("20")
    .transform((val) => Math.min(Math.max(parseInt(val, 10), 1), 100)),
  offset: z
    .string()
    .default("0")
    .transform((val) => Math.max(parseInt(val, 10), 0)),
});

const CommentSchema = z.object({
  text: z.string().min(1).max(2000),
});

const MergeRequestsSchema = z.object({
  targetRequestIds: z.array(z.string().uuid()).min(1),
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if user has access to view/modify a feature request
 */
async function checkRequestAccess(
  requestId: string,
  organizationId: string,
): Promise<boolean> {
  const request = await db.featureRequest.findFirst({
    where: {
      id: requestId,
      organizationId,
    },
  });
  return !!request;
}

/**
 * Helper to require organization context
 */
function requireOrgContext(req: Request, res: Response, next: Function) {
  if (!req.currentOrganizationId) {
    return res.status(400).json({ error: "Organization context required" });
  }
  return next();
}

// =============================================================================
// Routes
// =============================================================================

/**
 * POST /api/feature-requests
 * Submit a new feature request via Web form
 */
router.post(
  "/",
  requireAuth,
  requireOrgContext,
  async (req: Request, res: Response) => {
    try {
      const data = CreateFeatureRequestSchema.parse(req.body);
      const organizationId = req.currentOrganizationId!;
      const userId = req.user?.id;

      // Construct web capture data
      const webCapture: WebCaptureData = {
        title: data.title,
        description: data.description,
        category: data.category,
        urgency: data.urgency,
        attachments: data.attachments,
        userId,
        pageContext: data.moduleContext,
      };

      // Create feature request capture
      const capture: FeatureRequestCapture = {
        source: "web",
        sourceRef: `web-${Date.now()}`,
        rawContent: `${data.title}\n\n${data.description}`,
        requesterId: userId,
        organizationId,
        metadata: webCapture as unknown as Record<string, unknown>,
      };

      // Create feature request record
      const request = await db.featureRequest.create({
        data: {
          organizationId,
          source: capture.source,
          sourceRef: capture.sourceRef,
          requesterId: capture.requesterId,
          rawContent: capture.rawContent,
          status: "new",
          priority: 3, // Default to low priority
          tags: data.category ? [data.category] : [],
          relatedModules: data.moduleContext ? [data.moduleContext] : [],
        },
      });

      // Audit log
      await createAuditLog({
        organizationId,
        action: "feature_request.created",
        userId: userId || "system",
        resourceType: "FeatureRequest",
        resourceId: request.id,
        details: {
          source: "web",
          title: data.title,
        },
      });

      logger.info("Feature request created", {
        requestId: request.id,
        organizationId,
        source: "web",
      });

      return res.status(201).json({
        success: true,
        request: {
          id: request.id,
          status: request.status,
          priority: request.priority,
          createdAt: request.createdAt,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      logger.error("Failed to create feature request", { error });
      return res.status(500).json({ error: "Failed to create feature request" });
    }
  },
);

/**
 * GET /api/feature-requests
 * List feature requests for organization with filters and pagination
 */
router.get(
  "/",
  requireAuth,
  requireOrgContext,
  async (req: Request, res: Response) => {
    try {
      const query = ListFeatureRequestsQuerySchema.parse(req.query);
      const organizationId = req.currentOrganizationId!;

      // Build where clause
      const where: any = {
        organizationId,
        parentRequestId: null, // Exclude merged requests
      };

      if (query.status) {
        where.status = query.status;
      }

      if (typeof query.priority === "number") {
        where.priority = query.priority;
      }

      if (query.moduleId) {
        where.relatedModules = {
          has: query.moduleId,
        };
      }

      if (query.source) {
        where.source = query.source;
      }

      if (query.search) {
        where.OR = [
          { rawContent: { contains: query.search, mode: "insensitive" } },
          { analyzedIntent: { contains: query.search, mode: "insensitive" } },
        ];
      }

      const [requests, total] = await Promise.all([
        db.featureRequest.findMany({
          where,
          orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
          skip: query.offset,
          take: query.limit,
          select: {
            id: true,
            source: true,
            rawContent: true,
            analyzedIntent: true,
            relatedModules: true,
            tags: true,
            priority: true,
            businessImpact: true,
            requestCount: true,
            status: true,
            linkedModuleId: true,
            createdAt: true,
          },
        }),
        db.featureRequest.count({ where }),
      ]);

      return res.json({
        data: requests,
        pagination: {
          total,
          limit: typeof query.limit === "number" ? query.limit : 20,
          offset: typeof query.offset === "number" ? query.offset : 0,
          hasMore:
            (typeof query.offset === "number" ? query.offset : 0) +
              (typeof query.limit === "number" ? query.limit : 20) <
            total,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      logger.error("Failed to list feature requests", { error });
      return res.status(500).json({ error: "Failed to list feature requests" });
    }
  },
);

/**
 * GET /api/feature-requests/:id
 * Get single feature request with full details
 */
router.get(
  "/:id",
  requireAuth,
  requireOrgContext,
  async (req: Request, res: Response) => {
    try {
      const requestId = String(req.params.id);
      const organizationId = req.currentOrganizationId!;

      const request = await db.featureRequest.findFirst({
        where: {
          id: requestId,
          organizationId,
        },
      });

      if (!request) {
        return res.status(404).json({ error: "Feature request not found" });
      }

      // Get requester info separately
      const requester = request.requesterId
        ? await db.user.findUnique({
            where: { id: request.requesterId },
            select: { id: true, email: true, displayName: true },
          })
        : null;

      // Get linked/related requests
      const linkedRequests = await db.featureRequest.findMany({
        where: {
          OR: [
            { parentRequestId: requestId },
            { id: request.parentRequestId || "" },
          ],
        },
        select: {
          id: true,
          rawContent: true,
          status: true,
          createdAt: true,
        },
      });

      return res.json({
        request: {
          ...request,
          requester,
          linkedRequests,
        },
      });
    } catch (error) {
      logger.error("Failed to get feature request", { error });
      return res.status(500).json({ error: "Failed to get feature request" });
    }
  },
);

/**
 * GET /api/feature-requests/:id/status
 * Track request status and get status history
 */
router.get(
  "/:id/status",
  requireAuth,
  requireOrgContext,
  async (req: Request, res: Response) => {
    try {
      const requestId = String(req.params.id);
      const organizationId = req.currentOrganizationId!;

      const request = await db.featureRequest.findFirst({
        where: {
          id: requestId,
          organizationId,
        },
        select: {
          id: true,
          status: true,
          priority: true,
          businessImpact: true,
          linkedModuleId: true,
          createdAt: true,
        },
      });

      if (!request) {
        return res.status(404).json({ error: "Feature request not found" });
      }

      // Get status change history from audit logs
      const statusHistory = await db.auditLog.findMany({
        where: {
          organizationId,
          resourceType: "FeatureRequest",
          resourceId: requestId,
          action: {
            in: ["feature_request.status_changed", "feature_request.created"],
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      return res.json({
        currentStatus: request.status,
        priority: request.priority,
        businessImpact: request.businessImpact,
        linkedModuleId: request.linkedModuleId,
        history: statusHistory.map((log) => ({
          action: log.action,
          timestamp: log.createdAt,
          details: log.details,
        })),
      });
    } catch (error) {
      logger.error("Failed to get feature request status", { error });
      return res.status(500).json({ error: "Failed to get status" });
    }
  },
);

/**
 * POST /api/feature-requests/:id/vote
 * Upvote a feature request (increases requestCount)
 */
router.post(
  "/:id/vote",
  requireAuth,
  requireOrgContext,
  async (req: Request, res: Response) => {
    try {
      const requestId = String(req.params.id);
      const organizationId = req.currentOrganizationId!;
      const userId = req.user?.id;

      const hasAccess = await checkRequestAccess(requestId, organizationId);
      if (!hasAccess) {
        return res.status(404).json({ error: "Feature request not found" });
      }

      // Increment request count
      const updated = await db.featureRequest.update({
        where: { id: requestId },
        data: {
          requestCount: {
            increment: 1,
          },
        },
      });

      await createAuditLog({
        organizationId,
        action: "feature_request.voted",
        userId: userId || "system",
        resourceType: "FeatureRequest",
        resourceId: requestId,
        details: {
          newRequestCount: updated.requestCount,
        },
      });

      logger.info("Feature request voted", { requestId, userId });

      return res.json({
        success: true,
        requestCount: updated.requestCount,
      });
    } catch (error) {
      logger.error("Failed to vote on feature request", { error });
      return res.status(500).json({ error: "Failed to vote" });
    }
  },
);

/**
 * POST /api/feature-requests/:id/comment
 * Add comment/clarification to request
 */
router.post(
  "/:id/comment",
  requireAuth,
  requireOrgContext,
  async (req: Request, res: Response) => {
    try {
      const data = CommentSchema.parse(req.body);
      const requestId = String(req.params.id);
      const organizationId = req.currentOrganizationId!;
      const userId = req.user?.id;

      const hasAccess = await checkRequestAccess(requestId, organizationId);
      if (!hasAccess) {
        return res.status(404).json({ error: "Feature request not found" });
      }

      // Store comment in audit log
      await createAuditLog({
        organizationId,
        action: "feature_request.commented",
        userId: userId || "system",
        resourceType: "FeatureRequest",
        resourceId: requestId,
        details: {
          comment: data.text,
        },
      });

      logger.info("Comment added to feature request", { requestId, userId });

      return res.json({
        success: true,
        message: "Comment added successfully",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      logger.error("Failed to add comment", { error });
      return res.status(500).json({ error: "Failed to add comment" });
    }
  },
);

// =============================================================================
// Admin Routes (require special permissions)
// =============================================================================

/**
 * PATCH /api/feature-requests/:id
 * Update request (admin only)
 */
router.patch(
  "/:id",
  requireAuth,
  requireOrgContext,
  requirePermission(Permission.FEATURE_REQUEST_MANAGE),
  async (req: Request, res: Response) => {
    try {
      const data = UpdateFeatureRequestSchema.parse(req.body);
      const requestId = String(req.params.id);
      const organizationId = req.currentOrganizationId!;
      const userId = req.user?.id;

      const hasAccess = await checkRequestAccess(requestId, organizationId);
      if (!hasAccess) {
        return res.status(404).json({ error: "Feature request not found" });
      }

      const updateData: any = {};
      if (data.status) updateData.status = data.status;
      if (data.priority !== undefined) updateData.priority = data.priority;
      if (data.linkedModuleId !== undefined)
        updateData.linkedModuleId = data.linkedModuleId;
      if (data.tags) updateData.tags = data.tags;
      if (data.relatedModules) updateData.relatedModules = data.relatedModules;

      const updated = await db.featureRequest.update({
        where: { id: requestId },
        data: updateData,
      });

      await createAuditLog({
        organizationId,
        action: "feature_request.updated",
        userId: userId || "system",
        resourceType: "FeatureRequest",
        resourceId: requestId,
        details: updateData,
      });

      if (data.status) {
        await createAuditLog({
          organizationId,
          action: "feature_request.status_changed",
          userId: userId || "system",
          resourceType: "FeatureRequest",
          resourceId: requestId,
          details: {
            newStatus: data.status,
          },
        });
      }

      logger.info("Feature request updated", { requestId, userId });

      return res.json({
        success: true,
        request: updated,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      logger.error("Failed to update feature request", { error });
      return res.status(500).json({ error: "Failed to update feature request" });
    }
  },
);

/**
 * POST /api/feature-requests/:id/merge
 * Merge duplicate requests into this one
 */
router.post(
  "/:id/merge",
  requireAuth,
  requireOrgContext,
  requirePermission(Permission.FEATURE_REQUEST_MANAGE),
  async (req: Request, res: Response) => {
    try {
      const data = MergeRequestsSchema.parse(req.body);
      const primaryRequestId = String(req.params.id);
      const organizationId = req.currentOrganizationId!;
      const userId = req.user?.id;

      const hasAccess = await checkRequestAccess(primaryRequestId, organizationId);
      if (!hasAccess) {
        return res.status(404).json({ error: "Feature request not found" });
      }

      // Verify all target requests exist and belong to org
      const targetRequests = await db.featureRequest.findMany({
        where: {
          id: { in: data.targetRequestIds },
          organizationId,
        },
      });

      if (targetRequests.length !== data.targetRequestIds.length) {
        return res.status(400).json({ error: "Some target requests not found" });
      }

      // Calculate total request count
      const totalRequestCount = targetRequests.reduce(
        (sum, req) => sum + req.requestCount,
        0,
      );

      // Merge: Mark targets as merged, increment count on primary
      await db.$transaction([
        db.featureRequest.updateMany({
          where: { id: { in: data.targetRequestIds } },
          data: {
            parentRequestId: primaryRequestId,
            status: "merged",
          },
        }),
        db.featureRequest.update({
          where: { id: primaryRequestId },
          data: {
            requestCount: {
              increment: totalRequestCount,
            },
          },
        }),
      ]);

      await createAuditLog({
        organizationId,
        action: "feature_request.merged",
        userId: userId || "system",
        resourceType: "FeatureRequest",
        resourceId: primaryRequestId,
        details: {
          mergedRequestIds: data.targetRequestIds,
          totalRequestCount,
        },
      });

      logger.info("Feature requests merged", {
        primaryRequestId,
        mergedCount: data.targetRequestIds.length,
      });

      return res.json({
        success: true,
        primaryRequestId,
        mergedRequestIds: data.targetRequestIds,
        totalRequestCount,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      logger.error("Failed to merge feature requests", { error });
      return res.status(500).json({ error: "Failed to merge requests" });
    }
  },
);

export default router;
