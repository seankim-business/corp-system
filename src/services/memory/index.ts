/**
 * Memory Service
 *
 * Long-term conversation memory system for agents.
 * Provides short-term (Redis) and long-term (PostgreSQL) memory storage,
 * entity tracking, automatic extraction, and context optimization.
 */

// Types
export * from "./types";

// Services
export { ShortTermMemory, shortTermMemory } from "./short-term";
export { LongTermMemory, longTermMemory } from "./long-term";
export { EntityMemoryManager, entityMemoryManager } from "./entity-memory";
export { MemoryExtractor, memoryExtractor } from "./memory-extractor";
export { ContextOptimizer, contextOptimizer } from "./context-optimizer";

// Convenience facade for common operations
import { shortTermMemory } from "./short-term";
import { longTermMemory } from "./long-term";
import { entityMemoryManager } from "./entity-memory";
import { memoryExtractor } from "./memory-extractor";
import { contextOptimizer } from "./context-optimizer";
import type {
  Memory,
  EntityMemory,
  Message,
  MemoryScope,
  ContextOptimizationResult,
} from "./types";

/**
 * MemoryService - Unified facade for all memory operations
 */
export class MemoryService {
  /**
   * Store a short-term memory in the current session
   */
  async rememberSession(sessionId: string, key: string, value: string): Promise<void> {
    await shortTermMemory.remember(sessionId, key, value);
  }

  /**
   * Recall a short-term memory from the current session
   */
  async recallSession(sessionId: string, key: string): Promise<string | null> {
    return shortTermMemory.recall(sessionId, key);
  }

  /**
   * Get all short-term memories for a session
   */
  async getSessionContext(sessionId: string): Promise<Record<string, string>> {
    return shortTermMemory.getSessionContext(sessionId);
  }

  /**
   * Store a long-term memory
   */
  async remember(
    organizationId: string,
    scope: MemoryScope,
    scopeId: string,
    key: string,
    value: string,
    options?: {
      type?: "fact" | "preference" | "decision" | "context";
      importance?: "low" | "medium" | "high" | "critical";
      sourceId?: string;
    },
  ): Promise<Memory> {
    return longTermMemory.remember({
      organizationId,
      scope,
      scopeId,
      type: options?.type || "fact",
      key,
      value,
      importance: options?.importance,
      sourceType: "explicit",
      sourceId: options?.sourceId,
    });
  }

  /**
   * Recall a long-term memory by key
   */
  async recall(
    organizationId: string,
    scope: MemoryScope,
    scopeId: string,
    key: string,
  ): Promise<Memory | null> {
    return longTermMemory.recall(organizationId, scope, scopeId, key);
  }

  /**
   * Search memories
   */
  async search(
    organizationId: string,
    scope: MemoryScope,
    scopeId: string,
    query: string,
    limit?: number,
  ): Promise<Memory[]> {
    return longTermMemory.search(organizationId, scope, scopeId, query, { limit });
  }

  /**
   * Get or create an entity
   */
  async getOrCreateEntity(
    organizationId: string,
    type: "person" | "project" | "company" | "product",
    name: string,
  ): Promise<EntityMemory> {
    return entityMemoryManager.getOrCreateEntity(organizationId, type, name);
  }

  /**
   * Find entities by name
   */
  async findEntities(
    organizationId: string,
    query: string,
  ): Promise<EntityMemory[]> {
    return entityMemoryManager.findEntities(organizationId, query);
  }

  /**
   * Extract and store memories from a conversation
   */
  async extractFromConversation(
    organizationId: string,
    userId: string,
    conversation: Message[],
    sessionId?: string,
  ): Promise<{ memoriesStored: number; entitiesStored: number }> {
    return memoryExtractor.extractAndStore(organizationId, userId, conversation, sessionId);
  }

  /**
   * Build optimized context for a query
   */
  async buildContext(
    organizationId: string,
    userId: string,
    query: string,
    maxTokens?: number,
    sessionId?: string,
  ): Promise<ContextOptimizationResult> {
    return contextOptimizer.buildContext(organizationId, userId, query, maxTokens, sessionId);
  }

  /**
   * Format context for inclusion in a prompt
   */
  formatContextForPrompt(context: ContextOptimizationResult): string {
    return contextOptimizer.formatContextForPrompt(context);
  }

  /**
   * Clear session memory
   */
  async clearSession(sessionId: string): Promise<void> {
    await shortTermMemory.clearSession(sessionId);
  }

  /**
   * Clean up expired memories
   */
  async cleanupExpired(organizationId?: string): Promise<number> {
    return longTermMemory.cleanupExpired(organizationId);
  }
}

// Export singleton instance
export const memoryService = new MemoryService();
