/**
 * Long-term Memory Service
 *
 * Uses PostgreSQL (via Prisma) to store permanent memories.
 * Uses the Memory Prisma model which supports:
 * - type: episodic (events), semantic (facts), procedural (how-tos)
 * - content: the actual memory content
 * - embedding: JSON array for semantic similarity search
 * - importance: 0.0-1.0 score
 * - accessCount: how many times retrieved
 * - lastAccessedAt: timestamp for recency scoring
 */

import { db } from "../../db/client";
import { logger } from "../../utils/logger";
import type {
  Memory,
  CreateMemoryInput,
  UpdateMemoryInput,
  MemorySearchOptions,
  MemoryScope,
  MemoryType,
  MemoryImportance,
} from "./types";

// Map MemoryImportance to numeric values for the Prisma importance field (0.0-1.0)
const IMPORTANCE_TO_NUMERIC: Record<MemoryImportance, number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  critical: 1.0,
};

// Reverse mapping
function numericToImportance(value: number): MemoryImportance {
  if (value >= 0.9) return "critical";
  if (value >= 0.6) return "high";
  if (value >= 0.4) return "medium";
  return "low";
}

// Map MemoryType to Prisma type field
const MEMORY_TYPE_MAP: Record<MemoryType, string> = {
  fact: "semantic",
  preference: "semantic",
  decision: "episodic",
  context: "episodic",
};

// Map Prisma type back to our type (with key included)
function prismaTypeToMemoryType(prismaType: string, key: string): MemoryType {
  if (key.startsWith("decision")) return "decision";
  if (key.startsWith("pref")) return "preference";
  if (prismaType === "episodic") return "context";
  return "fact";
}

/**
 * Parse a compound key back to components
 */
function parseScopedKey(content: string): { scope: MemoryScope; scopeId: string; key: string; value: string } | null {
  try {
    const parsed = JSON.parse(content);
    return {
      scope: parsed.scope,
      scopeId: parsed.scopeId,
      key: parsed.key,
      value: parsed.value,
    };
  } catch {
    return null;
  }
}

export class LongTermMemory {
  /**
   * Store a new memory
   */
  async remember(input: CreateMemoryInput): Promise<Memory> {
    const prismaType = MEMORY_TYPE_MAP[input.type] || "semantic";
    const importance = IMPORTANCE_TO_NUMERIC[input.importance || "medium"];

    // Store scope, key, value in content as JSON for retrieval
    const content = JSON.stringify({
      scope: input.scope,
      scopeId: input.scopeId,
      key: input.key,
      value: input.value,
      sourceType: input.sourceType || "explicit",
      sourceId: input.sourceId,
    });

    try {
      const memory = await db.memory.create({
        data: {
          organizationId: input.organizationId,
          userId: input.scope === "user" ? input.scopeId : null,
          type: prismaType,
          content,
          importance,
          accessCount: 0,
          lastAccessedAt: new Date(),
        },
      });

      logger.debug("Created long-term memory", {
        id: memory.id,
        organizationId: input.organizationId,
        scope: input.scope,
        key: input.key,
        type: input.type,
      });

      return this.buildMemory(memory, input);
    } catch (error) {
      logger.error("Failed to create long-term memory", {
        input,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Upsert a memory (create or update)
   */
  async upsert(input: CreateMemoryInput): Promise<Memory> {
    // Try to find existing memory with same scope/key
    const existing = await this.recall(
      input.organizationId,
      input.scope,
      input.scopeId,
      input.key,
    );

    if (existing) {
      // Update existing
      return this.update(existing.id, {
        value: input.value,
        importance: input.importance,
        expiresAt: input.expiresAt,
      });
    }

    // Create new
    return this.remember(input);
  }

  /**
   * Recall a specific memory by key
   */
  async recall(
    organizationId: string,
    scope: MemoryScope,
    scopeId: string,
    key: string,
  ): Promise<Memory | null> {
    try {
      // Search by content JSON containing the key
      const memories = await db.memory.findMany({
        where: {
          organizationId,
          ...(scope === "user" ? { userId: scopeId } : {}),
        },
        take: 100, // Limit search space
      });

      for (const memory of memories) {
        const parsed = parseScopedKey(memory.content);
        if (
          parsed &&
          parsed.scope === scope &&
          parsed.scopeId === scopeId &&
          parsed.key === key
        ) {
          // Update access metrics
          await this.updateAccessMetrics(memory.id);

          return this.buildMemoryFromPrisma(memory, parsed);
        }
      }

      return null;
    } catch (error) {
      logger.error("Failed to recall memory", {
        organizationId,
        scope,
        scopeId,
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Search memories by query (key or value substring match)
   */
  async search(
    organizationId: string,
    scope: MemoryScope,
    scopeId: string,
    query: string,
    options: MemorySearchOptions = {},
  ): Promise<Memory[]> {
    const { limit = 20, types, importance: importanceFilter } = options;

    try {
      const memories = await db.memory.findMany({
        where: {
          organizationId,
          ...(scope === "user" ? { userId: scopeId } : {}),
          ...(importanceFilter
            ? {
                importance: {
                  gte: Math.min(...importanceFilter.map((i) => IMPORTANCE_TO_NUMERIC[i])),
                },
              }
            : {}),
        },
        orderBy: [{ importance: "desc" }, { lastAccessedAt: "desc" }],
        take: limit * 3, // Fetch more to filter
      });

      const queryLower = query.toLowerCase();
      const results: Memory[] = [];

      for (const memory of memories) {
        const parsed = parseScopedKey(memory.content);
        if (!parsed || parsed.scope !== scope || parsed.scopeId !== scopeId) {
          continue;
        }

        // Filter by type if specified
        if (types && types.length > 0) {
          const memoryType = prismaTypeToMemoryType(memory.type, parsed.key);
          if (!types.includes(memoryType)) continue;
        }

        // Search in key and value
        const matches =
          parsed.key.toLowerCase().includes(queryLower) ||
          parsed.value.toLowerCase().includes(queryLower);

        if (matches) {
          results.push(this.buildMemoryFromPrisma(memory, parsed));
          if (results.length >= limit) break;
        }
      }

      // Update access metrics for found memories
      for (const result of results) {
        this.updateAccessMetrics(result.id).catch(() => {});
      }

      return results;
    } catch (error) {
      logger.error("Failed to search memories", {
        organizationId,
        scope,
        scopeId,
        query,
        options,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get all memories for a scope
   */
  async getAll(
    organizationId: string,
    scope: MemoryScope,
    scopeId: string,
    options: MemorySearchOptions = {},
  ): Promise<Memory[]> {
    const { limit = 100, types, importance: importanceFilter } = options;

    try {
      const memories = await db.memory.findMany({
        where: {
          organizationId,
          ...(scope === "user" ? { userId: scopeId } : {}),
          ...(importanceFilter
            ? {
                importance: {
                  gte: Math.min(...importanceFilter.map((i) => IMPORTANCE_TO_NUMERIC[i])),
                },
              }
            : {}),
        },
        orderBy: [{ importance: "desc" }, { lastAccessedAt: "desc" }],
        take: limit * 2,
      });

      const results: Memory[] = [];

      for (const memory of memories) {
        const parsed = parseScopedKey(memory.content);
        if (!parsed || parsed.scope !== scope || parsed.scopeId !== scopeId) {
          continue;
        }

        // Filter by type if specified
        if (types && types.length > 0) {
          const memoryType = prismaTypeToMemoryType(memory.type, parsed.key);
          if (!types.includes(memoryType)) continue;
        }

        results.push(this.buildMemoryFromPrisma(memory, parsed));
        if (results.length >= limit) break;
      }

      return results;
    } catch (error) {
      logger.error("Failed to get all memories", {
        organizationId,
        scope,
        scopeId,
        options,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Update an existing memory
   */
  async update(id: string, input: UpdateMemoryInput): Promise<Memory> {
    try {
      const existing = await db.memory.findUnique({ where: { id } });
      if (!existing) {
        throw new Error(`Memory not found: ${id}`);
      }

      const parsed = parseScopedKey(existing.content);
      if (!parsed) {
        throw new Error(`Invalid memory content: ${id}`);
      }

      // Update content if value changed
      let newContent = existing.content;
      if (input.value !== undefined) {
        newContent = JSON.stringify({
          ...parsed,
          value: input.value,
        });
      }

      const memory = await db.memory.update({
        where: { id },
        data: {
          content: newContent,
          ...(input.importance !== undefined && {
            importance: IMPORTANCE_TO_NUMERIC[input.importance],
          }),
          lastAccessedAt: new Date(),
        },
      });

      const updatedParsed = parseScopedKey(memory.content)!;
      return this.buildMemoryFromPrisma(memory, updatedParsed);
    } catch (error) {
      logger.error("Failed to update memory", {
        id,
        input,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Delete a memory
   */
  async forget(id: string): Promise<void> {
    try {
      await db.memory.delete({ where: { id } });
      logger.debug("Deleted memory", { id });
    } catch (error) {
      logger.error("Failed to delete memory", {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Delete all memories for a scope
   */
  async forgetAll(
    organizationId: string,
    scope: MemoryScope,
    scopeId: string,
  ): Promise<number> {
    try {
      // First find all memories for this scope
      const memories = await db.memory.findMany({
        where: {
          organizationId,
          ...(scope === "user" ? { userId: scopeId } : {}),
        },
      });

      const idsToDelete: string[] = [];
      for (const memory of memories) {
        const parsed = parseScopedKey(memory.content);
        if (parsed && parsed.scope === scope && parsed.scopeId === scopeId) {
          idsToDelete.push(memory.id);
        }
      }

      if (idsToDelete.length > 0) {
        await db.memory.deleteMany({
          where: {
            id: { in: idsToDelete },
          },
        });
      }

      logger.debug("Deleted all memories for scope", {
        organizationId,
        scope,
        scopeId,
        count: idsToDelete.length,
      });

      return idsToDelete.length;
    } catch (error) {
      logger.error("Failed to delete all memories", {
        organizationId,
        scope,
        scopeId,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Get relevant memories for a query (for context building)
   * Uses importance, recency, and keyword matching to rank memories
   */
  async getRelevantMemories(
    organizationId: string,
    userId: string,
    query: string,
    maxTokens: number = 1000,
  ): Promise<Memory[]> {
    try {
      // Get memories for user scope and organization scope
      const memories = await db.memory.findMany({
        where: {
          organizationId,
          OR: [{ userId }, { userId: null }],
        },
        orderBy: [{ importance: "desc" }, { lastAccessedAt: "desc" }],
        take: 200, // Get a larger pool to rank
      });

      const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const scored: Array<{ memory: Memory; score: number; tokens: number }> = [];

      for (const memory of memories) {
        const parsed = parseScopedKey(memory.content);
        if (!parsed) continue;

        const memoryObj = this.buildMemoryFromPrisma(memory, parsed);

        // Calculate relevance score
        let score = 0;

        // Importance score (0-40 points)
        score += memory.importance * 40;

        // Recency score (0-30 points, decay over 30 days)
        const daysSinceAccess =
          (Date.now() - memory.lastAccessedAt.getTime()) / (1000 * 60 * 60 * 24);
        score += Math.max(0, 30 - daysSinceAccess);

        // Access frequency score (0-15 points)
        score += Math.min(15, memory.accessCount * 0.5);

        // Keyword match score (0-15 points per word)
        const memoryText = `${parsed.key} ${parsed.value}`.toLowerCase();
        for (const word of queryWords) {
          if (memoryText.includes(word)) {
            score += 15;
          }
        }

        // Estimate tokens (rough: 1 token ~ 4 chars)
        const tokens = Math.ceil(`${parsed.key}: ${parsed.value}`.length / 4);

        scored.push({ memory: memoryObj, score, tokens });
      }

      // Sort by score descending
      scored.sort((a, b) => b.score - a.score);

      // Select memories within token limit
      const results: Memory[] = [];
      let totalTokens = 0;

      for (const { memory, tokens } of scored) {
        if (totalTokens + tokens > maxTokens) continue;
        results.push(memory);
        totalTokens += tokens;

        // Update access metrics async
        this.updateAccessMetrics(memory.id).catch(() => {});
      }

      return results;
    } catch (error) {
      logger.error("Failed to get relevant memories", {
        organizationId,
        userId,
        query,
        maxTokens,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Clean up expired memories
   * Note: The Prisma Memory model doesn't have expiresAt,
   * so we clean up based on very old lastAccessedAt + low importance
   */
  async cleanupExpired(organizationId?: string): Promise<number> {
    try {
      // Delete memories that haven't been accessed in 90 days and have low importance
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);

      const result = await db.memory.deleteMany({
        where: {
          ...(organizationId && { organizationId }),
          lastAccessedAt: { lt: cutoffDate },
          importance: { lt: 0.3 }, // Only delete low importance memories
        },
      });

      logger.info("Cleaned up old memories", {
        organizationId,
        deletedCount: result.count,
      });

      return result.count;
    } catch (error) {
      logger.error("Failed to cleanup expired memories", {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Update access metrics for a memory
   */
  private async updateAccessMetrics(id: string): Promise<void> {
    try {
      await db.memory.update({
        where: { id },
        data: {
          accessCount: { increment: 1 },
          lastAccessedAt: new Date(),
        },
      });
    } catch (error) {
      logger.debug("Failed to update access metrics", {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Build Memory object from CreateMemoryInput
   */
  private buildMemory(
    prismaMemory: { id: string; createdAt: Date },
    input: CreateMemoryInput,
  ): Memory {
    return {
      id: prismaMemory.id,
      organizationId: input.organizationId,
      scope: input.scope,
      scopeId: input.scopeId,
      type: input.type,
      key: input.key,
      value: input.value,
      importance: input.importance || "medium",
      sourceType: input.sourceType || "explicit",
      sourceId: input.sourceId,
      createdAt: prismaMemory.createdAt,
      updatedAt: new Date(),
      lastAccessedAt: new Date(),
      expiresAt: input.expiresAt,
    };
  }

  /**
   * Build Memory object from Prisma memory record
   */
  private buildMemoryFromPrisma(
    memory: {
      id: string;
      organizationId: string;
      type: string;
      importance: number;
      accessCount: number;
      lastAccessedAt: Date;
      createdAt: Date;
    },
    parsed: { scope: MemoryScope; scopeId: string; key: string; value: string; sourceType?: string; sourceId?: string },
  ): Memory {
    return {
      id: memory.id,
      organizationId: memory.organizationId,
      scope: parsed.scope,
      scopeId: parsed.scopeId,
      type: prismaTypeToMemoryType(memory.type, parsed.key),
      key: parsed.key,
      value: parsed.value,
      importance: numericToImportance(memory.importance),
      sourceType: (parsed.sourceType as "extracted" | "explicit" | "inferred") || "explicit",
      sourceId: parsed.sourceId,
      createdAt: memory.createdAt,
      updatedAt: memory.lastAccessedAt,
      lastAccessedAt: memory.lastAccessedAt,
    };
  }
}

// Export singleton instance
export const longTermMemory = new LongTermMemory();
