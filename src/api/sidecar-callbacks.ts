import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db/client";
import { withQueueConnection } from "../db/redis";
import { executeNotionTool } from "../mcp-servers/notion";
import { executeLinearTool } from "../mcp-servers/linear";
import { executeGitHubTool } from "../mcp-servers/github";
import { getMCPConnectionsByProvider, getAccessTokenFromConfig } from "../services/mcp-registry";
import { logger } from "../utils/logger";
import { EventEmitter } from "events";

export const sidecarCallbacksRouter = Router();
export const progressEmitter = new EventEmitter();

// Internal API key authentication for sidecar endpoints
// This ensures only the sidecar service can access these routes
const SIDECAR_API_KEY = process.env.SIDECAR_API_KEY || "internal-sidecar-key";

function requireSidecarAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers["x-sidecar-api-key"];

  if (!apiKey || apiKey !== SIDECAR_API_KEY) {
    logger.warn("Unauthorized sidecar callback attempt", {
      ip: req.ip,
      path: req.path,
    });
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

// Apply sidecar auth to all routes
sidecarCallbacksRouter.use(requireSidecarAuth);

// Session state updates
sidecarCallbacksRouter.post("/sidecar/sessions/:sessionId/update", async (req, res) => {
  const { sessionId } = req.params;
  const { state, metadata } = req.body;

  try {
    await withQueueConnection(async (client) => {
      await client.hset(`session:${sessionId}`, "state", JSON.stringify(state));
    });

    const existingSession = await db.session.findUnique({
      where: { id: sessionId },
    });

    if (!existingSession) {
      return res.status(404).json({ error: "Session not found" });
    }

    await db.session.update({
      where: { id: sessionId },
      data: {
        state: {
          ...(existingSession.state as any),
          ...state,
        },
        metadata: {
          ...(existingSession.metadata as any),
          ...metadata,
        },
        updatedAt: new Date(),
      },
    });

    logger.info("Session state updated via sidecar callback", { sessionId, state });
    return res.json({ success: true });
  } catch (error) {
    logger.error("Failed to update session state", { sessionId, error });
    return res.status(500).json({ error: "Failed to update session state" });
  }
});

// MCP tool execution callback
sidecarCallbacksRouter.post("/sidecar/mcp/invoke", async (req, res) => {
  const { organizationId, provider, toolName, args } = req.body;

  try {
    // Validate required fields
    if (!organizationId || !provider || !toolName) {
      return res.status(400).json({
        error: "Missing required fields: organizationId, provider, toolName",
      });
    }

    // Get MCP connection for organization
    const connections = await getMCPConnectionsByProvider(organizationId, provider);

    if (connections.length === 0) {
      return res.status(404).json({
        error: `No ${provider} connection found for organization ${organizationId}`,
      });
    }

    const connection = connections[0];

    let result;
    switch (provider.toLowerCase()) {
      case "notion": {
        const accessToken = getAccessTokenFromConfig(connection.config as any);
        if (!accessToken) {
          throw new Error("No access token found for Notion connection");
        }
        result = await executeNotionTool(
          accessToken,
          toolName,
          args || {},
          organizationId,
          connection,
        );
        break;
      }
      case "linear": {
        const linearToken = getAccessTokenFromConfig(connection.config as any);
        if (!linearToken) {
          throw new Error("No access token found for Linear connection");
        }
        result = await executeLinearTool(
          linearToken,
          toolName,
          args || {},
          organizationId,
          connection,
        );
        break;
      }
      case "github": {
        const githubToken = getAccessTokenFromConfig(connection.config as any);
        if (!githubToken) {
          throw new Error("No access token found for GitHub connection");
        }
        result = await executeGitHubTool(
          githubToken,
          toolName,
          args || {},
          organizationId,
          connection,
        );
        break;
      }
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    logger.info("MCP tool executed via sidecar callback", {
      organizationId,
      provider,
      toolName,
    });

    return res.json({ result });
  } catch (error) {
    logger.error("Failed to execute MCP tool", {
      organizationId,
      provider,
      toolName,
      error,
    });
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to execute MCP tool",
    });
  }
});

// Progress updates (for real-time streaming)
sidecarCallbacksRouter.post("/sidecar/sessions/:sessionId/progress", async (req, res) => {
  const { sessionId } = req.params;
  const { progress } = req.body;

  try {
    await withQueueConnection(async (client) => {
      await client.publish(`session:${sessionId}:progress`, JSON.stringify(progress));
    });

    progressEmitter.emit(`session:${sessionId}:progress`, progress);

    logger.debug("Progress update received", { sessionId, progress });
    return res.json({ success: true });
  } catch (error) {
    logger.error("Failed to handle progress update", { sessionId, error });
    return res.status(500).json({ error: "Failed to handle progress update" });
  }
});

// SSE endpoint for real-time progress streaming
sidecarCallbacksRouter.get("/sidecar/sessions/:sessionId/stream", (req, res) => {
  const { sessionId } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: "connected", sessionId })}\n\n`);

  const listener = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  progressEmitter.on(`session:${sessionId}:progress`, listener);

  req.on("close", () => {
    progressEmitter.off(`session:${sessionId}:progress`, listener);
    logger.debug("SSE connection closed", { sessionId });
  });
});
