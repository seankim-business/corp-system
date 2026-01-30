/**
 * Feature Request Intake Service
 *
 * Captures feature requests from multiple channels (Slack, Web, Notion, Email)
 * and normalizes them into a common format for processing.
 */
import { db } from "../../../db/client";
import { logger } from "../../../utils/logger";
import {
  FeatureRequestCapture,
  FeatureRequestSource,
  SlackCaptureData,
  WebCaptureData,
  NotionCaptureData,
  EmailCaptureData,
  FeatureRequestPipelineConfig,
  DEFAULT_PIPELINE_CONFIG,
} from "./types";

export interface CapturedRequest {
  id: string;
  source: FeatureRequestSource;
  sourceRef: string;
  rawContent: string;
  requesterId?: string;
  organizationId: string;
  status: string;
  createdAt: Date;
}

export class FeatureRequestIntakeService {
  // @ts-expect-error - Config reserved for future feature expansion (deduplication thresholds, etc.)
  private config: FeatureRequestPipelineConfig;

  constructor(config: Partial<FeatureRequestPipelineConfig> = {}) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
  }

  /**
   * Capture a feature request from Slack
   */
  async captureFromSlack(
    organizationId: string,
    data: SlackCaptureData
  ): Promise<CapturedRequest> {
    logger.info("Capturing feature request from Slack", {
      organizationId,
      channelId: data.channelId,
      messageTs: data.messageTs,
    });

    // Build raw content from message and thread context
    let rawContent = data.text;

    if (data.threadContext && data.threadContext.length > 0) {
      const threadMessages = data.threadContext
        .map((msg) => `[${msg.userId}]: ${msg.text}`)
        .join("\n");
      rawContent = `${data.text}\n\n--- Thread Context ---\n${threadMessages}`;
    }

    const sourceRef = data.threadTs
      ? `slack:${data.channelId}:${data.threadTs}:${data.messageTs}`
      : `slack:${data.channelId}:${data.messageTs}`;

    // Check for existing request with same sourceRef
    const existing = await this.findBySourceRef(organizationId, sourceRef);
    if (existing) {
      logger.info("Feature request already captured from Slack", {
        existingId: existing.id,
        sourceRef,
      });
      return existing;
    }

    const capture: FeatureRequestCapture = {
      source: "slack",
      sourceRef,
      rawContent,
      requesterId: await this.resolveSlackUserId(organizationId, data.userId),
      organizationId,
      metadata: {
        channelId: data.channelId,
        channelName: data.channelName,
        messageTs: data.messageTs,
        threadTs: data.threadTs,
        userName: data.userName,
        reactions: data.reactions,
        threadMessageCount: data.threadContext?.length || 0,
      },
    };

    return this.createRequest(capture);
  }

  /**
   * Capture a feature request from web form
   */
  async captureFromWeb(
    organizationId: string,
    data: WebCaptureData
  ): Promise<CapturedRequest> {
    logger.info("Capturing feature request from web", {
      organizationId,
      title: data.title,
      category: data.category,
    });

    // Build raw content from title and description
    const rawContent = `${data.title}\n\n${data.description}`;

    // Generate a unique source reference
    const sourceRef = `web:${Date.now()}:${this.hashContent(rawContent).slice(0, 8)}`;

    const capture: FeatureRequestCapture = {
      source: "web",
      sourceRef,
      rawContent,
      requesterId: data.userId,
      organizationId,
      metadata: {
        title: data.title,
        category: data.category,
        urgency: data.urgency,
        attachments: data.attachments,
        sessionId: data.sessionId,
        pageContext: data.pageContext,
      },
    };

    return this.createRequest(capture);
  }

  /**
   * Capture a feature request from Notion
   */
  async captureFromNotion(
    organizationId: string,
    data: NotionCaptureData
  ): Promise<CapturedRequest> {
    logger.info("Capturing feature request from Notion", {
      organizationId,
      pageId: data.pageId,
      title: data.title,
    });

    // Extract content from blocks
    const blockContent = data.blocks
      .map((block) => {
        if (block.type === "paragraph" || block.type === "heading_1" ||
            block.type === "heading_2" || block.type === "heading_3") {
          return block.content;
        }
        if (block.type === "bulleted_list_item" || block.type === "numbered_list_item") {
          return `- ${block.content}`;
        }
        return block.content;
      })
      .filter(Boolean)
      .join("\n");

    const rawContent = `${data.title}\n\n${blockContent}`;
    const sourceRef = `notion:${data.pageId}`;

    // Check for existing request with same sourceRef
    const existing = await this.findBySourceRef(organizationId, sourceRef);
    if (existing) {
      logger.info("Feature request already captured from Notion", {
        existingId: existing.id,
        sourceRef,
      });
      return existing;
    }

    const capture: FeatureRequestCapture = {
      source: "notion",
      sourceRef,
      rawContent,
      requesterId: await this.resolveNotionUserId(organizationId, data.createdBy),
      organizationId,
      metadata: {
        pageId: data.pageId,
        title: data.title,
        properties: data.properties,
        blockCount: data.blocks.length,
        createdBy: data.createdBy,
        lastEditedBy: data.lastEditedBy,
      },
    };

    return this.createRequest(capture);
  }

  /**
   * Capture a feature request from email
   */
  async captureFromEmail(
    organizationId: string,
    data: EmailCaptureData
  ): Promise<CapturedRequest> {
    logger.info("Capturing feature request from email", {
      organizationId,
      messageId: data.messageId,
      subject: data.subject,
      from: data.from,
    });

    // Build raw content from subject and body
    const rawContent = `${data.subject}\n\n${data.body}`;
    const sourceRef = `email:${data.messageId}`;

    // Check for existing request with same sourceRef
    const existing = await this.findBySourceRef(organizationId, sourceRef);
    if (existing) {
      logger.info("Feature request already captured from email", {
        existingId: existing.id,
        sourceRef,
      });
      return existing;
    }

    const capture: FeatureRequestCapture = {
      source: "email",
      sourceRef,
      rawContent,
      requesterId: await this.resolveEmailUserId(organizationId, data.from),
      organizationId,
      metadata: {
        messageId: data.messageId,
        from: data.from,
        subject: data.subject,
        attachments: data.attachments?.map((a) => ({
          filename: a.filename,
          contentType: a.contentType,
          size: a.size,
        })),
        receivedAt: data.receivedAt.toISOString(),
        replyTo: data.replyTo,
      },
    };

    return this.createRequest(capture);
  }

  /**
   * Generic capture method for any source
   */
  async capture(data: FeatureRequestCapture): Promise<CapturedRequest> {
    logger.info("Capturing feature request", {
      organizationId: data.organizationId,
      source: data.source,
    });

    // Check for existing request with same sourceRef
    const existing = await this.findBySourceRef(data.organizationId, data.sourceRef);
    if (existing) {
      logger.info("Feature request already captured", {
        existingId: existing.id,
        sourceRef: data.sourceRef,
      });
      return existing;
    }

    return this.createRequest(data);
  }

  /**
   * Create a new feature request in the database
   */
  private async createRequest(capture: FeatureRequestCapture): Promise<CapturedRequest> {
    try {
      const request = await db.featureRequest.create({
        data: {
          organizationId: capture.organizationId,
          source: capture.source,
          sourceRef: capture.sourceRef,
          rawContent: capture.rawContent,
          requesterId: capture.requesterId || null,
          status: "new",
          priority: 3, // Default to low
          requestCount: 1,
          relatedModules: [],
          tags: [],
        },
      });

      logger.info("Feature request created", {
        requestId: request.id,
        source: capture.source,
        organizationId: capture.organizationId,
      });

      return {
        id: request.id,
        source: capture.source as FeatureRequestSource,
        sourceRef: capture.sourceRef,
        rawContent: capture.rawContent,
        requesterId: capture.requesterId,
        organizationId: capture.organizationId,
        status: request.status,
        createdAt: request.createdAt,
      };
    } catch (error) {
      logger.error(
        "Failed to create feature request",
        {
          source: capture.source,
          organizationId: capture.organizationId,
        },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Find existing request by source reference
   */
  private async findBySourceRef(
    organizationId: string,
    sourceRef: string
  ): Promise<CapturedRequest | null> {
    const existing = await db.featureRequest.findFirst({
      where: {
        organizationId,
        sourceRef,
      },
    });

    if (!existing) return null;

    return {
      id: existing.id,
      source: existing.source as FeatureRequestSource,
      sourceRef: existing.sourceRef || "",
      rawContent: existing.rawContent,
      requesterId: existing.requesterId || undefined,
      organizationId: existing.organizationId,
      status: existing.status,
      createdAt: existing.createdAt,
    };
  }

  /**
   * Resolve Slack user ID to internal user ID
   */
  private async resolveSlackUserId(
    organizationId: string,
    slackUserId: string
  ): Promise<string | undefined> {
    // Try to find user by Slack identity link
    try {
      const identity = await db.externalIdentity.findFirst({
        where: {
          provider: "slack",
          providerUserId: slackUserId,
          user: {
            memberships: {
              some: {
                organizationId,
              },
            },
          },
        },
        include: {
          user: true,
        },
      });

      if (identity?.userId) {
        return identity.userId;
      }
    } catch (error) {
      // Identity linking may not be set up, continue without user ID
      logger.debug("Could not resolve Slack user ID", { slackUserId, organizationId });
    }

    return undefined;
  }

  /**
   * Resolve Notion user ID to internal user ID
   */
  private async resolveNotionUserId(
    organizationId: string,
    notionUserId?: string
  ): Promise<string | undefined> {
    if (!notionUserId) return undefined;

    try {
      const identity = await db.externalIdentity.findFirst({
        where: {
          provider: "notion",
          providerUserId: notionUserId,
          user: {
            memberships: {
              some: {
                organizationId,
              },
            },
          },
        },
        include: {
          user: true,
        },
      });

      if (identity?.userId) {
        return identity.userId;
      }
    } catch (error) {
      logger.debug("Could not resolve Notion user ID", { notionUserId, organizationId });
    }

    return undefined;
  }

  /**
   * Resolve email address to internal user ID
   */
  private async resolveEmailUserId(
    organizationId: string,
    email: string
  ): Promise<string | undefined> {
    try {
      const user = await db.user.findFirst({
        where: {
          email: email.toLowerCase(),
          memberships: {
            some: {
              organizationId,
            },
          },
        },
      });

      if (user?.id) {
        return user.id;
      }
    } catch (error) {
      logger.debug("Could not resolve email to user ID", { email, organizationId });
    }

    return undefined;
  }

  /**
   * Simple content hash for deduplication
   */
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}

// Singleton instance
let intakeServiceInstance: FeatureRequestIntakeService | null = null;

export function getIntakeService(
  config?: Partial<FeatureRequestPipelineConfig>
): FeatureRequestIntakeService {
  if (!intakeServiceInstance) {
    intakeServiceInstance = new FeatureRequestIntakeService(config);
  }
  return intakeServiceInstance;
}
