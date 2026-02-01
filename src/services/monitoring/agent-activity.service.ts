import { EventEmitter } from "events";
import { Response } from "express";
import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { sseManager } from "../../api/sse";
import { runWithoutRLS } from "../../utils/async-context";

interface SSEClient {
  id: string;
  organizationId: string;
  res: Response;
}

interface TrackStartParams {
  organizationId: string;
  sessionId: string;
  agentType: string;
  agentName?: string;
  category?: string;
  inputData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
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

interface ActivityEvent {
  type:
    | "agent_started"
    | "agent_progress"
    | "agent_completed"
    | "agent_failed"
    | "agent_delegated"
    | "account_selected";
  activityId: string;
  organizationId: string;
  sessionId: string;
  agentType: string;
  agentName?: string;
  category?: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

class AgentActivityService extends EventEmitter {
  private clients: Map<string, SSEClient> = new Map();
  private slackService?: {
    postAgentStart: (params: TrackStartParams) => Promise<void>;
    updateAgentProgress: (activityId: string, update: ProgressUpdate) => Promise<void>;
    postAgentComplete: (activityId: string, result: CompletionResult) => Promise<void>;
  };

  constructor() {
    super();
  }

  setSlackService(service: typeof this.slackService) {
    this.slackService = service;
  }

  async trackStart(params: TrackStartParams): Promise<string> {
    // Run with RLS bypass - this is called from orchestration workers where
    // circuit breaker bypass is needed for reliable activity tracking
    const activity = await runWithoutRLS(() =>
      prisma.agentActivity.create({
        data: {
          organizationId: params.organizationId,
          sessionId: params.sessionId,
          agentType: params.agentType,
          agentName: params.agentName,
          category: params.category,
          status: "running",
          inputData: (params.inputData || {}) as any,
          metadata: (params.metadata || {}) as any,
        },
      })
    );

    const event: ActivityEvent = {
      type: "agent_started",
      activityId: activity.id,
      organizationId: params.organizationId,
      sessionId: params.sessionId,
      agentType: params.agentType,
      agentName: params.agentName,
      category: params.category,
      data: {
        inputData: params.inputData,
        metadata: params.metadata,
      },
      timestamp: (activity.startedAt ?? new Date()) as Date,
    };

    this.broadcast(params.organizationId, event);

    if (this.slackService) {
      await this.slackService.postAgentStart(params).catch((err) => {
        logger.error("Failed to post agent start to Slack", { error: String(err) });
      });
    }

    return activity.id;
  }

  async trackProgress(activityId: string, update: ProgressUpdate): Promise<void> {
    // Run with RLS bypass for circuit breaker bypass
    const activity = await runWithoutRLS(() =>
      prisma.agentActivity.findUnique({
        where: { id: activityId },
      })
    );

    if (!activity) {
      logger.warn("Activity not found for progress update", { activityId });
      return;
    }

    await runWithoutRLS(() =>
      prisma.agentActivity.update({
        where: { id: activityId },
        data: {
          metadata: {
            ...(activity.metadata as Record<string, unknown>),
            ...update.metadata,
            lastProgress: update.message,
            progressPercent: update.progress,
          },
        },
      })
    );

    const event: ActivityEvent = {
      type: "agent_progress",
      activityId,
      organizationId: activity.organizationId,
      sessionId: (activity.sessionId ?? "") as string,
      agentType: activity.agentType,
      agentName: activity.agentName || undefined,
      category: activity.category || undefined,
      data: {
        message: update.message,
        progress: update.progress,
        metadata: update.metadata,
      },
      timestamp: new Date(),
    };

    this.broadcast(activity.organizationId, event);

    if (this.slackService) {
      await this.slackService.updateAgentProgress(activityId, update).catch((err) => {
        logger.error("Failed to update agent progress in Slack", { error: String(err) });
      });
    }
  }

  async trackComplete(activityId: string, result: CompletionResult): Promise<void> {
    // Run with RLS bypass for circuit breaker bypass
    const activity = await runWithoutRLS(() =>
      prisma.agentActivity.findUnique({
        where: { id: activityId },
      })
    );

    if (!activity) {
      logger.warn("Activity not found for completion", { activityId });
      return;
    }

    const completedAt = new Date();
    const durationMs = activity.startedAt
      ? completedAt.getTime() - activity.startedAt.getTime()
      : 0;
    const status = result.errorMessage ? "failed" : "completed";

    await runWithoutRLS(() =>
      prisma.agentActivity.update({
        where: { id: activityId },
        data: {
          status,
          completedAt,
          durationMs,
          outputData: (result.outputData || {}) as any,
          errorMessage: result.errorMessage,
          metadata: {
            ...(activity.metadata as Record<string, unknown>),
            ...result.metadata,
          } as any,
        },
      })
    );

    const event: ActivityEvent = {
      type: result.errorMessage ? "agent_failed" : "agent_completed",
      activityId,
      organizationId: activity.organizationId,
      sessionId: (activity.sessionId ?? "") as string,
      agentType: activity.agentType,
      agentName: activity.agentName || undefined,
      category: activity.category || undefined,
      data: {
        durationMs,
        outputData: result.outputData,
        errorMessage: result.errorMessage,
        metadata: result.metadata,
      },
      timestamp: completedAt,
    };

    this.broadcast(activity.organizationId, event);

    if (this.slackService) {
      await this.slackService.postAgentComplete(activityId, result).catch((err) => {
        logger.error("Failed to post agent completion to Slack", { error: String(err) });
      });
    }
  }

  async trackDelegation(parentActivityId: string, childParams: TrackStartParams): Promise<string> {
    // Run with RLS bypass for circuit breaker bypass
    const childActivity = await runWithoutRLS(() =>
      prisma.agentActivity.create({
        data: {
          organizationId: childParams.organizationId,
          sessionId: childParams.sessionId,
          agentType: childParams.agentType,
          agentName: childParams.agentName,
          category: childParams.category,
          parentActivityId: parentActivityId,
          status: "running",
          startedAt: new Date(),
          inputData: (childParams.inputData || {}) as any,
          metadata: (childParams.metadata || {}) as any,
        },
      })
    );

    const event: ActivityEvent = {
      type: "agent_delegated",
      activityId: childActivity.id,
      organizationId: childParams.organizationId,
      sessionId: childParams.sessionId,
      agentType: childParams.agentType,
      agentName: childParams.agentName || undefined,
      category: childParams.category || undefined,
      data: {
        parentActivityId,
        inputData: childParams.inputData,
      },
      timestamp: childActivity.startedAt!,
    };

    this.broadcast(childParams.organizationId, event);

    return childActivity.id;
  }

  async trackAccountSelection(
    organizationId: string,
    sessionId: string,
    accountInfo: {
      accountId: string;
      nickname: string;
      usage: number;
      drainRate: number;
    },
  ): Promise<void> {
    const event: ActivityEvent = {
      type: "account_selected",
      activityId: accountInfo.accountId,
      organizationId,
      sessionId,
      agentType: "account_selector",
      data: {
        accountId: accountInfo.accountId,
        nickname: accountInfo.nickname,
        usage: accountInfo.usage,
        drainRate: accountInfo.drainRate,
      },
      timestamp: new Date(),
    };

    this.broadcast(organizationId, event);
  }

  addSSEClient(client: SSEClient): void {
    this.clients.set(client.id, client);
    logger.info("SSE client connected to agent activity stream", {
      clientId: client.id,
      organizationId: client.organizationId,
      totalClients: this.clients.size,
    });
  }

  removeSSEClient(clientId: string): void {
    this.clients.delete(clientId);
    logger.info("SSE client disconnected from agent activity stream", {
      clientId,
      totalClients: this.clients.size,
    });
  }

  private broadcast(organizationId: string, event: ActivityEvent): void {
    sseManager.sendToOrganization(organizationId, event.type, event);

    const orgClients = Array.from(this.clients.values()).filter(
      (c) => c.organizationId === organizationId,
    );

    orgClients.forEach((client) => {
      try {
        client.res.write(`event: ${event.type}\n`);
        client.res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch (err) {
        logger.error("Failed to send SSE event to client", {
          clientId: client.id,
          error: String(err),
        });
        this.removeSSEClient(client.id);
      }
    });

    logger.debug("Broadcasted agent activity event", {
      type: event.type,
      activityId: event.activityId,
      recipientCount: orgClients.length,
      viaRedis: true,
    });
  }

  async getRecent(organizationId: string, limit = 50): Promise<unknown[]> {
    // Run with RLS bypass for circuit breaker bypass
    const activities = await runWithoutRLS(() =>
      prisma.agentActivity.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: limit,
      })
    );

    return activities;
  }

  async getById(activityId: string): Promise<unknown | null> {
    // Run with RLS bypass for circuit breaker bypass
    return await runWithoutRLS(() =>
      prisma.agentActivity.findUnique({
        where: { id: activityId },
      })
    );
  }

  async getBySession(sessionId: string): Promise<unknown[]> {
    // Run with RLS bypass for circuit breaker bypass
    return await runWithoutRLS(() =>
      prisma.agentActivity.findMany({
        where: { sessionId },
        orderBy: { createdAt: "asc" },
      })
    );
  }

  sendHeartbeat(): void {
    this.clients.forEach((client) => {
      try {
        client.res.write(":heartbeat\n\n");
      } catch (err) {
        logger.error("Failed to send heartbeat to client", {
          clientId: client.id,
          error: String(err),
        });
        this.removeSSEClient(client.id);
      }
    });
  }

  shutdown(): void {
    logger.info("Shutting down AgentActivityService", { activeClients: this.clients.size });

    this.clients.forEach((client) => {
      try {
        client.res.write("event: shutdown\n");
        client.res.write('data: {"reason": "server_shutting_down"}\n\n');
        client.res.end();
      } catch (err) {
        logger.error("Error closing SSE client", { clientId: client.id, error: String(err) });
      }
    });

    this.clients.clear();
  }
}

export const agentActivityService = new AgentActivityService();

const heartbeatInterval = setInterval(() => agentActivityService.sendHeartbeat(), 30000);

export async function shutdownAgentActivityService(): Promise<void> {
  clearInterval(heartbeatInterval);
  agentActivityService.shutdown();
}
