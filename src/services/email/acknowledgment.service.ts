/**
 * Email Acknowledgment Service
 *
 * Sends confirmation emails back to feature request submitters
 * with tracking IDs and next steps.
 */
import { logger } from "../../utils/logger";

/**
 * Email Acknowledgment Service
 *
 * Sends confirmation emails when feature requests are received via email.
 */
export class EmailAcknowledgmentService {
  private sendgridApiKey: string;
  private fromEmail: string;
  private fromName: string;

  constructor() {
    // Use process.env directly since SendGrid is optional
    this.sendgridApiKey = process.env.SENDGRID_API_KEY || "";
    this.fromEmail = process.env.SENDGRID_FROM_EMAIL || "noreply@nubabel.com";
    this.fromName = process.env.SENDGRID_FROM_NAME || "Nubabel Feature Requests";
  }

  /**
   * Send acknowledgment email to feature request submitter
   */
  async sendAcknowledgment(
    recipientEmail: string,
    originalSubject: string,
    trackingId: string
  ): Promise<void> {
    if (!this.sendgridApiKey) {
      logger.warn("SendGrid API key not configured, skipping acknowledgment email");
      return;
    }

    try {
      const subject = `Re: ${originalSubject}`;
      const htmlContent = this.generateAcknowledgmentHtml(trackingId, originalSubject);
      const textContent = this.generateAcknowledgmentText(trackingId, originalSubject);

      await this.sendEmail(recipientEmail, subject, htmlContent, textContent);

      logger.info("Acknowledgment email sent", {
        to: recipientEmail,
        trackingId,
      });
    } catch (error) {
      logger.error(
        "Failed to send acknowledgment email",
        { recipientEmail, trackingId },
        error instanceof Error ? error : new Error(String(error))
      );
      // Don't throw - acknowledgment failure shouldn't block request processing
    }
  }

  /**
   * Send error acknowledgment when processing fails
   */
  async sendErrorAcknowledgment(
    recipientEmail: string,
    originalSubject: string,
    errorMessage: string
  ): Promise<void> {
    if (!this.sendgridApiKey) {
      return;
    }

    try {
      const subject = `Error: ${originalSubject}`;
      const htmlContent = this.generateErrorHtml(errorMessage, originalSubject);
      const textContent = this.generateErrorText(errorMessage, originalSubject);

      await this.sendEmail(recipientEmail, subject, htmlContent, textContent);

      logger.info("Error acknowledgment email sent", {
        to: recipientEmail,
      });
    } catch (error) {
      logger.error(
        "Failed to send error acknowledgment email",
        { recipientEmail },
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Generate HTML content for acknowledgment email
   */
  private generateAcknowledgmentHtml(trackingId: string, originalSubject: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #0066cc; color: white; padding: 20px; text-align: center; }
    .content { background: #f9f9f9; padding: 20px; margin-top: 20px; }
    .tracking-id {
      background: #fff;
      border: 2px solid #0066cc;
      padding: 15px;
      margin: 20px 0;
      font-size: 18px;
      font-weight: bold;
      text-align: center;
    }
    .footer { margin-top: 20px; font-size: 12px; color: #666; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Feature Request Received</h1>
    </div>

    <div class="content">
      <p>Thank you for submitting your feature request!</p>

      <p><strong>Your Request:</strong><br>
      ${this.escapeHtml(originalSubject)}</p>

      <div class="tracking-id">
        Tracking ID: ${trackingId}
      </div>

      <p><strong>What happens next?</strong></p>
      <ol>
        <li>Our AI will analyze your request and extract key requirements</li>
        <li>Similar requests will be automatically grouped together</li>
        <li>You'll receive updates as your request is prioritized and developed</li>
      </ol>

      <p>You can track the status of your request using the tracking ID above.</p>

      <p>If you have any questions, please reply to this email.</p>
    </div>

    <div class="footer">
      <p>This is an automated message from Nubabel Feature Request System.</p>
      <p>Please do not reply directly to this email unless you need assistance.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Generate plain text content for acknowledgment email
   */
  private generateAcknowledgmentText(trackingId: string, originalSubject: string): string {
    return `
✅ FEATURE REQUEST RECEIVED

Thank you for submitting your feature request!

Your Request:
${originalSubject}

Tracking ID: ${trackingId}

What happens next?
1. Our AI will analyze your request and extract key requirements
2. Similar requests will be automatically grouped together
3. You'll receive updates as your request is prioritized and developed

You can track the status of your request using the tracking ID above.

If you have any questions, please reply to this email.

---
This is an automated message from Nubabel Feature Request System.
    `.trim();
  }

  /**
   * Generate HTML content for error acknowledgment
   */
  private generateErrorHtml(errorMessage: string, originalSubject: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #cc0000; color: white; padding: 20px; text-align: center; }
    .content { background: #fff3cd; padding: 20px; margin-top: 20px; border-left: 4px solid #ff9800; }
    .footer { margin-top: 20px; font-size: 12px; color: #666; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ Feature Request Processing Error</h1>
    </div>

    <div class="content">
      <p>We encountered an issue processing your feature request:</p>

      <p><strong>Subject:</strong><br>
      ${this.escapeHtml(originalSubject)}</p>

      <p><strong>Error:</strong><br>
      ${this.escapeHtml(errorMessage)}</p>

      <p>Our team has been notified and will investigate. Please try again later or contact support if this issue persists.</p>

      <p>You can reply to this email with any additional information that might help us resolve this issue.</p>
    </div>

    <div class="footer">
      <p>This is an automated message from Nubabel Feature Request System.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Generate plain text content for error acknowledgment
   */
  private generateErrorText(errorMessage: string, originalSubject: string): string {
    return `
⚠️ FEATURE REQUEST PROCESSING ERROR

We encountered an issue processing your feature request:

Subject:
${originalSubject}

Error:
${errorMessage}

Our team has been notified and will investigate. Please try again later or contact support if this issue persists.

You can reply to this email with any additional information that might help us resolve this issue.

---
This is an automated message from Nubabel Feature Request System.
    `.trim();
  }

  /**
   * Send email via SendGrid API
   */
  private async sendEmail(
    to: string,
    subject: string,
    htmlContent: string,
    textContent: string
  ): Promise<void> {
    const payload = {
      personalizations: [
        {
          to: [{ email: to }],
          subject,
        },
      ],
      from: {
        email: this.fromEmail,
        name: this.fromName,
      },
      content: [
        {
          type: "text/plain",
          value: textContent,
        },
        {
          type: "text/html",
          value: htmlContent,
        },
      ],
    };

    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.sendgridApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SendGrid API error (${response.status}): ${errorText}`);
    }

    logger.debug("Email sent via SendGrid", {
      to,
      subject,
      status: response.status,
    });
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }
}

// Singleton instance
let ackServiceInstance: EmailAcknowledgmentService | null = null;

export function getEmailAcknowledgmentService(): EmailAcknowledgmentService {
  if (!ackServiceInstance) {
    ackServiceInstance = new EmailAcknowledgmentService();
  }
  return ackServiceInstance;
}
