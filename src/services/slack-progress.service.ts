import { WebClient } from "@slack/web-api";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";
import { getSlackIntegrationByOrg } from "../api/slack-integration";
import { PROGRESS_STAGES } from "../events/job-progress";

interface ProgressUpdateParams {
  eventId: string;
  organizationId: string;
  channel: string;
  threadTs: string;
  stage: string;
  percentage: number;
  metadata?: Record<string, any>;
}

const PROGRESS_MESSAGES: Record<string, { ko: string; en: string }> = {
  [PROGRESS_STAGES.STARTED]: { ko: "⏳ 분석 중...", en: "⏳ Analyzing..." },
  [PROGRESS_STAGES.VALIDATED]: { ko: "⏳ 분석 완료, 처리 중...", en: "⏳ Analysis complete, processing..." },
  [PROGRESS_STAGES.PROCESSING]: { ko: "⏳ 처리 중...", en: "⏳ Processing..." },
  [PROGRESS_STAGES.FINALIZING]: { ko: "⏳ 마무리 중...", en: "⏳ Finalizing..." },
  [PROGRESS_STAGES.COMPLETED]: { ko: "✅ 완료!", en: "✅ Done!" },
  [PROGRESS_STAGES.FAILED]: { ko: "❌ 실패", en: "❌ Failed" },
};

export class SlackProgressService {
  private async getSlackClient(organizationId: string): Promise<WebClient | null> {
    const integration = await getSlackIntegrationByOrg(organizationId);

    if (!integration?.botToken || !integration.enabled) {
      return null;
    }

    return new WebClient(integration.botToken);
  }

  async updateProgress(params: ProgressUpdateParams): Promise<void> {
    const { eventId, organizationId, channel, stage, percentage } = params;

    try {
      // Get the progress message timestamp from Redis
      const progressMessageTs = await redis.get(`slack:progress:${eventId}`);

      if (!progressMessageTs) {
        logger.debug("No progress message found for event", { eventId });
        return;
      }

      const client = await this.getSlackClient(organizationId);
      if (!client) {
        logger.debug("No Slack client available for organization", { organizationId });
        return;
      }

      const messages = PROGRESS_MESSAGES[stage] || { ko: "⏳ 처리 중...", en: "⏳ Processing..." };
      const progressBar = this.buildProgressBar(percentage);

      // Display both Korean and English
      const displayMessage = `${messages.ko} / ${messages.en}`;

      await client.chat.update({
        channel,
        ts: progressMessageTs,
        text: `${displayMessage} (${percentage}%)`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${displayMessage}\n${progressBar} *${percentage}%*`,
            },
          },
        ],
      });

      logger.debug("Progress message updated", {
        eventId,
        stage,
        percentage,
      });

      // Clean up Redis key when completed or failed
      if (stage === PROGRESS_STAGES.COMPLETED || stage === PROGRESS_STAGES.FAILED) {
        await redis.del(`slack:progress:${eventId}`);
      }
    } catch (error: any) {
      logger.error("Failed to update Slack progress message", {
        error: error.message,
        eventId,
        stage,
      });
      // Don't throw - progress updates should not block job processing
    }
  }

  private buildProgressBar(percentage: number): string {
    const filled = Math.floor(percentage / 10);
    const empty = 10 - filled;
    return "▓".repeat(filled) + "░".repeat(empty);
  }
}

let _instance: SlackProgressService | null = null;

export function getSlackProgressService(): SlackProgressService {
  if (!_instance) {
    _instance = new SlackProgressService();
  }
  return _instance;
}

export default SlackProgressService;
