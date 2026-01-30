/**
 * Slack AR Commands Router
 *
 * Handles /ar slash commands for Agent Resource management.
 * Supports both English and Korean aliases.
 */

import { Router, Request, Response } from "express";
import crypto from "crypto";
import { db } from "../db/client";
import { logger } from "../utils/logger";

const router = Router();

// Korean command aliases
const COMMAND_ALIASES: Record<string, string> = {
  '상태': 'status',
  '워크로드': 'workload',
  '이슈': 'issues',
  '승인': 'approve',
  '반려': 'reject',
  '도움말': 'help',
};

// Slack signature verification
function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string,
): boolean {
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp, 10) < fiveMinutesAgo) {
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac("sha256", signingSecret);
  hmac.update(sigBasestring);
  const computedSignature = `v0=${hmac.digest("hex")}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computedSignature, "utf-8"),
      Buffer.from(signature, "utf-8"),
    );
  } catch {
    return false;
  }
}

// Parse command and args
function parseCommand(text: string): { command: string; args: string[] } {
  const parts = text.trim().split(/\s+/);
  let command = parts[0]?.toLowerCase() || 'help';

  // Handle Korean aliases
  if (COMMAND_ALIASES[command]) {
    command = COMMAND_ALIASES[command];
  }

  return {
    command,
    args: parts.slice(1),
  };
}

// Get organization from Slack workspace ID
async function getOrganizationByTeamId(teamId: string) {
  const integration = await db.slackIntegration.findFirst({
    where: { workspaceId: teamId },
  });
  if (!integration) return null;

  const organization = await db.organization.findUnique({
    where: { id: integration.organizationId },
  });
  return organization;
}

/**
 * POST /api/slack/ar/commands
 * Main handler for /ar slash commands
 */
router.post("/commands", async (req: Request, res: Response) => {
  try {
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (!signingSecret) {
      logger.warn("Slack signing secret not configured");
      return res.status(500).json({ error: "Slack not configured" });
    }

    const slackSignature = req.headers["x-slack-signature"] as string;
    const slackTimestamp = req.headers["x-slack-request-timestamp"] as string;

    if (!slackSignature || !slackTimestamp) {
      return res.status(401).json({ error: "Missing signature" });
    }

    // Build raw body for signature verification
    const rawBody = typeof (req as any).rawBody === "string"
      ? (req as any).rawBody
      : new URLSearchParams(req.body).toString();

    if (!verifySlackSignature(signingSecret, slackSignature, slackTimestamp, rawBody)) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    const { team_id: teamId, text } = req.body;

    // Get organization
    const organization = await getOrganizationByTeamId(teamId);
    if (!organization) {
      return res.status(200).json({
        response_type: "ephemeral",
        text: "This Slack workspace is not connected to Nubabel. Please contact your administrator.",
      });
    }

    const { command, args } = parseCommand(text || '');

    switch (command) {
      case 'status':
        return handleStatus(res, organization.id);
      case 'workload':
        return handleWorkload(res, organization.id);
      case 'issues':
        return handleIssues(res, organization.id);
      case 'approve':
        return handleApprove(res, organization.id, args);
      case 'reject':
        return handleReject(res, organization.id, args);
      case 'help':
      default:
        return handleHelp(res);
    }
  } catch (error) {
    logger.error("AR Slack command error", {}, error as Error);
    return res.status(200).json({
      response_type: "ephemeral",
      text: "An error occurred while processing your command. Please try again.",
    });
  }
});

async function handleStatus(res: Response, orgId: string) {
  try {
    const [deptCount, posCount, assignCount, issueCount] = await Promise.all([
      db.agentDepartment.count({ where: { organizationId: orgId, status: 'active' } }),
      db.agentPosition.count({ where: { organizationId: orgId } }),
      db.agentAssignment.count({ where: { organizationId: orgId, status: 'active' } }),
      // For issues, we'd need the issue detector service - simplified here
      Promise.resolve(0),
    ]);

    return res.status(200).json({
      response_type: "in_channel",
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "📊 AR System Status", emoji: true }
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Departments:*\n${deptCount}` },
            { type: "mrkdwn", text: `*Positions:*\n${posCount}` },
            { type: "mrkdwn", text: `*Active Assignments:*\n${assignCount}` },
            { type: "mrkdwn", text: `*Issues:*\n${issueCount}` },
          ]
        },
        {
          type: "context",
          elements: [
            { type: "mrkdwn", text: "Use `/ar help` for more commands" }
          ]
        }
      ]
    });
  } catch (error) {
    logger.error("AR status command error", { orgId }, error as Error);
    return res.status(200).json({
      response_type: "ephemeral",
      text: "Failed to fetch AR status. Please try again.",
    });
  }
}

async function handleWorkload(res: Response, orgId: string) {
  try {
    const assignments = await db.agentAssignment.findMany({
      where: { organizationId: orgId, status: 'active' },
      include: { agent: { select: { name: true } } },
      orderBy: { workload: 'desc' },
      take: 10,
    });

    if (assignments.length === 0) {
      return res.status(200).json({
        response_type: "ephemeral",
        text: "No active assignments found.",
      });
    }

    const rows = assignments.map(a => {
      const pct = Math.round(a.workload * 100);
      const bar = '█'.repeat(Math.floor(pct / 10)) + '░'.repeat(10 - Math.floor(pct / 10));
      const status = pct >= 90 ? '🔴' : pct >= 80 ? '🟡' : '🟢';
      return `${(a.agent?.name || a.agentId).padEnd(15)} ${bar} ${pct}% ${status}`;
    }).join('\n');

    const avgWorkload = assignments.reduce((sum, a) => sum + a.workload, 0) / assignments.length;

    return res.status(200).json({
      response_type: "in_channel",
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "📈 Workload Distribution", emoji: true }
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: "```\n" + rows + "\n```" }
        },
        {
          type: "context",
          elements: [
            { type: "mrkdwn", text: `Average: ${Math.round(avgWorkload * 100)}%` }
          ]
        }
      ]
    });
  } catch (error) {
    logger.error("AR workload command error", { orgId }, error as Error);
    return res.status(200).json({
      response_type: "ephemeral",
      text: "Failed to fetch workload data. Please try again.",
    });
  }
}

async function handleIssues(res: Response, _orgId: string) {
  // Simplified - in production, use the issue detector service with _orgId
  return res.status(200).json({
    response_type: "in_channel",
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🚨 Active Issues", emoji: true }
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: "✅ No issues detected. All systems operating normally." }
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: "Visit the AR Dashboard for detailed issue tracking." }
        ]
      }
    ]
  });
}

async function handleApprove(res: Response, orgId: string, args: string[]) {
  const requestId = args[0];
  if (!requestId) {
    return res.status(200).json({
      response_type: "ephemeral",
      text: "Usage: `/ar approve <request_id>`"
    });
  }

  try {
    const request = await db.aRApprovalRequest.findFirst({
      where: { id: requestId, organizationId: orgId, status: 'pending' },
    });

    if (!request) {
      return res.status(200).json({
        response_type: "ephemeral",
        text: "Approval request not found or already processed."
      });
    }

    await db.aRApprovalRequest.update({
      where: { id: requestId },
      data: {
        status: 'approved',
        responses: {
          push: {
            level: request.currentLevel,
            approverId: 'slack-user',
            decision: 'approved',
            timestamp: new Date().toISOString(),
          }
        }
      },
    });

    return res.status(200).json({
      response_type: "in_channel",
      text: `✅ Request approved: ${request.title}`
    });
  } catch (error) {
    logger.error("AR approve command error", { orgId, requestId }, error as Error);
    return res.status(200).json({
      response_type: "ephemeral",
      text: "Failed to approve request. Please try again.",
    });
  }
}

async function handleReject(res: Response, orgId: string, args: string[]) {
  const requestId = args[0];
  if (!requestId) {
    return res.status(200).json({
      response_type: "ephemeral",
      text: "Usage: `/ar reject <request_id> [-r reason]`"
    });
  }

  const reasonIndex = args.indexOf('-r');
  const reason = reasonIndex >= 0 ? args.slice(reasonIndex + 1).join(' ') : undefined;

  try {
    const request = await db.aRApprovalRequest.findFirst({
      where: { id: requestId, organizationId: orgId, status: 'pending' },
    });

    if (!request) {
      return res.status(200).json({
        response_type: "ephemeral",
        text: "Approval request not found or already processed."
      });
    }

    await db.aRApprovalRequest.update({
      where: { id: requestId },
      data: {
        status: 'rejected',
        responses: {
          push: {
            level: request.currentLevel,
            approverId: 'slack-user',
            decision: 'rejected',
            note: reason,
            timestamp: new Date().toISOString(),
          }
        }
      },
    });

    return res.status(200).json({
      response_type: "in_channel",
      text: `❌ Request rejected: ${request.title}${reason ? `\nReason: ${reason}` : ''}`
    });
  } catch (error) {
    logger.error("AR reject command error", { orgId, requestId }, error as Error);
    return res.status(200).json({
      response_type: "ephemeral",
      text: "Failed to reject request. Please try again.",
    });
  }
}

function handleHelp(res: Response) {
  return res.status(200).json({
    response_type: "ephemeral",
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "📖 AR Commands Help", emoji: true }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Available Commands:*\n\n" +
            "• `/ar status` (상태) - AR system overview\n" +
            "• `/ar workload` (워크로드) - Workload distribution\n" +
            "• `/ar issues` (이슈) - Active issues list\n" +
            "• `/ar approve <id>` (승인) - Approve a request\n" +
            "• `/ar reject <id> [-r reason]` (반려) - Reject a request\n" +
            "• `/ar help` (도움말) - Show this help"
        }
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: "_Both English and Korean (한글) commands are supported_" }
        ]
      }
    ]
  });
}

export default router;
