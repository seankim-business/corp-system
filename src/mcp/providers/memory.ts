/**
 * Memory MCP Provider
 *
 * Provides MCP tools for memory operations.
 * Agents can store, recall, and search memories across short-term and long-term storage.
 */

import { MCPTool, CallContext, ToolCallResult } from "../types";
import {
  longTermMemory,
  shortTermMemory,
  entityMemoryManager,
  contextOptimizer,
  memoryExtractor,
} from "../../services/memory";
import type { MemoryScope, MemoryType, MemoryImportance } from "../../services/memory/types";
import { logger } from "../../utils/logger";

const TOOLS: MCPTool[] = [
  {
    name: "memory__store",
    description: "Store a memory for future recall. Supports user, organization, or session scope.",
    inputSchema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "Unique key to identify the memory",
        },
        value: {
          type: "string",
          description: "The content to remember",
        },
        scope: {
          type: "string",
          description: "Memory scope: user, organization, or session",
          enum: ["user", "organization", "session"],
        },
        type: {
          type: "string",
          description: "Memory type: fact, preference, decision, or context",
          enum: ["fact", "preference", "decision", "context"],
        },
        importance: {
          type: "string",
          description: "Memory importance: low, medium, high, or critical",
          enum: ["low", "medium", "high", "critical"],
        },
        sessionId: {
          type: "string",
          description: "Session ID (required for session scope)",
        },
      },
      required: ["key", "value"],
    },
    outputSchema: {
      type: "object",
      properties: {
        memory: { type: "object" },
      },
    },
    provider: "memory",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "memory__recall",
    description: "Recall a specific memory by key",
    inputSchema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "The memory key to recall",
        },
        scope: {
          type: "string",
          description: "Memory scope: user, organization, or session",
          enum: ["user", "organization", "session"],
        },
        sessionId: {
          type: "string",
          description: "Session ID (required for session scope)",
        },
      },
      required: ["key"],
    },
    outputSchema: {
      type: "object",
      properties: {
        memory: { type: "object" },
      },
    },
    provider: "memory",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "memory__search",
    description: "Search memories by query text",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query",
        },
        scope: {
          type: "string",
          description: "Memory scope: user or organization",
          enum: ["user", "organization"],
        },
        types: {
          type: "array",
          items: { type: "string" },
          description: "Filter by memory types",
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default 20)",
        },
      },
      required: ["query"],
    },
    outputSchema: {
      type: "object",
      properties: {
        memories: {
          type: "array",
          items: { type: "object" },
        },
        entities: {
          type: "array",
          items: { type: "object" },
        },
      },
    },
    provider: "memory",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "memory__delete",
    description: "Delete a memory by ID",
    inputSchema: {
      type: "object",
      properties: {
        memoryId: {
          type: "string",
          description: "The memory ID to delete",
        },
      },
      required: ["memoryId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
      },
    },
    provider: "memory",
    requiresAuth: false,
    permissions: {
      allowedAgents: ["all"],
      requiresApproval: {
        condition: "always",
        approver: "admin",
      },
    },
  },
  {
    name: "memory__context",
    description: "Build optimized context for a query, combining relevant memories and entities",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The query to build context for",
        },
        maxTokens: {
          type: "number",
          description: "Maximum tokens for the context (default 2000)",
        },
        sessionId: {
          type: "string",
          description: "Session ID to include session context",
        },
      },
      required: ["query"],
    },
    outputSchema: {
      type: "object",
      properties: {
        context: { type: "object" },
        formatted: { type: "string" },
      },
    },
    provider: "memory",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "memory__list",
    description: "List memories for the current user or organization",
    inputSchema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          description: "Memory scope: user or organization",
          enum: ["user", "organization"],
        },
        type: {
          type: "string",
          description: "Filter by memory type",
          enum: ["fact", "preference", "decision", "context"],
        },
        importance: {
          type: "string",
          description: "Filter by importance",
          enum: ["low", "medium", "high", "critical"],
        },
        limit: {
          type: "number",
          description: "Maximum results (default 50)",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      properties: {
        memories: {
          type: "array",
          items: { type: "object" },
        },
      },
    },
    provider: "memory",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "memory__extract",
    description: "Extract memories from a conversation and store them automatically",
    inputSchema: {
      type: "object",
      properties: {
        conversation: {
          type: "array",
          items: {
            type: "object",
            properties: {
              role: { type: "string" },
              content: { type: "string" },
            },
          },
          description: "Array of conversation messages with role and content",
        },
        sessionId: {
          type: "string",
          description: "Session ID for context",
        },
      },
      required: ["conversation"],
    },
    outputSchema: {
      type: "object",
      properties: {
        memoriesStored: { type: "number" },
        entitiesStored: { type: "number" },
      },
    },
    provider: "memory",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "memory__entities_list",
    description: "List entities (people, projects, companies, products) in the organization",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Filter by entity type",
          enum: ["person", "project", "company", "product"],
        },
        limit: {
          type: "number",
          description: "Maximum results (default 50)",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      properties: {
        entities: {
          type: "array",
          items: { type: "object" },
        },
      },
    },
    provider: "memory",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "memory__entity_get",
    description: "Get details of a specific entity",
    inputSchema: {
      type: "object",
      properties: {
        entityId: {
          type: "string",
          description: "The entity ID to retrieve",
        },
      },
      required: ["entityId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        entity: { type: "object" },
      },
    },
    provider: "memory",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "memory__session_get",
    description: "Get all memories from a specific session",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: "The session ID to retrieve memories from",
        },
      },
      required: ["sessionId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        memories: { type: "object" },
      },
    },
    provider: "memory",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "memory__session_clear",
    description: "Clear all memories from a session",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: "The session ID to clear",
        },
      },
      required: ["sessionId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
      },
    },
    provider: "memory",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
];

interface StoreArgs {
  key: string;
  value: string;
  scope?: "user" | "organization" | "session";
  type?: MemoryType;
  importance?: MemoryImportance;
  sessionId?: string;
}

interface RecallArgs {
  key: string;
  scope?: "user" | "organization" | "session";
  sessionId?: string;
}

interface SearchArgs {
  query: string;
  scope?: "user" | "organization";
  types?: MemoryType[];
  limit?: number;
}

interface DeleteArgs {
  memoryId: string;
}

interface ContextArgs {
  query: string;
  maxTokens?: number;
  sessionId?: string;
}

interface ListArgs {
  scope?: "user" | "organization";
  type?: MemoryType;
  importance?: MemoryImportance;
  limit?: number;
}

interface ExtractArgs {
  conversation: Array<{ role: string; content: string }>;
  sessionId?: string;
}

interface EntitiesListArgs {
  type?: "person" | "project" | "company" | "product";
  limit?: number;
}

interface EntityGetArgs {
  entityId: string;
}

interface SessionArgs {
  sessionId: string;
}

export function createMemoryProvider() {
  return {
    name: "memory",

    getTools(): MCPTool[] {
      return TOOLS;
    },

    async executeTool(
      toolName: string,
      args: Record<string, unknown>,
      context: CallContext,
    ): Promise<ToolCallResult> {
      const startTime = Date.now();

      try {
        let result: unknown;
        const actualToolName = toolName.replace("memory__", "");

        switch (actualToolName) {
          case "store":
            result = await storeMemory(args as any, context);
            break;
          case "recall":
            result = await recallMemory(args as any, context);
            break;
          case "search":
            result = await searchMemory(args as any, context);
            break;
          case "delete":
            result = await deleteMemory(args as any, context);
            break;
          case "context":
            result = await buildContext(args as any, context);
            break;
          case "list":
            result = await listMemories(args as any, context);
            break;
          case "extract":
            result = await extractMemories(args as any, context);
            break;
          case "entities_list":
            result = await listEntities(args as any, context);
            break;
          case "entity_get":
            result = await getEntity(args as any, context);
            break;
          case "session_get":
            result = await getSessionMemories(args as any);
            break;
          case "session_clear":
            result = await clearSessionMemories(args as any);
            break;
          default:
            throw new Error(`Unknown tool: ${toolName}`);
        }

        return {
          success: true,
          data: result,
          metadata: {
            duration: Date.now() - startTime,
            cached: false,
          },
        };
      } catch (error) {
        logger.error(
          "Memory tool execution failed",
          { toolName, organizationId: context.organizationId },
          error as Error,
        );
        return {
          success: false,
          error: {
            code: "EXECUTION_ERROR",
            message: (error as Error).message,
          },
          metadata: {
            duration: Date.now() - startTime,
            cached: false,
          },
        };
      }
    },
  };
}

async function storeMemory(
  args: StoreArgs,
  context: CallContext,
): Promise<{ memory: unknown }> {
  const { key, value, scope = "user", type = "fact", importance = "medium", sessionId } = args;

  if (scope === "session") {
    if (!sessionId) {
      throw new Error("sessionId is required for session scope");
    }
    await shortTermMemory.remember(sessionId, key, value);
    return { memory: { key, value, scope: "session", sessionId } };
  }

  const scopeId = scope === "user" ? context.userId : context.organizationId;

  const memory = await longTermMemory.remember({
    organizationId: context.organizationId,
    scope: scope as MemoryScope,
    scopeId,
    type: type as MemoryType,
    key,
    value,
    importance: importance as MemoryImportance,
    sourceType: "explicit",
    sourceId: context.agentId,
  });

  logger.info("Memory stored via MCP", {
    organizationId: context.organizationId,
    scope,
    key,
    agentId: context.agentId,
  });

  return { memory };
}

async function recallMemory(
  args: RecallArgs,
  context: CallContext,
): Promise<{ memory: unknown | null }> {
  const { key, scope = "user", sessionId } = args;

  if (scope === "session") {
    if (!sessionId) {
      throw new Error("sessionId is required for session scope");
    }
    const value = await shortTermMemory.recall(sessionId, key);
    return { memory: value ? { key, value, scope: "session" } : null };
  }

  const scopeId = scope === "user" ? context.userId : context.organizationId;

  const memory = await longTermMemory.recall(
    context.organizationId,
    scope as MemoryScope,
    scopeId,
    key,
  );

  return { memory };
}

async function searchMemory(
  args: SearchArgs,
  context: CallContext,
): Promise<{ memories: unknown[]; entities: unknown[] }> {
  const { query, scope = "user", limit = 20 } = args;

  const scopeId = scope === "user" ? context.userId : context.organizationId;

  const memories = await longTermMemory.search(
    context.organizationId,
    scope as MemoryScope,
    scopeId,
    query,
    { limit },
  );

  const entities = await entityMemoryManager.findEntities(
    context.organizationId,
    query,
    { limit: 10 },
  );

  return { memories, entities };
}

async function deleteMemory(
  args: DeleteArgs,
  context: CallContext,
): Promise<{ success: boolean }> {
  const { memoryId } = args;

  await longTermMemory.forget(memoryId);

  logger.info("Memory deleted via MCP", {
    memoryId,
    organizationId: context.organizationId,
    agentId: context.agentId,
  });

  return { success: true };
}

async function buildContext(
  args: ContextArgs,
  context: CallContext,
): Promise<{ context: unknown; formatted: string }> {
  const { query, maxTokens = 2000, sessionId } = args;

  const builtContext = await contextOptimizer.buildContext(
    context.organizationId,
    context.userId,
    query,
    maxTokens,
    sessionId,
  );

  const formatted = contextOptimizer.formatContextForPrompt(builtContext);

  return { context: builtContext, formatted };
}

async function listMemories(
  args: ListArgs,
  context: CallContext,
): Promise<{ memories: unknown[] }> {
  const { scope = "user", type, importance, limit = 50 } = args;

  const scopeId = scope === "user" ? context.userId : context.organizationId;

  const memories = await longTermMemory.getAll(
    context.organizationId,
    scope as MemoryScope,
    scopeId,
    {
      types: type ? [type] : undefined,
      importance: importance ? [importance] : undefined,
      limit: Math.min(limit, 100),
    },
  );

  return { memories };
}

async function extractMemories(
  args: ExtractArgs,
  context: CallContext,
): Promise<{ memoriesStored: number; entitiesStored: number }> {
  const { conversation, sessionId } = args;

  const result = await memoryExtractor.extractAndStore(
    context.organizationId,
    context.userId,
    conversation as any,
    sessionId,
  );

  logger.info("Memories extracted via MCP", {
    organizationId: context.organizationId,
    memoriesStored: result.memoriesStored,
    entitiesStored: result.entitiesStored,
    agentId: context.agentId,
  });

  return result;
}

async function listEntities(
  args: EntitiesListArgs,
  context: CallContext,
): Promise<{ entities: unknown[] }> {
  const { type, limit = 50 } = args;

  let entities;
  if (type) {
    entities = await entityMemoryManager.getEntitiesByType(
      context.organizationId,
      type as any,
      Math.min(limit, 100),
    );
  } else {
    entities = await entityMemoryManager.getRecentEntities(
      context.organizationId,
      Math.min(limit, 100),
    );
  }

  return { entities };
}

async function getEntity(
  args: EntityGetArgs,
  context: CallContext,
): Promise<{ entity: unknown }> {
  const { entityId } = args;

  const entity = await entityMemoryManager.getEntity(entityId);

  if (!entity || entity.organizationId !== context.organizationId) {
    throw new Error("Entity not found");
  }

  return { entity };
}

async function getSessionMemories(
  args: SessionArgs,
): Promise<{ memories: Record<string, string> }> {
  const { sessionId } = args;

  const memories = await shortTermMemory.getSessionContext(sessionId);

  return { memories };
}

async function clearSessionMemories(
  args: SessionArgs,
): Promise<{ success: boolean }> {
  const { sessionId } = args;

  await shortTermMemory.clearSession(sessionId);

  return { success: true };
}
