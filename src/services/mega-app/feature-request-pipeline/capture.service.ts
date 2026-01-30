/**
 * Feature Request Capture Service
 *
 * Handles feature request capture from various sources (Slack, Web, Notion, Email).
 * This service is the entry point for all feature requests before AI analysis.
 */

import { db as prisma } from "../../../db/client";
import { logger } from "../../../utils/logger";
import { metrics } from "../../../utils/metrics";
import {
  FeatureRequestCapture,
  SlackCaptureData,
  WebCaptureData,
  NotionCaptureData,
  EmailCaptureData,
  FeatureRequestSource,
} from "./types";

/**
 * Create a feature request from any source
 */
export async function createFeatureRequest(
  capture: FeatureRequestCapture,
): Promise<{ id: string; success: boolean; error?: string }> {
  try {
    logger.info("Creating feature request", {
      source: capture.source,
      organizationId: capture.organizationId,
      sourceRef: capture.sourceRef,
    });

    // Create the feature request record
    const featureRequest = await prisma.featureRequest.create({
      data: {
        organizationId: capture.organizationId,
        source: capture.source,
        sourceRef: capture.sourceRef,
        rawContent: capture.rawContent,
        requesterId: capture.requesterId,
        status: "new",
        priority: 3, // Default to Low until analyzed
        requestCount: 1,
        // Note: metadata is stored in rawContent or can be added to schema later
      },
    });

    logger.info("Feature request created", {
      id: featureRequest.id,
      source: capture.source,
    });

    metrics.increment("feature_request.created", {
      source: capture.source,
    });

    // TODO: Enqueue for AI analysis
    // await enqueueFeatureAnalysis(featureRequest.id);

    return {
      id: featureRequest.id,
      success: true,
    };
  } catch (error) {
    logger.error(
      "Failed to create feature request",
      { capture },
      error instanceof Error ? error : new Error(String(error)),
    );

    return {
      id: "",
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Capture feature request from Slack
 */
export async function captureFromSlack(
  organizationId: string,
  requesterId: string | undefined,
  slackData: SlackCaptureData,
): Promise<{ id: string; success: boolean; error?: string }> {
  const sourceRef = `${slackData.channelId}:${slackData.messageTs}`;

  // Check for duplicate capture
  const existing = await prisma.featureRequest.findFirst({
    where: {
      organizationId,
      source: "slack",
      sourceRef,
    },
  });

  if (existing) {
    logger.debug("Feature request already captured from this Slack message", {
      requestId: existing.id,
      sourceRef,
    });
    return {
      id: existing.id,
      success: true,
    };
  }

  // Build raw content from Slack data
  let rawContent = slackData.text;

  // Add thread context if available
  if (slackData.threadContext && slackData.threadContext.length > 0) {
    rawContent += "\n\n--- Thread Context ---\n";
    for (const msg of slackData.threadContext) {
      rawContent += `\n${msg.userId}: ${msg.text}`;
    }
  }

  // Add metadata as structured comment in rawContent
  const metadataComment = [
    "\n\n--- Metadata ---",
    `Channel: ${slackData.channelName || slackData.channelId}`,
    `User: ${slackData.userName || slackData.userId}`,
    `Thread: ${slackData.threadTs ? "Yes" : "No"}`,
    slackData.reactions ? `Reactions: ${slackData.reactions.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return createFeatureRequest({
    source: "slack",
    sourceRef,
    rawContent: rawContent + metadataComment,
    requesterId,
    organizationId,
  });
}

/**
 * Capture feature request from web form
 */
export async function captureFromWeb(
  organizationId: string,
  requesterId: string | undefined,
  webData: WebCaptureData,
): Promise<{ id: string; success: boolean; error?: string }> {
  const sourceRef = webData.sessionId || `web:${Date.now()}`;

  let rawContent = `${webData.title}\n\n${webData.description}`;

  // Add metadata as structured comment
  const metadataComment = [
    "\n\n--- Metadata ---",
    webData.category ? `Category: ${webData.category}` : null,
    webData.urgency ? `Urgency: ${webData.urgency}` : null,
    webData.pageContext ? `Page Context: ${webData.pageContext}` : null,
    webData.attachments?.length
      ? `Attachments: ${webData.attachments.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  if (metadataComment.length > 20) {
    rawContent += metadataComment;
  }

  return createFeatureRequest({
    source: "web",
    sourceRef,
    rawContent,
    requesterId,
    organizationId,
  });
}

/**
 * Capture feature request from Notion
 */
export async function captureFromNotion(
  organizationId: string,
  requesterId: string | undefined,
  notionData: NotionCaptureData,
): Promise<{ id: string; success: boolean; error?: string }> {
  const sourceRef = notionData.pageId;

  // Check for duplicate
  const existing = await prisma.featureRequest.findFirst({
    where: {
      organizationId,
      source: "notion",
      sourceRef,
    },
  });

  if (existing) {
    logger.debug("Feature request already captured from this Notion page", {
      requestId: existing.id,
      sourceRef,
    });
    return {
      id: existing.id,
      success: true,
    };
  }

  // Build raw content from Notion blocks
  let rawContent = `${notionData.title}\n\n`;
  for (const block of notionData.blocks) {
    rawContent += `${block.content}\n`;
  }

  // Add metadata
  const metadataComment = [
    "\n\n--- Metadata ---",
    `Notion Page ID: ${notionData.pageId}`,
    notionData.createdBy ? `Created By: ${notionData.createdBy}` : null,
    notionData.lastEditedBy ? `Last Edited By: ${notionData.lastEditedBy}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  rawContent += metadataComment;

  return createFeatureRequest({
    source: "notion",
    sourceRef,
    rawContent,
    requesterId,
    organizationId,
  });
}

/**
 * Capture feature request from email
 */
export async function captureFromEmail(
  organizationId: string,
  requesterId: string | undefined,
  emailData: EmailCaptureData,
): Promise<{ id: string; success: boolean; error?: string }> {
  const sourceRef = emailData.messageId;

  // Check for duplicate
  const existing = await prisma.featureRequest.findFirst({
    where: {
      organizationId,
      source: "email",
      sourceRef,
    },
  });

  if (existing) {
    logger.debug("Feature request already captured from this email", {
      requestId: existing.id,
      sourceRef,
    });
    return {
      id: existing.id,
      success: true,
    };
  }

  let rawContent = `Subject: ${emailData.subject}\n\nFrom: ${emailData.from}\n\n${emailData.body}`;

  // Add metadata
  const metadataComment = [
    "\n\n--- Metadata ---",
    `Message ID: ${emailData.messageId}`,
    `Received At: ${emailData.receivedAt.toISOString()}`,
    emailData.replyTo ? `Reply To: ${emailData.replyTo}` : null,
    emailData.attachments?.length
      ? `Attachments: ${emailData.attachments.map((a) => a.filename).join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  rawContent += metadataComment;

  return createFeatureRequest({
    source: "email",
    sourceRef,
    rawContent,
    requesterId,
    organizationId,
  });
}

/**
 * Get feature request by ID
 */
export async function getFeatureRequestById(id: string) {
  return prisma.featureRequest.findUnique({
    where: { id },
  });
}

/**
 * Get feature requests for organization
 */
export async function getFeatureRequestsByOrganization(
  organizationId: string,
  options?: {
    status?: string;
    source?: FeatureRequestSource;
    limit?: number;
    offset?: number;
  },
) {
  const where: any = { organizationId };

  if (options?.status) {
    where.status = options.status;
  }

  if (options?.source) {
    where.source = options.source;
  }

  return prisma.featureRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: options?.limit || 50,
    skip: options?.offset || 0,
  });
}
