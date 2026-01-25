import { App, LogLevel } from "@slack/bolt";
import { enqueueSlackEvent } from "../queue/slack-event.queue";
import {
  createSession,
  getSessionBySlackThread,
} from "../orchestrator/session-manager";
import {
  getUserBySlackId,
  getOrganizationBySlackWorkspace,
} from "../services/slack-service";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";

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

    await client.chat.postMessage({
      channel,
      thread_ts: thread_ts || ts,
      text: "🤔 Analyzing...",
    });

    const result = await orchestrate({
      userRequest: cleanedText,
      sessionId: session.id,
      organizationId: organization.id,
      userId: nubabelUser.id,
    });

    await say({
      text: formatResponse(result),
      thread_ts: thread_ts || ts,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;

    logger.error(
      "Slack mention handler error",
      {
        duration,
        error: error.message,
      },
      error,
    );

    metrics.increment("slack.error.handler_failed");
    metrics.timing("slack.mention.duration", duration, { status: "error" });

    await say({
      text: `❌ Error: ${error.message}`,
      thread_ts: event.thread_ts || event.ts,
    });
  } finally {
    const duration = Date.now() - startTime;
    metrics.timing("slack.mention.duration", duration);
  }
});

app.message(async ({ message, say }) => {
  if ("channel_type" in message && message.channel_type === "im") {
    await say("Hi! Mention me in a channel with @company-os to get started!");
  }
});

function formatResponse(result: OrchestrationResult): string {
  const emoji = getPersonaEmoji(result.metadata.category);
  return `${emoji} *[${result.metadata.category}]* ${result.output}`;
}

function getPersonaEmoji(category: string): string {
  const emojiMap: Record<string, string> = {
    "visual-engineering": "🎨",
    ultrabrain: "🧠",
    artistry: "✨",
    quick: "⚡",
    writing: "📝",
    "unspecified-low": "🤖",
    "unspecified-high": "🚀",
  };
  return emojiMap[category] || "🤖";
}

export async function startSlackBot() {
  await app.start();
  console.log("⚡️ Slack Bot is running!");
}

export default app;
