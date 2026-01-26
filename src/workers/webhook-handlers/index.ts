import { WebhookEventData } from "../../queue/webhook.queue";
import { logger } from "../../utils/logger";

/**
 * Webhook Handler Interface
 *
 * These handlers are INTENTIONAL EXTENSION POINTS for company-specific business logic.
 *
 * The Nubabel Core provides webhook infrastructure (receiving, validating, queuing),
 * but business logic is left to extensions/customizations.
 *
 * Examples of what to implement:
 * - Trigger orchestration workflows based on external events
 * - Sync data between external systems and internal database
 * - Send notifications to users
 * - Update workflow execution status
 *
 * See: docs/planning/CORE_VS_EXTENSION.md for extension patterns
 * See: docs/IMPLEMENTATION_STATUS.md for extensibility points
 */
export interface WebhookHandler {
  canHandle(provider: string): boolean;
  handle(data: WebhookEventData): Promise<void>;
}

class SlackWebhookHandler implements WebhookHandler {
  canHandle(provider: string): boolean {
    return provider === "slack";
  }

  async handle(data: WebhookEventData): Promise<void> {
    logger.info("Processing Slack webhook", { eventId: data.eventId, eventType: data.eventType });

    switch (data.eventType) {
      case "url_verification":
        break;
      case "event_callback":
        await this.handleEventCallback(data);
        break;
      case "interactive_message":
        await this.handleInteractiveMessage(data);
        break;
      default:
        logger.warn("Unknown Slack event type", { eventType: data.eventType });
    }
  }

  private async handleEventCallback(data: WebhookEventData): Promise<void> {
    const event = data.payload?.event;
    if (!event) return;

    switch (event.type) {
      case "app_mention":
        logger.info("Slack app mention received", { user: event.user, channel: event.channel });
        break;
      case "message":
        if (event.channel_type === "im") {
          logger.info("Slack DM received", { user: event.user });
        }
        break;
    }
  }

  private async handleInteractiveMessage(data: WebhookEventData): Promise<void> {
    logger.info("Slack interactive message", { actionId: data.payload?.action_id });
  }
}

class GitHubWebhookHandler implements WebhookHandler {
  canHandle(provider: string): boolean {
    return provider === "github";
  }

  async handle(data: WebhookEventData): Promise<void> {
    logger.info("Processing GitHub webhook", { eventId: data.eventId, eventType: data.eventType });

    switch (data.eventType) {
      case "push":
        await this.handlePush(data);
        break;
      case "pull_request":
        await this.handlePullRequest(data);
        break;
      case "issues":
        await this.handleIssues(data);
        break;
      case "issue_comment":
        await this.handleIssueComment(data);
        break;
      default:
        logger.debug("Unhandled GitHub event type", { eventType: data.eventType });
    }
  }

  private async handlePush(data: WebhookEventData): Promise<void> {
    const { ref, commits, pusher } = data.payload || {};
    logger.info("GitHub push event", { ref, commitCount: commits?.length, pusher: pusher?.name });
  }

  private async handlePullRequest(data: WebhookEventData): Promise<void> {
    const { action, pull_request } = data.payload || {};
    logger.info("GitHub PR event", {
      action,
      prNumber: pull_request?.number,
      title: pull_request?.title,
    });
  }

  private async handleIssues(data: WebhookEventData): Promise<void> {
    const { action, issue } = data.payload || {};
    logger.info("GitHub issue event", { action, issueNumber: issue?.number, title: issue?.title });
  }

  private async handleIssueComment(data: WebhookEventData): Promise<void> {
    const { action, comment, issue } = data.payload || {};
    logger.info("GitHub comment event", {
      action,
      issueNumber: issue?.number,
      commentId: comment?.id,
    });
  }
}

class LinearWebhookHandler implements WebhookHandler {
  canHandle(provider: string): boolean {
    return provider === "linear";
  }

  async handle(data: WebhookEventData): Promise<void> {
    logger.info("Processing Linear webhook", { eventId: data.eventId, eventType: data.eventType });

    const { action, type } = data.payload || {};

    switch (type) {
      case "Issue":
        await this.handleIssue(action, data);
        break;
      case "Comment":
        await this.handleComment(action, data);
        break;
      case "Project":
        await this.handleProject(action, data);
        break;
      default:
        logger.debug("Unhandled Linear type", { type, action });
    }
  }

  private async handleIssue(action: string, data: WebhookEventData): Promise<void> {
    const issue = data.payload?.data;
    logger.info("Linear issue event", { action, issueId: issue?.id, title: issue?.title });
  }

  private async handleComment(action: string, data: WebhookEventData): Promise<void> {
    const comment = data.payload?.data;
    logger.info("Linear comment event", { action, commentId: comment?.id });
  }

  private async handleProject(action: string, data: WebhookEventData): Promise<void> {
    const project = data.payload?.data;
    logger.info("Linear project event", { action, projectId: project?.id, name: project?.name });
  }
}

class NotionWebhookHandler implements WebhookHandler {
  canHandle(provider: string): boolean {
    return provider === "notion";
  }

  async handle(data: WebhookEventData): Promise<void> {
    logger.info("Processing Notion webhook", { eventId: data.eventId, eventType: data.eventType });

    const { type, data: eventData } = data.payload || {};
    logger.info("Notion event", { type, pageId: eventData?.page_id });
  }
}

class GenericWebhookHandler implements WebhookHandler {
  canHandle(_provider: string): boolean {
    return true;
  }

  async handle(data: WebhookEventData): Promise<void> {
    logger.info("Processing generic webhook", {
      provider: data.provider,
      eventId: data.eventId,
      eventType: data.eventType,
    });
  }
}

const handlers: WebhookHandler[] = [
  new SlackWebhookHandler(),
  new GitHubWebhookHandler(),
  new LinearWebhookHandler(),
  new NotionWebhookHandler(),
  new GenericWebhookHandler(),
];

export async function routeWebhook(data: WebhookEventData): Promise<void> {
  for (const handler of handlers) {
    if (handler.canHandle(data.provider)) {
      await handler.handle(data);
      return;
    }
  }
}

export function getHandlerForProvider(provider: string): WebhookHandler | undefined {
  return handlers.find((h) => h.canHandle(provider));
}
