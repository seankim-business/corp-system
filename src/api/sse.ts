import { Request, Response, Router } from "express";
import { EventEmitter } from "events";
import { authenticate } from "../middleware/auth.middleware";
import { logger } from "../utils/logger";

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
    const userClients = Array.from(this.clients.values()).filter(
      (c) => c.userId === userId,
    );

    userClients.forEach((client) => {
      this.sendEvent(client.res, event, data);
    });

    return userClients.length;
  }

  sendToOrganization(organizationId: string, event: string, data: any) {
    const orgClients = Array.from(this.clients.values()).filter(
      (c) => c.organizationId === organizationId,
    );

    orgClients.forEach((client) => {
      this.sendEvent(client.res, event, data);
    });

    return orgClients.length;
  }

  private sendEvent(res: Response, event: string, data: any) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  sendHeartbeat() {
    this.clients.forEach((client) => {
      client.res.write(":heartbeat\n\n");
    });
  }
}

export const sseManager = new SSEManager();

setInterval(() => sseManager.sendHeartbeat(), 30000);

sseRouter.get("/events", authenticate, (req: Request, res: Response) => {
  const clientId = `${req.user!.id}-${Date.now()}`;

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
  };

  sseManager.addClient(client);

  req.on("close", () => {
    sseManager.removeClient(clientId);
  });
});
