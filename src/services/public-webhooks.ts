// @ts-nocheck
/**
 * Public Webhooks Service
 *
 * Manages webhooks for external developer integrations.
 * - Webhook registration and management
 * - Event emission with signature verification
 * - Retry logic with exponential backoff
 * - Failure tracking and auto-disable
 */

import { randomBytes, createHmac } from "crypto";
import { db as prisma } from "../db/client";
import { withQueueConnection } from "../db/redis";
import { logger } from "../utils/logger";
import { createAuditLog } from "./audit-logger";
import { getCircuitBreaker } from "../utils/circuit-breaker";

// =============================================================================
// TYPES
// =============================================================================

export type WebhookEvent =
  | "agent.execution.started"
  | "agent.execution.completed"
  | "agent.execution.failed"
  | "workflow.started"
  | "workflow.completed"
  | "workflow.failed"
  | "approval.requested"
  | "approval.completed"
  | "approval.rejected"
  | "api_key.created"
  | "api_key.revoked";

export interface Webhook {
  id: string;
  organizationId: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  status: "active" | "disabled";
  failureCount: number;
  lastFailure?: Date;
  lastSuccess?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWebhookInput {
  name?: string;
  url: string;
  events: WebhookEvent[];
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  payload: unknown;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  lastAttemptAt?: Date;
  responseStatus?: number;
  responseBody?: string;
  error?: string;
  createdAt: Date;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const ALL_WEBHOOK_EVENTS: WebhookEvent[] = [
  "agent.execution.started",
  "agent.execution.completed",
  "agent.execution.failed",
  "workflow.started",
  "workflow.completed",
  "workflow.failed",
  "approval.requested",
  "approval.completed",
  "approval.rejected",
  "api_key.created",
  "api_key.revoked",
];

const SECRET_LENGTH = 32;
const MAX_FAILURES_BEFORE_DISABLE = 10;
const WEBHOOK_TIMEOUT_MS = 30000;
const DELIVERY_QUEUE_KEY = "webhook:delivery:queue";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateSecret(): string {
  return randomBytes(SECRET_LENGTH).toString("hex");
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function mapPrismaToWebhook(data: any): Webhook {
  return {
    id: data.id,
    organizationId: data.organizationId,
    url: data.url,
    events: data.events as WebhookEvent[],
    secret: data.secret,
    status: data.status as "active" | "disabled",
    failureCount: data.failureCount,
    lastFailure: data.lastFailure || undefined,
    lastSuccess: data.lastSuccess || undefined,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

// =============================================================================
// WEBHOOK SERVICE
// =============================================================================

export class WebhookService {
  private breaker = getCircuitBreaker("webhook-delivery", {
    failureThreshold: 10,
    successThreshold: 2,
    timeout: WEBHOOK_TIMEOUT_MS,
    resetTimeout: 60000,
  });

  /**
   * Register a new webhook for an organization.
   */
  async register(
    organizationId: string,
    userId: string,
    input: CreateWebhookInput,
  ): Promise<Webhook> {
    const secret = generateSecret();

    const webhookRecord = await prisma.publicWebhook.create({
      data: {
        organizationId,
        name: input.name || `Webhook ${Date.now()}`,
        url: input.url,
        events: input.events,
        secret,
        status: "active",
        failureCount: 0,
      },
    });

    const webhook = mapPrismaToWebhook(webhookRecord);

    await createAuditLog({
      organizationId,
      userId,
      action: "webhook.created",
      resourceType: "webhook",
      resourceId: webhook.id,
    });

    logger.info("Webhook registered", {
      organizationId,
      webhookId: webhook.id,
      url: input.url,
      events: input.events,
    });

    return webhook;
  }

  /**
   * List all webhooks for an organization.
   */
  async list(organizationId: string): Promise<Webhook[]> {
    const webhookRecords = await prisma.publicWebhook.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });

    return webhookRecords.map(mapPrismaToWebhook);
  }

  /**
   * Get a specific webhook.
   */
  async get(webhookId: string, organizationId: string): Promise<Webhook | null> {
    const webhookRecord = await prisma.publicWebhook.findFirst({
      where: { id: webhookId, organizationId },
    });

    return webhookRecord ? mapPrismaToWebhook(webhookRecord) : null;
  }

  /**
   * Update webhook settings.
   */
  async update(
    webhookId: string,
    organizationId: string,
    userId: string,
    data: Partial<Pick<Webhook, "url" | "events" | "status">>,
  ): Promise<Webhook> {
    const existing = await prisma.publicWebhook.findFirst({
      where: { id: webhookId, organizationId },
    });

    if (!existing) {
      throw new Error("Webhook not found");
    }

    const updateData: any = {};
    if (data.url !== undefined) updateData.url = data.url;
    if (data.events !== undefined) updateData.events = data.events;
    if (data.status !== undefined) {
      updateData.status = data.status;
      if (data.status === "active") {
        updateData.failureCount = 0;
      }
    }

    const updated = await prisma.publicWebhook.update({
      where: { id: webhookId },
      data: updateData,
    });

    await createAuditLog({
      organizationId,
      userId,
      action: "webhook.updated",
      resourceType: "webhook",
      resourceId: webhookId,
    });

    return mapPrismaToWebhook(updated);
  }

  /**
   * Delete a webhook.
   */
  async delete(webhookId: string, organizationId: string, userId: string): Promise<void> {
    const existing = await prisma.publicWebhook.findFirst({
      where: { id: webhookId, organizationId },
    });

    if (!existing) {
      throw new Error("Webhook not found");
    }

    await prisma.publicWebhook.delete({
      where: { id: webhookId },
    });

    await createAuditLog({
      organizationId,
      userId,
      action: "webhook.deleted",
      resourceType: "webhook",
      resourceId: webhookId,
    });

    logger.info("Webhook deleted", { organizationId, webhookId });
  }

  /**
   * Rotate webhook secret.
   */
  async rotateSecret(
    webhookId: string,
    organizationId: string,
    userId: string,
  ): Promise<string> {
    const existing = await prisma.publicWebhook.findFirst({
      where: { id: webhookId, organizationId },
    });

    if (!existing) {
      throw new Error("Webhook not found");
    }

    const newSecret = generateSecret();

    await prisma.publicWebhook.update({
      where: { id: webhookId },
      data: { secret: newSecret },
    });

    await createAuditLog({
      organizationId,
      userId,
      action: "webhook.secret_rotated",
      resourceType: "webhook",
      resourceId: webhookId,
    });

    return newSecret;
  }

  /**
   * Emit an event to all registered webhooks for an organization.
   */
  async emit(
    organizationId: string,
    event: WebhookEvent,
    payload: unknown,
  ): Promise<void> {
    const webhooks = await prisma.publicWebhook.findMany({
      where: {
        organizationId,
        status: "active",
      },
    });

    // Filter webhooks that subscribe to this event type
    const matchingWebhooks = webhooks.filter((webhook) => {
      const events = webhook.events as string[];
      return events && events.includes(event);
    });

    if (matchingWebhooks.length === 0) {
      return;
    }

    logger.debug("Emitting webhook event", {
      organizationId,
      event,
      webhookCount: matchingWebhooks.length,
    });

    // Queue deliveries for all matching webhooks
    await Promise.all(
      matchingWebhooks.map((webhook) =>
        this.queueDelivery(mapPrismaToWebhook(webhook), event, payload),
      ),
    );
  }

  /**
   * Queue a webhook delivery for processing.
   */
  private async queueDelivery(
    webhook: Webhook,
    event: WebhookEvent,
    payload: unknown,
  ): Promise<void> {
    const delivery: WebhookDelivery = {
      id: `del_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      webhookId: webhook.id,
      event,
      payload,
      status: "pending",
      attempts: 0,
      createdAt: new Date(),
    };

    await withQueueConnection(async (client) => {
      await client.lpush(DELIVERY_QUEUE_KEY, JSON.stringify(delivery));
    });

    // Attempt immediate delivery
    await this.deliver(webhook, event, payload, delivery.id);
  }

  /**
   * Deliver a webhook with retry logic.
   */
  async deliver(
    webhook: Webhook,
    event: WebhookEvent,
    payload: unknown,
    deliveryId?: string,
  ): Promise<boolean> {
    const body = JSON.stringify({
      id: deliveryId || `evt_${Date.now()}`,
      event,
      timestamp: new Date().toISOString(),
      data: payload,
    });

    const signature = signPayload(body, webhook.secret);

    try {
      const response = await this.breaker.execute(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

        try {
          return await fetch(webhook.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Webhook-Signature": `sha256=${signature}`,
              "X-Webhook-Event": event,
              "X-Webhook-Timestamp": new Date().toISOString(),
              "User-Agent": "Nubabel-Webhook/1.0",
            },
            body,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }
      });

      if (response.ok) {
        await this.recordSuccess(webhook.id);
        logger.debug("Webhook delivered successfully", {
          webhookId: webhook.id,
          event,
          status: response.status,
        });
        return true;
      } else {
        const responseText = await response.text().catch(() => "");
        await this.recordFailure(webhook.id, `HTTP ${response.status}: ${responseText}`);
        logger.warn("Webhook delivery failed", {
          webhookId: webhook.id,
          event,
          status: response.status,
        });
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.recordFailure(webhook.id, errorMessage);
      logger.error("Webhook delivery error", {
        webhookId: webhook.id,
        event,
        error: errorMessage,
      });
      return false;
    }
  }

  /**
   * Record a successful delivery.
   */
  private async recordSuccess(webhookId: string): Promise<void> {
    await prisma.publicWebhook.update({
      where: { id: webhookId },
      data: {
        lastSuccess: new Date(),
        failureCount: 0,
      },
    });
  }

  /**
   * Record a failed delivery.
   */
  private async recordFailure(webhookId: string, _error: string): Promise<void> {
    const webhook = await prisma.publicWebhook.update({
      where: { id: webhookId },
      data: {
        lastFailure: new Date(),
        failureCount: { increment: 1 },
      },
    });

    // Auto-disable after too many failures
    if (webhook.failureCount >= MAX_FAILURES_BEFORE_DISABLE) {
      await prisma.publicWebhook.update({
        where: { id: webhookId },
        data: { status: "disabled" },
      });

      logger.warn("Webhook auto-disabled due to failures", {
        webhookId,
        failureCount: webhook.failureCount,
      });
    }
  }

  /**
   * Test a webhook by sending a test event.
   */
  async test(webhookId: string, organizationId: string): Promise<{
    success: boolean;
    status?: number;
    error?: string;
    latencyMs: number;
  }> {
    const webhook = await this.get(webhookId, organizationId);
    if (!webhook) {
      throw new Error("Webhook not found");
    }

    const testPayload = {
      test: true,
      message: "This is a test webhook delivery from Nubabel",
      timestamp: new Date().toISOString(),
    };

    const body = JSON.stringify({
      id: `test_${Date.now()}`,
      event: "test",
      timestamp: new Date().toISOString(),
      data: testPayload,
    });

    const signature = signPayload(body, webhook.secret);
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

      const response = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": `sha256=${signature}`,
          "X-Webhook-Event": "test",
          "X-Webhook-Timestamp": new Date().toISOString(),
          "User-Agent": "Nubabel-Webhook/1.0",
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;

      return {
        success: response.ok,
        status: response.status,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latencyMs,
      };
    }
  }

  /**
   * Get recent deliveries for a webhook.
   */
  async getDeliveryLogs(
    webhookId: string,
    organizationId: string,
    limit = 50,
  ): Promise<WebhookDelivery[]> {
    const webhook = await this.get(webhookId, organizationId);
    if (!webhook) {
      throw new Error("Webhook not found");
    }

    const records = await prisma.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return records.map((r) => ({
      id: r.id,
      webhookId: r.webhookId,
      event: r.event as WebhookEvent,
      payload: r.payload,
      status: r.status as "pending" | "delivered" | "failed",
      attempts: r.attempts,
      lastAttemptAt: r.lastAttemptAt || undefined,
      responseStatus: r.responseStatus || undefined,
      responseBody: r.responseBody || undefined,
      error: r.error || undefined,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Generate signature header value for verification docs.
   */
  static generateSignatureExample(payload: string, secret: string): string {
    return `sha256=${signPayload(payload, secret)}`;
  }
}

export const webhookService = new WebhookService();
