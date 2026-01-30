/**
 * Email Webhooks API
 *
 * Handles inbound email webhooks from SendGrid Inbound Parse
 * for email-based feature request capture.
 */
import { Router, Request, Response } from "express";
import multer from "multer";
import { getInboundEmailParser } from "../services/email/inbound-parser";
import { getIntakeService } from "../services/mega-app/feature-request-pipeline/intake.service";
import { getEmailAcknowledgmentService } from "../services/email/acknowledgment.service";
import { logger } from "../utils/logger";
import { db } from "../db/client";

const router = Router();

// Configure multer for file uploads (attachments)
// Store in memory since we'll process immediately
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 10, // Max 10 attachments
  },
});

/**
 * POST /webhooks/email/inbound
 *
 * Receives multipart form data from SendGrid Inbound Parse.
 * Expected fields:
 * - from: sender email
 * - to: recipient email
 * - subject: email subject
 * - text: plain text body
 * - html: HTML body (optional)
 * - attachments: JSON metadata (optional)
 * - attachment1, attachment2, etc: actual files (optional)
 */
router.post(
  "/inbound",
  upload.any(), // Accept all file fields (attachment1, attachment2, etc)
  async (req: Request, res: Response) => {
    try {
      logger.info("Received inbound email webhook", {
        from: req.body.from,
        to: req.body.to,
        subject: req.body.subject,
        fileCount: (req.files as Express.Multer.File[])?.length || 0,
      });

      // Parse SendGrid payload
      const parser = getInboundEmailParser();
      const emailData = parser.parseInboundEmail(
        req.body,
        req.files as Express.Multer.File[]
      );

      logger.info("Parsed inbound email", {
        messageId: emailData.messageId,
        from: emailData.from,
        subject: emailData.subject,
        bodyLength: emailData.body.length,
        attachmentCount: emailData.attachments?.length || 0,
      });

      // Determine organization from recipient email
      // Expected format: features@{org-subdomain}.nubabel.com
      // Or fallback to lookup by domain
      const organizationId = await resolveOrganizationFromRecipient(
        req.body.to,
        emailData.from
      );

      if (!organizationId) {
        logger.warn("Could not resolve organization from recipient email", {
          to: req.body.to,
          from: emailData.from,
        });

        // Send error acknowledgment
        const ackService = getEmailAcknowledgmentService();
        await ackService.sendErrorAcknowledgment(
          emailData.from,
          emailData.subject,
          "Could not determine your organization. Please contact support."
        );

        return res.status(200).json({
          success: false,
          error: "organization_not_found",
          message: "Could not resolve organization from recipient email",
        });
      }

      // Capture feature request via intake service
      const intakeService = getIntakeService();
      const capturedRequest = await intakeService.captureFromEmail(
        organizationId,
        emailData
      );

      logger.info("Feature request captured from email", {
        requestId: capturedRequest.id,
        organizationId,
        messageId: emailData.messageId,
      });

      // Send acknowledgment email
      const ackService = getEmailAcknowledgmentService();
      await ackService.sendAcknowledgment(
        emailData.from,
        emailData.subject,
        capturedRequest.id
      );

      logger.info("Acknowledgment email sent", {
        to: emailData.from,
        trackingId: capturedRequest.id,
      });

      // SendGrid expects 200 OK
      return res.status(200).json({
        success: true,
        requestId: capturedRequest.id,
        trackingId: capturedRequest.id,
        message: "Feature request received and acknowledgment sent",
      });
    } catch (error) {
      logger.error(
        "Failed to process inbound email webhook",
        {
          from: req.body?.from,
          to: req.body?.to,
          subject: req.body?.subject,
        },
        error instanceof Error ? error : new Error(String(error))
      );

      // Still return 200 to SendGrid to avoid retries
      // But log the error for investigation
      return res.status(200).json({
        success: false,
        error: "processing_failed",
        message: "Failed to process email. Our team has been notified.",
      });
    }
  }
);

/**
 * Resolve organization ID from recipient email address
 *
 * Strategies:
 * 1. Parse subdomain from features@{subdomain}.nubabel.com
 * 2. Lookup organization by custom domain
 * 3. Match sender's email domain to organization
 */
async function resolveOrganizationFromRecipient(
  recipientEmail: string,
  senderEmail: string
): Promise<string | null> {
  try {
    // Strategy 1: Parse subdomain from recipient email
    // Expected format: features@acme.nubabel.com -> subdomain "acme"
    const recipientMatch = recipientEmail.match(/features@([^.]+)\.nubabel\.com/i);
    if (recipientMatch && recipientMatch[1]) {
      const subdomain = recipientMatch[1].toLowerCase();

      const org = await db.organization.findFirst({
        where: {
          slug: subdomain,
        },
        select: {
          id: true,
        },
      });

      if (org) {
        logger.info("Resolved organization from subdomain", {
          subdomain,
          organizationId: org.id,
        });
        return org.id;
      }
    }

    // Strategy 2: Lookup by custom email domain in organization settings
    const recipientDomain = recipientEmail.split("@")[1]?.toLowerCase();
    if (recipientDomain) {
      const org = await db.organization.findFirst({
        where: {
          settings: {
            path: ["featureRequestEmail"],
            string_contains: recipientDomain,
          },
        },
        select: {
          id: true,
        },
      });

      if (org) {
        logger.info("Resolved organization from custom domain", {
          domain: recipientDomain,
          organizationId: org.id,
        });
        return org.id;
      }
    }

    // Strategy 3: Match sender's email domain to organization members
    const senderDomain = senderEmail.split("@")[1]?.toLowerCase();
    if (senderDomain) {
      const user = await db.user.findFirst({
        where: {
          email: {
            endsWith: `@${senderDomain}`,
          },
        },
        include: {
          memberships: {
            take: 1,
            select: {
              organizationId: true,
            },
          },
        },
      });

      if (user?.memberships[0]?.organizationId) {
        logger.info("Resolved organization from sender domain", {
          senderDomain,
          organizationId: user.memberships[0].organizationId,
        });
        return user.memberships[0].organizationId;
      }
    }

    return null;
  } catch (error) {
    logger.error(
      "Error resolving organization from recipient",
      { recipientEmail, senderEmail },
      error instanceof Error ? error : new Error(String(error))
    );
    return null;
  }
}

/**
 * GET /webhooks/email/health
 *
 * Health check endpoint for monitoring
 */
router.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    service: "email-webhooks",
    timestamp: new Date().toISOString(),
  });
});

export const emailWebhooksRouter = router;
