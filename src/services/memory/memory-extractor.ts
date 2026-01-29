/**
 * Memory Extractor Service
 *
 * Auto-extracts memorizable information from conversations using AI.
 * Identifies facts, preferences, entities, and decisions.
 */

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../../utils/logger";
import { longTermMemory } from "./long-term";
import { entityMemoryManager } from "./entity-memory";
import type {
  Message,
  ExtractionResult,
  MemoryImportance,
  EntityType,
} from "./types";

const EXTRACTION_PROMPT = `You are a memory extraction system. Analyze the conversation and extract information worth remembering.

Extract the following types of information:

1. **Facts**: Concrete, factual information about the user, project, company, or situation
   - Examples: "Budget limit is 50 million won", "Project deadline is March 15th"

2. **Preferences**: User preferences for how things should be done
   - Examples: "Prefers concise bullet points", "Wants Korean responses"

3. **Entities**: People, projects, companies, or products mentioned
   - Include any attributes or relationships mentioned

4. **Decisions**: Important decisions made during the conversation
   - Include the context for why the decision was made

For each item, assess importance:
- critical: Must not be forgotten, affects major decisions
- high: Important to remember for future interactions
- medium: Useful context to have
- low: Nice to know but not essential

Return your response as valid JSON matching this structure:
{
  "facts": [
    { "key": "unique_identifier", "value": "description", "importance": "medium" }
  ],
  "preferences": [
    { "key": "unique_identifier", "value": "description" }
  ],
  "entities": [
    { "type": "person|project|company|product", "name": "Entity Name", "attributes": { "key": "value" } }
  ],
  "decisions": [
    { "description": "What was decided", "context": "Why it was decided" }
  ]
}

If nothing noteworthy to extract, return empty arrays.`;

export class MemoryExtractor {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic();
  }

  /**
   * Extract memorizable information from a conversation
   */
  async extract(conversation: Message[]): Promise<ExtractionResult> {
    if (conversation.length === 0) {
      return { facts: [], preferences: [], entities: [], decisions: [] };
    }

    try {
      // Format conversation for the model
      const conversationText = conversation
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join("\n\n");

      const response = await this.client.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: `${EXTRACTION_PROMPT}\n\nConversation to analyze:\n\n${conversationText}`,
          },
        ],
      });

      // Extract text content
      const textContent = response.content.find((c) => c.type === "text");
      if (!textContent || textContent.type !== "text") {
        return { facts: [], preferences: [], entities: [], decisions: [] };
      }

      // Parse JSON response
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn("No JSON found in extraction response");
        return { facts: [], preferences: [], entities: [], decisions: [] };
      }

      const extracted = JSON.parse(jsonMatch[0]) as ExtractionResult;

      // Validate structure
      return {
        facts: Array.isArray(extracted.facts) ? extracted.facts : [],
        preferences: Array.isArray(extracted.preferences) ? extracted.preferences : [],
        entities: Array.isArray(extracted.entities) ? extracted.entities : [],
        decisions: Array.isArray(extracted.decisions) ? extracted.decisions : [],
      };
    } catch (error) {
      logger.error("Memory extraction failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return { facts: [], preferences: [], entities: [], decisions: [] };
    }
  }

  /**
   * Extract and store memories from a conversation
   */
  async extractAndStore(
    organizationId: string,
    userId: string,
    conversation: Message[],
    sessionId?: string,
  ): Promise<{
    memoriesStored: number;
    entitiesStored: number;
  }> {
    const extraction = await this.extract(conversation);

    let memoriesStored = 0;
    let entitiesStored = 0;

    // Store facts
    for (const fact of extraction.facts) {
      try {
        await longTermMemory.remember({
          organizationId,
          scope: "user",
          scopeId: userId,
          type: "fact",
          key: fact.key,
          value: fact.value,
          importance: this.validateImportance(fact.importance),
          sourceType: "extracted",
          sourceId: sessionId,
        });
        memoriesStored++;
      } catch (error) {
        logger.debug("Failed to store fact", { key: fact.key, error });
      }
    }

    // Store preferences
    for (const pref of extraction.preferences) {
      try {
        await longTermMemory.remember({
          organizationId,
          scope: "user",
          scopeId: userId,
          type: "preference",
          key: pref.key,
          value: pref.value,
          importance: "medium",
          sourceType: "extracted",
          sourceId: sessionId,
        });
        memoriesStored++;
      } catch (error) {
        logger.debug("Failed to store preference", { key: pref.key, error });
      }
    }

    // Store decisions
    for (const decision of extraction.decisions) {
      try {
        await longTermMemory.remember({
          organizationId,
          scope: "user",
          scopeId: userId,
          type: "decision",
          key: `decision_${Date.now()}`,
          value: `${decision.description} | Context: ${decision.context}`,
          importance: "high",
          sourceType: "extracted",
          sourceId: sessionId,
        });
        memoriesStored++;
      } catch (error) {
        logger.debug("Failed to store decision", { error });
      }
    }

    // Store entities
    for (const entity of extraction.entities) {
      try {
        const entityType = this.validateEntityType(entity.type);
        const created = await entityMemoryManager.getOrCreateEntity(
          organizationId,
          entityType,
          entity.name,
        );

        // Update attributes if provided
        if (entity.attributes && Object.keys(entity.attributes).length > 0) {
          await entityMemoryManager.updateAttributes(created.id, entity.attributes);
        }

        entitiesStored++;
      } catch (error) {
        logger.debug("Failed to store entity", { name: entity.name, error });
      }
    }

    logger.debug("Memory extraction complete", {
      organizationId,
      userId,
      memoriesStored,
      entitiesStored,
    });

    return { memoriesStored, entitiesStored };
  }

  private validateImportance(importance: string): MemoryImportance {
    const valid: MemoryImportance[] = ["low", "medium", "high", "critical"];
    return valid.includes(importance as MemoryImportance)
      ? (importance as MemoryImportance)
      : "medium";
  }

  private validateEntityType(type: string): EntityType {
    const valid: EntityType[] = ["person", "project", "company", "product"];
    return valid.includes(type as EntityType) ? (type as EntityType) : "project";
  }
}

// Export singleton instance
export const memoryExtractor = new MemoryExtractor();
