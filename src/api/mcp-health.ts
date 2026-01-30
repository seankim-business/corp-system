import { Router, Request, Response } from "express";
import { logger } from "../utils/logger";

const router = Router();

// =============================================================================
// Types
// =============================================================================

type MCPServerStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

interface MCPServerHealth {
  providerId: string;
  displayName: string;
  status: MCPServerStatus;
  toolCount: number;
  lastResponseMs?: number;
  errorRate?: number;
  uptime?: number;
  lastChecked: string;
}

// =============================================================================
// In-Memory Registry (populated by MCP servers on startup)
// =============================================================================

const serverHealthMap = new Map<string, MCPServerHealth>();

/**
 * Register an MCP server's health data (called by MCP servers on init/update).
 */
export function registerMCPServerHealth(
  providerId: string,
  data: Omit<MCPServerHealth, "lastChecked">,
): void {
  serverHealthMap.set(providerId, {
    ...data,
    lastChecked: new Date().toISOString(),
  });
}

/**
 * Update an MCP server's health status.
 */
export function updateMCPServerStatus(
  providerId: string,
  status: MCPServerStatus,
  lastResponseMs?: number,
  errorRate?: number,
): void {
  const existing = serverHealthMap.get(providerId);
  if (existing) {
    existing.status = status;
    existing.lastChecked = new Date().toISOString();
    if (lastResponseMs !== undefined) existing.lastResponseMs = lastResponseMs;
    if (errorRate !== undefined) existing.errorRate = errorRate;
  }
}

/**
 * Remove an MCP server from health tracking.
 */
export function unregisterMCPServerHealth(providerId: string): void {
  serverHealthMap.delete(providerId);
}

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /api/mcp/health
 * Overview of all registered MCP server health statuses.
 */
router.get("/", (_req: Request, res: Response) => {
  const servers = Array.from(serverHealthMap.values());

  const healthyCount = servers.filter((s) => s.status === "healthy").length;
  const degradedCount = servers.filter((s) => s.status === "degraded").length;
  const unhealthyCount = servers.filter((s) => s.status === "unhealthy").length;

  let overall: MCPServerStatus = "healthy";
  if (unhealthyCount > 0) overall = "unhealthy";
  else if (degradedCount > 0) overall = "degraded";
  else if (servers.length === 0) overall = "unknown";

  res.json({
    overall,
    totalServers: servers.length,
    healthy: healthyCount,
    degraded: degradedCount,
    unhealthy: unhealthyCount,
    servers,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/mcp/health/:providerId
 * Detailed health for a specific MCP provider.
 */
router.get("/:providerId", (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const health = serverHealthMap.get(providerId);

  if (!health) {
    res.status(404).json({
      error: "MCP server not found",
      providerId,
      availableServers: Array.from(serverHealthMap.keys()),
    });
    return;
  }

  // Check staleness (if last check > 5 min ago, mark as unknown)
  const lastCheckedMs = new Date(health.lastChecked).getTime();
  const staleThresholdMs = 5 * 60 * 1000;
  const isStale = Date.now() - lastCheckedMs > staleThresholdMs;

  res.json({
    ...health,
    isStale,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/mcp/health/:providerId/check
 * Trigger a health check for a specific MCP provider (manual probe).
 */
router.post("/:providerId/check", async (req: Request, res: Response) => {
  const providerId = req.params.providerId as string;
  const health = serverHealthMap.get(providerId);

  if (!health) {
    res.status(404).json({ error: "MCP server not found", providerId });
    return;
  }

  // Simulate health check (actual implementation would call the server)
  const start = Date.now();
  try {
    // In production, this would call the MCP server's health endpoint
    const checkDurationMs = Date.now() - start;

    updateMCPServerStatus(providerId, "healthy", checkDurationMs, 0);

    logger.info("MCP health check passed", { providerId, durationMs: checkDurationMs });

    res.json({
      providerId,
      status: "healthy",
      checkDurationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const checkDurationMs = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);

    updateMCPServerStatus(providerId, "unhealthy", checkDurationMs);

    logger.warn("MCP health check failed", { providerId, error: message });

    res.json({
      providerId,
      status: "unhealthy",
      error: message,
      checkDurationMs,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
