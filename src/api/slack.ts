import { App, LogLevel, AuthorizeResult } from "@slack/bolt";
import { WebClient } from "@slack/web-api";
import { slackEventQueue } from "../queue/slack-event.queue";
import { createSession, getSessionBySlackThread } from "../orchestrator/session-manager";
import { getUserBySlackId, getOrganizationBySlackWorkspace } from "../services/slack-service";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";
import { randomUUID } from "crypto";
import { getSlackIntegrationByWorkspace } from "./slack-integration";
import { redis } from "../db/redis";
import { db as prisma } from "../db/client";
import { updateApprovalMessage } from "../services/approval-slack";
import { createAuditLog } from "../services/audit-logger";

let slackApp: App | null = null;

interface AuthorizeQuery {
  teamId?: string;
  enterpriseId?: string;
  isEnterpriseInstall?: boolean;
}

async function authorize(query: AuthorizeQuery): Promise<AuthorizeResult> {
  const teamId = query.teamId;

  if (!teamId) {
    throw new Error("Team ID is required for authorization");
  }

  const integration = await getSlackIntegrationByWorkspace(teamId);

  if (!integration) {
    throw new Error(`No Slack integration found for workspace ${teamId}`);
  }

  if (!integration.enabled) {
    throw new Error(`Slack integration is disabled for workspace ${teamId}`);
  }

  return {
    botToken: integration.botToken,
    botUserId: integration.botUserId || undefined,
    botId: integration.botUserId || undefined,
  };
}

function createSlackApp(): App {
  const useSocketMode = process.env.SLACK_SOCKET_MODE === "true";

  if (useSocketMode) {
    if (!process.env.SLACK_APP_TOKEN) {
      throw new Error("SLACK_APP_TOKEN is required for Socket Mode");
    }
    if (!process.env.SLACK_SIGNING_SECRET) {
      throw new Error("SLACK_SIGNING_SECRET is required");
    }

    return new App({
      authorize,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
      socketMode: true,
      appToken: process.env.SLACK_APP_TOKEN,
      logLevel: (process.env.SLACK_LOG_LEVEL as LogLevel) || LogLevel.INFO,
    });
  }

  if (!process.env.SLACK_SIGNING_SECRET) {
    throw new Error("SLACK_SIGNING_SECRET is required");
  }

  return new App({
    authorize,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    logLevel: (process.env.SLACK_LOG_LEVEL as LogLevel) || LogLevel.INFO,
  });
}

function setupEventHandlers(app: App): void {
  app.event("app_mention", async ({ event, say, client }) => {
    const startTime = Date.now();

    let dedupeKey: string | null = null;

    try {
      const { user, text, channel, thread_ts, ts } = event;

      const messageTs = thread_ts || ts;
      dedupeKey = `slack:dedupe:app_mention:${channel}:${messageTs}`;
      const alreadyProcessed = await redis.exists(dedupeKey);
      if (alreadyProcessed) {
        logger.debug("Duplicate Slack app_mention event skipped", {
          channel,
          ts: messageTs,
        });
        return;
      }

      await redis.set(dedupeKey, "1", 300);

      logger.info("Slack mention received", {
        user,
        channel,
        hasThread: !!thread_ts,
      });

      metrics.increment("slack.mention.received");

      if (!user) {
        logger.warn("Slack mention without user");
        return;
      }

      const nubabelUser = await getUserBySlackId(user, client as WebClient);
      if (!nubabelUser) {
        logger.warn("Nubabel user not found for Slack user", {
          slackUserId: user,
        });
        metrics.increment("slack.error.user_not_found");

        await say({
          text: "❌ Nubabel user not found. Please login first at https://nubabel.com",
          thread_ts: thread_ts || ts,
        });
        return;
      }

      const slackWorkspace = await client.team.info();
      const workspaceId = slackWorkspace.team?.id;

      if (!workspaceId) {
        await say({
          text: "❌ Failed to get Slack workspace info",
          thread_ts: thread_ts || ts,
        });
        return;
      }

      const organization = await getOrganizationBySlackWorkspace(workspaceId);

      if (!organization) {
        await say({
          text: "❌ Organization not found. Please connect your Slack workspace in Settings.",
          thread_ts: thread_ts || ts,
        });
        return;
      }

      let session = await getSessionBySlackThread(thread_ts || ts);
      if (!session) {
        session = await createSession({
          userId: nubabelUser.id,
          organizationId: organization.id,
          source: "slack",
          metadata: {
            slackChannelId: channel,
            slackThreadTs: thread_ts || ts,
            slackUserId: user,
          },
        });
      }

      const cleanedText = text.replace(/<@[A-Z0-9]+>/g, "").trim();

      const eventId = randomUUID();

      await slackEventQueue.enqueueEvent({
        type: "app_mention",
        channel,
        user,
        text: cleanedText,
        ts: messageTs,
        organizationId: organization.id,
        userId: nubabelUser.id,
        sessionId: session.id,
        eventId,
      });

      await say({
        text: `🤔 Processing your request...`,
        thread_ts: messageTs,
      });

      logger.info("Slack event enqueued", {
        eventId,
        user: nubabelUser.id,
        organization: organization.id,
      });

      metrics.increment("slack.mention.enqueued");
      metrics.timing("slack.mention.duration", Date.now() - startTime);
    } catch (error: unknown) {
      if (dedupeKey) {
        await redis.del(dedupeKey);
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Slack mention handler error", {
        error: errorMessage,
      });

      metrics.increment("slack.error.handler_failed");

      await say({
        text: `❌ Error: ${errorMessage}`,
        thread_ts: event.thread_ts || event.ts,
      });
    }
  });

  app.message(async ({ message, say, client }) => {
    if ("channel_type" in message && message.channel_type === "im") {
      const msg = message as { user?: string; text?: string; channel: string; ts: string };

      if (!msg.user || !msg.text) return;

      const dedupeKey = `slack:dedupe:direct_message:${msg.channel}:${msg.ts}`;
      const alreadyProcessed = await redis.exists(dedupeKey);
      if (alreadyProcessed) {
        logger.debug("Duplicate Slack direct message skipped", {
          channel: msg.channel,
          ts: msg.ts,
        });
        return;
      }

      await redis.set(dedupeKey, "1", 300);

      try {
        const nubabelUser = await getUserBySlackId(msg.user, client as WebClient);
        if (!nubabelUser) {
          await say("Please login at https://nubabel.com first!");
          return;
        }

        const slackWorkspace = await client.team.info();
        const workspaceId = slackWorkspace.team?.id;

        if (!workspaceId) {
          await say("Failed to get workspace info");
          return;
        }

        const organization = await getOrganizationBySlackWorkspace(workspaceId);
        if (!organization) {
          await say("Organization not found. Please connect your Slack workspace in Settings.");
          return;
        }

        let session = await getSessionBySlackThread(msg.channel);
        if (!session) {
          session = await createSession({
            userId: nubabelUser.id,
            organizationId: organization.id,
            source: "slack",
            metadata: {
              slackChannelId: msg.channel,
              slackUserId: msg.user,
            },
          });
        }

        const eventId = randomUUID();

        await slackEventQueue.enqueueEvent({
          type: "direct_message",
          channel: msg.channel,
          user: msg.user,
          text: msg.text,
          ts: msg.ts,
          organizationId: organization.id,
          userId: nubabelUser.id,
          sessionId: session.id,
          eventId,
        });

        await say(`🤔 Processing your message...`);
      } catch (error: unknown) {
        await redis.del(dedupeKey);
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("DM handler error", { error: errorMessage });
        await say(`Error: ${errorMessage}`);
      }
    }
  });

  app.command("/nubabel", async ({ command, ack, say, client }) => {
    await ack();

    const dedupeKey = `slack:dedupe:slash_command:${command.team_id}:${command.channel_id}:${command.trigger_id}`;
    const alreadyProcessed = await redis.exists(dedupeKey);
    if (alreadyProcessed) {
      logger.debug("Duplicate Slack slash command skipped", {
        teamId: command.team_id,
        channelId: command.channel_id,
      });
      return;
    }

    await redis.set(dedupeKey, "1", 300);

    try {
      const { user_id, text, channel_id, team_id } = command;

      const nubabelUser = await getUserBySlackId(user_id, client as WebClient);
      if (!nubabelUser) {
        await say("Please login at https://nubabel.com first!");
        return;
      }

      const organization = await getOrganizationBySlackWorkspace(team_id);
      if (!organization) {
        await say("Organization not found. Please connect your Slack workspace in Settings.");
        return;
      }

      let session = await getSessionBySlackThread(channel_id);
      if (!session) {
        session = await createSession({
          userId: nubabelUser.id,
          organizationId: organization.id,
          source: "slack",
          metadata: {
            slackChannelId: channel_id,
            slackUserId: user_id,
          },
        });
      }

      const eventId = randomUUID();

      await slackEventQueue.enqueueEvent({
        type: "slash_command",
        channel: channel_id,
        user: user_id,
        text,
        ts: Date.now().toString(),
        organizationId: organization.id,
        userId: nubabelUser.id,
        sessionId: session.id,
        eventId,
      });

      await say(`🤔 Processing your command...`);
    } catch (error: unknown) {
      await redis.del(dedupeKey);
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Slash command error", { error: errorMessage });
      await say(`Error: ${errorMessage}`);
    }
  });

  app.action(/^approve_/, async ({ action, ack, body, client }) => {
    await ack();

    try {
      const actionValue = (action as { value?: string }).value;
      if (!actionValue) {
        logger.warn("Approval action without value");
        return;
      }

      const approvalId = actionValue;
      const slackUserId = body.user.id;

      const nubabelUser = await getUserBySlackId(slackUserId, client as WebClient);
      if (!nubabelUser) {
        logger.warn("Nubabel user not found for Slack approver", { slackUserId });
        return;
      }

      const approval = await prisma.approval.findUnique({ where: { id: approvalId } });
      if (!approval) {
        logger.warn("Approval not found", { approvalId });
        return;
      }

      const isApprover = approval.approverId === nubabelUser.id;
      const isFallbackApprover = approval.fallbackApproverId === nubabelUser.id;

      if (!isApprover && !isFallbackApprover) {
        logger.warn("User not authorized to approve", { userId: nubabelUser.id, approvalId });
        return;
      }

      if (approval.status !== "pending") {
        logger.info("Approval already responded", { approvalId, status: approval.status });
        return;
      }

      if (new Date() > approval.expiresAt) {
        await prisma.approval.update({ where: { id: approvalId }, data: { status: "expired" } });
        logger.info("Approval expired", { approvalId });
        return;
      }

      const updatedApproval = await prisma.approval.update({
        where: { id: approvalId },
        data: { status: "approved", respondedAt: new Date() },
      });

      await createAuditLog({
        organizationId: approval.organizationId,
        action: "approval.approved",
        userId: nubabelUser.id,
        resourceType: "Approval",
        resourceId: approval.id,
        details: { type: approval.type, title: approval.title, requesterId: approval.requesterId },
      });

      await updateApprovalMessage({
        approval: {
          ...updatedApproval,
          context: updatedApproval.context as Record<string, unknown> | null,
        },
        responderId: nubabelUser.id,
        organizationId: approval.organizationId,
      });

      metrics.increment("slack.approval.approved");
      logger.info("Approval approved via Slack", { approvalId, userId: nubabelUser.id });
    } catch (error) {
      logger.error(
        "Slack approve action error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  });

  app.action(/^reject_/, async ({ action, ack, body, client }) => {
    await ack();

    try {
      const actionValue = (action as { value?: string }).value;
      if (!actionValue) {
        logger.warn("Rejection action without value");
        return;
      }

      const approvalId = actionValue;
      const slackUserId = body.user.id;

      const nubabelUser = await getUserBySlackId(slackUserId, client as WebClient);
      if (!nubabelUser) {
        logger.warn("Nubabel user not found for Slack rejector", { slackUserId });
        return;
      }

      const approval = await prisma.approval.findUnique({ where: { id: approvalId } });
      if (!approval) {
        logger.warn("Approval not found", { approvalId });
        return;
      }

      const isApprover = approval.approverId === nubabelUser.id;
      const isFallbackApprover = approval.fallbackApproverId === nubabelUser.id;

      if (!isApprover && !isFallbackApprover) {
        logger.warn("User not authorized to reject", { userId: nubabelUser.id, approvalId });
        return;
      }

      if (approval.status !== "pending") {
        logger.info("Approval already responded", { approvalId, status: approval.status });
        return;
      }

      if (new Date() > approval.expiresAt) {
        await prisma.approval.update({ where: { id: approvalId }, data: { status: "expired" } });
        logger.info("Approval expired", { approvalId });
        return;
      }

      const updatedApproval = await prisma.approval.update({
        where: { id: approvalId },
        data: { status: "rejected", respondedAt: new Date() },
      });

      await createAuditLog({
        organizationId: approval.organizationId,
        action: "approval.rejected",
        userId: nubabelUser.id,
        resourceType: "Approval",
        resourceId: approval.id,
        details: { type: approval.type, title: approval.title, requesterId: approval.requesterId },
      });

      await updateApprovalMessage({
        approval: {
          ...updatedApproval,
          context: updatedApproval.context as Record<string, unknown> | null,
        },
        responderId: nubabelUser.id,
        organizationId: approval.organizationId,
      });

      metrics.increment("slack.approval.rejected");
      logger.info("Approval rejected via Slack", { approvalId, userId: nubabelUser.id });
    } catch (error) {
      logger.error(
        "Slack reject action error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  });
}

export async function startSlackBot(): Promise<void> {
  if (slackApp) {
    logger.warn("Slack bot already running");
    return;
  }

  slackApp = createSlackApp();
  setupEventHandlers(slackApp);

  await slackApp.start();
  logger.info("Slack Bot started (multi-tenant mode)");
}

export async function stopSlackBot(): Promise<void> {
  if (!slackApp) {
    return;
  }

  await slackApp.stop();
  slackApp = null;
  logger.info("Slack Bot stopped");
}

export function getSlackApp(): App | null {
  return slackApp;
}
