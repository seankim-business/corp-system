/**
 * Resource Registry MCP Provider
 * Provides tools for AI agents to query and interact with the Enterprise Resource Registry
 */

import { logger } from "../../utils/logger";
import { MCPTool, CallContext, ToolCallResult } from "../types";
import { db as prisma } from "../../db/client";
import { InternalResourceType } from "@prisma/client";

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface ResourceRegistryMCPProvider {
  name: string;
  getTools(): MCPTool[];
  executeTool(
    toolName: string,
    args: Record<string, unknown>,
    context: CallContext
  ): Promise<ToolCallResult>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDER_NAME = "resource_registry";

const DEFAULT_PERMISSIONS = {
  allowedAgents: ["all"],
};

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

function buildTools(): MCPTool[] {
  return [
    {
      name: "resource_registry_list_mappings",
      provider: PROVIDER_NAME,
      description:
        "List all resource mappings configured for the organization. Shows external resources (Notion, Google Sheets, etc.) mapped to internal types (goals, tasks, etc.).",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
              "vision",
              "mission",
              "goal",
              "objective",
              "key_result",
              "strategy",
              "business_model",
              "value_stream",
              "project",
              "task",
              "department",
              "position",
              "kpi",
              "custom",
            ],
            description: "Filter by internal resource type",
          },
          activeOnly: {
            type: "boolean",
            description: "Only return active mappings (default: true)",
          },
        },
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          mappings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                externalResourceName: { type: "string" },
                internalType: { type: "string" },
                provider: { type: "string" },
                lastSyncAt: { type: "string" },
                recordCount: { type: "number" },
              },
            },
          },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "resource_registry_query",
      provider: PROVIDER_NAME,
      description:
        "Query resources across all mappings by type. Returns cached data from external sources like Notion databases or Google Sheets.",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
              "vision",
              "mission",
              "goal",
              "objective",
              "key_result",
              "strategy",
              "business_model",
              "value_stream",
              "project",
              "task",
              "department",
              "position",
              "kpi",
              "custom",
            ],
            description: "Resource type to query",
          },
          search: {
            type: "string",
            description: "Search term to filter results",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 20, max: 100)",
          },
        },
        required: ["type"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          records: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                data: { type: "object" },
                source: { type: "string" },
                lastSyncAt: { type: "string" },
              },
            },
          },
          totalCount: { type: "number" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "resource_registry_get_record",
      provider: PROVIDER_NAME,
      description: "Get a specific record by ID from the resource registry.",
      inputSchema: {
        type: "object",
        properties: {
          recordId: {
            type: "string",
            description: "ID of the linked record",
          },
        },
        required: ["recordId"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          record: {
            type: "object",
            properties: {
              id: { type: "string" },
              data: { type: "object" },
              mapping: { type: "object" },
              lastSyncAt: { type: "string" },
            },
          },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "resource_registry_search",
      provider: PROVIDER_NAME,
      description:
        "Search across all resource types for matching records. Useful for finding relevant resources when the type is unknown.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
          types: {
            type: "array",
            items: { type: "string" },
            description: "Limit search to specific types (optional)",
          },
          limit: {
            type: "number",
            description: "Maximum results (default: 10)",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                type: { type: "string" },
                data: { type: "object" },
                relevance: { type: "number" },
              },
            },
          },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
  ];
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

async function executeListMappings(
  args: Record<string, unknown>,
  context: CallContext
): Promise<ToolCallResult> {
  const startTime = Date.now();
  const { organizationId } = context;
  const type = args.type as InternalResourceType | undefined;
  const activeOnly = args.activeOnly !== false;

  try {
    const where: {
      organizationId: string;
      internalType?: InternalResourceType;
      isActive?: boolean;
    } = { organizationId };

    if (type) where.internalType = type;
    if (activeOnly) where.isActive = true;

    const mappings = await prisma.resourceMapping.findMany({
      where,
      include: {
        connection: {
          select: { providerType: true, displayName: true },
        },
        _count: { select: { linkedRecords: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      success: true,
      data: {
        mappings: mappings.map((m) => ({
          id: m.id,
          externalResourceName: m.externalResourceName,
          internalType: m.internalType,
          provider: m.connection.providerType,
          providerName: m.connection.displayName,
          lastSyncAt: m.lastSyncAt?.toISOString(),
          recordCount: m._count.linkedRecords,
          isActive: m.isActive,
        })),
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (error) {
    logger.error("Failed to list mappings", { organizationId }, error instanceof Error ? error : undefined);
    return {
      success: false,
      error: {
        code: "RESOURCE_REGISTRY_LIST_MAPPINGS_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeQuery(
  args: Record<string, unknown>,
  context: CallContext
): Promise<ToolCallResult> {
  const startTime = Date.now();
  const { organizationId } = context;
  const type = args.type as InternalResourceType;
  const search = args.search as string | undefined;
  const limit = Math.min((args.limit as number) || 20, 100);

  try {
    const records = await prisma.resourceLinkedRecord.findMany({
      where: {
        organizationId,
        mapping: { internalType: type, isActive: true },
      },
      include: {
        mapping: {
          select: {
            externalResourceName: true,
            connection: { select: { providerType: true } },
          },
        },
      },
      take: limit * 2, // Fetch more for filtering
      orderBy: { lastSyncAt: "desc" },
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

    return {
      success: true,
      data: {
        records: filteredRecords.slice(0, limit).map((r) => ({
          id: r.id,
          data: r.cachedData,
          source: `${r.mapping.connection.providerType}: ${r.mapping.externalResourceName}`,
          lastSyncAt: r.lastSyncAt?.toISOString(),
        })),
        totalCount: filteredRecords.length,
        type,
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (error) {
    logger.error("Failed to query resources", { organizationId, type }, error instanceof Error ? error : undefined);
    return {
      success: false,
      error: {
        code: "RESOURCE_REGISTRY_QUERY_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeGetRecord(
  args: Record<string, unknown>,
  context: CallContext
): Promise<ToolCallResult> {
  const startTime = Date.now();
  const { organizationId } = context;
  const recordId = args.recordId as string;

  try {
    const record = await prisma.resourceLinkedRecord.findFirst({
      where: { id: recordId, organizationId },
      include: {
        mapping: {
          select: {
            id: true,
            externalResourceName: true,
            internalType: true,
            connection: { select: { providerType: true, displayName: true } },
          },
        },
      },
    });

    if (!record) {
      return {
        success: false,
        error: {
          code: "RESOURCE_REGISTRY_RECORD_NOT_FOUND",
          message: "Record not found",
        },
        metadata: { duration: Date.now() - startTime, cached: false },
      };
    }

    return {
      success: true,
      data: {
        record: {
          id: record.id,
          externalRecordId: record.externalRecordId,
          data: record.cachedData,
          mapping: {
            id: record.mapping.id,
            name: record.mapping.externalResourceName,
            type: record.mapping.internalType,
            provider: record.mapping.connection.providerType,
          },
          syncStatus: record.syncStatus,
          lastSyncAt: record.lastSyncAt?.toISOString(),
        },
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (error) {
    logger.error("Failed to get record", { recordId }, error instanceof Error ? error : undefined);
    return {
      success: false,
      error: {
        code: "RESOURCE_REGISTRY_GET_RECORD_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeSearch(
  args: Record<string, unknown>,
  context: CallContext
): Promise<ToolCallResult> {
  const startTime = Date.now();
  const { organizationId } = context;
  const query = args.query as string;
  const types = args.types as InternalResourceType[] | undefined;
  const limit = Math.min((args.limit as number) || 10, 50);

  try {
    const where: {
      organizationId: string;
      mapping?: { internalType?: { in: InternalResourceType[] }; isActive: boolean };
    } = {
      organizationId,
      mapping: { isActive: true },
    };

    if (types && types.length > 0) {
      where.mapping = { internalType: { in: types }, isActive: true };
    }

    const records = await prisma.resourceLinkedRecord.findMany({
      where,
      include: {
        mapping: {
          select: {
            internalType: true,
            externalResourceName: true,
            connection: { select: { providerType: true } },
          },
        },
      },
      take: limit * 5, // Fetch more for filtering
    });

    // Search and score results
    const queryLower = query.toLowerCase();
    const scored = records
      .map((r) => {
        const data = r.cachedData as Record<string, unknown>;
        const text = JSON.stringify(data).toLowerCase();
        const matches = (text.match(new RegExp(queryLower, "g")) || []).length;
        return { record: r, relevance: matches };
      })
      .filter((s) => s.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);

    return {
      success: true,
      data: {
        results: scored.map((s) => ({
          id: s.record.id,
          type: s.record.mapping.internalType,
          source: s.record.mapping.externalResourceName,
          data: s.record.cachedData,
          relevance: s.relevance,
        })),
        query,
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (error) {
    logger.error("Failed to search resources", { query }, error instanceof Error ? error : undefined);
    return {
      success: false,
      error: {
        code: "RESOURCE_REGISTRY_SEARCH_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

// ---------------------------------------------------------------------------
// Provider export
// ---------------------------------------------------------------------------

export const resourceRegistryProvider: ResourceRegistryMCPProvider = {
  name: PROVIDER_NAME,

  getTools(): MCPTool[] {
    return buildTools();
  },

  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    context: CallContext
  ): Promise<ToolCallResult> {
    switch (toolName) {
      case "resource_registry_list_mappings":
        return executeListMappings(args, context);
      case "resource_registry_query":
        return executeQuery(args, context);
      case "resource_registry_get_record":
        return executeGetRecord(args, context);
      case "resource_registry_search":
        return executeSearch(args, context);
      default:
        return {
          success: false,
          error: {
            code: "RESOURCE_REGISTRY_UNKNOWN_TOOL",
            message: `Unknown tool: ${toolName}`,
          },
          metadata: { duration: 0, cached: false },
        };
    }
  },
};
