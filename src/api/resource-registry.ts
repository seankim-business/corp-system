/**
 * Resource Registry API Routes
 * Endpoints for managing external resource connections and mappings
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../middleware/validation.middleware";
import { Permission } from "../auth/rbac";
import { db as prisma } from "../db/client";
import { encrypt, decrypt } from "../utils/encryption";
import { logger } from "../utils/logger";
import {
  getProviderInfo,
  getProvider,
  parseResourceUrl,
  schemaDetectorService,
  syncService,
} from "../services/resource-registry";
import { ResourceProviderType, InternalResourceType, SyncDirection } from "@prisma/client";

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const createConnectionSchema = z.object({
  providerType: z.nativeEnum(ResourceProviderType),
  displayName: z.string().min(1).max(255),
  credentials: z.record(z.unknown()),
  connectionUrl: z.string().url().optional(),
});

const detectSchema = z.object({
  url: z.string().url().optional(),
  connectionId: z.string().uuid().optional(),
  resourceId: z.string().optional(),
  userDescription: z.string().optional(),
});

const createMappingSchema = z.object({
  connectionId: z.string().uuid(),
  externalResourceId: z.string().min(1).max(500),
  externalResourceName: z.string().min(1).max(500),
  internalType: z.nativeEnum(InternalResourceType),
  customTypeName: z.string().max(100).optional(),
  fieldMappings: z.record(z.string()).optional(),
  syncDirection: z.nativeEnum(SyncDirection).optional(),
  syncSchedule: z.string().max(100).optional(),
});

const updateMappingSchema = z.object({
  externalResourceName: z.string().max(500).optional(),
  internalType: z.nativeEnum(InternalResourceType).optional(),
  customTypeName: z.string().max(100).optional(),
  fieldMappings: z.record(z.string()).optional(),
  syncDirection: z.nativeEnum(SyncDirection).optional(),
  syncSchedule: z.string().max(100).optional(),
  isActive: z.boolean().optional(),
});

const querySchema = z.object({
  type: z.nativeEnum(InternalResourceType).optional(),
  connectionId: z.string().uuid().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

// ============================================================================
// Provider Endpoints
// ============================================================================

/**
 * GET /api/resource-registry/providers
 * List available resource providers
 */
router.get("/providers", requireAuth, async (_req: Request, res: Response) => {
  try {
    const providers = getProviderInfo();
    return res.json({ providers });
  } catch (error) {
    logger.error("Failed to list providers", {}, error instanceof Error ? error : undefined);
    return res.status(500).json({ error: "Failed to list providers" });
  }
});

// ============================================================================
// Connection Endpoints
// ============================================================================

/**
 * GET /api/resource-registry/connections
 * List connections for organization
 */
router.get(
  "/connections",
  requireAuth,
  requirePermission(Permission.INTEGRATION_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;

      const connections = await prisma.resourceProviderConnection.findMany({
        where: { organizationId },
        select: {
          id: true,
          providerType: true,
          displayName: true,
          status: true,
          lastValidatedAt: true,
          validationError: true,
          createdAt: true,
          _count: { select: { mappings: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return res.json({ connections });
    } catch (error) {
      logger.error("Failed to list connections", { organizationId: req.user?.organizationId }, error instanceof Error ? error : undefined);
      return res.status(500).json({ error: "Failed to list connections" });
    }
  }
);

/**
 * POST /api/resource-registry/connections
 * Create a new provider connection
 */
router.post(
  "/connections",
  requireAuth,
  requirePermission(Permission.INTEGRATION_MANAGE),
  validate({ body: createConnectionSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { providerType, displayName, credentials, connectionUrl } = req.body as z.infer<
        typeof createConnectionSchema
      >;

      // Encrypt sensitive credentials
      const encryptedCredentials: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(credentials)) {
        if (typeof value === "string" && (key.includes("token") || key.includes("secret") || key.includes("key"))) {
          encryptedCredentials[key] = `encrypted:${encrypt(value)}`;
        } else {
          encryptedCredentials[key] = value;
        }
      }

      // Validate connection
      const provider = getProvider(providerType);
      if (!provider) {
        return res.status(400).json({ error: `Provider ${providerType} not supported` });
      }

      const connection = await prisma.resourceProviderConnection.create({
        data: {
          organizationId,
          providerType,
          displayName,
          credentials: encryptedCredentials as any,
          connectionUrl,
          status: "pending",
        },
      });

      // Validate in background
      const decryptedCredentials: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(credentials)) {
        decryptedCredentials[key] = value;
      }

      try {
        const isValid = await provider.validateConnection({
          organizationId,
          connectionId: connection.id,
          credentials: decryptedCredentials,
          connectionUrl: connectionUrl || undefined,
        });

        await prisma.resourceProviderConnection.update({
          where: { id: connection.id },
          data: {
            status: isValid ? "active" : "error",
            lastValidatedAt: new Date(),
            validationError: isValid ? null : "Connection validation failed",
          },
        });
      } catch (validationError) {
        await prisma.resourceProviderConnection.update({
          where: { id: connection.id },
          data: {
            status: "error",
            validationError: validationError instanceof Error ? validationError.message : "Validation failed",
          },
        });
      }

      return res.status(201).json({
        connection: {
          id: connection.id,
          providerType: connection.providerType,
          displayName: connection.displayName,
          status: connection.status,
          createdAt: connection.createdAt,
        },
      });
    } catch (error) {
      logger.error("Failed to create connection", { organizationId: req.user?.organizationId }, error instanceof Error ? error : undefined);
      return res.status(500).json({ error: "Failed to create connection" });
    }
  }
);

/**
 * DELETE /api/resource-registry/connections/:id
 * Delete a connection
 */
router.delete(
  "/connections/:id",
  requireAuth,
  requirePermission(Permission.INTEGRATION_MANAGE),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      const connection = await prisma.resourceProviderConnection.findFirst({
        where: { id: id as string, organizationId },
      });

      if (!connection) {
        return res.status(404).json({ error: "Connection not found" });
      }

      await prisma.resourceProviderConnection.delete({ where: { id: id as string } });

      return res.json({ success: true });
    } catch (error) {
      logger.error("Failed to delete connection", { connectionId: req.params.id }, error instanceof Error ? error : undefined);
      return res.status(500).json({ error: "Failed to delete connection" });
    }
  }
);

// ============================================================================
// Detection Endpoints
// ============================================================================

/**
 * POST /api/resource-registry/detect
 * Detect resource type from URL or resource ID
 */
router.post(
  "/detect",
  requireAuth,
  requirePermission(Permission.INTEGRATION_READ),
  validate({ body: detectSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { url, connectionId, resourceId, userDescription } = req.body as z.infer<typeof detectSchema>;

      let provider;
      let parsedResourceId: string;
      let connection;

      // Parse URL if provided
      if (url) {
        const parsed = parseResourceUrl(url);
        if (!parsed) {
          return res.status(400).json({ error: "Could not identify provider from URL" });
        }
        provider = parsed.provider;
        parsedResourceId = parsed.resourceId;

        // Find or require connection for this provider
        connection = await prisma.resourceProviderConnection.findFirst({
          where: { organizationId, providerType: provider.providerType, status: "active" },
        });

        if (!connection) {
          return res.status(400).json({
            error: `No active connection found for ${provider.displayName}. Please create a connection first.`,
            provider: provider.providerType,
          });
        }
      } else if (connectionId && resourceId) {
        connection = await prisma.resourceProviderConnection.findFirst({
          where: { id: connectionId, organizationId },
        });

        if (!connection) {
          return res.status(404).json({ error: "Connection not found" });
        }

        provider = getProvider(connection.providerType);
        if (!provider) {
          return res.status(400).json({ error: `Provider ${connection.providerType} not supported` });
        }
        parsedResourceId = resourceId;
      } else {
        return res.status(400).json({ error: "Either url or connectionId+resourceId required" });
      }

      // Decrypt credentials
      const decryptedCredentials: Record<string, unknown> = {};
      const creds = connection.credentials as Record<string, unknown>;
      for (const [key, value] of Object.entries(creds)) {
        if (typeof value === "string" && value.startsWith("encrypted:")) {
          decryptedCredentials[key] = decrypt(value.replace("encrypted:", ""));
        } else {
          decryptedCredentials[key] = value;
        }
      }

      // Detect schema
      const schema = await provider.detectSchema(
        {
          organizationId,
          connectionId: connection.id,
          credentials: decryptedCredentials,
          connectionUrl: connection.connectionUrl || undefined,
        },
        parsedResourceId
      );

      // Get type suggestions
      const suggestions = await schemaDetectorService.detectResourceType(organizationId, schema, {
        userDescription,
      });

      return res.json({
        resourceId: parsedResourceId,
        provider: provider.providerType,
        connectionId: connection.id,
        schema,
        suggestions,
      });
    } catch (error) {
      logger.error("Failed to detect resource", { organizationId: req.user?.organizationId }, error instanceof Error ? error : undefined);
      return res.status(500).json({ error: "Failed to detect resource" });
    }
  }
);

/**
 * GET /api/resource-registry/connections/:id/resources
 * List resources from a connection
 */
router.get(
  "/connections/:id/resources",
  requireAuth,
  requirePermission(Permission.INTEGRATION_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const { cursor, limit } = req.query;

      const connection = await prisma.resourceProviderConnection.findFirst({
        where: { id: id as string, organizationId },
      });

      if (!connection) {
        return res.status(404).json({ error: "Connection not found" });
      }

      const provider = getProvider(connection.providerType);
      if (!provider) {
        return res.status(400).json({ error: `Provider ${connection.providerType} not supported` });
      }

      // Decrypt credentials
      const decryptedCredentials: Record<string, unknown> = {};
      const creds = connection.credentials as Record<string, unknown>;
      for (const [key, value] of Object.entries(creds)) {
        if (typeof value === "string" && value.startsWith("encrypted:")) {
          decryptedCredentials[key] = decrypt(value.replace("encrypted:", ""));
        } else {
          decryptedCredentials[key] = value;
        }
      }

      const resources = await provider.listResources(
        {
          organizationId,
          connectionId: connection.id,
          credentials: decryptedCredentials,
          connectionUrl: connection.connectionUrl || undefined,
        },
        {
          cursor: cursor as string | undefined,
          limit: limit ? parseInt(limit as string, 10) : undefined,
        }
      );

      return res.json(resources);
    } catch (error) {
      logger.error("Failed to list resources", { connectionId: req.params.id }, error instanceof Error ? error : undefined);
      return res.status(500).json({ error: "Failed to list resources" });
    }
  }
);

// ============================================================================
// Mapping Endpoints
// ============================================================================

/**
 * GET /api/resource-registry/mappings
 * List mappings for organization
 */
router.get(
  "/mappings",
  requireAuth,
  requirePermission(Permission.INTEGRATION_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { connectionId, type, active } = req.query;

      const where: {
        organizationId: string;
        connectionId?: string;
        internalType?: InternalResourceType;
        isActive?: boolean;
      } = { organizationId };

      if (connectionId) where.connectionId = Array.isArray(connectionId) ? connectionId[0] : connectionId;
      if (type) where.internalType = type as InternalResourceType;
      if (active !== undefined) where.isActive = active === "true";

      const mappings = await prisma.resourceMapping.findMany({
        where,
        include: {
          connection: {
            select: { id: true, providerType: true, displayName: true },
          },
          _count: { select: { linkedRecords: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return res.json({ mappings });
    } catch (error) {
      logger.error("Failed to list mappings", { organizationId: req.user?.organizationId }, error instanceof Error ? error : undefined);
      return res.status(500).json({ error: "Failed to list mappings" });
    }
  }
);

/**
 * POST /api/resource-registry/mappings
 * Create a new resource mapping
 */
router.post(
  "/mappings",
  requireAuth,
  requirePermission(Permission.INTEGRATION_MANAGE),
  validate({ body: createMappingSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const data = req.body as z.infer<typeof createMappingSchema>;

      // Verify connection belongs to org
      const connection = await prisma.resourceProviderConnection.findFirst({
        where: { id: data.connectionId, organizationId },
      });

      if (!connection) {
        return res.status(404).json({ error: "Connection not found" });
      }

      // Check for existing mapping
      const existing = await prisma.resourceMapping.findUnique({
        where: {
          connectionId_externalResourceId: {
            connectionId: data.connectionId,
            externalResourceId: data.externalResourceId,
          },
        },
      });

      if (existing) {
        return res.status(409).json({ error: "Mapping already exists for this resource" });
      }

      const mapping = await prisma.resourceMapping.create({
        data: {
          organizationId,
          connectionId: data.connectionId,
          externalResourceId: data.externalResourceId,
          externalResourceName: data.externalResourceName,
          internalType: data.internalType,
          customTypeName: data.customTypeName,
          fieldMappings: data.fieldMappings || {},
          syncDirection: data.syncDirection || "pull_only",
          syncSchedule: data.syncSchedule,
        },
        include: {
          connection: {
            select: { id: true, providerType: true, displayName: true },
          },
        },
      });

      return res.status(201).json({ mapping });
    } catch (error) {
      logger.error("Failed to create mapping", { organizationId: req.user?.organizationId }, error instanceof Error ? error : undefined);
      return res.status(500).json({ error: "Failed to create mapping" });
    }
  }
);

/**
 * PUT /api/resource-registry/mappings/:id
 * Update a mapping
 */
router.put(
  "/mappings/:id",
  requireAuth,
  requirePermission(Permission.INTEGRATION_MANAGE),
  validate({ body: updateMappingSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const data = req.body as z.infer<typeof updateMappingSchema>;

      const mapping = await prisma.resourceMapping.findFirst({
        where: { id: id as string, organizationId },
      });

      if (!mapping) {
        return res.status(404).json({ error: "Mapping not found" });
      }

      const updated = await prisma.resourceMapping.update({
        where: { id: id as string },
        data,
        include: {
          connection: {
            select: { id: true, providerType: true, displayName: true },
          },
        },
      });

      return res.json({ mapping: updated });
    } catch (error) {
      logger.error("Failed to update mapping", { mappingId: req.params.id }, error instanceof Error ? error : undefined);
      return res.status(500).json({ error: "Failed to update mapping" });
    }
  }
);

/**
 * DELETE /api/resource-registry/mappings/:id
 * Delete a mapping
 */
router.delete(
  "/mappings/:id",
  requireAuth,
  requirePermission(Permission.INTEGRATION_MANAGE),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;

      const mapping = await prisma.resourceMapping.findFirst({
        where: { id: id as string, organizationId },
      });

      if (!mapping) {
        return res.status(404).json({ error: "Mapping not found" });
      }

      await prisma.resourceMapping.delete({ where: { id: id as string } });

      return res.json({ success: true });
    } catch (error) {
      logger.error("Failed to delete mapping", { mappingId: req.params.id }, error instanceof Error ? error : undefined);
      return res.status(500).json({ error: "Failed to delete mapping" });
    }
  }
);

/**
 * POST /api/resource-registry/mappings/:id/sync
 * Trigger sync for a mapping
 */
router.post(
  "/mappings/:id/sync",
  requireAuth,
  requirePermission(Permission.INTEGRATION_MANAGE),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: currentUserId } = req.user!;
      const { id } = req.params;
      const { fullSync } = req.body || {};

      const mapping = await prisma.resourceMapping.findFirst({
        where: { id: id as string, organizationId },
      });

      if (!mapping) {
        return res.status(404).json({ error: "Mapping not found" });
      }

      const result = await syncService.syncMapping(id as string, `user:${currentUserId}`, { fullSync });

      return res.json({ result });
    } catch (error) {
      logger.error("Failed to sync mapping", { mappingId: req.params.id }, error instanceof Error ? error : undefined);
      return res.status(500).json({ error: "Failed to sync mapping" });
    }
  }
);

// ============================================================================
// Query Endpoints
// ============================================================================

/**
 * GET /api/resource-registry/query
 * Query resources across all mappings
 */
router.get(
  "/query",
  requireAuth,
  requirePermission(Permission.INTEGRATION_READ),
  validate({ query: querySchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { type, connectionId, search, limit = 50, cursor } = req.query as z.infer<typeof querySchema>;

      const where: {
        organizationId: string;
        mapping?: { internalType?: InternalResourceType; connectionId?: string };
        id?: { gt: string };
      } = { organizationId };

      if (type || connectionId) {
        where.mapping = {};
        if (type) where.mapping.internalType = type;
        if (connectionId) where.mapping.connectionId = connectionId;
      }

      if (cursor) {
        where.id = { gt: cursor };
      }

      const records = await prisma.resourceLinkedRecord.findMany({
        where,
        include: {
          mapping: {
            select: {
              id: true,
              externalResourceName: true,
              internalType: true,
              connection: {
                select: { providerType: true, displayName: true },
              },
            },
          },
        },
        take: (limit || 50) + 1,
        orderBy: { id: "asc" },
      });

      // Filter by search if provided
      let filteredRecords = records;
      if (search) {
        const searchLower = search.toLowerCase();
        filteredRecords = records.filter((r) => {
          const data = r.cachedData as Record<string, unknown>;
          return Object.values(data).some(
            (v) => typeof v === "string" && v.toLowerCase().includes(searchLower)
          );
        });
      }

      const hasMore = filteredRecords.length > (limit || 50);
      if (hasMore) {
        filteredRecords.pop();
      }

      return res.json({
        records: filteredRecords,
        hasMore,
        cursor: filteredRecords.length > 0 ? filteredRecords[filteredRecords.length - 1].id : undefined,
      });
    } catch (error) {
      logger.error("Failed to query resources", { organizationId: req.user?.organizationId }, error);
      return res.status(500).json({ error: "Failed to query resources" });
    }
  }
);

/**
 * GET /api/resource-registry/mappings/:id/records
 * Get linked records for a mapping
 */
router.get(
  "/mappings/:id/records",
  requireAuth,
  requirePermission(Permission.INTEGRATION_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const { cursor, limit, status } = req.query;

      const mapping = await prisma.resourceMapping.findFirst({
        where: { id, organizationId },
      });

      if (!mapping) {
        return res.status(404).json({ error: "Mapping not found" });
      }

      const result = await syncService.getLinkedRecords(id, {
        cursor: cursor as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        status: status as string | undefined,
      });

      return res.json(result);
    } catch (error) {
      logger.error("Failed to get linked records", { mappingId: req.params.id }, error);
      return res.status(500).json({ error: "Failed to get linked records" });
    }
  }
);

/**
 * GET /api/resource-registry/mappings/:id/history
 * Get sync history for a mapping
 */
router.get(
  "/mappings/:id/history",
  requireAuth,
  requirePermission(Permission.INTEGRATION_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const { limit } = req.query;

      const mapping = await prisma.resourceMapping.findFirst({
        where: { id, organizationId },
      });

      if (!mapping) {
        return res.status(404).json({ error: "Mapping not found" });
      }

      const history = await syncService.getSyncHistory(id, limit ? parseInt(limit as string, 10) : undefined);

      return res.json({ history });
    } catch (error) {
      logger.error("Failed to get sync history", { mappingId: req.params.id }, error);
      return res.status(500).json({ error: "Failed to get sync history" });
    }
  }
);

export default router;
