/**
 * Memory Integration for Orchestrator
 *
 * Integrates the memory system with agent execution flow.
 * Handles context building and memory extraction during conversations.
 */

import { logger } from "../utils/logger";
import {
  memoryService,
  shortTermMemory,
  longTermMemory,
  entityMemoryManager,
  memoryExtractor,
  contextOptimizer,
} from "../services/memory";
import type {
  Memory,
  EntityMemory,
  Message,
} from "../services/memory/types";

export interface MemoryContext {
  sessionMemory: Record<string, string>;
  longTermMemories: Memory[];
  entities: EntityMemory[];
  formattedContext: string;
  totalTokens: number;
}

export interface ExecutionContextWithMemory {
  organizationId: string;
  userId: string;
  sessionId: string;
  memoryContext?: MemoryContext;
}

/**
 * Build memory context for an agent execution
 */
export async function buildMemoryContext(
  organizationId: string,
  userId: string,
  sessionId: string,
  request: string,
  maxTokens: number = 2000,
): Promise<MemoryContext> {
  try {
    // 1. Get short-term session memory
    const sessionMemory = await shortTermMemory.getSessionContext(sessionId);

    // 2. Build optimized context using context optimizer
    const optimizedContext = await contextOptimizer.buildContext(
      organizationId,
      userId,
      request,
      maxTokens,
      sessionId,
    );

    // 3. Format for inclusion in prompts
    const formattedContext = contextOptimizer.formatContextForPrompt(optimizedContext);

    logger.debug("Memory context built", {
      organizationId,
      sessionId,
      sessionMemoryCount: Object.keys(sessionMemory).length,
      longTermMemoryCount: optimizedContext.memories.length,
      entityCount: optimizedContext.entities.length,
      totalTokens: optimizedContext.totalTokens,
    });

    return {
      sessionMemory,
      longTermMemories: optimizedContext.memories,
      entities: optimizedContext.entities,
      formattedContext,
      totalTokens: optimizedContext.totalTokens,
    };
  } catch (error) {
    logger.error("Failed to build memory context", {
      organizationId,
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });

    // Return empty context on error
    return {
      sessionMemory: {},
      longTermMemories: [],
      entities: [],
      formattedContext: "",
      totalTokens: 0,
    };
  }
}

/**
 * Execute with memory context
 */
export async function executeWithMemory<T>(
  context: ExecutionContextWithMemory,
  request: string,
  executor: (request: string, memoryContext: MemoryContext) => Promise<T>,
): Promise<{ result: T; memoryContext: MemoryContext }> {
  // Build memory context
  const memoryContext = await buildMemoryContext(
    context.organizationId,
    context.userId,
    context.sessionId,
    request,
  );

  // Execute with memory
  const result = await executor(request, memoryContext);

  return { result, memoryContext };
}

/**
 * Post-execution memory processing
 * Call this after agent execution to extract and store memories
 */
export async function processConversationMemories(
  organizationId: string,
  userId: string,
  sessionId: string,
  conversation: Message[],
): Promise<{ memoriesStored: number; entitiesStored: number }> {
  try {
    // Only process if conversation has enough content
    if (conversation.length < 2) {
      return { memoriesStored: 0, entitiesStored: 0 };
    }

    // Extract and store memories
    const result = await memoryExtractor.extractAndStore(
      organizationId,
      userId,
      conversation,
      sessionId,
    );

    logger.debug("Conversation memories processed", {
      organizationId,
      sessionId,
      ...result,
    });

    return result;
  } catch (error) {
    logger.error("Failed to process conversation memories", {
      organizationId,
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });

    return { memoriesStored: 0, entitiesStored: 0 };
  }
}

/**
 * Store a key insight in session memory for quick recall
 */
export async function storeSessionInsight(
  sessionId: string,
  key: string,
  value: string,
): Promise<void> {
  await shortTermMemory.remember(sessionId, key, value);
}

/**
 * Store multiple session insights at once
 */
export async function storeSessionInsights(
  sessionId: string,
  insights: Record<string, string>,
): Promise<void> {
  await shortTermMemory.rememberMany(sessionId, insights);
}

/**
 * Store a permanent memory (fact, preference, decision)
 */
export async function storePermanentMemory(
  organizationId: string,
  userId: string,
  key: string,
  value: string,
  options?: {
    type?: "fact" | "preference" | "decision" | "context";
    importance?: "low" | "medium" | "high" | "critical";
    sessionId?: string;
  },
): Promise<Memory> {
  return longTermMemory.remember({
    organizationId,
    scope: "user",
    scopeId: userId,
    type: options?.type || "fact",
    key,
    value,
    importance: options?.importance || "medium",
    sourceType: "explicit",
    sourceId: options?.sessionId,
  });
}

/**
 * Get or create an entity from conversation context
 */
export async function trackEntity(
  organizationId: string,
  type: "person" | "project" | "company" | "product",
  name: string,
  attributes?: Record<string, string>,
): Promise<EntityMemory> {
  const entity = await entityMemoryManager.getOrCreateEntity(organizationId, type, name);

  if (attributes && Object.keys(attributes).length > 0) {
    return entityMemoryManager.updateAttributes(entity.id, attributes);
  }

  return entity;
}

/**
 * Augment a system prompt with memory context
 */
export function augmentPromptWithMemory(
  systemPrompt: string,
  memoryContext: MemoryContext,
): string {
  if (!memoryContext.formattedContext) {
    return systemPrompt;
  }

  return `${systemPrompt}

${memoryContext.formattedContext}`;
}

/**
 * Create a memory-aware message for the AI
 */
export function createMemoryAwareMessage(
  userMessage: string,
  _memoryContext: MemoryContext,
): string {
  // For now, just return the user message
  // Memory context is typically added to system prompt
  return userMessage;
}

/**
 * Clean up session memory after conversation ends
 */
export async function cleanupSessionMemory(sessionId: string): Promise<void> {
  await shortTermMemory.clearSession(sessionId);
  logger.debug("Session memory cleaned up", { sessionId });
}

/**
 * Get relevant memories for a specific query
 */
export async function getRelevantMemories(
  organizationId: string,
  userId: string,
  query: string,
  maxTokens: number = 1000,
): Promise<Memory[]> {
  return longTermMemory.getRelevantMemories(organizationId, userId, query, maxTokens);
}

// Export the memory service for direct access if needed
export { memoryService };
