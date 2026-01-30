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
import { undoAutoApproval } from "../services/auto-approval.service";
import { registerIdentityCommands } from "./slack-identity-commands";
import { resolveSlackThreadContext, buildSlackContextPrompt } from "../services/slack-thread-context";
import {
  isFeatureRequest,
  handleFeatureRequestMention,
  handleFeatureRequestReaction,
} from "./slack-feature-requests";

let slackApp: App | null = null;

// ============================================================================
// Ack Reactions - OpenClaw-style instant feedback
// ============================================================================

const ACK_EMOJI = "eyes"; // 👀 - processing
const DONE_EMOJI = "white_check_mark"; // ✅ - completed

/**
 * Add an acknowledgment reaction to show we're processing
 */
async function addAckReaction(
  client: WebClient,
  channel: string,
  timestamp: string,
): Promise<void> {
  try {
    await client.reactions.add({
      channel,
      timestamp,
      name: ACK_EMOJI,
    });
    logger.debug("Added ack reaction", { channel, timestamp, emoji: ACK_EMOJI });
  } catch (error: any) {
    // Ignore "already_reacted" errors
    if (error.data?.error !== "already_reacted") {
      logger.warn("Failed to add ack reaction", {
        channel,
        timestamp,
        error: error.message,
      });
    }
  }
}

/**
 * Remove the ack reaction and add completion reaction
 * Exported for use by notification worker when response is sent
 */
export async function markMessageComplete(
  client: WebClient,
  channel: string,
  timestamp: string,
): Promise<void> {
  try {
    // Remove the ack reaction
    await client.reactions.remove({
      channel,
      timestamp,
      name: ACK_EMOJI,
    }).catch(() => {
      // Ignore if reaction wasn't there
    });

    // Add completion reaction
    await client.reactions.add({
      channel,
      timestamp,
      name: DONE_EMOJI,
    });
    logger.debug("Marked message complete", { channel, timestamp });
  } catch (error: any) {
    if (error.data?.error !== "already_reacted") {
      logger.warn("Failed to mark message complete", {
        channel,
        timestamp,
        error: error.message,
      });
    }
  }
}

/**
 * Add a custom reaction to a message
 */
export async function addReaction(
  client: WebClient,
  channel: string,
  timestamp: string,
  emoji: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await client.reactions.add({
      channel,
      timestamp,
      name: emoji.replace(/:/g, ""), // Remove colons if present
    });
    return { ok: true };
  } catch (error: any) {
    if (error.data?.error === "already_reacted") {
      return { ok: true }; // Already reacted is success
    }
    return { ok: false, error: error.message };
  }
}

/**
 * Remove a reaction from a message
 */
export async function removeReaction(
  client: WebClient,
  channel: string,
  timestamp: string,
  emoji: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await client.reactions.remove({
      channel,
      timestamp,
      name: emoji.replace(/:/g, ""),
    });
    return { ok: true };
  } catch (error: any) {
    if (error.data?.error === "no_reaction") {
      return { ok: true }; // No reaction to remove is success
    }
    return { ok: false, error: error.message };
  }
}

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
    // Fallback to environment variables for dev/test
    const envBotToken = process.env.SLACK_BOT_TOKEN;
    if (envBotToken) {
      logger.info("Using environment variable fallback for Slack auth", { teamId });
      return {
        botToken: envBotToken,
        botUserId: undefined,
        botId: undefined,
      };
    }
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

      // Add ack reaction immediately for instant feedback
      await addAckReaction(client as WebClient, channel, ts);

      // messageTs is for thread context (reply in same thread)
      const messageTs = thread_ts || ts;
      // dedupeKey must use the actual message ts, NOT thread_ts
      // Otherwise all messages in a thread get the same key and only first is processed
      dedupeKey = `slack:dedupe:app_mention:${channel}:${ts}`;
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

      // Check if this is a feature request
      if (isFeatureRequest(text)) {
        logger.debug("Detected feature request, routing to feature request handler");
        await handleFeatureRequestMention(
          {
            user: user || "",
            text,
            channel,
            thread_ts,
            ts,
          },
          client as WebClient,
        );
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

      // Collect thread context for AI (OpenClaw-style context awareness)
      let threadContextPrompt: string | undefined;
      try {
        const slackContext = await resolveSlackThreadContext(
          client as WebClient,
          channel,
          thread_ts,
          ts,
          user,
        );
        threadContextPrompt = buildSlackContextPrompt(slackContext);

        logger.debug("Collected Slack thread context", {
          channel,
          hasThread: !!thread_ts,
          messageCount: slackContext.threadContext?.messageCount || 0,
        });
      } catch (error) {
        logger.warn("Failed to collect thread context, continuing without", {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Store original message ts for ack reaction completion
      await redis.set(`slack:original_ts:${eventId}`, ts, 600);

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
        threadContext: threadContextPrompt,
      });

      const progressMessage = await say({
        text: `🤔 Processing your request...`,
        thread_ts: messageTs,
      });

      // Store the progress message timestamp for updates
      if (progressMessage?.ts) {
        await redis.set(`slack:progress:${eventId}`, progressMessage.ts, 600);
      }

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
      const msg = message as { user?: string; text?: string; channel: string; ts: string; thread_ts?: string };

      if (!msg.user || !msg.text) return;

      // Add ack reaction immediately for instant feedback
      await addAckReaction(client as WebClient, msg.channel, msg.ts);

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

        // Collect context for DMs (recent messages in conversation)
        let threadContextPrompt: string | undefined;
        try {
          const slackContext = await resolveSlackThreadContext(
            client as WebClient,
            msg.channel,
            msg.thread_ts,
            msg.ts,
            msg.user,
          );
          threadContextPrompt = buildSlackContextPrompt(slackContext);
        } catch (error) {
          logger.warn("Failed to collect DM context", {
            error: error instanceof Error ? error.message : String(error),
          });
        }

        // Store original message ts for ack reaction completion
        await redis.set(`slack:original_ts:${eventId}`, msg.ts, 600);

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
          threadContext: threadContextPrompt,
        });

        const progressMessage = await say(`🤔 Processing your message...`);

        // Store the progress message timestamp for updates
        if (progressMessage?.ts) {
          await redis.set(`slack:progress:${eventId}`, progressMessage.ts, 600);
        }
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

      const progressMessage = await say(`🤔 Processing your command...`);

      // Store the progress message timestamp for updates
      if (progressMessage?.ts) {
        await redis.set(`slack:progress:${eventId}`, progressMessage.ts, 600);
      }
    } catch (error: unknown) {
      await redis.del(dedupeKey);
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Slash command error", { error: errorMessage });
      await say(`Error: ${errorMessage}`);
    }
  });

  app.command("/schedule", async ({ command, ack, say, client }) => {
    await ack();

    const dedupeKey = `slack:dedupe:slash_command:schedule:${command.team_id}:${command.channel_id}:${command.trigger_id}`;
    const alreadyProcessed = await redis.exists(dedupeKey);
    if (alreadyProcessed) {
      logger.debug("Duplicate /schedule command skipped", {
        teamId: command.team_id,
        channelId: command.channel_id,
      });
      return;
    }

    await redis.set(dedupeKey, "1", 300);

    try {
      const { user_id, text, team_id } = command;

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

      // Parse command: /schedule [cron] [agent] [prompt]
      const parts = text.trim().match(/^"([^"]+)"|\S+/g) || [];
      if (parts.length < 3) {
        await say({
          text: "Invalid syntax. Usage: `/schedule [cron] [agent] [prompt]`",
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "*Invalid syntax*\n\nUsage: `/schedule [cron] [agent] [prompt]`\n\nExamples:\n• `/schedule \"0 9 * * *\" task-agent \"summarize yesterday's tasks\"`\n• `/schedule daily report-agent \"generate daily report\"`\n• `/schedule hourly data-agent \"check system metrics\"`",
              },
            },
          ],
        });
        return;
      }

      const cronInput = (parts[0] ?? "").replace(/^"|"$/g, "");
      const agentName = (parts[1] ?? "").replace(/^"|"$/g, "");
      const prompt = parts
        .slice(2)
        .join(" ")
        .replace(/^"|"$/g, "");

      // Import dependencies
      const parser = await import("cron-parser");
      const { createScheduledTask } = await import("../services/scheduled-tasks");
      const { agentRegistry } = await import("../orchestrator/agent-registry");

      // Parse cron expression (support shortcuts)
      const shortcuts: Record<string, string> = {
        hourly: "0 * * * *",
        daily: "0 9 * * *",
        weekly: "0 9 * * 1",
        monthly: "0 9 1 * *",
      };

      const cronExpression = shortcuts[cronInput.toLowerCase()] || cronInput;

      // Validate cron expression
      try {
        parser.parseExpression(cronExpression);
      } catch (error) {
        await say({
          text: `Invalid cron expression: ${cronExpression}`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Invalid cron expression:* \`${cronExpression}\`\n\n*Shortcuts:*\n• \`hourly\` - Every hour at minute 0\n• \`daily\` - Every day at 9:00 AM\n• \`weekly\` - Every Monday at 9:00 AM\n• \`monthly\` - First day of month at 9:00 AM\n\n*Custom format:* \`minute hour day month day-of-week\`\nExample: \`0 9 * * *\` = Every day at 9:00 AM`,
              },
            },
          ],
        });
        return;
      }

      // Validate agent name
      const allAgents = agentRegistry.getAllAgents();
      const agent = allAgents.find((a) => a.id === agentName || a.name.toLowerCase() === agentName.toLowerCase());
      if (!agent) {
        const agentList = allAgents.map((a) => `• \`${a.id}\` - ${a.name} ${a.emoji}`).join("\n");
        await say({
          text: `Agent not found: ${agentName}`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Agent not found:* \`${agentName}\`\n\n*Available agents:*\n${agentList}`,
              },
            },
          ],
        });
        return;
      }

      // Create scheduled task
      const scheduledTask = await createScheduledTask(organization.id, {
        name: `Slack: ${prompt.substring(0, 50)}`,
        description: `Scheduled via Slack /schedule command by ${nubabelUser.displayName || nubabelUser.email}`,
        taskType: "custom",
        config: {
          frequency: "custom",
          cronExpression,
          timezone: "UTC",
        },
        payload: {
          agent: agent.id,
          prompt,
          slackUserId: user_id,
        },
        enabled: true,
        createdBy: nubabelUser.id,
      });

      // Calculate next run time
      const interval = parser.parseExpression(cronExpression);
      const nextRun = interval.next().toDate();

      // Post confirmation
      await say({
        text: `✅ Schedule created successfully`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*✅ Schedule created successfully*\n\n*Agent:* ${agent.emoji} ${agent.name}\n*Task:* ${prompt}\n*Schedule:* \`${cronExpression}\`\n*Next run:* <!date^${Math.floor(nextRun.getTime() / 1000)}^{date_short_pretty} at {time}|${nextRun.toISOString()}>\n*Schedule ID:* \`${scheduledTask.id}\``,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: "Manage your schedules at https://nubabel.com/schedules",
              },
            ],
          },
        ],
      });

      metrics.increment("slack.schedule.created", { agent: agent.id });
      logger.info("Schedule created via Slack", {
        scheduleId: scheduledTask.id,
        organizationId: organization.id,
        userId: nubabelUser.id,
        agent: agent.id,
        cronExpression,
      });
    } catch (error: unknown) {
      await redis.del(dedupeKey);
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Slack /schedule command error", { error: errorMessage });
      await say({
        text: `❌ Error: ${errorMessage}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*❌ Error creating schedule*\n\n\`${errorMessage}\``,
            },
          },
        ],
      });
    }
  });

  app.command("/task", async ({ command, ack, say, client }) => {
    await ack();

    const dedupeKey = `slack:dedupe:task_command:${command.team_id}:${command.channel_id}:${command.trigger_id}`;
    const alreadyProcessed = await redis.exists(dedupeKey);
    if (alreadyProcessed) {
      logger.debug("Duplicate /task slash command skipped", {
        teamId: command.team_id,
        channelId: command.channel_id,
      });
      return;
    }

    await redis.set(dedupeKey, "1", 300);

    try {
      const { user_id, text, team_id } = command;

      // Detect user's preferred language
      const { getUserLanguagePreference, getLocalizedResponse } = await import("../orchestrator/language-detector");

      // Get Slack user info for locale detection
      let slackUserInfo;
      try {
        const userInfo = await client.users.info({ user: user_id });
        slackUserInfo = {
          locale: userInfo.user?.locale,
          tz: userInfo.user?.tz,
        };
      } catch (error) {
        logger.warn("Failed to get Slack user info for language detection", { error });
        slackUserInfo = undefined;
      }

      const userLang = getUserLanguagePreference(slackUserInfo, text);

      const nubabelUser = await getUserBySlackId(user_id, client as WebClient);
      if (!nubabelUser) {
        const loginUrl = "https://nubabel.com";
        const message = getLocalizedResponse("task_login_required", userLang);
        await say(userLang === "ko"
          ? `${message}: ${loginUrl}`
          : `${message} at ${loginUrl}`);
        await redis.del(dedupeKey);
        return;
      }

      const organization = await getOrganizationBySlackWorkspace(team_id);
      if (!organization) {
        const message = getLocalizedResponse("task_org_not_found", userLang);
        const settingsHint = userLang === "ko"
          ? "설정에서 Slack 워크스페이스를 연결해주세요."
          : "Please connect your Slack workspace in Settings.";
        await say(`${message}. ${settingsHint}`);
        await redis.del(dedupeKey);
        return;
      }

      // Parse the command text: "/task create Fix the login bug" or "/task Fix the login bug"
      const trimmedText = text.trim();
      let subcommand = "create";
      let taskTitle = trimmedText;

      const firstSpace = trimmedText.indexOf(" ");
      if (firstSpace > 0) {
        const potentialSubcommand = trimmedText.substring(0, firstSpace).toLowerCase();
        if (["create", "list", "update", "delete"].includes(potentialSubcommand)) {
          subcommand = potentialSubcommand;
          taskTitle = trimmedText.substring(firstSpace + 1).trim();
        }
      }

      if (subcommand === "create") {
        if (!taskTitle) {
          const message = getLocalizedResponse("task_invalid_syntax", userLang);
          const usage = userLang === "ko"
            ? "사용법: `/task create <제목>`"
            : "Usage: `/task create <title>`";
          await say(`${message}. ${usage}`);
          await redis.del(dedupeKey);
          return;
        }

        // Get Notion connection and database ID
        const notionConnection = await prisma.notionConnection.findUnique({
          where: { organizationId: organization.id },
        });

        if (!notionConnection || (!notionConnection.accessToken && !notionConnection.apiKey)) {
          const message = getLocalizedResponse("task_notion_not_connected", userLang);
          const settingsUrl = "https://nubabel.com/settings/notion";
          const hint = userLang === "ko"
            ? "설정에서 Notion을 연결해주세요"
            : "Please connect Notion in Settings";
          await say(`${message}. ${hint}: ${settingsUrl}`);
          await redis.del(dedupeKey);
          return;
        }

        const databaseId = notionConnection.defaultDatabaseId;
        if (!databaseId) {
          const message = getLocalizedResponse("task_no_default_database", userLang);
          const hint = userLang === "ko"
            ? "설정에서 기본 데이터베이스를 지정해주세요."
            : "Please set a default database in Settings.";
          await say(`${message}. ${hint}`);
          await redis.del(dedupeKey);
          return;
        }

        // Create the task via Notion provider
        const { executeProviderTool } = await import("../mcp/providers/index");

        const result = await executeProviderTool(
          "notion_create_task",
          {
            databaseId,
            title: taskTitle,
          },
          {
            organizationId: organization.id,
            userId: nubabelUser.id,
            agentId: "slack-task-command",
          },
        );

        if (result.success && result.data) {
          const task = (result.data as { task?: { id?: string; url?: string } }).task;
          const taskUrl = task?.url || `https://notion.so/${task?.id?.replace(/-/g, "")}`;

          const successMessage = getLocalizedResponse("task_created", userLang);
          const viewLinkText = getLocalizedResponse("task_view_in_notion", userLang);
          const titleLabel = userLang === "ko" ? "제목" : "Title";

          await say({
            text: successMessage,
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `${successMessage}\n\n*${titleLabel}:* ${taskTitle}\n<${taskUrl}|${viewLinkText}>`,
                },
              },
            ],
          });

          metrics.increment("slack.task.created");
          logger.info("Task created via Slack /task command", {
            organizationId: organization.id,
            userId: nubabelUser.id,
            taskTitle,
            language: userLang,
          });
        } else {
          const errorMsg = result.error?.message || "Unknown error";
          const failedMessage = getLocalizedResponse("task_creation_failed", userLang);
          await say(`${failedMessage}: ${errorMsg}`);
          metrics.increment("slack.task.error");
        }
      } else {
        const notImplemented = userLang === "ko"
          ? `❌ "${subcommand}" 명령어는 아직 구현되지 않았습니다. \`/task create <제목>\`을 시도해보세요.`
          : `❌ Subcommand "${subcommand}" is not yet implemented. Try \`/task create <title>\``;
        await say(notImplemented);
      }
    } catch (error: unknown) {
      await redis.del(dedupeKey);
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("/task command error", { error: errorMessage });
      await say(`❌ Error: ${errorMessage}`);
      metrics.increment("slack.task.error");
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

  // Auto-approval undo button handler
  app.action(/^auto_approval_undo_/, async ({ action, ack, body, client }) => {
    await ack();

    try {
      const actionValue = (action as { value?: string }).value;
      if (!actionValue) {
        logger.warn("Auto-approval undo action without value");
        return;
      }

      const approvalId = actionValue;
      const slackUserId = body.user.id;

      logger.info("Auto-approval undo requested", { approvalId, slackUserId });

      const nubabelUser = await getUserBySlackId(slackUserId, client as WebClient);
      if (!nubabelUser) {
        logger.warn("Nubabel user not found for auto-approval undo", { slackUserId });
        // Respond to user
        if ("message" in body && body.message?.ts && "channel" in body.container) {
          await client.chat.postMessage({
            channel: (body.container as any).channel_id,
            thread_ts: body.message.ts,
            text: "❌ User not found. Please login at https://nubabel.com first.",
          });
        }
        return;
      }

      const result = await undoAutoApproval(approvalId);

      // Update the message to show undo status
      if ("message" in body && body.message?.ts && "channel" in body.container) {
        if (result.success) {
          await client.chat.update({
            channel: (body.container as any).channel_id,
            ts: body.message.ts,
            text: "🔄 Auto-approval undone - manual approval required",
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: "🔄 *Auto-approval undone*\n\n_This request now requires manual approval._",
                },
              },
            ],
          });

          metrics.increment("slack.auto_approval.undo_success");
          logger.info("Auto-approval undone via Slack", { approvalId, userId: nubabelUser.id });
        } else {
          await client.chat.postMessage({
            channel: (body.container as any).channel_id,
            thread_ts: body.message.ts,
            text: `❌ Failed to undo: ${result.reason}`,
          });

          metrics.increment("slack.auto_approval.undo_failed");
          logger.warn("Auto-approval undo failed", { approvalId, reason: result.reason });
        }
      }
    } catch (error) {
      logger.error(
        "Slack auto-approval undo action error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  });

  // Auto-approval details button handler
  app.action(/^auto_approval_details_/, async ({ action, ack, body, client }) => {
    await ack();

    try {
      const actionValue = (action as { value?: string }).value;
      if (!actionValue) {
        logger.warn("Auto-approval details action without value");
        return;
      }

      const approvalId = actionValue;

      // For now, just log - could open a modal with details in the future
      logger.info("Auto-approval details requested", { approvalId });

      // Respond with a simple message
      if ("message" in body && body.message?.ts && "channel" in body.container) {
        await client.chat.postMessage({
          channel: (body.container as any).channel_id,
          thread_ts: body.message.ts,
          text: `ℹ️ Approval details: ID \`${approvalId}\`\n\nThis request was automatically approved based on low risk score and historical approval patterns.`,
        });
      }

      metrics.increment("slack.auto_approval.details_viewed");
    } catch (error) {
      logger.error(
        "Slack auto-approval details action error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  });

  // Reaction added event handler for feedback capture
  app.event("reaction_added", async ({ event, client }) => {
    try {
      const { reaction, user: slackUserId, item } = event;

      // Only process message reactions
      if (item.type !== "message") {
        return;
      }

      const { channel, ts: messageTs } = item;

      // Check for :bulb: emoji - feature request
      if (reaction === "bulb") {
        logger.debug("Detected :bulb: reaction, routing to feature request handler");
        await handleFeatureRequestReaction(event, client as WebClient);
        return;
      }

      // Only capture negative feedback (thumbsdown, -1)
      const {
        mapReactionToSentiment,
      } = await import("../services/feedback-capture.service");
      const sentiment = mapReactionToSentiment(reaction);

      if (sentiment !== "negative") {
        logger.debug("Ignoring non-negative reaction", { reaction });
        return;
      }

      // Get Slack workspace info
      const slackWorkspace = await client.team.info();
      const workspaceId = slackWorkspace.team?.id;

      if (!workspaceId) {
        logger.warn("Could not get workspace ID for reaction");
        return;
      }

      // Get organization from workspace
      const organization = await getOrganizationBySlackWorkspace(workspaceId);
      if (!organization) {
        logger.warn("Organization not found for Slack workspace", { workspaceId });
        return;
      }

      // Get Nubabel user
      const nubabelUser = await getUserBySlackId(slackUserId, client as WebClient);
      if (!nubabelUser) {
        logger.debug("Nubabel user not found for reaction", { slackUserId });
        return;
      }

      // Check if this is a bot message (check if we have it in Redis)
      const eventId = await redis.get(`slack:bot_message_reverse:${channel}:${messageTs}`);

      // Retrieve the bot message content
      const {
        getBotMessageContent,
        findExecutionByEventId,
        captureFeedback,
        feedbackExists,
        promptForCorrection,
      } = await import("../services/feedback-capture.service");

      // Check if feedback already exists
      const alreadyCaptured = await feedbackExists(workspaceId, messageTs, nubabelUser.id);
      if (alreadyCaptured) {
        logger.debug("Feedback already captured for this message", { messageTs, userId: nubabelUser.id });
        return;
      }

      const originalMessage = await getBotMessageContent(client as WebClient, channel, messageTs);

      if (!originalMessage) {
        logger.warn("Could not retrieve bot message content", { channel, messageTs });
        return;
      }

      // Find execution ID if available
      let executionId: string | undefined;
      if (eventId) {
        const foundExecutionId = await findExecutionByEventId(eventId);
        if (foundExecutionId) {
          executionId = foundExecutionId;
        }
      }

      // Get thread_ts if this is in a thread
      let threadTs: string | undefined;
      try {
        const messageInfo = await client.conversations.history({
          channel,
          latest: messageTs,
          limit: 1,
          inclusive: true,
        });
        if (messageInfo.messages && messageInfo.messages.length > 0) {
          threadTs = messageInfo.messages[0].thread_ts;
        }
      } catch (error) {
        logger.debug("Could not retrieve thread_ts", { error });
      }

      // Capture the feedback
      await captureFeedback({
        organizationId: organization.id,
        userId: nubabelUser.id,
        executionId,
        slackWorkspaceId: workspaceId,
        slackChannelId: channel,
        slackThreadTs: threadTs,
        slackMessageTs: messageTs,
        feedbackType: "reaction",
        reaction,
        originalMessage,
        metadata: {
          sentiment,
          eventId: eventId || null,
        },
      });

      // Prompt user for correction text
      await promptForCorrection(
        client as WebClient,
        slackUserId,
        channel,
        threadTs || messageTs,
        messageTs,
      );

      logger.info("Feedback captured from Slack reaction", {
        reaction,
        sentiment,
        organizationId: organization.id,
        userId: nubabelUser.id,
        hasExecution: !!executionId,
      });
    } catch (error) {
      logger.error(
        "Slack reaction_added handler error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      // Don't throw - reaction handling should not block
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
  registerIdentityCommands(slackApp);

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
