import { Router, Request, Response } from "express";
import crypto from "crypto";
import { db as prisma } from "../db/client";
import { logger } from "../utils/logger";
import { orchestrationQueue } from "../queue/orchestration.queue";
import { getUserBySlackId, getOrganizationBySlackWorkspace } from "../services/slack-service";
import { encrypt } from "../utils/encryption";
import { getMarketplaceApiKeys } from "./marketplace-hub";

const router = Router();

// ---------------------------------------------------------------------------
// Helper: Verify Slack request signature
// ---------------------------------------------------------------------------

function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string,
): boolean {
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp, 10) < fiveMinutesAgo) {
    logger.warn("Slack request timestamp too old", { timestamp });
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

// ---------------------------------------------------------------------------
// Helper: Handle marketplace API key commands
// ---------------------------------------------------------------------------

const VALID_API_KEY_SOURCES = ["smithery", "civitai", "langchain"] as const;
type ApiKeySource = (typeof VALID_API_KEY_SOURCES)[number];

function getApiKeyFieldName(source: ApiKeySource): string {
  return `${source}ApiKey`;
}

async function handleMarketplaceApiKeyCommand(
  res: Response,
  commandText: string,
  organizationId: string,
): Promise<Response> {
  const parts = commandText.split(/\s+/);
  // Format: "marketplace apikey <action> [source] [key]"
  const action = parts[2]?.toLowerCase();
  const source = parts[3]?.toLowerCase() as ApiKeySource | undefined;
  const apiKey = parts.slice(4).join(" ");

  // List command
  if (action === "list") {
    try {
      const keys = await getMarketplaceApiKeys(organizationId);
      const configured = [];
      if (keys.smitheryApiKey) configured.push("• Smithery: Configured");
      if (keys.civitaiApiKey) configured.push("• CivitAI: Configured");
      if (keys.langchainApiKey) configured.push("• LangChain Hub: Configured");

      if (configured.length === 0) {
        return res.status(200).json({
          response_type: "ephemeral",
          text: "No marketplace API keys are configured.\n\nSet one with: `/nubabel marketplace apikey set <source> <key>`\nSources: smithery, civitai, langchain",
        });
      }

      return res.status(200).json({
        response_type: "ephemeral",
        text: `Configured marketplace API keys:\n${configured.join("\n")}`,
      });
    } catch (error) {
      logger.error("Failed to list marketplace API keys", {}, error as Error);
      return res.status(200).json({
        response_type: "ephemeral",
        text: "Failed to list API keys. Please try again.",
      });
    }
  }

  // Set command
  if (action === "set") {
    if (!source || !VALID_API_KEY_SOURCES.includes(source)) {
      return res.status(200).json({
        response_type: "ephemeral",
        text: "Invalid source. Use: smithery, civitai, or langchain\n\nExample: `/nubabel marketplace apikey set smithery sk-xxxx`",
      });
    }

    if (!apiKey) {
      return res.status(200).json({
        response_type: "ephemeral",
        text: "Please provide an API key.\n\nExample: `/nubabel marketplace apikey set smithery sk-xxxx`",
      });
    }

    try {
      const fieldName = getApiKeyFieldName(source);
      const encryptedKey = encrypt(apiKey);

      await prisma.organizationMarketplaceSettings.upsert({
        where: { organizationId },
        create: {
          organizationId,
          [fieldName]: encryptedKey,
        } as any,
        update: {
          [fieldName]: encryptedKey,
        } as any,
      });

      logger.info("Marketplace API key set via Slack", { organizationId, source });

      return res.status(200).json({
        response_type: "ephemeral",
        text: `${source.charAt(0).toUpperCase() + source.slice(1)} API key has been configured.`,
      });
    } catch (error) {
      logger.error("Failed to set marketplace API key", {}, error as Error);
      return res.status(200).json({
        response_type: "ephemeral",
        text: "Failed to save API key. Please try again.",
      });
    }
  }

  // Delete command
  if (action === "delete" || action === "remove") {
    if (!source || !VALID_API_KEY_SOURCES.includes(source)) {
      return res.status(200).json({
        response_type: "ephemeral",
        text: "Invalid source. Use: smithery, civitai, or langchain\n\nExample: `/nubabel marketplace apikey delete smithery`",
      });
    }

    try {
      const fieldName = getApiKeyFieldName(source);

      await prisma.organizationMarketplaceSettings.update({
        where: { organizationId },
        data: {
          [fieldName]: null,
        } as any,
      });

      logger.info("Marketplace API key deleted via Slack", { organizationId, source });

      return res.status(200).json({
        response_type: "ephemeral",
        text: `${source.charAt(0).toUpperCase() + source.slice(1)} API key has been removed.`,
      });
    } catch (error) {
      logger.error("Failed to delete marketplace API key", {}, error as Error);
      return res.status(200).json({
        response_type: "ephemeral",
        text: "Failed to delete API key. Please try again.",
      });
    }
  }

  // Unknown action
  return res.status(200).json({
    response_type: "ephemeral",
    text: "Unknown command. Available actions:\n• `list` - List configured API keys\n• `set <source> <key>` - Set an API key\n• `delete <source>` - Remove an API key\n\nSources: smithery, civitai, langchain",
  });
}

// ---------------------------------------------------------------------------
// POST /api/slack/commands  -  Slash command handler (/nubabel)
// ---------------------------------------------------------------------------

router.post("/commands", async (req: Request, res: Response) => {
  try {
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (!signingSecret) {
      logger.error("SLACK_SIGNING_SECRET is not configured");
      return res.status(500).json({ error: "Slack integration not configured" });
    }

    const slackSignature = req.headers["x-slack-signature"] as string | undefined;
    const slackTimestamp = req.headers["x-slack-request-timestamp"] as string | undefined;

    if (!slackSignature || !slackTimestamp) {
      logger.warn("Missing Slack signature headers on /commands");
      return res.status(401).json({ error: "Missing Slack signature headers" });
    }

    const rawBody =
      typeof (req as any).rawBody === "string"
        ? (req as any).rawBody
        : new URLSearchParams(req.body as Record<string, string>).toString();

    if (!verifySlackSignature(signingSecret, slackSignature, slackTimestamp, rawBody)) {
      logger.warn("Slack signature verification failed on /commands");
      return res.status(401).json({ error: "Invalid Slack signature" });
    }

    const {
      team_id: teamId,
      user_id: slackUserId,
      text: commandText,
      channel_id: channelId,
    } = req.body as Record<string, string>;

    logger.info("Slack slash command received", { teamId, slackUserId, channelId, commandText });

    // Look up the Nubabel organization by Slack workspace
    const organization = await getOrganizationBySlackWorkspace(teamId);
    if (!organization) {
      logger.warn("No organization found for Slack workspace", { teamId });
      return res.status(200).json({
        response_type: "ephemeral",
        text: "Your Slack workspace is not connected to a Nubabel organization. Please visit Settings to connect.",
      });
    }

    const organizationId = organization.id;

    // Look up the Nubabel user by Slack ID (via email from Slack API)
    const slackBotToken = process.env.SLACK_BOT_TOKEN;
    if (!slackBotToken) {
      logger.error("SLACK_BOT_TOKEN is not configured");
      return res.status(200).json({
        response_type: "ephemeral",
        text: "Slack bot token is not configured. Please contact your administrator.",
      });
    }

    let userId: string;
    try {
      const { WebClient } = await import("@slack/web-api");
      const slackClient = new WebClient(slackBotToken);
      const user = await getUserBySlackId(slackUserId, slackClient);
      if (!user) {
        return res.status(200).json({
          response_type: "ephemeral",
          text: "Your Slack account is not linked to a Nubabel user. Please log in and connect your Slack account.",
        });
      }
      userId = user.id;
    } catch {
      logger.warn("Failed to resolve Slack user", { slackUserId, teamId });
      return res.status(200).json({
        response_type: "ephemeral",
        text: "Could not find your Nubabel account. Please log in and connect your Slack account.",
      });
    }

    if (!commandText || commandText.trim().length === 0) {
      return res.status(200).json({
        response_type: "ephemeral",
        text: `*Nubabel Commands*

*General:*
• \`/nubabel <your request>\` — AI assistant
• \`/nubabel help\` — Show this help
• \`/nubabel status\` — Bot status & usage
• \`/nubabel whoami\` — Your user info

*Settings:*
• \`/nubabel marketplace apikey list\` — List API keys
• \`/nubabel marketplace apikey set <source> <key>\` — Set API key
• \`/nubabel marketplace apikey delete <source>\` — Remove API key

Sources: smithery, civitai, langchain`,
      });
    }

    // Check for OpenClaw-style commands
    const trimmedCommand = commandText.trim().toLowerCase();

    // /nubabel help
    if (trimmedCommand === "help" || trimmedCommand === "commands") {
      return res.status(200).json({
        response_type: "ephemeral",
        text: `*Nubabel Commands*

*General:*
• \`/nubabel <your request>\` — AI assistant
• \`/nubabel help\` — Show this help
• \`/nubabel status\` — Bot status & usage
• \`/nubabel whoami\` — Your user info

*Settings:*
• \`/nubabel marketplace apikey list\` — List API keys
• \`/nubabel marketplace apikey set <source> <key>\` — Set API key
• \`/nubabel marketplace apikey delete <source>\` — Remove API key

*Slack Tools Available:*
sendMessage, updateMessage, deleteMessage, uploadFile, addReaction, removeReaction,
pinMessage, unpinMessage, getPermalink, listChannels, getChannelInfo, getChannelHistory,
listUsers, getUser, getUserPresence, searchMessages, getThreadMessages,
scheduleMessage, createChannel, inviteToChannel, kickFromChannel, setChannelTopic, archiveChannel`,
      });
    }

    // /nubabel status
    if (trimmedCommand === "status") {
      try {
        const [sessionCount, workflowCount] = await Promise.all([
          prisma.session.count({ where: { organizationId } }),
          prisma.workflow.count({ where: { organizationId, enabled: true } }),
        ]);

        return res.status(200).json({
          response_type: "ephemeral",
          text: `*Nubabel Status*

:white_check_mark: Bot is online
:office: Organization: ${organization.name}
:page_facing_up: Active Sessions: ${sessionCount}
:gear: Enabled Workflows: ${workflowCount}
:clock1: Server Time: ${new Date().toISOString()}`,
        });
      } catch (error) {
        logger.error("Failed to get status", {}, error as Error);
        return res.status(200).json({
          response_type: "ephemeral",
          text: ":white_check_mark: Bot is online",
        });
      }
    }

    // /nubabel whoami
    if (trimmedCommand === "whoami" || trimmedCommand === "id") {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: {
            memberships: {
              where: { organizationId },
              select: { role: true, permissions: true },
            },
          },
        });

        if (!user) {
          return res.status(200).json({
            response_type: "ephemeral",
            text: "User not found in Nubabel.",
          });
        }

        const membership = user.memberships[0];
        return res.status(200).json({
          response_type: "ephemeral",
          text: `*Your Nubabel Identity*

:bust_in_silhouette: Name: ${user.displayName || "Not set"}
:email: Email: ${user.email}
:office: Organization: ${organization.name}
:key: Role: ${membership?.role || "member"}
:id: User ID: \`${user.id}\`
:slack: Slack ID: \`${slackUserId}\``,
        });
      } catch (error) {
        logger.error("Failed to get user info", {}, error as Error);
        return res.status(200).json({
          response_type: "ephemeral",
          text: `Slack User ID: \`${slackUserId}\``,
        });
      }
    }

    if (trimmedCommand.startsWith("marketplace apikey")) {
      return handleMarketplaceApiKeyCommand(res, commandText.trim(), organizationId);
    }

    const sessionId = crypto.randomUUID();
    const eventId = crypto.randomUUID();

    await orchestrationQueue.enqueueOrchestration({
      userRequest: commandText.trim(),
      sessionId,
      organizationId,
      userId,
      eventId,
      slackChannel: channelId,
      slackThreadTs: "",
    });

    logger.info("Slack command queued for orchestration", {
      sessionId,
      userId,
      organizationId,
      commandText: commandText.trim(),
    });

    return res.status(200).json({
      response_type: "ephemeral",
      text: `Got it! Processing your request: "${commandText.trim()}"\nI'll respond here shortly.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Slack slash command handler error", { error: message });
    return res.status(200).json({
      response_type: "ephemeral",
      text: "Something went wrong processing your command. Please try again.",
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/slack/interactions  -  Interactive component handler
// ---------------------------------------------------------------------------

interface SlackInteractionPayload {
  type: string;
  user: { id: string; team_id: string };
  actions?: Array<{
    action_id: string;
    value?: string;
    block_id?: string;
  }>;
  trigger_id?: string;
  response_url?: string;
  message?: { ts: string; text?: string };
  channel?: { id: string };
}

router.post("/interactions", async (req: Request, res: Response) => {
  try {
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (!signingSecret) {
      logger.error("SLACK_SIGNING_SECRET is not configured");
      return res.status(500).json({ error: "Slack integration not configured" });
    }

    const slackSignature = req.headers["x-slack-signature"] as string | undefined;
    const slackTimestamp = req.headers["x-slack-request-timestamp"] as string | undefined;

    if (!slackSignature || !slackTimestamp) {
      return res.status(401).json({ error: "Missing Slack signature headers" });
    }

    const rawBody =
      typeof (req as any).rawBody === "string"
        ? (req as any).rawBody
        : new URLSearchParams(req.body as Record<string, string>).toString();

    if (!verifySlackSignature(signingSecret, slackSignature, slackTimestamp, rawBody)) {
      return res.status(401).json({ error: "Invalid Slack signature" });
    }

    const payloadStr = req.body?.payload;
    if (!payloadStr || typeof payloadStr !== "string") {
      return res.status(400).json({ error: "Missing payload" });
    }

    let payload: SlackInteractionPayload;
    try {
      payload = JSON.parse(payloadStr) as SlackInteractionPayload;
    } catch {
      return res.status(400).json({ error: "Invalid payload JSON" });
    }

    const slackUserId = payload.user?.id;
    const teamId = payload.user?.team_id;
    const actions = payload.actions ?? [];

    logger.info("Slack interaction received", {
      type: payload.type,
      slackUserId,
      teamId,
      actionCount: actions.length,
    });

    const slackIntegration = teamId
      ? await prisma.slackIntegration.findUnique({ where: { workspaceId: teamId } })
      : null;
    const organizationId = slackIntegration?.organizationId;

    for (const action of actions) {
      const actionId = action.action_id;
      const actionValue = action.value;

      try {
        // ----- Feedback actions -----
        if (actionId === "feedback_positive" || actionId === "feedback_negative") {
          const sentiment = actionId === "feedback_positive" ? "positive" : "negative";
          logger.info("Slack feedback received", {
            sentiment,
            slackUserId,
            executionId: actionValue,
            organizationId,
          });
        }

        // ----- Approval actions -----
        else if (actionId === "approve_action" || actionId === "reject_action") {
          const status = actionId === "approve_action" ? "approved" : "rejected";
          logger.info("Slack approval action received", { status, slackUserId, actionValue });

          if (actionValue) {
            const approval = await prisma.approval.findUnique({ where: { id: actionValue } });

            if (!approval) {
              logger.warn("Approval not found for Slack action", { approvalId: actionValue });
              continue;
            }

            if (approval.status !== "pending") {
              logger.info("Approval already responded", {
                approvalId: actionValue,
                currentStatus: approval.status,
              });
              continue;
            }

            if (new Date() > approval.expiresAt) {
              await prisma.approval.update({
                where: { id: actionValue },
                data: { status: "expired" },
              });
              logger.info("Approval expired", { approvalId: actionValue });
              continue;
            }

            await prisma.approval.update({
              where: { id: actionValue },
              data: { status, respondedAt: new Date() },
            });

            logger.info("Approval updated via Slack interaction", {
              approvalId: actionValue,
              status,
              slackUserId,
            });
          }
        }

        // ----- Retry action -----
        else if (actionId === "retry_action") {
          logger.info("Slack retry action received", { slackUserId, actionValue });

          if (actionValue && organizationId) {
            let retryData: { userRequest: string; sessionId: string; userId: string } | null = null;
            try {
              retryData = JSON.parse(actionValue);
            } catch {
              logger.warn("Failed to parse retry action value", { actionValue });
            }

            if (retryData) {
              const sessionId = crypto.randomUUID();
              const eventId = crypto.randomUUID();

              await orchestrationQueue.enqueueOrchestration({
                userRequest: retryData.userRequest,
                sessionId,
                organizationId,
                userId: retryData.userId,
                eventId,
                slackChannel: payload.channel?.id ?? "",
                slackThreadTs: "",
              });

              logger.info("Retry job queued via Slack interaction", {
                sessionId,
                organizationId,
                originalSessionId: retryData.sessionId,
              });
            }
          }
        }

        // ----- Unknown action -----
        else {
          logger.warn("Unhandled Slack interaction action", { actionId, actionValue });
        }
      } catch (actionError: unknown) {
        const actionMessage =
          actionError instanceof Error ? actionError.message : String(actionError);
        logger.error("Error handling Slack interaction action", {
          actionId,
          error: actionMessage,
        });
      }
    }

    return res.status(200).send();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Slack interaction handler error", { error: message });
    return res.status(200).send();
  }
});

export default router;
