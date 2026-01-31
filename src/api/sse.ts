import { Request, Response, Router } from "express";
import { EventEmitter } from "events";
import { authenticate } from "../middleware/auth.middleware";
import { logger } from "../utils/logger";
import { getQueueConnectionSync, releaseQueueConnection, withQueueConnection } from "../db/redis";

export const sseRouter = Router();

interface SSEClient {
  id: string;
  organizationId: string;
  userId: string;
  res: Response;
  lastEventId?: string;
  /** If set, only deliver events matching these types */
  eventFilter?: Set<string>;
  /** If set, only deliver events for this specific user */
  userFilter?: string;
}

class SSEManager extends EventEmitter {
  private clients: Map<string, SSEClient> = new Map();
  // Mark as long-lived: these connections are held for the service lifetime
  private redis = getQueueConnectionSync(true);
  private subscriber = getQueueConnectionSync(true);

  constructor() {
    super();

    this.subscriber.subscribe("sse:org", (err: unknown) => {
      if (err) {
        logger.error("Failed to subscribe SSE channel", { err: String(err) });
      }
    });

    this.subscriber.on("message", (_channel: string, message: string) => {
      try {
        const parsed = JSON.parse(message) as {
          organizationId: string;
          event: string;
          data: unknown;
          id?: string;
          userId?: string;
        };

        const orgClients = Array.from(this.clients.values()).filter(
          (c) => c.organizationId === parsed.organizationId,
        );

        orgClients.forEach((client) => {
          if (this.shouldDeliverEvent(client, parsed.event, parsed.userId)) {
            this.sendEvent(client, parsed.event, parsed.data, parsed.id);
          }
        });
      } catch (err) {
        logger.error("Failed to parse SSE pubsub message", { err: String(err) });
      }
    });
  }

  addClient(client: SSEClient) {
    this.clients.set(client.id, client);
    logger.info("SSE client connected", {
      clientId: client.id,
      organizationId: client.organizationId,
      totalClients: this.clients.size,
    });
  }

  removeClient(clientId: string) {
    this.clients.delete(clientId);
    logger.info("SSE client disconnected", {
      clientId,
      totalClients: this.clients.size,
    });
  }

  sendToUser(userId: string, event: string, data: any) {
    const userClients = Array.from(this.clients.values()).filter((c) => c.userId === userId);

    userClients.forEach((client) => {
      this.sendEvent(client, event, data);
    });

    return userClients.length;
  }

  sendToOrganization(organizationId: string, event: string, data: any) {
    const orgClients = Array.from(this.clients.values()).filter(
      (c) => c.organizationId === organizationId,
    );

    const streamKey = `sse:org:${organizationId}`;

    void this.redis
      .xadd(streamKey, "*", "event", event, "data", JSON.stringify(data))
      .then((id) => {
        const eventId = typeof id === "string" ? id : undefined;
        void this.redis.expire(streamKey, 3600);

        // Publish for multi-instance fanout
        void this.redis.publish(
          "sse:org",
          JSON.stringify({ organizationId, event, data, id: eventId }),
        );

        // Local delivery
        orgClients.forEach((client) => {
          this.sendEvent(client, event, data, eventId);
        });
      })
      .catch((err) => {
        logger.error("Failed to persist SSE event", { err: String(err) });
        orgClients.forEach((client) => {
          this.sendEvent(client, event, data);
        });
      });

    return orgClients.length;
  }

  /**
   * Check whether an event should be delivered to a client based on its filters.
   */
  private shouldDeliverEvent(client: SSEClient, eventType: string, eventUserId?: string): boolean {
    // Event type filter: if set, only deliver matching event types
    if (client.eventFilter && client.eventFilter.size > 0) {
      // Support prefix matching (e.g., "job:" matches "job:completed", "job:failed")
      const matches = client.eventFilter.has(eventType) ||
        Array.from(client.eventFilter).some((f) => f.endsWith(":*") && eventType.startsWith(f.slice(0, -1)));
      if (!matches) return false;
    }

    // User filter: if set, only deliver events for this specific user
    if (client.userFilter && eventUserId && client.userFilter !== eventUserId) {
      return false;
    }

    return true;
  }

  private sendEvent(client: SSEClient, event: string, data: any, id?: string) {
    if (id) {
      client.res.write(`id: ${id}\n`);
    }
    client.res.write(`event: ${event}\n`);
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  sendHeartbeat() {
    this.clients.forEach((client) => {
      client.res.write(":heartbeat\n\n");
    });
  }

  async shutdown() {
    logger.info("Shutting down SSE manager", { activeClients: this.clients.size });

    this.clients.forEach((client) => {
      try {
        client.res.write("event: shutdown\n");
        client.res.write('data: {"reason": "server_shutting_down"}\n\n');
        client.res.end();
      } catch (err) {
        logger.error("Error closing SSE client", { clientId: client.id, err: String(err) });
      }
    });
    this.clients.clear();

    if (this.subscriber) {
      try {
        await this.subscriber.unsubscribe("sse:org");
        logger.info("SSE Redis subscriber closed");
      } catch (err) {
        logger.error("Error closing SSE subscriber", { err: String(err) });
      }
    }

    releaseQueueConnection(this.redis);
    releaseQueueConnection(this.subscriber);
  }
}

export const sseManager = new SSEManager();

const heartbeatInterval = setInterval(() => sseManager.sendHeartbeat(), 30000);

export async function shutdownSSE(): Promise<void> {
  clearInterval(heartbeatInterval);
  await sseManager.shutdown();
}

sseRouter.get("/events", authenticate, async (req: Request, res: Response) => {
  // Redis health check before setting up SSE connection
  try {
    const redis = getQueueConnectionSync(false);
    await redis.ping();
  } catch (err) {
    logger.error("Redis unavailable for SSE setup", { error: String(err) });
    res.status(503).json({ error: "SSE temporarily unavailable" });
    return;
  }

  const clientId = `${req.user!.id}-${Date.now()}`;
  const lastEventIdHeader = req.header("Last-Event-ID");
  const lastEventId = typeof lastEventIdHeader === "string" ? lastEventIdHeader : undefined;

  // Parse event type filter from query params: ?events=job:completed,job:failed
  const eventsParam = req.query.events;
  let eventFilter: Set<string> | undefined;
  if (typeof eventsParam === "string" && eventsParam.length > 0) {
    eventFilter = new Set(eventsParam.split(",").map((e) => e.trim()).filter(Boolean));
  }

  // Parse user filter: ?userId=<id> — only receive events for a specific user
  const userFilterParam = req.query.userId;
  const userFilter = typeof userFilterParam === "string" ? userFilterParam : undefined;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  res.write(`event: connected\n`);
  res.write(`data: {"clientId": "${clientId}"}\n\n`);

  const client: SSEClient = {
    id: clientId,
    organizationId: req.organization!.id,
    userId: req.user!.id,
    res,
    lastEventId,
    eventFilter,
    userFilter,
  };

  sseManager.addClient(client);

  // Best-effort replay from Redis stream for organization events.
  if (lastEventId) {
    const streamKey = `sse:org:${client.organizationId}`;
    void withQueueConnection(
      (client) => client.xread("COUNT", 100, "STREAMS", streamKey, lastEventId) as Promise<any>,
    )
      .then((result: any) => {
        if (!result) return;
        const entries = result[0]?.[1] as Array<[string, string[]]> | undefined;
        if (!entries) return;
        for (const [id, fields] of entries) {
          const map: Record<string, string> = {};
          for (let i = 0; i < fields.length; i += 2) {
            map[fields[i]] = fields[i + 1];
          }
          const event = map.event || "message";
          const data = map.data ? JSON.parse(map.data) : {};
          res.write(`id: ${id}\n`);
          res.write(`event: ${event}\n`);
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        }
      })
      .catch(() => {
        // ignore
      });
  }

  req.on("close", () => {
    sseManager.removeClient(clientId);
  });
});

// =============================================================================
// SSE Fallback: Long-Polling Endpoint
// For clients that cannot maintain persistent SSE connections (firewalls,
// proxies, mobile networks). Clients poll periodically with ?since=<eventId>.
// =============================================================================

sseRouter.get("/events/poll", authenticate, async (req: Request, res: Response) => {
  const organizationId = req.organization!.id;
  const sinceId = typeof req.query.since === "string" ? req.query.since : "0-0";
  const limitParam = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 50;
  const limit = Math.min(Math.max(limitParam, 1), 200);

  // Parse event filter from query params
  const eventsParam = req.query.events;
  let eventFilter: Set<string> | undefined;
  if (typeof eventsParam === "string" && eventsParam.length > 0) {
    eventFilter = new Set(eventsParam.split(",").map((e) => e.trim()).filter(Boolean));
  }

  const streamKey = `sse:org:${organizationId}`;

  try {
    const rawResult = await withQueueConnection(
      (conn) => conn.xread("COUNT", limit, "STREAMS", streamKey, sinceId) as Promise<any>,
    );

    const events: Array<{ id: string; event: string; data: unknown; timestamp: string }> = [];

    if (rawResult) {
      const entries = rawResult[0]?.[1] as Array<[string, string[]]> | undefined;
      if (entries) {
        for (const [id, fields] of entries) {
          const map: Record<string, string> = {};
          for (let i = 0; i < fields.length; i += 2) {
            map[fields[i]] = fields[i + 1];
          }
          const event = map.event || "message";

          // Apply event filter if provided
          if (eventFilter && eventFilter.size > 0) {
            const matches = eventFilter.has(event) ||
              Array.from(eventFilter).some((f) => f.endsWith(":*") && event.startsWith(f.slice(0, -1)));
            if (!matches) continue;
          }

          const data = map.data ? JSON.parse(map.data) : {};
          // Extract timestamp from Redis stream ID (format: <millisecondTimestamp>-<sequence>)
          const ts = id.split("-")[0];
          events.push({
            id,
            event,
            data,
            timestamp: new Date(parseInt(ts, 10)).toISOString(),
          });
        }
      }
    }

    const lastEventId = events.length > 0 ? events[events.length - 1].id : sinceId;

    res.json({
      events,
      lastEventId,
      hasMore: events.length === limit,
      pollIntervalMs: events.length > 0 ? 1000 : 5000, // Faster polling when active
    });
  } catch (err) {
    logger.error("SSE polling error", { organizationId, error: String(err) });
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

sseRouter.get("/activity/stream", authenticate, async (req: Request, res: Response) => {
  const clientId = `activity-${req.user!.id}-${Date.now()}`;
  const lastEventIdHeader = req.header("Last-Event-ID");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  res.write(`event: connected\n`);
  res.write(`data: {"clientId": "${clientId}"}\n\n`);

  const client = {
    id: clientId,
    organizationId: req.organization!.id,
    res,
  };

  const { agentActivityService } = await import("../services/monitoring/agent-activity.service");
  agentActivityService.addSSEClient(client);

  if (lastEventIdHeader) {
    try {
      const recentActivities = await agentActivityService.getRecent(req.organization!.id, 100);
      res.write(`event: initial\n`);
      res.write(`data: ${JSON.stringify({ activities: recentActivities })}\n\n`);
    } catch (err) {
      logger.error("Failed to send initial activities", { error: String(err) });
    }
  }

  req.on("close", () => {
    agentActivityService.removeSSEClient(clientId);
  });
});
