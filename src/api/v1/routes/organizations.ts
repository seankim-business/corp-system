/**
 * V1 API - Organization Endpoints
 *
 * Public API endpoints for organization information.
 */

import { Router, Request, Response } from "express";
import { apiKeyAuth } from "../middleware/api-key-auth";
import { db as prisma } from "../../../db/client";
import { logger } from "../../../utils/logger";
import { getRateLimitStatus } from "../middleware/rate-limiter";
import { apiKeyService, ALL_SCOPES } from "../../../services/api-keys";

const router = Router();

/**
 * GET /organization
 * Get current organization info
 */
router.get("/", apiKeyAuth(["organization:read"]), async (req: Request, res: Response) => {
  try {
    const organizationId = req.apiOrganizationId!;

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        createdAt: true,
      },
    });

    if (!organization) {
      return res.status(404).json({
        error: "not_found",
        message: "Organization not found",
      });
    }

    return res.json({
      data: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logoUrl: organization.logoUrl,
        createdAt: organization.createdAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error("Failed to get organization", { error });
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to get organization",
    });
  }
});

/**
 * GET /organization/usage
 * Get API usage information for the current API key
 */
router.get("/usage", apiKeyAuth(["organization:read"]), async (req: Request, res: Response) => {
  try {
    const apiKey = req.apiKey!;

    const [rateLimits, usageStats] = await Promise.all([
      getRateLimitStatus(apiKey),
      apiKeyService.getUsageStats(apiKey.id),
    ]);

    return res.json({
      data: {
        apiKey: {
          id: apiKey.id,
          name: apiKey.name,
          tier: apiKey.rateLimitTier,
          scopes: apiKey.scopes,
          createdAt: apiKey.createdAt.toISOString(),
          lastUsedAt: apiKey.lastUsedAt?.toISOString(),
          expiresAt: apiKey.expiresAt?.toISOString(),
        },
        rateLimits: {
          minute: {
            limit: rateLimits.minute.limit,
            remaining: rateLimits.minute.remaining,
            resetInSeconds: rateLimits.minute.reset,
          },
          day: {
            limit: rateLimits.day.limit,
            remaining: rateLimits.day.remaining,
            resetInSeconds: rateLimits.day.reset,
          },
        },
        totalRequests: usageStats.totalRequests,
      },
    });
  } catch (error) {
    logger.error("Failed to get usage info", { error });
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to get usage information",
    });
  }
});

/**
 * GET /organization/api-keys
 * List API keys for the organization
 */
router.get("/api-keys", apiKeyAuth(["organization:read"]), async (req: Request, res: Response) => {
  try {
    const organizationId = req.apiOrganizationId!;

    const apiKeys = await apiKeyService.list(organizationId);

    return res.json({
      data: apiKeys.map((key) => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        scopes: key.scopes,
        rateLimitTier: key.rateLimitTier,
        status: key.status,
        lastUsedAt: key.lastUsedAt?.toISOString(),
        totalRequests: key.totalRequests,
        expiresAt: key.expiresAt?.toISOString(),
        createdAt: key.createdAt.toISOString(),
      })),
      meta: {
        total: apiKeys.length,
        availableScopes: ALL_SCOPES,
      },
    });
  } catch (error) {
    logger.error("Failed to list API keys", { error });
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to list API keys",
    });
  }
});

/**
 * GET /organization/stats
 * Get organization statistics
 */
router.get("/stats", apiKeyAuth(["organization:read"]), async (req: Request, res: Response) => {
  try {
    const organizationId = req.apiOrganizationId!;

    const [
      workflowCount,
      executionCount,
      recentExecutions,
      activeApiKeys,
    ] = await Promise.all([
      prisma.workflow.count({
        where: { organizationId },
      }),
      prisma.workflowExecution.count({
        where: { workflow: { organizationId } },
      }),
      prisma.workflowExecution.count({
        where: {
          workflow: { organizationId },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.aPIKey.count({
        where: { organizationId, status: "active" },
      }),
    ]);

    return res.json({
      data: {
        workflows: {
          total: workflowCount,
        },
        executions: {
          total: executionCount,
          last24Hours: recentExecutions,
        },
        apiKeys: {
          active: activeApiKeys,
        },
      },
    });
  } catch (error) {
    logger.error("Failed to get organization stats", { error });
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to get organization statistics",
    });
  }
});

export default router;
