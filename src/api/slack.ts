import { App, LogLevel } from "@slack/bolt";
import { slackEventQueue } from "../queue/slack-event.queue";
import { createSession, getSessionBySlackThread } from "../orchestrator/session-manager";
import { getUserBySlackId, getOrganizationBySlackWorkspace } from "../services/slack-service";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";
import { randomUUID } from "crypto";

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: Boolean(process.env.SLACK_SOCKET_MODE || true),
  appToken: process.env.SLACK_APP_TOKEN,
  logLevel: (process.env.SLACK_LOG_LEVEL as LogLevel) || LogLevel.INFO,
});

app.event("app_mention", async ({ event, say, client }) => {
  const startTime = Date.now();

  try {
    const { user, text, channel, thread_ts, ts } = event;

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

    const nubabelUser = await getUserBySlackId(user);
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
      ts: thread_ts || ts,
      organizationId: organization.id,
      userId: nubabelUser.id,
      sessionId: session.id,
      eventId,
    });

    await say({
      text: `🤔 Processing your request...`,
      thread_ts: thread_ts || ts,
    });

    logger.info("Slack event enqueued", {
      eventId,
      user: nubabelUser.id,
      organization: organization.id,
    });

    metrics.increment("slack.mention.enqueued");
    metrics.timing("slack.mention.duration", Date.now() - startTime);
  } catch (error: any) {
    logger.error("Slack mention handler error", {
      error: error.message,
    });

    metrics.increment("slack.error.handler_failed");

    await say({
      text: `❌ Error: ${error.message}`,
      thread_ts: event.thread_ts || event.ts,
    });
  }
});

app.message(async ({ message, say, client }) => {
  if ("channel_type" in message && message.channel_type === "im") {
    const { user, text } = message as any;

    if (!user || !text) return;

    try {
      const nubabelUser = await getUserBySlackId(user);
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

      let session = await getSessionBySlackThread(message.channel);
      if (!session) {
        session = await createSession({
          userId: nubabelUser.id,
          organizationId: organization.id,
          source: "slack",
          metadata: {
            slackChannelId: message.channel,
            slackUserId: user,
          },
        });
      }

      const eventId = randomUUID();

      await slackEventQueue.enqueueEvent({
        type: "direct_message",
        channel: message.channel,
        user,
        text,
        ts: (message as any).ts,
        organizationId: organization.id,
        userId: nubabelUser.id,
        sessionId: session.id,
        eventId,
      });

      await say(`🤔 Processing your message...`);
    } catch (error: any) {
      logger.error("DM handler error", { error: error.message });
      await say(`Error: ${error.message}`);
    }
  }
});

app.command("/nubabel", async ({ command, ack, say }) => {
  await ack();

  try {
    const { user_id, text, channel_id, team_id } = command;

    const nubabelUser = await getUserBySlackId(user_id);
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
  } catch (error: any) {
    logger.error("Slash command error", { error: error.message });
    await say(`Error: ${error.message}`);
  }
});

export async function startSlackBot() {
  await app.start();
  console.log("⚡️ Slack Bot is running!");
}

export default app;
