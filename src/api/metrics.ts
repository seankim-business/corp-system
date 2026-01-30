/**
 * Prometheus Metrics Endpoint
 *
 * Exposes GET /metrics for Prometheus scraping.
 * Returns all registered metrics plus process-level metrics
 * in Prometheus text exposition format.
 */

import { Router, Request, Response } from "express";
import { metricsRegistry } from "../services/metrics-exporter";
import { logger } from "../utils/logger";

const router = Router();

/**
 * GET /metrics
 *
 * Returns all metrics in Prometheus text exposition format.
 * No authentication required -- this endpoint is designed
 * to be scraped by a Prometheus server on an internal network.
 */
router.get("/metrics", (_req: Request, _res: Response) => {
  try {
    // Collect application metrics from the registry
    const appMetrics = metricsRegistry.collect();

    // Collect process-level metrics
    const processMetrics = collectProcessMetrics();

    const output = appMetrics + "\n" + processMetrics;

    _res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    _res.send(output);
  } catch (error) {
    logger.error("Failed to collect Prometheus metrics", { error });
    _res.status(500).send("# Failed to collect metrics\n");
  }
});

/**
 * Collect Node.js / process-level metrics in Prometheus text format.
 */
function collectProcessMetrics(): string {
  const lines: string[] = [];

  // Process uptime
  const uptimeSeconds = Math.floor(process.uptime());
  lines.push("# HELP process_uptime_seconds Process uptime in seconds");
  lines.push("# TYPE process_uptime_seconds gauge");
  lines.push(`process_uptime_seconds ${uptimeSeconds}`);

  // Heap used
  const mem = process.memoryUsage();
  lines.push("");
  lines.push("# HELP nodejs_heap_used_bytes Node.js heap memory used in bytes");
  lines.push("# TYPE nodejs_heap_used_bytes gauge");
  lines.push(`nodejs_heap_used_bytes ${mem.heapUsed}`);

  return lines.join("\n") + "\n";
}

export default router;
