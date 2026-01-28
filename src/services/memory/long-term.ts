/**
 * Long-term Memory Service
 *
 * Uses PostgreSQL (via Prisma) to store permanent memories.
 * Supports scoped memories (user, team, org, project) and search.
 *
 * TODO: Implement long-term memory functionality once Prisma schema includes Memory table
 * TODO: Add database migrations for memory tables
 */

import { db } from "../../db/client";
import { logger } from "../../utils/logger";
import type {
  Memory,
  CreateMemoryInput,
  UpdateMemoryInput,
  MemorySearchOptions,
  MemoryScope,
  MemoryImportance,
  MemorySourceType,
} from "./types";

export class LongTermMemory {
  /**
   * Store a new memory
   */
  async remember(input: CreateMemoryInput): Promise<Memory> {
    logger.info("LongTermMemory.remember", {
      organizationId: input.organizationId,
      scope: input.scope,
      key: input.key,
    });

    const memory = await db.memory.create({
      data: {
        organizationId: input.organizationId,
        scope: input.scope,
        scopeId: input.scopeId,
        type: input.type,
        key: input.key,
        value: input.value,
        importance: input.importance || "medium",
        sourceType: input.sourceType || "explicit",
        sourceId: input.sourceId,
        lastAccessedAt: new Date(),
        expiresAt: input.expiresAt,
      },
    });

    return this.mapToMemory(memory);
  }

  /**
   * Upsert a memory (create or update)
   */
  async upsert(input: CreateMemoryInput): Promise<Memory> {
    logger.info("LongTermMemory.upsert", {
      organizationId: input.organizationId,
      key: input.key,
    });

    const memory = await db.memory.upsert({
      where: {
        organizationId_scope_scopeId_key: {
          organizationId: input.organizationId,
          scope: input.scope,
          scopeId: input.scopeId,
          key: input.key,
        },
      },
      update: {
        value: input.value,
        importance: input.importance || "medium",
        lastAccessedAt: new Date(),
        expiresAt: input.expiresAt,
      },
      create: {
        organizationId: input.organizationId,
        scope: input.scope,
        scopeId: input.scopeId,
        type: input.type,
        key: input.key,
        value: input.value,
        importance: input.importance || "medium",
        sourceType: input.sourceType || "explicit",
        sourceId: input.sourceId,
        lastAccessedAt: new Date(),
        expiresAt: input.expiresAt,
      },
    });

    return this.mapToMemory(memory);
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
    logger.info("LongTermMemory.recall", { organizationId, scope, scopeId, key });

    const memory = await db.memory.findUnique({
      where: {
        organizationId_scope_scopeId_key: {
          organizationId,
          scope,
          scopeId,
          key,
        },
      },
    });

    if (memory) {
      await db.memory.update({
        where: { id: memory.id },
        data: { lastAccessedAt: new Date() },
      });
    }

    return memory ? this.mapToMemory(memory) : null;
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
    logger.info("LongTermMemory.search", { organizationId, scope, scopeId, query, options });

    const where: any = {
      organizationId,
      scope,
      scopeId,
      OR: [
        { key: { contains: query, mode: 'insensitive' } },
        { value: { contains: query, mode: 'insensitive' } },
      ],
    };

    if (options.types && options.types.length > 0) {
      where.type = { in: options.types };
    }

    if (options.importance) {
      where.importance = options.importance;
    }

    const memories = await db.memory.findMany({
      where,
      take: options.limit || 20,
      orderBy: { lastAccessedAt: 'desc' },
    });

    return memories.map(m => this.mapToMemory(m));
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
    logger.info("LongTermMemory.getAll", { organizationId, scope, scopeId, options });

    const where: any = {
      organizationId,
      scope,
      scopeId,
    };

    if (options.types && options.types.length > 0) {
      where.type = { in: options.types };
    }

    if (options.importance) {
      where.importance = options.importance;
    }

    const memories = await db.memory.findMany({
      where,
      take: options.limit || 50,
      orderBy: { lastAccessedAt: 'desc' },
    });

    return memories.map(m => this.mapToMemory(m));
  }

  /**
   * Update an existing memory
   */
  async update(id: string, input: UpdateMemoryInput): Promise<Memory> {
    logger.info("LongTermMemory.update", { id, input });

    const data: any = {
      lastAccessedAt: new Date(),
    };

    if (input.value !== undefined) data.value = input.value;
    if (input.importance !== undefined) data.importance = input.importance;
    if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt;

    const memory = await db.memory.update({
      where: { id },
      data,
    });

    return this.mapToMemory(memory);
  }

  /**
   * Delete a memory
   */
  async forget(id: string): Promise<void> {
    logger.info("LongTermMemory.forget", { id });

    await db.memory.delete({
      where: { id },
    });
  }

  /**
   * Delete all memories for a scope
   */
  async forgetAll(
    organizationId: string,
    scope: MemoryScope,
    scopeId: string,
  ): Promise<number> {
    logger.info("LongTermMemory.forgetAll", { organizationId, scope, scopeId });

    const result = await db.memory.deleteMany({
      where: {
        organizationId,
        scope,
        scopeId,
      },
    });

    return result.count;
  }

  /**
   * Get relevant memories for a query (for context building)
   */
  async getRelevantMemories(
    organizationId: string,
    userId: string,
    query: string,
    maxTokens: number = 1000,
  ): Promise<Memory[]> {
    logger.info("LongTermMemory.getRelevantMemories", { organizationId, userId, query, maxTokens });

    const memories = await db.memory.findMany({
      where: {
        organizationId,
        OR: [
          { scope: 'organization' },
          { scope: 'user', scopeId: userId },
        ],
      },
      orderBy: [
        { importance: 'desc' },
        { lastAccessedAt: 'desc' },
      ],
      take: 20,
    });

    // Simple token-based filtering (rough estimate: 4 chars = 1 token)
    const filtered: any[] = [];
    let tokenCount = 0;

    for (const memory of memories) {
      const estimatedTokens = Math.ceil((memory.key.length + memory.value.length) / 4);
      if (tokenCount + estimatedTokens > maxTokens) break;

      filtered.push(memory);
      tokenCount += estimatedTokens;
    }

    return filtered.map(m => this.mapToMemory(m));
  }

  /**
   * Clean up expired memories
   */
  async cleanupExpired(organizationId?: string): Promise<number> {
    logger.info("LongTermMemory.cleanupExpired", { organizationId });

    const where: any = {
      expiresAt: {
        lte: new Date(),
      },
    };

    if (organizationId) {
      where.organizationId = organizationId;
    }

    const result = await db.memory.deleteMany({ where });

    return result.count;
  }

  /**
   * Map Prisma memory to Memory interface
   */
  private mapToMemory(memory: any): Memory {
    return {
      id: memory.id,
      organizationId: memory.organizationId,
      scope: memory.scope as MemoryScope,
      scopeId: memory.scopeId,
      type: memory.type as "fact" | "preference" | "decision" | "context",
      key: memory.key,
      value: memory.value,
      importance: memory.importance as MemoryImportance,
      sourceType: memory.sourceType as MemorySourceType,
      sourceId: memory.sourceId,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
      lastAccessedAt: memory.lastAccessedAt,
      expiresAt: memory.expiresAt,
    };
  }
}

// Export singleton instance
export const longTermMemory = new LongTermMemory();
