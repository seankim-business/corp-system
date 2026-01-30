/**
 * Notion Webhook Integration
 *
 * Handles webhook events from Notion for the Feature Request Pipeline.
 * Captures feature requests when pages are created/updated with type "Feature Request".
 */
import { Router, Request, Response } from "express";
import crypto from "crypto";
import { logger } from "../utils/logger";
import { getNotionClient } from "../services/notion/client";
import { getIntakeService } from "../services/mega-app/feature-request-pipeline/intake.service";
import { NotionCaptureData } from "../services/mega-app/feature-request-pipeline/types";

export const notionWebhooksRouter = Router();

interface NotionWebhookEvent {
  object: "event";
  id: string;
  created_time: string;
  event_type: "page.created" | "page.updated" | "page.deleted";
  page: {
    id: string;
    parent?: {
      type: string;
      database_id?: string;
    };
    properties: Record<string, unknown>;
  };
}

/**
 * Verify Notion webhook signature
 * Notion uses HMAC-SHA256 with the webhook secret
 */
function verifyNotionSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Extract organization ID from webhook context
 * In a real implementation, you would map the Notion workspace to an organization
 */
async function getOrganizationIdFromWebhook(
  event: NotionWebhookEvent
): Promise<string | null> {
  // TODO: Implement actual mapping logic
  // For now, check for database_id in parent and map to organization
  const databaseId = event.page.parent?.database_id;

  if (!databaseId) {
    return null;
  }

  // This should be replaced with actual database lookup
  // Example: const org = await db.notionIntegration.findFirst({ where: { databaseId } });

  // Placeholder - return environment variable or default
  return process.env.DEFAULT_ORGANIZATION_ID || null;
}

/**
 * Check if page is a Feature Request based on properties
 */
function isFeatureRequestPage(event: NotionWebhookEvent): boolean {
  // Check if there's a "Type" property with value "Feature Request"
  const properties = event.page.properties;

  for (const [key, value] of Object.entries(properties)) {
    if (key.toLowerCase() === "type" && typeof value === "object" && value !== null) {
      const propValue = value as { type?: string; select?: { name?: string } };
      if (propValue.type === "select" && propValue.select?.name === "Feature Request") {
        return true;
      }
    }
  }

  return false;
}

/**
 * POST /webhooks/notion
 *
 * Receives webhook events from Notion when pages are created or updated.
 * Extracts feature requests and forwards them to the intake service.
 */
notionWebhooksRouter.post("/webhooks/notion", async (req: Request, res: Response) => {
  try {
    // Get webhook secret
    const webhookSecret = process.env.NOTION_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.error("NOTION_WEBHOOK_SECRET not configured");
      return res.status(500).json({ error: "Webhook secret not configured" });
    }

    // Verify signature
    const signature = req.header("x-notion-signature");
    if (!signature) {
      logger.warn("Missing Notion webhook signature");
      return res.status(401).json({ error: "Missing signature" });
    }

    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const bodyString = rawBody.toString("utf8");

    if (!verifyNotionSignature(bodyString, signature, webhookSecret)) {
      logger.warn("Invalid Notion webhook signature");
      return res.status(401).json({ error: "Invalid signature" });
    }

    // Parse event
    const event = req.body as NotionWebhookEvent;

    // Validate event structure
    if (!event.id || !event.event_type || !event.page?.id) {
      logger.warn("Invalid Notion webhook payload", { event });
      return res.status(400).json({ error: "Invalid payload" });
    }

    logger.info("Received Notion webhook", {
      eventId: event.id,
      eventType: event.event_type,
      pageId: event.page.id,
    });

    // Only process page creation and updates
    if (event.event_type !== "page.created" && event.event_type !== "page.updated") {
      logger.debug("Ignoring non-page event", { eventType: event.event_type });
      return res.status(200).json({ ok: true, processed: false });
    }

    // Check if this is a feature request page
    if (!isFeatureRequestPage(event)) {
      logger.debug("Page is not a feature request, ignoring", {
        pageId: event.page.id,
      });
      return res.status(200).json({ ok: true, processed: false });
    }

    // Get organization ID
    const organizationId = await getOrganizationIdFromWebhook(event);
    if (!organizationId) {
      logger.warn("Could not determine organization for Notion webhook", {
        pageId: event.page.id,
      });
      return res.status(200).json({ ok: true, processed: false });
    }

    // Fast ACK - we'll process asynchronously
    res.status(200).json({ ok: true, processing: true });

    // Process the feature request asynchronously (don't block webhook)
    void (async () => {
      try {
        // Fetch full page content from Notion
        const notionClient = getNotionClient();
        const { page, blocks } = await notionClient.getPageContent(event.page.id);

        // Build NotionCaptureData
        const notionData: NotionCaptureData = {
          pageId: page.id,
          title: page.title,
          properties: page.properties,
          blocks: blocks.map((block) => ({
            id: block.id,
            type: block.type,
            content: block.content,
          })),
          createdBy: page.createdBy,
          lastEditedBy: page.lastEditedBy,
        };

        // Capture feature request
        const intakeService = getIntakeService();
        const captured = await intakeService.captureFromNotion(organizationId, notionData);

        logger.info("Feature request captured from Notion webhook", {
          eventId: event.id,
          pageId: event.page.id,
          requestId: captured.id,
          organizationId,
        });
      } catch (error) {
        logger.error(
          "Failed to process Notion webhook",
          {
            eventId: event.id,
            pageId: event.page.id,
            organizationId,
          },
          error instanceof Error ? error : new Error(String(error))
        );
      }
    })();

    return;
  } catch (error) {
    logger.error(
      "Notion webhook handler error",
      {},
      error instanceof Error ? error : new Error(String(error))
    );
    return res.status(500).json({ error: "Internal server error" });
  }
});
