import { WebClient } from "@slack/web-api";
import { db as prisma } from "../db/client";
import { logger } from "../utils/logger";

interface ApprovalForSlack {
  id: string;
  type: string;
  title: string;
  description: string;
  context?: Record<string, unknown> | null;
  expiresAt: Date;
  status: string;
  slackChannelId?: string | null;
  slackMessageTs?: string | null;
}

interface UserInfo {
  id: string;
  email?: string | null;
  displayName?: string | null;
}

export async function sendApprovalNotification(params: {
  approval: ApprovalForSlack;
  requester: UserInfo;
  approver: UserInfo;
  organizationId: string;
}): Promise<{ channelId: string; messageTs: string } | null> {
  const { approval, requester, approver, organizationId } = params;

  const integration = await prisma.slackIntegration.findFirst({
    where: { organizationId, enabled: true },
  });

  if (!integration || !integration.botToken) {
    logger.debug("No Slack integration found for organization", { organizationId });
    return null;
  }

  const client = new WebClient(integration.botToken);

  const approverSlackUser = await findSlackUserByEmail(client, approver.email ?? undefined);
  if (!approverSlackUser) {
    logger.warn("Could not find Slack user for approver", {
      approverEmail: approver.email,
      approvalId: approval.id,
    });
    return null;
  }

  const requesterName = requester.displayName || requester.email || "Someone";
  const expiresAtFormatted = formatExpiry(approval.expiresAt);

  const blocks = buildApprovalBlocks({
    approval,
    requesterName,
    expiresAtFormatted,
    isPending: true,
  });

  try {
    const dmResponse = await client.conversations.open({
      users: approverSlackUser,
    });

    if (!dmResponse.ok || !dmResponse.channel?.id) {
      throw new Error("Failed to open DM channel with approver");
    }

    const channelId = dmResponse.channel.id;

    const messageResponse = await client.chat.postMessage({
      channel: channelId,
      text: `Approval Request: ${approval.title}`,
      blocks,
    });

    if (!messageResponse.ok || !messageResponse.ts) {
      throw new Error("Failed to send approval message");
    }

    logger.info("Sent approval notification via Slack", {
      approvalId: approval.id,
      channelId,
      messageTs: messageResponse.ts,
    });

    return { channelId, messageTs: messageResponse.ts };
  } catch (error) {
    logger.error(
      "Failed to send Slack approval notification",
      { approvalId: approval.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}

export async function updateApprovalMessage(params: {
  approval: ApprovalForSlack;
  responderId: string;
  organizationId: string;
}): Promise<void> {
  const { approval, responderId, organizationId } = params;

  if (!approval.slackChannelId || !approval.slackMessageTs) {
    return;
  }

  const integration = await prisma.slackIntegration.findFirst({
    where: { organizationId, enabled: true },
  });

  if (!integration || !integration.botToken) {
    return;
  }

  const client = new WebClient(integration.botToken);

  const responder = await prisma.user.findUnique({
    where: { id: responderId },
    select: { displayName: true, email: true },
  });

  const responderName = responder?.displayName || responder?.email || "Someone";

  const blocks = buildApprovalBlocks({
    approval,
    requesterName: "",
    expiresAtFormatted: "",
    isPending: false,
    responderName,
  });

  try {
    await client.chat.update({
      channel: approval.slackChannelId,
      ts: approval.slackMessageTs,
      text: `Approval ${approval.status}: ${approval.title}`,
      blocks,
    });

    logger.info("Updated Slack approval message", {
      approvalId: approval.id,
      status: approval.status,
    });
  } catch (error) {
    logger.error(
      "Failed to update Slack approval message",
      { approvalId: approval.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}

async function findSlackUserByEmail(client: WebClient, email?: string): Promise<string | null> {
  if (!email) return null;

  try {
    const response = await client.users.lookupByEmail({ email });
    return response.user?.id || null;
  } catch (error) {
    logger.debug("Slack user lookup failed", { email });
    return null;
  }
}

function formatExpiry(expiresAt: Date): string {
  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? "s" : ""}`;
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? "s" : ""}`;
  }
  return `${minutes} minute${minutes > 1 ? "s" : ""}`;
}

function buildApprovalBlocks(params: {
  approval: ApprovalForSlack;
  requesterName: string;
  expiresAtFormatted: string;
  isPending: boolean;
  responderName?: string;
}): any[] {
  const { approval, requesterName, expiresAtFormatted, isPending, responderName } = params;

  const typeEmoji = getTypeEmoji(approval.type);
  const statusEmoji = getStatusEmoji(approval.status);

  if (!isPending) {
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${statusEmoji} *Approval ${capitalize(approval.status)}*\n\n*${approval.title}*`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `_${responderName} ${approval.status} this request_`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `${typeEmoji} ${capitalize(approval.type)} | ID: \`${approval.id.slice(0, 8)}\``,
          },
        ],
      },
    ];
  }

  const blocks: any[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${typeEmoji} Approval Request`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${approval.title}*\n\n${approval.description}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Requested by *${requesterName}* | Expires in *${expiresAtFormatted}*`,
        },
      ],
    },
    { type: "divider" },
    {
      type: "actions",
      block_id: `approval_actions_${approval.id}`,
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Approve",
            emoji: true,
          },
          style: "primary",
          action_id: `approve_${approval.id}`,
          value: approval.id,
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Reject",
            emoji: true,
          },
          style: "danger",
          action_id: `reject_${approval.id}`,
          value: approval.id,
        },
      ],
    },
  ];

  if (approval.context && Object.keys(approval.context).length > 0) {
    const contextStr = Object.entries(approval.context)
      .map(([k, v]) => `*${k}:* ${v}`)
      .join("\n");
    blocks.splice(3, 0, {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Additional Context:*\n${contextStr}`,
      },
    });
  }

  return blocks;
}

function getTypeEmoji(type: string): string {
  switch (type) {
    case "budget":
      return "💰";
    case "deployment":
      return "🚀";
    case "content":
      return "📝";
    default:
      return "📋";
  }
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case "approved":
      return "✅";
    case "rejected":
      return "❌";
    case "expired":
      return "⏰";
    default:
      return "⏳";
  }
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
