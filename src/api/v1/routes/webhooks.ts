/**
 * V1 API - Webhook Endpoints
 *
 * Public API endpoints for webhook management.
 */

import { Router, Request, Response } from "express";
import { apiKeyAuth } from "../middleware/api-key-auth";
import { webhookService, ALL_WEBHOOK_EVENTS, WebhookEvent } from "../../../services/public-webhooks";
import { logger } from "../../../utils/logger";

const router = Router();

/**
 * GET /webhooks
 * List registered webhooks
 */
router.get("/", apiKeyAuth(["webhooks:manage"]), async (req: Request, res: Response) => {
  try {
    const organizationId = req.apiOrganizationId!;
    const webhooks = await webhookService.list(organizationId);

    return res.json({
      data: webhooks.map((w) => ({
        id: w.id,
        url: w.url,
        events: w.events,
        status: w.status,
        failureCount: w.failureCount,
        lastSuccess: w.lastSuccess?.toISOString(),
        lastFailure: w.lastFailure?.toISOString(),
        createdAt: w.createdAt.toISOString(),
      })),
      meta: {
        total: webhooks.length,
        availableEvents: ALL_WEBHOOK_EVENTS,
      },
    });
  } catch (error) {
    logger.error("Failed to list webhooks", { error });
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to list webhooks",
    });
  }
});

/**
 * GET /webhooks/:id
 * Get a specific webhook
 */
router.get("/:id", apiKeyAuth(["webhooks:manage"]), async (req: Request, res: Response) => {
  try {
    const organizationId = req.apiOrganizationId!;
    const webhookId = String(req.params.id);

    const webhook = await webhookService.get(webhookId, organizationId);

    if (!webhook) {
      return res.status(404).json({
        error: "not_found",
        message: "Webhook not found",
      });
    }

    return res.json({
      data: {
        id: webhook.id,
        url: webhook.url,
        events: webhook.events,
        status: webhook.status,
        failureCount: webhook.failureCount,
        lastSuccess: webhook.lastSuccess?.toISOString(),
        lastFailure: webhook.lastFailure?.toISOString(),
        createdAt: webhook.createdAt.toISOString(),
        updatedAt: webhook.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error("Failed to get webhook", { error, webhookId: req.params.id });
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to get webhook",
    });
  }
});

/**
 * POST /webhooks
 * Register a new webhook
 */
router.post("/", apiKeyAuth(["webhooks:manage"]), async (req: Request, res: Response) => {
  try {
    const organizationId = req.apiOrganizationId!;
    const userId = req.apiKey?.createdBy || "api";
    const { url, events } = req.body;

    // Validate URL
    if (!url || typeof url !== "string") {
      return res.status(400).json({
        error: "validation_error",
        message: "url is required and must be a string",
      });
    }

    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        error: "validation_error",
        message: "url must be a valid URL",
      });
    }

    // Validate events
    if (!events || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({
        error: "validation_error",
        message: "events is required and must be a non-empty array",
        availableEvents: ALL_WEBHOOK_EVENTS,
      });
    }

    const invalidEvents = events.filter((e: string) => !ALL_WEBHOOK_EVENTS.includes(e as WebhookEvent));
    if (invalidEvents.length > 0) {
      return res.status(400).json({
        error: "validation_error",
        message: `Invalid event(s): ${invalidEvents.join(", ")}`,
        availableEvents: ALL_WEBHOOK_EVENTS,
      });
    }

    const webhook = await webhookService.register(organizationId, userId, {
      url,
      events: events as WebhookEvent[],
    });

    // Return secret only on creation
    return res.status(201).json({
      data: {
        id: webhook.id,
        url: webhook.url,
        events: webhook.events,
        status: webhook.status,
        secret: webhook.secret, // Only returned on creation!
        createdAt: webhook.createdAt.toISOString(),
      },
      message: "Webhook created. Save the secret - it won't be shown again.",
    });
  } catch (error) {
    logger.error("Failed to create webhook", { error });
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to create webhook",
    });
  }
});

/**
 * PATCH /webhooks/:id
 * Update a webhook
 */
router.patch("/:id", apiKeyAuth(["webhooks:manage"]), async (req: Request, res: Response) => {
  try {
    const organizationId = req.apiOrganizationId!;
    const userId = req.apiKey?.createdBy || "api";
    const webhookId = String(req.params.id);
    const { url, events, status } = req.body;

    const existing = await webhookService.get(webhookId, organizationId);
    if (!existing) {
      return res.status(404).json({
        error: "not_found",
        message: "Webhook not found",
      });
    }

    // Validate URL if provided
    if (url !== undefined) {
      try {
        new URL(url);
      } catch {
        return res.status(400).json({
          error: "validation_error",
          message: "url must be a valid URL",
        });
      }
    }

    // Validate events if provided
    if (events !== undefined) {
      if (!Array.isArray(events) || events.length === 0) {
        return res.status(400).json({
          error: "validation_error",
          message: "events must be a non-empty array",
        });
      }

      const invalidEvents = events.filter((e: string) => !ALL_WEBHOOK_EVENTS.includes(e as WebhookEvent));
      if (invalidEvents.length > 0) {
        return res.status(400).json({
          error: "validation_error",
          message: `Invalid event(s): ${invalidEvents.join(", ")}`,
          availableEvents: ALL_WEBHOOK_EVENTS,
        });
      }
    }

    // Validate status if provided
    if (status !== undefined && !["active", "disabled"].includes(status)) {
      return res.status(400).json({
        error: "validation_error",
        message: "status must be 'active' or 'disabled'",
      });
    }

    const webhook = await webhookService.update(String(webhookId), organizationId, userId, {
      url,
      events: events as WebhookEvent[],
      status,
    });

    return res.json({
      data: {
        id: webhook.id,
        url: webhook.url,
        events: webhook.events,
        status: webhook.status,
        failureCount: webhook.failureCount,
        updatedAt: webhook.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error("Failed to update webhook", { error, webhookId: req.params.id });
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to update webhook",
    });
  }
});

/**
 * DELETE /webhooks/:id
 * Delete a webhook
 */
router.delete("/:id", apiKeyAuth(["webhooks:manage"]), async (req: Request, res: Response) => {
  try {
    const organizationId = req.apiOrganizationId!;
    const userId = req.apiKey?.createdBy || "api";
    const webhookId = String(req.params.id);

    const existing = await webhookService.get(webhookId, organizationId);
    if (!existing) {
      return res.status(404).json({
        error: "not_found",
        message: "Webhook not found",
      });
    }

    await webhookService.delete(webhookId, organizationId, userId);

    return res.status(204).send();
  } catch (error) {
    logger.error("Failed to delete webhook", { error, webhookId: req.params.id });
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to delete webhook",
    });
  }
});

/**
 * POST /webhooks/:id/test
 * Test a webhook with a sample payload
 */
router.post("/:id/test", apiKeyAuth(["webhooks:manage"]), async (req: Request, res: Response) => {
  try {
    const organizationId = req.apiOrganizationId!;
    const webhookId = String(req.params.id);

    const result = await webhookService.test(webhookId, organizationId);

    return res.json({
      data: {
        success: result.success,
        status: result.status,
        error: result.error,
        latencyMs: result.latencyMs,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Webhook not found") {
      return res.status(404).json({
        error: "not_found",
        message: "Webhook not found",
      });
    }
    logger.error("Failed to test webhook", { error, webhookId: req.params.id });
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to test webhook",
    });
  }
});

/**
 * POST /webhooks/:id/rotate-secret
 * Rotate webhook secret
 */
router.post(
  "/:id/rotate-secret",
  apiKeyAuth(["webhooks:manage"]),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.apiOrganizationId!;
      const userId = req.apiKey?.createdBy || "api";
      const webhookId = String(req.params.id);

      const newSecret = await webhookService.rotateSecret(webhookId, organizationId, userId);

      return res.json({
        data: {
          id: webhookId,
          secret: newSecret,
        },
        message: "Secret rotated. Save the new secret - it won't be shown again.",
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Webhook not found") {
        return res.status(404).json({
          error: "not_found",
          message: "Webhook not found",
        });
      }
      logger.error("Failed to rotate webhook secret", { error, webhookId: req.params.id });
      return res.status(500).json({
        error: "internal_error",
        message: "Failed to rotate webhook secret",
      });
    }
  },
);

/**
 * GET /webhooks/:id/deliveries
 * Get webhook delivery logs
 */
router.get(
  "/:id/deliveries",
  apiKeyAuth(["webhooks:manage"]),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.apiOrganizationId!;
      const webhookId = String(req.params.id);
      const limit = Math.min(parseInt(req.query.limit as string || "50", 10), 100);

      const deliveries = await webhookService.getDeliveryLogs(webhookId, organizationId, limit);

      return res.json({
        data: deliveries.map((d) => ({
          id: d.id,
          event: d.event,
          status: d.status,
          attempts: d.attempts,
          responseStatus: d.responseStatus,
          error: d.error,
          createdAt: d.createdAt.toISOString(),
          lastAttemptAt: d.lastAttemptAt?.toISOString(),
        })),
        meta: {
          total: deliveries.length,
          limit,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Webhook not found") {
        return res.status(404).json({
          error: "not_found",
          message: "Webhook not found",
        });
      }
      logger.error("Failed to get webhook deliveries", { error, webhookId: req.params.id });
      return res.status(500).json({
        error: "internal_error",
        message: "Failed to get webhook deliveries",
      });
    }
  },
);

/**
 * GET /webhooks/events
 * List available webhook events
 */
router.get("/events/list", apiKeyAuth(["webhooks:manage"]), async (_req: Request, res: Response) => {
  return res.json({
    data: ALL_WEBHOOK_EVENTS.map((event) => ({
      name: event,
      description: getEventDescription(event),
    })),
  });
});

function getEventDescription(event: WebhookEvent): string {
  const descriptions: Record<WebhookEvent, string> = {
    "agent.execution.started": "Fired when an agent starts executing",
    "agent.execution.completed": "Fired when an agent completes successfully",
    "agent.execution.failed": "Fired when an agent execution fails",
    "workflow.started": "Fired when a workflow starts executing",
    "workflow.completed": "Fired when a workflow completes successfully",
    "workflow.failed": "Fired when a workflow execution fails",
    "approval.requested": "Fired when an approval is requested",
    "approval.completed": "Fired when an approval is granted",
    "approval.rejected": "Fired when an approval is rejected",
    "api_key.created": "Fired when a new API key is created",
    "api_key.revoked": "Fired when an API key is revoked",
  };
  return descriptions[event] || event;
}

export default router;
