/**
 * Pattern Analytics API
 *
 * Provides endpoints for accessing pattern optimizer metrics and statistics.
 * Part of E3-T3 (Pattern-based response optimization).
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { logger } from "../utils/logger";
import {
  getPatternApplicationStats,
  clearPatternCache,
} from "../services/pattern-optimizer";

const router = Router();

/**
 * GET /api/pattern-analytics/stats
 *
 * Get pattern application statistics for the organization.
 *
 * Response:
 * {
 *   totalPatterns: number,
 *   highConfidencePatterns: number,
 *   patternsByType: Record<string, number>,
 *   avgConfidence: number
 * }
 */
router.get(
  "/stats",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = (req as any).user?.organizationId;

      if (!organizationId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      const stats = await getPatternApplicationStats(organizationId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error(
        "Failed to get pattern statistics",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to retrieve pattern statistics",
      });
    }
  },
);

/**
 * POST /api/pattern-analytics/clear-cache
 *
 * Clear pattern cache for the organization.
 * Useful after approving new pattern suggestions.
 *
 * Body (optional):
 * {
 *   agentType?: string  // Clear cache for specific agent type only
 * }
 */
router.post(
  "/clear-cache",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = (req as any).user?.organizationId;

      if (!organizationId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      const { agentType } = req.body;

      clearPatternCache(organizationId, agentType);

      logger.info("Pattern cache cleared", {
        organizationId,
        agentType: agentType || "all",
      });

      res.json({
        success: true,
        message: agentType
          ? `Cache cleared for agent type: ${agentType}`
          : "Cache cleared for all agent types",
      });
    } catch (error) {
      logger.error(
        "Failed to clear pattern cache",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to clear pattern cache",
      });
    }
  },
);

export default router;
