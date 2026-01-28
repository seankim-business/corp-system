import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { validate } from "../middleware/validation.middleware";
import { z } from "zod";
import {
  syncFromGitHub,
  syncToGitHub,
  getResources,
  getResource,
  watchGitHub,
  getSupportedResourceTypes,
  SSOTResourceType,
  SSOTPromoteRequest,
  SSOTWebhookEvent,
} from "../services/github-ssot";
import { logger } from "../utils/logger";

const router = Router();

// Validation Schemas
const resourceTypeSchema = z.enum(["agent", "sop", "skill", "policy", "function", "role"]);

const listResourcesQuerySchema = z.object({
  refresh: z
    .string()
    .optional()
    .transform((val) => val === "true"),
});

const resourceIdParamSchema = z.object({
  resourceType: resourceTypeSchema,
  resourceId: z.string().min(1),
});

const syncBodySchema = z.object({
  resourceType: resourceTypeSchema.optional(),
});

const promoteBodySchema = z.object({
  resourceType: resourceTypeSchema,
  resourceId: z.string().min(1),
  title: z.string().min(1).max(255),
  body: z.string().max(65535).optional(),
  content: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  branch: z.string().max(255).optional(),
});

const webhookBodySchema = z.object({
  action: z.enum(["push", "pull_request"]),
  ref: z.string().optional(),
  commits: z
    .array(
      z.object({
        id: z.string(),
        added: z.array(z.string()),
        modified: z.array(z.string()),
        removed: z.array(z.string()),
      }),
    )
    .optional(),
  pullRequest: z
    .object({
      number: z.number(),
      state: z.enum(["open", "closed"]),
      merged: z.boolean(),
      head: z.object({ ref: z.string() }),
      base: z.object({ ref: z.string() }),
    })
    .optional(),
});

/**
 * GET /ssot/types
 * List all supported resource types
 */
router.get(
  "/ssot/types",
  requireAuth,
  requirePermission(Permission.INTEGRATION_READ),
  (_req: Request, res: Response) => {
    const types = getSupportedResourceTypes();
    return res.json({ types });
  },
);

/**
 * GET /ssot/:resourceType
 * List resources of a specific type from GitHub SSOT
 */
router.get(
  "/ssot/:resourceType",
  requireAuth,
  requirePermission(Permission.INTEGRATION_READ),
  validate({
    params: z.object({ resourceType: resourceTypeSchema }),
    query: listResourcesQuerySchema,
  }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const resourceType = req.params.resourceType as SSOTResourceType;
      const forceRefresh = req.query.refresh === "true";

      const resources = await getResources(organizationId, resourceType, forceRefresh);

      return res.json({
        resourceType,
        count: resources.length,
        resources: resources.map((r) => ({
          id: r.id,
          type: r.type,
          name: r.name,
          path: r.path,
          sha: r.sha,
          lastSyncedAt: r.lastSyncedAt,
          metadata: r.metadata,
        })),
      });
    } catch (error) {
      logger.error("Failed to list SSOT resources", {
        error,
        organizationId: req.user?.organizationId,
        resourceType: req.params.resourceType,
      });
      const message = error instanceof Error ? error.message : "Failed to list resources";
      return res.status(500).json({ error: message });
    }
  },
);

/**
 * GET /ssot/:resourceType/:resourceId
 * Get a specific resource from GitHub SSOT
 */
router.get(
  "/ssot/:resourceType/:resourceId",
  requireAuth,
  requirePermission(Permission.INTEGRATION_READ),
  validate({
    params: resourceIdParamSchema,
    query: listResourcesQuerySchema,
  }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const resourceType = req.params.resourceType as SSOTResourceType;
      const resourceId = String(req.params.resourceId);
      const forceRefresh = req.query.refresh === "true";

      const resource = await getResource(organizationId, resourceType, resourceId, forceRefresh);

      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }

      return res.json({ resource });
    } catch (error) {
      logger.error("Failed to get SSOT resource", {
        error,
        organizationId: req.user?.organizationId,
        resourceType: req.params.resourceType,
        resourceId: req.params.resourceId,
      });
      const message = error instanceof Error ? error.message : "Failed to get resource";
      return res.status(500).json({ error: message });
    }
  },
);

/**
 * POST /ssot/sync
 * Trigger a sync from GitHub SSOT
 */
router.post(
  "/ssot/sync",
  requireAuth,
  requirePermission(Permission.INTEGRATION_MANAGE),
  validate({ body: syncBodySchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const { resourceType } = req.body;

      const result = await syncFromGitHub(organizationId, resourceType, userId);

      return res.json({
        success: result.success,
        syncedAt: result.syncedAt,
        stats: {
          added: result.resourcesAdded,
          updated: result.resourcesUpdated,
          deleted: result.resourcesDeleted,
        },
        errors: result.errors,
      });
    } catch (error) {
      logger.error("Failed to sync from GitHub SSOT", {
        error,
        organizationId: req.user?.organizationId,
      });
      const message = error instanceof Error ? error.message : "Failed to sync from GitHub";
      return res.status(500).json({ error: message });
    }
  },
);

/**
 * POST /ssot/promote
 * Promote a document to GitHub SSOT (creates a PR)
 */
router.post(
  "/ssot/promote",
  requireAuth,
  requirePermission(Permission.INTEGRATION_MANAGE),
  validate({ body: promoteBodySchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const promoteRequest: SSOTPromoteRequest = {
        resourceType: req.body.resourceType,
        resourceId: req.body.resourceId,
        title: req.body.title,
        body: req.body.body,
        content: req.body.content,
        metadata: req.body.metadata,
        branch: req.body.branch,
      };

      const result = await syncToGitHub(organizationId, promoteRequest, userId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
        });
      }

      return res.status(201).json({
        success: true,
        pullRequest: result.pullRequest
          ? {
              number: result.pullRequest.number,
              title: result.pullRequest.title,
              htmlUrl: result.pullRequest.htmlUrl,
              state: result.pullRequest.state,
            }
          : null,
      });
    } catch (error) {
      logger.error("Failed to promote to GitHub SSOT", {
        error,
        organizationId: req.user?.organizationId,
        resourceType: req.body.resourceType,
        resourceId: req.body.resourceId,
      });
      const message = error instanceof Error ? error.message : "Failed to promote to GitHub";
      return res.status(500).json({ error: message });
    }
  },
);

/**
 * POST /ssot/webhook
 * Handle GitHub webhook events for SSOT sync
 * Note: This endpoint should be registered with reduced auth for webhook callbacks
 */
router.post(
  "/ssot/webhook/:organizationId",
  validate({ body: webhookBodySchema }),
  async (req: Request, res: Response) => {
    try {
      const organizationId = String(req.params.organizationId);

      // TODO: Validate GitHub webhook signature (X-Hub-Signature-256)
      // For now, we accept all requests but should add HMAC validation

      const event: SSOTWebhookEvent = {
        action: req.body.action,
        ref: req.body.ref,
        commits: req.body.commits,
        pullRequest: req.body.pullRequest
          ? {
              number: req.body.pullRequest.number,
              state: req.body.pullRequest.state,
              merged: req.body.pullRequest.merged,
              head: req.body.pullRequest.head,
              base: req.body.pullRequest.base,
            }
          : undefined,
      };

      await watchGitHub(organizationId, event);

      return res.json({ success: true, message: "Webhook processed" });
    } catch (error) {
      logger.error("Failed to process GitHub SSOT webhook", {
        error,
        organizationId: req.params.organizationId,
      });
      // Return 200 to acknowledge receipt even on error (GitHub best practice)
      return res.json({ success: false, error: "Webhook processing failed" });
    }
  },
);

// Convenience routes for specific resource types
const resourceTypes: SSOTResourceType[] = ["agent", "sop", "skill", "policy", "function", "role"];

for (const type of resourceTypes) {
  const pluralType = type === "policy" ? "policies" : `${type}s`;

  /**
   * GET /ssot/agents, /ssot/sops, /ssot/skills, /ssot/policies, /ssot/functions, /ssot/roles
   * Convenience endpoints for listing resources by type
   */
  router.get(
    `/ssot/${pluralType}`,
    requireAuth,
    requirePermission(Permission.INTEGRATION_READ),
    validate({ query: listResourcesQuerySchema }),
    async (req: Request, res: Response) => {
      try {
        const { organizationId } = req.user!;
        const forceRefresh = req.query.refresh === "true";

        const resources = await getResources(organizationId, type, forceRefresh);

        return res.json({
          resourceType: type,
          count: resources.length,
          resources: resources.map((r) => ({
            id: r.id,
            type: r.type,
            name: r.name,
            path: r.path,
            sha: r.sha,
            lastSyncedAt: r.lastSyncedAt,
            metadata: r.metadata,
          })),
        });
      } catch (error) {
        logger.error(`Failed to list SSOT ${pluralType}`, {
          error,
          organizationId: req.user?.organizationId,
        });
        const message = error instanceof Error ? error.message : `Failed to list ${pluralType}`;
        return res.status(500).json({ error: message });
      }
    },
  );
}

export default router;
