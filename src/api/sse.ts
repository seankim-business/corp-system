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
}

class SSEManager extends EventEmitter {
  private clients: Map<string, SSEClient> = new Map();
  private redis = getQueueConnectionSync();
  private subscriber = getQueueConnectionSync();

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
        };

        const orgClients = Array.from(this.clients.values()).filter(
          (c) => c.organizationId === parsed.organizationId,
        );

        orgClients.forEach((client) => {
          this.sendEvent(client, parsed.event, parsed.data, parsed.id);
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

setInterval(() => sseManager.sendHeartbeat(), 30000);

export async function shutdownSSE(): Promise<void> {
  await sseManager.shutdown();
}

sseRouter.get("/events", authenticate, (req: Request, res: Response) => {
  const clientId = `${req.user!.id}-${Date.now()}`;
  const lastEventIdHeader = req.header("Last-Event-ID");
  const lastEventId = typeof lastEventIdHeader === "string" ? lastEventIdHeader : undefined;

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
