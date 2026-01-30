import { WebClient } from "@slack/web-api";
import { db } from "../db/client";
import { logger } from "../utils/logger";

interface AgentStartParams {
  organizationId: string;
  sessionId: string;
  agentType: string;
  agentName?: string;
  category?: string;
  inputData?: Record<string, unknown>;
  slackChannelId?: string;
  slackThreadTs?: string;
}

interface ProgressUpdate {
  message?: string;
  progress?: number;
  metadata?: Record<string, unknown>;
}

interface CompletionResult {
  outputData?: Record<string, unknown>;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

const AGENT_EMOJIS: Record<string, string> = {
  sisyphus: "🏔️",
  oracle: "🔮",
  explore: "🔍",
  librarian: "📚",
  executor: "⚡",
  "executor-low": "⚡",
  "executor-high": "🚀",
  architect: "🏗️",
  designer: "🎨",
  qa_tester: "🧪",
  build_fixer: "🔧",
  writer: "✍️",
  ai_executor: "🤖",
  default: "🤖",
};

export class SlackAgentVisibilityService {
  private messageCache: Map<string, { channelId: string; ts: string }> = new Map();

  private async getSlackClient(organizationId: string): Promise<WebClient | null> {
    const integration = await db.slackIntegration.findFirst({
      where: { organizationId },
    });

    if (!integration?.botToken || !integration.enabled) {
      return null;
    }

    return new WebClient(integration.botToken);
  }

  private getAgentEmoji(agentType: string): string {
    return AGENT_EMOJIS[agentType.toLowerCase()] || AGENT_EMOJIS.default;
  }

  async postAgentStart(params: AgentStartParams): Promise<string | null> {
    const client = await this.getSlackClient(params.organizationId);
    if (!client || !params.slackChannelId) return null;

    const emoji = this.getAgentEmoji(params.agentType);
    const agentDisplay = params.agentName || params.agentType;

    try {
      const result = await client.chat.postMessage({
        channel: params.slackChannelId,
        thread_ts: params.slackThreadTs,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${emoji} *Agent Started*: \`${agentDisplay}\`\n_Processing your request..._`,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `📁 Category: \`${params.category || "default"}\` | 🔗 Session: \`${params.sessionId.slice(0, 8)}...\``,
              },
            ],
          },
        ],
        text: `${emoji} Agent ${agentDisplay} started`,
      });

      if (result.ts) {
        this.messageCache.set(params.sessionId, {
          channelId: params.slackChannelId,
          ts: result.ts,
        });

        const activities = await db.agentActivity.findMany({
          where: { sessionId: params.sessionId },
        });

        for (const activity of activities) {
          await db.agentActivity.update({
            where: { id: activity.id },
            data: {
              slackChannelId: params.slackChannelId,
              slackThreadTs: params.slackThreadTs,
              slackMessageTs: result.ts,
            },
          });
        }

        return result.ts;
      }

      return null;
    } catch (err) {
      logger.error("Failed to post agent start to Slack", {
        error: String(err),
        sessionId: params.sessionId,
      });
      return null;
    }
  }

  async updateAgentProgress(activityId: string, update: ProgressUpdate): Promise<void> {
    const activity = await db.agentActivity.findUnique({ where: { id: activityId } });
    if (!activity?.slackMessageTs || !activity.slackChannelId) return;

    const client = await this.getSlackClient(activity.organizationId);
    if (!client) return;

    const emoji = this.getAgentEmoji(activity.agentType);
    const progress = update.progress || 0;
    const progressBar =
      "▓".repeat(Math.floor(progress / 10)) + "░".repeat(10 - Math.floor(progress / 10));

    try {
      await client.chat.update({
        channel: activity.slackChannelId,
        ts: activity.slackMessageTs,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${emoji} *Agent Working*: \`${activity.agentName || activity.agentType}\`\n${update.message || "Processing..."}`,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${progressBar} *${progress}%*`,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `📁 Category: \`${activity.category || "default"}\``,
              },
            ],
          },
        ],
        text: `${emoji} Agent ${activity.agentType} progress: ${progress}%`,
      });
    } catch (err) {
      logger.error("Failed to update agent progress in Slack", {
        error: String(err),
        activityId,
      });
    }
  }

  async postAgentComplete(activityId: string, result: CompletionResult): Promise<void> {
    const activity = await db.agentActivity.findUnique({ where: { id: activityId } });
    if (!activity?.slackMessageTs || !activity.slackChannelId) return;

    const client = await this.getSlackClient(activity.organizationId);
    if (!client) return;

    const isError = !!result.errorMessage;
    const emoji = isError ? "❌" : "✅";
    const status = isError ? "Failed" : "Completed";
    const duration = activity.durationMs ? `${(activity.durationMs / 1000).toFixed(2)}s` : "N/A";

    try {
      await client.chat.update({
        channel: activity.slackChannelId,
        ts: activity.slackMessageTs,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${emoji} *Agent ${status}*: \`${activity.agentName || activity.agentType}\`${isError ? `\n\n_Error: ${result.errorMessage}_` : ""}`,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `⏱️ Duration: ${duration} | 📁 Category: \`${activity.category || "default"}\``,
              },
            ],
          },
        ],
        text: `${emoji} Agent ${activity.agentType} ${status.toLowerCase()}`,
      });

      this.messageCache.delete(activity.sessionId || "");
    } catch (err) {
      logger.error("Failed to post agent completion to Slack", {
        error: String(err),
        activityId,
      });
    }
  }

  async broadcastToChannel(
    organizationId: string,
    channelId: string,
    message: string,
    blocks?: any[],
  ): Promise<string | null> {
    const client = await this.getSlackClient(organizationId);
    if (!client) return null;

    try {
      const result = await client.chat.postMessage({
        channel: channelId,
        text: message,
        blocks,
      });

      return result.ts || null;
    } catch (err) {
      logger.error("Failed to broadcast to Slack channel", {
        error: String(err),
        channelId,
      });
      return null;
    }
  }
}

let _instance: SlackAgentVisibilityService | null = null;

export function getSlackAgentVisibilityService(): SlackAgentVisibilityService {
  if (!_instance) {
    _instance = new SlackAgentVisibilityService();
  }
  return _instance;
}

export default SlackAgentVisibilityService;
