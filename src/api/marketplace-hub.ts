/**
 * Marketplace Hub API Routes
 *
 * Provides endpoints for discovering, searching, and installing extensions
 * from external sources (ComfyUI, CivitAI, etc.)
 *
 * @module api/marketplace-hub
 */

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth } from "../middleware/auth.middleware";
import { logger } from "../utils/logger";
import { createAllSources } from "../marketplace/services/sources/external";
import type {
  BaseExternalSource,
  ExternalSourceItem,
  SearchOptions,
} from "../marketplace/services/sources/external/types";
import { ToolRecommender } from "../marketplace/services/tool-recommender";
import { InstallationExecutor } from "../marketplace/services/installation-executor";
import {
  InstallationPolicyChecker,
  getDefaultPolicy,
} from "../marketplace/types/installation-modes";
import { marketplaceAnalytics } from "../marketplace/services/marketplace-analytics";

const router = Router();
const prisma = new PrismaClient();

// Singleton instances of external sources
let sources: Map<string, BaseExternalSource> | null = null;

/**
 * Initialize external sources (lazy singleton pattern)
 * Uses createAllSources() factory to register all available sources:
 * - Smithery (MCP servers)
 * - MCP Registry (official registry)
 * - Glama (17,400+ servers)
 * - ComfyUI (workflows/extensions)
 * - CivitAI (AI models/workflows)
 * - LangChain Hub (prompts/chains)
 */
function getSources(): Map<string, BaseExternalSource> {
  if (!sources) {
    sources = new Map();

    // Initialize all sources with API keys from environment
    const allSources = createAllSources({
      smitheryApiKey: process.env.SMITHERY_API_KEY,
      civitaiApiKey: process.env.CIVITAI_API_KEY,
      langchainApiKey: process.env.LANGCHAIN_API_KEY,
    });

    // Register each source by its ID
    for (const source of allSources) {
      sources.set(source.sourceId, source);
    }

    logger.info("External sources initialized", {
      sources: Array.from(sources.keys()),
      count: sources.size,
    });
  }

  return sources;
}

/**
 * Get organization ID from authenticated request
 */
function getOrgId(req: Request): string {
  if (!req.user?.organizationId) {
    throw new Error("Organization ID not found in request");
  }
  return req.user.organizationId;
}

/**
 * GET /api/marketplace-hub/sources
 * List available external sources
 */
router.get("/sources", requireAuth, (_req: Request, res: Response) => {
  void (async () => {
    try {
      const sourcesMap = getSources();

      const sourcesList = Array.from(sourcesMap.values()).map((source) => ({
        id: source.sourceId,
        name: source.displayName,
        supportedTypes: source.supportedTypes,
        enabled: true,
      }));

      logger.info("External sources listed", {
        count: sourcesList.length,
      });

      res.json({
        success: true,
        data: {
          sources: sourcesList,
        },
      });
    } catch (error) {
      logger.error("Failed to list sources", {}, error as Error);
      res.status(500).json({
        error: {
          code: "LIST_SOURCES_FAILED",
          message: "Failed to list external sources",
        },
      });
    }
  })();
});

/**
 * GET /api/marketplace-hub/search
 * Search across selected external sources
 *
 * Query params:
 * - q: Search query (required)
 * - sources: Comma-separated source IDs (default: 'all')
 * - type: Extension type filter (optional)
 * - limit: Max results per source (default: 20)
 */
router.get("/search", requireAuth, (req: Request, res: Response) => {
  void (async () => {
    const startTime = Date.now();
    try {
      const query = typeof req.query.q === "string" ? req.query.q : "";
      const sourcesParam = typeof req.query.sources === "string" ? req.query.sources : "all";
      const type = typeof req.query.type === "string" ? req.query.type : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const orgId = getOrgId(req);

      if (!query) {
        res.status(400).json({
          error: {
            code: "MISSING_QUERY",
            message: "Search query (q) is required",
          },
        });
        return;
      }

      const sourcesMap = getSources();
      const selectedSources: BaseExternalSource[] = [];

      // Determine which sources to search
      if (sourcesParam === "all") {
        selectedSources.push(...Array.from(sourcesMap.values()));
      } else {
        const sourceIds = sourcesParam.split(",").map((s) => s.trim());
        for (const sourceId of sourceIds) {
          const source = sourcesMap.get(sourceId);
          if (source) {
            selectedSources.push(source);
          } else {
            logger.warn("Unknown source requested", { sourceId });
          }
        }
      }

      if (selectedSources.length === 0) {
        res.status(400).json({
          error: {
            code: "NO_SOURCES",
            message: "No valid sources specified",
          },
        });
        return;
      }

      // Build search options
      const searchOptions: SearchOptions = {
        query,
        limit,
        type: type as any,
      };

      // Search all selected sources in parallel
      const searchPromises = selectedSources.map(async (source) => {
        try {
          const result = await source.search(searchOptions);
          return {
            sourceId: source.sourceId,
            items: result.items,
          };
        } catch (error) {
          logger.error(
            "Source search failed",
            {
              sourceId: source.sourceId,
              query,
            },
            error as Error,
          );
          return {
            sourceId: source.sourceId,
            items: [],
          };
        }
      });

      const results = await Promise.all(searchPromises);

      // Combine results from all sources
      const allItems: ExternalSourceItem[] = [];
      const sourcesSearched: string[] = [];

      for (const result of results) {
        allItems.push(...result.items);
        sourcesSearched.push(result.sourceId);
      }

      const latencyMs = Date.now() - startTime;

      // Record search analytics
      await marketplaceAnalytics.recordSearch({
        orgId,
        query,
        sources: sourcesSearched,
        latencyMs,
        resultsCount: allItems.length,
      });

      logger.info("Marketplace hub search completed", {
        query,
        sources: sourcesSearched,
        totalResults: allItems.length,
        latencyMs,
      });

      res.json({
        success: true,
        data: {
          items: allItems,
          total: allItems.length,
          sources: sourcesSearched,
        },
      });
    } catch (error) {
      logger.error(
        "Marketplace hub search failed",
        {
          query: req.query.q,
        },
        error as Error,
      );
      res.status(500).json({
        error: {
          code: "SEARCH_FAILED",
          message: "Failed to search marketplace hub",
        },
      });
    }
  })();
});

/**
 * GET /api/marketplace-hub/item/:source/:itemId
 * Get specific item details from a source
 */
router.get("/item/:source/:itemId", requireAuth, (req: Request, res: Response) => {
  void (async () => {
    try {
      const sourceId = req.params.source as string;
      const itemId = req.params.itemId as string;

      const sourcesMap = getSources();
      const source = sourcesMap.get(sourceId);

      if (!source) {
        res.status(404).json({
          error: {
            code: "SOURCE_NOT_FOUND",
            message: `Source '${sourceId}' not found`,
          },
        });
        return;
      }

      const item = await source.getById(itemId);

      if (!item) {
        res.status(404).json({
          error: {
            code: "ITEM_NOT_FOUND",
            message: `Item '${itemId}' not found in source '${sourceId}'`,
          },
        });
        return;
      }

      logger.info("Marketplace hub item retrieved", {
        sourceId,
        itemId,
        itemName: item.name,
      });

      res.json({
        success: true,
        data: {
          item,
        },
      });
    } catch (error) {
      logger.error(
        "Failed to get item details",
        {
          source: req.params.source,
          itemId: req.params.itemId,
        },
        error as Error,
      );
      res.status(500).json({
        error: {
          code: "GET_ITEM_FAILED",
          message: "Failed to get item details",
        },
      });
    }
  })();
});

/**
 * POST /api/marketplace-hub/install
 * Install an item from an external source
 *
 * Body:
 * - source: Source ID (required)
 * - itemId: Item ID within source (required)
 * - config: Optional installation configuration
 */
router.post("/install", requireAuth, (req: Request, res: Response) => {
  void (async () => {
    let installSuccess = false;
    let sourceId: string | undefined;
    let itemId: string | undefined;
    let itemName: string | undefined;
    let orgId: string | undefined;

    try {
      const { source, itemId: itemIdParam, config } = req.body;
      sourceId = source;
      itemId = itemIdParam;
      orgId = getOrgId(req);
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "User ID not found",
          },
        });
        return;
      }

      if (!sourceId || !itemId) {
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "source and itemId are required",
          },
        });
        return;
      }

      const sourcesMap = getSources();
      const sourceInstance = sourcesMap.get(sourceId);

      if (!sourceInstance) {
        res.status(404).json({
          error: {
            code: "SOURCE_NOT_FOUND",
            message: `Source '${sourceId}' not found`,
          },
        });
        return;
      }

      // Get item details
      const item = await sourceInstance.getById(itemId);

      if (!item) {
        res.status(404).json({
          error: {
            code: "ITEM_NOT_FOUND",
            message: `Item '${itemId}' not found in source '${sourceId}'`,
          },
        });
        return;
      }

      itemName = item.name;

      // Check installation policy
      const policyChecker = new InstallationPolicyChecker();
      const policy = getDefaultPolicy();
      const decision = policyChecker.canInstall(policy, sourceId);

      if (!decision.allowed) {
        res.status(403).json({
          error: {
            code: "INSTALLATION_BLOCKED",
            message: `Installation from source '${sourceId}' is not allowed by organization policy`,
          },
        });
        return;
      }

      // Use InstallationExecutor
      const executor = new InstallationExecutor();
      const result = await executor.install(item, orgId, userId, config);

      installSuccess = true;

      logger.info("External item installed via executor", {
        sourceId,
        itemId,
        extensionId: result.extensionId,
        orgId,
        userId,
      });

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error(
        "Failed to install item",
        {
          source: req.body.source,
          itemId: req.body.itemId,
        },
        error as Error,
      );
      res.status(500).json({
        error: {
          code: "INSTALL_FAILED",
          message: "Failed to install item",
        },
      });
    } finally {
      // Record installation analytics
      if (orgId && sourceId && itemId && itemName) {
        await marketplaceAnalytics.recordInstallation({
          orgId,
          source: sourceId,
          itemId,
          itemName,
          mode: "manual",
          success: installSuccess,
        });
      }
    }
  })();
});

/**
 * DELETE /api/marketplace-hub/uninstall/:extensionId
 * Uninstall an extension
 */
router.delete("/uninstall/:extensionId", requireAuth, (req: Request, res: Response) => {
  void (async () => {
    try {
      const extensionId = req.params.extensionId as string;
      const orgId = getOrgId(req);

      // Find installation
      const installation = await prisma.extensionInstallation.findFirst({
        where: {
          extensionId,
          organizationId: orgId,
        },
      });

      if (!installation) {
        res.status(404).json({
          error: {
            code: "NOT_INSTALLED",
            message: "Extension is not installed",
          },
        });
        return;
      }

      // Delete installation
      await prisma.extensionInstallation.delete({
        where: {
          id: installation.id,
        },
      });

      logger.info("Extension uninstalled", {
        extensionId,
        orgId,
      });

      res.json({
        success: true,
        message: "Extension uninstalled successfully",
      });
    } catch (error) {
      logger.error(
        "Failed to uninstall extension",
        {
          extensionId: req.params.extensionId,
        },
        error as Error,
      );
      res.status(500).json({
        error: {
          code: "UNINSTALL_FAILED",
          message: "Failed to uninstall extension",
        },
      });
    }
  })();
});

/**
 * POST /api/marketplace-hub/recommend
 * Get AI-powered tool recommendations
 *
 * Body:
 * - request: User's request/need (required)
 * - context: Optional context information
 */
router.post("/recommend", requireAuth, (req: Request, res: Response) => {
  void (async () => {
    try {
      const { request, context } = req.body;
      const orgId = getOrgId(req);

      if (!request) {
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "request is required",
          },
        });
        return;
      }

      // Get installed tools for the organization
      const installations = await prisma.extensionInstallation.findMany({
        where: {
          organizationId: orgId,
          status: "active",
        },
        include: {
          extension: {
            select: {
              id: true,
              slug: true,
              name: true,
              extensionType: true,
              source: true,
            },
          },
        },
      });

      const installedTools = installations.map((inst) => inst.extension.id);

      // Create ToolRecommender with API keys
      const recommender = new ToolRecommender({
        smitheryApiKey: process.env.SMITHERY_API_KEY,
        civitaiApiKey: process.env.CIVITAI_API_KEY,
        langchainApiKey: process.env.LANGCHAIN_API_KEY,
      }, process.env.ANTHROPIC_API_KEY);

      // Get recommendations
      const recommendations = await recommender.recommendTools(request, {
        orgId,
        installedTools,
        userPreferences: context,
      });

      logger.info("Tool recommendations generated", {
        request,
        orgId,
        count: recommendations.length,
        hasContext: !!context,
      });

      res.json({
        success: true,
        data: {
          recommendations,
        },
      });
    } catch (error) {
      logger.error(
        "Failed to generate recommendations",
        {
          request: req.body.request,
        },
        error as Error,
      );
      res.status(500).json({
        error: {
          code: "RECOMMEND_FAILED",
          message: "Failed to generate recommendations",
        },
      });
    }
  })();
});

/**
 * GET /api/marketplace-hub/installed
 * List installed external extensions for organization
 */
router.get("/installed", requireAuth, (req: Request, res: Response) => {
  void (async () => {
    try {
      const orgId = getOrgId(req);

      const installations = await prisma.extensionInstallation.findMany({
        where: {
          organizationId: orgId,
        },
        include: {
          extension: {
            select: {
              id: true,
              slug: true,
              name: true,
              description: true,
              version: true,
              extensionType: true,
              category: true,
              tags: true,
              source: true,
              manifest: true,
              enabled: true,
            },
          },
        },
        orderBy: {
          installedAt: "desc",
        },
      });

      logger.info("Installed extensions listed", {
        orgId,
        count: installations.length,
      });

      res.json({
        success: true,
        data: {
          items: installations,
        },
      });
    } catch (error) {
      logger.error("Failed to list installed extensions", {}, error as Error);
      res.status(500).json({
        error: {
          code: "LIST_INSTALLED_FAILED",
          message: "Failed to list installed extensions",
        },
      });
    }
  })();
});

/**
 * GET /api/marketplace-hub/settings
 * Get organization marketplace settings
 */
router.get("/settings", requireAuth, (req: Request, res: Response) => {
  void (async () => {
    try {
      const orgId = getOrgId(req);

      let settings = await prisma.organizationMarketplaceSettings.findUnique({
        where: { organizationId: orgId },
      });

      // Create default settings if not exists
      if (!settings) {
        const defaultPolicy = getDefaultPolicy();
        settings = await prisma.organizationMarketplaceSettings.create({
          data: {
            organizationId: orgId,
            installationMode: defaultPolicy.mode,
            allowedSources: defaultPolicy.allowedSources || [],
            blockedSources: defaultPolicy.blockedSources || [],
            maxAutoInstalls: defaultPolicy.maxAutoInstalls || 5,
            requireReview: defaultPolicy.requireReview || false,
          },
        });
      }

      logger.info("Marketplace settings retrieved", { orgId });

      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      logger.error("Failed to get marketplace settings", {}, error as Error);
      res.status(500).json({
        error: {
          code: "GET_SETTINGS_FAILED",
          message: "Failed to get marketplace settings",
        },
      });
    }
  })();
});

/**
 * PUT /api/marketplace-hub/settings
 * Update organization marketplace settings
 *
 * Body:
 * - installationMode: Installation mode (manual/recommend/yolo)
 * - allowedSources: Array of allowed source IDs (empty = all allowed)
 * - blockedSources: Array of blocked source IDs
 */
router.put("/settings", requireAuth, (req: Request, res: Response) => {
  void (async () => {
    try {
      const orgId = getOrgId(req);
      const { installationMode, allowedSources, blockedSources } = req.body;

      // Validate installation mode if provided
      if (
        installationMode &&
        !["manual", "recommend", "yolo"].includes(installationMode)
      ) {
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid installation mode. Must be manual, recommend, or yolo",
          },
        });
        return;
      }

      const settings = await prisma.organizationMarketplaceSettings.upsert({
        where: { organizationId: orgId },
        create: {
          organizationId: orgId,
          installationMode: installationMode || "recommend",
          allowedSources: allowedSources || [],
          blockedSources: blockedSources || [],
        },
        update: {
          ...(installationMode && { installationMode }),
          ...(allowedSources !== undefined && { allowedSources }),
          ...(blockedSources !== undefined && { blockedSources }),
        },
      });

      logger.info("Marketplace settings updated", { orgId, installationMode });

      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      logger.error("Failed to update marketplace settings", {}, error as Error);
      res.status(500).json({
        error: {
          code: "UPDATE_SETTINGS_FAILED",
          message: "Failed to update marketplace settings",
        },
      });
    }
  })();
});

/**
 * GET /api/marketplace-hub/analytics/overview
 * Get analytics overview for organization
 *
 * Query params:
 * - days: Number of days to analyze (default: 30)
 */
router.get("/analytics/overview", requireAuth, (req: Request, res: Response) => {
  void (async () => {
    try {
      const orgId = getOrgId(req);
      const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;

      const overview = await marketplaceAnalytics.getOverview(orgId, days);

      res.json({
        success: true,
        data: overview,
      });
    } catch (error) {
      logger.error("Failed to get analytics overview", {}, error as Error);
      res.status(500).json({
        error: {
          code: "ANALYTICS_FAILED",
          message: "Failed to get analytics overview",
        },
      });
    }
  })();
});

/**
 * GET /api/marketplace-hub/analytics/installations
 * Get installation metrics for organization
 *
 * Query params:
 * - days: Number of days to analyze (default: 30)
 */
router.get("/analytics/installations", requireAuth, (req: Request, res: Response) => {
  void (async () => {
    try {
      const orgId = getOrgId(req);
      const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;

      const metrics = await marketplaceAnalytics.getInstallationMetrics(orgId, days);

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      logger.error("Failed to get installation metrics", {}, error as Error);
      res.status(500).json({
        error: {
          code: "ANALYTICS_FAILED",
          message: "Failed to get installation metrics",
        },
      });
    }
  })();
});

/**
 * GET /api/marketplace-hub/analytics/popular
 * Get popular tools for organization
 *
 * Query params:
 * - limit: Maximum number of tools to return (default: 10)
 */
router.get("/analytics/popular", requireAuth, (req: Request, res: Response) => {
  void (async () => {
    try {
      const orgId = getOrgId(req);
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

      const popularTools = await marketplaceAnalytics.getPopularTools(orgId, limit);

      res.json({
        success: true,
        data: {
          tools: popularTools,
        },
      });
    } catch (error) {
      logger.error("Failed to get popular tools", {}, error as Error);
      res.status(500).json({
        error: {
          code: "ANALYTICS_FAILED",
          message: "Failed to get popular tools",
        },
      });
    }
  })();
});

export default router;
