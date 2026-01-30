import { Router, Request, Response } from "express";
import {
  searchMCPServers,
  getMCPServer,
  getRecommendedMCPServers,
} from "../services/mcp-registry/index";
import { logger } from "../utils/logger";

const router = Router();

/**
 * GET /api/mcp/servers?search=query&limit=20
 * Search MCP registry for servers
 */
router.get("/servers", async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string) || "";
    const limit = parseInt(req.query.limit as string) || 20;

    logger.info("Searching MCP servers", { search, limit });

    const results = await searchMCPServers(search, { limit });

    res.json({
      success: true,
      data: results.servers,
      count: results.metadata.count,
    });
  } catch (error) {
    logger.error("Error searching MCP servers", { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/mcp/recommended
 * Get recommended MCP servers list
 */
router.get("/recommended", async (_req: Request, res: Response) => {
  try {
    logger.info("Fetching recommended MCP servers");

    const recommended = await getRecommendedMCPServers();

    res.json({
      success: true,
      data: recommended,
      count: recommended.length,
    });
  } catch (error) {
    logger.error("Error fetching recommended MCP servers", { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/mcp/servers/:name
 * Get specific MCP server details
 */
router.get("/servers/:name", async (req: Request, res: Response) => {
  try {
    const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;

    logger.info("Fetching MCP server details", { name });

    const server = await getMCPServer(name);

    if (!server) {
      return res.status(404).json({
        success: false,
        error: `MCP server '${name}' not found`,
      });
    }

    return res.json({
      success: true,
      data: server,
    });
  } catch (error) {
    logger.error("Error fetching MCP server details", { error, name: req.params.name });
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
