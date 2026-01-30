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
import { ComfyUISource } from "../marketplace/services/sources/external/comfyui-source";
import { CivitAISource } from "../marketplace/services/sources/external/civitai-source";
import type {
  BaseExternalSource,
  ExternalSourceItem,
  SearchOptions,
} from "../marketplace/services/sources/external/types";

const router = Router();
const prisma = new PrismaClient();

// Singleton instances of external sources
let sources: Map<string, BaseExternalSource> | null = null;

/**
 * Initialize external sources (lazy singleton pattern)
 */
function getSources(): Map<string, BaseExternalSource> {
  if (!sources) {
    sources = new Map();

    // Initialize ComfyUI source
    const comfyui = new ComfyUISource();
    sources.set(comfyui.sourceId, comfyui);

    // Initialize CivitAI source
    const civitai = new CivitAISource({
      apiKey: process.env.CIVITAI_API_KEY,
    });
    sources.set(civitai.sourceId, civitai);

    logger.info("External sources initialized", {
      sources: Array.from(sources.keys()),
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
    try {
      const query = typeof req.query.q === "string" ? req.query.q : "";
      const sourcesParam = typeof req.query.sources === "string" ? req.query.sources : "all";
      const type = typeof req.query.type === "string" ? req.query.type : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

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

      logger.info("Marketplace hub search completed", {
        query,
        sources: sourcesSearched,
        totalResults: allItems.length,
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
    try {
      const { source: sourceId, itemId, config } = req.body;
      const orgId = getOrgId(req);
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

      // Get item details
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

      // Create marketplace extension record
      const extension = await prisma.marketplaceExtension.create({
        data: {
          organizationId: orgId,
          slug: `${sourceId}-${itemId}`.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
          name: item.name,
          description: item.description,
          version: item.version || "1.0.0",
          extensionType: item.type,
          category: item.tags?.[0] || "general",
          tags: item.tags || [],
          source: sourceId,
          format: "external",
          manifest: JSON.parse(
            JSON.stringify({
              externalSource: sourceId,
              externalId: itemId,
              installMethod: item.installMethod,
              installConfig: item.installConfig,
              rawData: item.rawData,
            }),
          ),
          isPublic: false,
          verified: false,
          status: "published",
          enabled: true,
          createdBy: userId,
        },
      });

      // Create installation record
      const installation = await prisma.extensionInstallation.create({
        data: {
          organizationId: orgId,
          extensionId: extension.id,
          version: extension.version,
          installedBy: userId,
          status: "active",
          autoUpdate: true,
          configOverrides: config ? JSON.parse(JSON.stringify(config)) : null,
        },
      });

      // Generate installation instructions
      const instructions = source.getInstallInstructions(item);

      logger.info("External item installed", {
        sourceId,
        itemId,
        extensionId: extension.id,
        orgId,
        userId,
      });

      res.status(201).json({
        success: true,
        data: {
          extensionId: extension.id,
          installationId: installation.id,
          instructions,
        },
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

      if (!request) {
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "request is required",
          },
        });
        return;
      }

      // TODO: Implement AI-powered recommendation system
      // For now, return empty recommendations
      logger.info("Tool recommendation requested", {
        request,
        hasContext: !!context,
      });

      res.json({
        success: true,
        data: {
          recommendations: [],
          message: "AI-powered recommendations coming soon",
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

export default router;
