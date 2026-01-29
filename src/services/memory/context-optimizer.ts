/**
 * Context Optimizer Service
 *
 * Builds optimal context from memories within token limits.
 * Prioritizes memories by relevance, importance, and recency.
 */

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../../utils/logger";
import { longTermMemory } from "./long-term";
import { entityMemoryManager } from "./entity-memory";
import { shortTermMemory } from "./short-term";
import type {
  Memory,
  EntityMemory,
  ContextOptimizationResult,
  MemoryImportance,
} from "./types";

export class ContextOptimizer {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic();
  }

  /**
   * Build optimal context within token limit
   */
  async buildContext(
    organizationId: string,
    userId: string,
    currentQuery: string,
    maxTokens: number = 2000,
    sessionId?: string,
  ): Promise<ContextOptimizationResult> {
    const result: ContextOptimizationResult = {
      memories: [],
      entities: [],
      recentContext: "",
      totalTokens: 0,
    };

    let remainingTokens = maxTokens;

    // 1. Get short-term session context (highest priority)
    if (sessionId) {
      const sessionContext = await shortTermMemory.getSessionContext(sessionId);
      if (Object.keys(sessionContext).length > 0) {
        const contextStr = Object.entries(sessionContext)
          .map(([k, v]) => `- ${k}: ${v}`)
          .join("\n");
        const tokens = this.estimateTokens(contextStr);

        if (tokens <= remainingTokens * 0.3) {
          // Reserve max 30% for session context
          result.recentContext = contextStr;
          result.totalTokens += tokens;
          remainingTokens -= tokens;
        }
      }
    }

    // 2. Get relevant long-term memories
    const relevantMemories = await longTermMemory.getRelevantMemories(
      organizationId,
      userId,
      currentQuery,
      Math.floor(remainingTokens * 0.5), // 50% of remaining for memories
    );

    for (const memory of relevantMemories) {
      const tokens = this.estimateTokens(`${memory.key}: ${memory.value}`);
      if (result.totalTokens + tokens <= maxTokens) {
        result.memories.push(memory);
        result.totalTokens += tokens;
      }
    }

    remainingTokens = maxTokens - result.totalTokens;

    // 3. Get relevant entities
    if (remainingTokens > 100) {
      const entities = await entityMemoryManager.findEntities(
        organizationId,
        currentQuery,
        { limit: 10 },
      );

      for (const entity of entities) {
        const entityStr = this.formatEntity(entity);
        const tokens = this.estimateTokens(entityStr);

        if (result.totalTokens + tokens <= maxTokens) {
          result.entities.push(entity);
          result.totalTokens += tokens;
        }
      }
    }

    return result;
  }

  /**
   * Format context for inclusion in a prompt
   */
  formatContextForPrompt(context: ContextOptimizationResult): string {
    const sections: string[] = [];

    // Recent session context
    if (context.recentContext) {
      sections.push("## Recent Context\n" + context.recentContext);
    }

    // Memories
    if (context.memories.length > 0) {
      const memoryLines = context.memories.map((m) => {
        const badge = this.getImportanceBadge(m.importance);
        return `- ${badge}[${m.type}] ${m.key}: ${m.value}`;
      });
      sections.push("## Relevant Memories\n" + memoryLines.join("\n"));
    }

    // Entities
    if (context.entities.length > 0) {
      const entityLines = context.entities.map((e) => this.formatEntity(e));
      sections.push("## Known Entities\n" + entityLines.join("\n"));
    }

    if (sections.length === 0) {
      return "";
    }

    return "# Context from Memory\n\n" + sections.join("\n\n");
  }

  /**
   * Prioritize memories by relevance to query
   */
  prioritizeMemories(
    memories: Memory[],
    query: string,
    maxTokens: number,
  ): Memory[] {
    // Score memories
    const scoredMemories = memories.map((memory) => {
      let score = 0;

      // Importance score
      const importanceScores = { critical: 100, high: 75, medium: 50, low: 25 };
      score += importanceScores[memory.importance] || 50;

      // Recency score (decay over 30 days)
      const daysSinceAccess = (Date.now() - memory.lastAccessedAt.getTime()) / (1000 * 60 * 60 * 24);
      score += Math.max(0, 50 - daysSinceAccess);

      // Relevance score (simple keyword match)
      const queryWords = query.toLowerCase().split(/\s+/);
      const memoryText = `${memory.key} ${memory.value}`.toLowerCase();
      const matchCount = queryWords.filter((w) => memoryText.includes(w)).length;
      score += matchCount * 20;

      return { memory, score };
    });

    // Sort by score
    scoredMemories.sort((a, b) => b.score - a.score);

    // Select within token limit
    const result: Memory[] = [];
    let totalTokens = 0;

    for (const { memory } of scoredMemories) {
      const tokens = this.estimateTokens(`${memory.key}: ${memory.value}`);
      if (totalTokens + tokens <= maxTokens) {
        result.push(memory);
        totalTokens += tokens;
      }
    }

    return result;
  }

  /**
   * Summarize long context to fit within token limit
   */
  async summarizeContext(context: string, maxTokens: number): Promise<string> {
    const currentTokens = this.estimateTokens(context);

    if (currentTokens <= maxTokens) {
      return context;
    }

    try {
      const response = await this.client.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: maxTokens,
        messages: [
          {
            role: "user",
            content: `Summarize the following context into approximately ${maxTokens} tokens while preserving the most important information:\n\n${context}`,
          },
        ],
      });

      const textContent = response.content.find((c) => c.type === "text");
      return textContent?.type === "text" ? textContent.text : context.slice(0, maxTokens * 4);
    } catch (error) {
      logger.error("Context summarization failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      // Fallback: truncate
      return context.slice(0, maxTokens * 4);
    }
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters for English, 2-3 for Korean
    // Using conservative estimate of 3 characters per token
    return Math.ceil(text.length / 3);
  }

  private formatEntity(entity: EntityMemory): string {
    const parts = [`- **${entity.entityName}** (${entity.entityType})`];

    const attrs = Object.entries(entity.attributes);
    if (attrs.length > 0) {
      const attrStr = attrs.map(([k, v]) => `${k}=${v}`).join(", ");
      parts.push(`: ${attrStr}`);
    }

    if (entity.notes.length > 0) {
      parts.push(` | Notes: ${entity.notes.slice(0, 2).join("; ")}`);
    }

    return parts.join("");
  }

  private getImportanceBadge(importance: MemoryImportance): string {
    switch (importance) {
      case "critical":
        return "🔴 ";
      case "high":
        return "🟠 ";
      case "medium":
        return "";
      case "low":
        return "⚪ ";
      default:
        return "";
    }
  }
}

// Export singleton instance
export const contextOptimizer = new ContextOptimizer();
