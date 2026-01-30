/**
 * SendGrid Inbound Parse Email Parser
 *
 * Parses incoming emails from SendGrid's Inbound Parse webhook
 * and converts them to EmailCaptureData format for feature request intake.
 */
import { EmailCaptureData, EmailAttachment } from "../mega-app/feature-request-pipeline/types";
import { logger } from "../../utils/logger";

/**
 * SendGrid Inbound Parse payload format (multipart/form-data)
 */
export interface SendGridInboundPayload {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: string; // JSON string with attachment metadata
  envelope?: string; // JSON string with SMTP envelope
  charsets?: string; // JSON string with charset info
  SPF?: string;
  "dkim"?: string;
  [key: string]: string | undefined; // For attachment files (attachment1, attachment2, etc)
}

/**
 * SendGrid attachment metadata from JSON
 */
interface SendGridAttachmentMetadata {
  filename: string;
  type: string;
  content?: string; // Base64 encoded content
  "content-id"?: string;
}

/**
 * Inbound Email Parser Service
 */
export class InboundEmailParser {
  /**
   * Parse SendGrid Inbound Parse payload to EmailCaptureData
   */
  parseInboundEmail(payload: SendGridInboundPayload, files?: Express.Multer.File[]): EmailCaptureData {
    logger.info("Parsing inbound email from SendGrid", {
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      hasText: !!payload.text,
      hasHtml: !!payload.html,
      fileCount: files?.length || 0,
    });

    // Extract plain text body (prefer text, fallback to stripped HTML)
    const body = this.extractBody(payload.text, payload.html);

    // Parse attachments
    const attachments = this.parseAttachments(payload, files);

    // Generate message ID from envelope or create one
    const messageId = this.extractMessageId(payload);

    // Parse reply-to address
    const replyTo = this.extractReplyTo(payload);

    return {
      messageId,
      from: this.normalizeEmail(payload.from),
      subject: payload.subject || "(No Subject)",
      body,
      attachments: attachments.length > 0 ? attachments : undefined,
      receivedAt: new Date(),
      replyTo,
    };
  }

  /**
   * Extract plain text body from text or HTML
   */
  private extractBody(text?: string, html?: string): string {
    if (text && text.trim()) {
      return text.trim();
    }

    if (html && html.trim()) {
      // Strip HTML tags for plain text version
      const stripped = this.stripHtml(html);
      return stripped.trim();
    }

    return "(No email body)";
  }

  /**
   * Strip HTML tags and convert to plain text
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "") // Remove style blocks
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "") // Remove script blocks
      .replace(/<[^>]+>/g, "") // Remove all tags
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n\s*\n\s*\n/g, "\n\n") // Collapse multiple blank lines
      .trim();
  }

  /**
   * Parse attachment metadata and files
   */
  private parseAttachments(
    payload: SendGridInboundPayload,
    files?: Express.Multer.File[]
  ): EmailAttachment[] {
    const attachments: EmailAttachment[] = [];

    // Parse attachment metadata from JSON string
    if (payload.attachments) {
      try {
        const metadata: Record<string, SendGridAttachmentMetadata> = JSON.parse(payload.attachments);

        Object.entries(metadata).forEach(([key, meta]) => {
          attachments.push({
            filename: meta.filename,
            contentType: meta.type,
            size: 0, // Size will be updated if file is provided
            url: undefined, // URL can be set later if files are uploaded to storage
          });
        });
      } catch (error) {
        logger.warn("Failed to parse attachments JSON", { error });
      }
    }

    // Match uploaded files with metadata
    if (files && files.length > 0) {
      files.forEach((file) => {
        const existing = attachments.find((a) => a.filename === file.originalname);
        if (existing) {
          existing.size = file.size;
        } else {
          attachments.push({
            filename: file.originalname,
            contentType: file.mimetype,
            size: file.size,
            url: undefined,
          });
        }
      });
    }

    return attachments;
  }

  /**
   * Extract or generate message ID
   */
  private extractMessageId(payload: SendGridInboundPayload): string {
    // Try to get message-id from envelope
    if (payload.envelope) {
      try {
        const envelope = JSON.parse(payload.envelope);
        if (envelope["message-id"]) {
          return envelope["message-id"];
        }
      } catch (error) {
        logger.debug("Failed to parse envelope JSON", { error });
      }
    }

    // Generate message ID from from + subject + timestamp
    const timestamp = Date.now();
    const hash = this.simpleHash(`${payload.from}:${payload.subject}:${timestamp}`);
    return `generated-${hash}@sendgrid.inbound`;
  }

  /**
   * Extract reply-to address
   */
  private extractReplyTo(payload: SendGridInboundPayload): string | undefined {
    // Check for Reply-To header (SendGrid may pass this as a custom field)
    if (payload["reply-to"]) {
      return this.normalizeEmail(payload["reply-to"]);
    }

    // Default to from address
    return this.normalizeEmail(payload.from);
  }

  /**
   * Normalize email address (remove display name if present)
   */
  private normalizeEmail(email: string): string {
    // Extract email from "Display Name <email@example.com>" format
    const match = email.match(/<(.+?)>/);
    if (match && match[1]) {
      return match[1].toLowerCase().trim();
    }
    return email.toLowerCase().trim();
  }

  /**
   * Simple hash function for generating IDs
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

// Singleton instance
let parserInstance: InboundEmailParser | null = null;

export function getInboundEmailParser(): InboundEmailParser {
  if (!parserInstance) {
    parserInstance = new InboundEmailParser();
  }
  return parserInstance;
}
