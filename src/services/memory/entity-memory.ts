/**
 * Entity Memory Service
 *
 * Manages entity-specific memories (people, projects, companies, products).
 * Tracks attributes, relationships, and mentions.
 *
 * Uses the EntityMemory Prisma model which stores:
 * - entityType: type of entity (person, project, company, product mapped to agent, user, project, task)
 * - entityId: UUID for the entity
 * - memoryType: type of memory (preference, context, state, note, attribute, relationship)
 * - content: the actual memory content (JSON for complex structures)
 * - metadata: additional metadata (JSON)
 */

import { db } from "../../db/client";
import { logger } from "../../utils/logger";
import type {
  EntityMemory,
  EntityType,
  CreateEntityInput,
  EntityRelationship,
} from "./types";

// Map our EntityType to Prisma's entityType field
const ENTITY_TYPE_MAP: Record<EntityType, string> = {
  person: "user",
  project: "project",
  company: "organization",
  product: "product",
};

// Reverse mapping
const ENTITY_TYPE_REVERSE_MAP: Record<string, EntityType> = {
  user: "person",
  project: "project",
  organization: "company",
  product: "product",
  agent: "person", // Fallback for legacy data
  task: "project", // Fallback for legacy data
};

interface EntityData {
  entityName: string;
  attributes: Record<string, string>;
  relationships: EntityRelationship[];
  notes: string[];
  mentionCount: number;
  lastMentioned: Date;
}

export class EntityMemoryManager {
  /**
   * Get or create an entity
   */
  async getOrCreateEntity(
    organizationId: string,
    type: EntityType,
    name: string,
  ): Promise<EntityMemory> {
    const prismaEntityType = ENTITY_TYPE_MAP[type] || type;

    try {
      // First, try to find existing entity by name in the "entity" memory type
      const existingMemories = await db.entityMemory.findMany({
        where: {
          organizationId,
          entityType: prismaEntityType,
          memoryType: "entity",
        },
      });

      // Look for entity with matching name
      for (const memory of existingMemories) {
        const content = JSON.parse(memory.content) as EntityData;
        if (content.entityName.toLowerCase() === name.toLowerCase()) {
          // Update mention tracking
          await this.recordMentionInternal(memory.entityId, organizationId, prismaEntityType);
          return this.buildEntityMemory(memory.entityId, organizationId, type, content, memory.createdAt);
        }
      }

      // Create new entity
      const entityId = crypto.randomUUID();
      const now = new Date();
      const entityData: EntityData = {
        entityName: name,
        attributes: {},
        relationships: [],
        notes: [],
        mentionCount: 1,
        lastMentioned: now,
      };

      await db.entityMemory.create({
        data: {
          organizationId,
          entityType: prismaEntityType,
          entityId,
          memoryType: "entity",
          content: JSON.stringify(entityData),
          metadata: {},
        },
      });

      logger.debug("Created new entity", { organizationId, type, name, entityId });

      return {
        id: entityId,
        organizationId,
        entityType: type,
        entityName: name,
        attributes: {},
        relationships: [],
        notes: [],
        lastMentioned: now,
        mentionCount: 1,
        createdAt: now,
        updatedAt: now,
      };
    } catch (error) {
      logger.error("Failed to get or create entity", {
        organizationId,
        type,
        name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create a new entity with full data
   */
  async createEntity(input: CreateEntityInput): Promise<EntityMemory> {
    const prismaEntityType = ENTITY_TYPE_MAP[input.entityType] || input.entityType;
    const entityId = crypto.randomUUID();
    const now = new Date();

    const entityData: EntityData = {
      entityName: input.entityName,
      attributes: input.attributes || {},
      relationships: input.relationships || [],
      notes: input.notes || [],
      mentionCount: 0,
      lastMentioned: now,
    };

    try {
      await db.entityMemory.create({
        data: {
          organizationId: input.organizationId,
          entityType: prismaEntityType,
          entityId,
          memoryType: "entity",
          content: JSON.stringify(entityData),
          metadata: {},
        },
      });

      logger.debug("Created entity with full data", {
        organizationId: input.organizationId,
        type: input.entityType,
        name: input.entityName,
        entityId,
      });

      return {
        id: entityId,
        organizationId: input.organizationId,
        entityType: input.entityType,
        entityName: input.entityName,
        attributes: input.attributes || {},
        relationships: input.relationships || [],
        notes: input.notes || [],
        lastMentioned: now,
        mentionCount: 0,
        createdAt: now,
        updatedAt: now,
      };
    } catch (error) {
      logger.error("Failed to create entity", {
        input,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get an entity by ID
   */
  async getEntity(id: string): Promise<EntityMemory | null> {
    try {
      const memory = await db.entityMemory.findFirst({
        where: {
          entityId: id,
          memoryType: "entity",
        },
      });

      if (!memory) {
        return null;
      }

      const content = JSON.parse(memory.content) as EntityData;
      const entityType = ENTITY_TYPE_REVERSE_MAP[memory.entityType] || "project";

      return this.buildEntityMemory(id, memory.organizationId, entityType, content, memory.createdAt);
    } catch (error) {
      logger.error("Failed to get entity", {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Update an entity's attribute
   */
  async updateAttribute(
    entityId: string,
    key: string,
    value: string,
  ): Promise<EntityMemory> {
    return this.updateAttributes(entityId, { [key]: value });
  }

  /**
   * Update multiple attributes at once
   */
  async updateAttributes(
    entityId: string,
    updates: Record<string, string>,
  ): Promise<EntityMemory> {
    try {
      const memory = await db.entityMemory.findFirst({
        where: {
          entityId,
          memoryType: "entity",
        },
      });

      if (!memory) {
        throw new Error(`Entity not found: ${entityId}`);
      }

      const content = JSON.parse(memory.content) as EntityData;
      content.attributes = { ...content.attributes, ...updates };

      await db.entityMemory.update({
        where: { id: memory.id },
        data: {
          content: JSON.stringify(content),
        },
      });

      const entityType = ENTITY_TYPE_REVERSE_MAP[memory.entityType] || "project";
      return this.buildEntityMemory(entityId, memory.organizationId, entityType, content, memory.createdAt);
    } catch (error) {
      logger.error("Failed to update attributes", {
        entityId,
        updates,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Add a relationship between entities
   */
  async addRelationship(
    entityId: string,
    relatedEntityId: string,
    relationship: string,
  ): Promise<EntityMemory> {
    try {
      const memory = await db.entityMemory.findFirst({
        where: {
          entityId,
          memoryType: "entity",
        },
      });

      if (!memory) {
        throw new Error(`Entity not found: ${entityId}`);
      }

      const content = JSON.parse(memory.content) as EntityData;

      // Check if relationship already exists
      const exists = content.relationships.some(
        (r) => r.relatedEntityId === relatedEntityId && r.relationship === relationship,
      );

      if (!exists) {
        content.relationships.push({ relatedEntityId, relationship });

        await db.entityMemory.update({
          where: { id: memory.id },
          data: {
            content: JSON.stringify(content),
          },
        });
      }

      const entityType = ENTITY_TYPE_REVERSE_MAP[memory.entityType] || "project";
      return this.buildEntityMemory(entityId, memory.organizationId, entityType, content, memory.createdAt);
    } catch (error) {
      logger.error("Failed to add relationship", {
        entityId,
        relatedEntityId,
        relationship,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Remove a relationship
   */
  async removeRelationship(
    entityId: string,
    relatedEntityId: string,
    relationship?: string,
  ): Promise<EntityMemory> {
    try {
      const memory = await db.entityMemory.findFirst({
        where: {
          entityId,
          memoryType: "entity",
        },
      });

      if (!memory) {
        throw new Error(`Entity not found: ${entityId}`);
      }

      const content = JSON.parse(memory.content) as EntityData;

      content.relationships = content.relationships.filter((r) => {
        if (relationship) {
          return !(r.relatedEntityId === relatedEntityId && r.relationship === relationship);
        }
        return r.relatedEntityId !== relatedEntityId;
      });

      await db.entityMemory.update({
        where: { id: memory.id },
        data: {
          content: JSON.stringify(content),
        },
      });

      const entityType = ENTITY_TYPE_REVERSE_MAP[memory.entityType] || "project";
      return this.buildEntityMemory(entityId, memory.organizationId, entityType, content, memory.createdAt);
    } catch (error) {
      logger.error("Failed to remove relationship", {
        entityId,
        relatedEntityId,
        relationship,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Add a note to an entity
   */
  async addNote(entityId: string, note: string): Promise<EntityMemory> {
    try {
      const memory = await db.entityMemory.findFirst({
        where: {
          entityId,
          memoryType: "entity",
        },
      });

      if (!memory) {
        throw new Error(`Entity not found: ${entityId}`);
      }

      const content = JSON.parse(memory.content) as EntityData;
      content.notes.push(note);

      await db.entityMemory.update({
        where: { id: memory.id },
        data: {
          content: JSON.stringify(content),
        },
      });

      const entityType = ENTITY_TYPE_REVERSE_MAP[memory.entityType] || "project";
      return this.buildEntityMemory(entityId, memory.organizationId, entityType, content, memory.createdAt);
    } catch (error) {
      logger.error("Failed to add note", {
        entityId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Find entities by name or attribute value
   */
  async findEntities(
    organizationId: string,
    query: string,
    options: { type?: EntityType; limit?: number } = {},
  ): Promise<EntityMemory[]> {
    const { type, limit = 50 } = options;
    const prismaEntityType = type ? ENTITY_TYPE_MAP[type] || type : undefined;

    try {
      const memories = await db.entityMemory.findMany({
        where: {
          organizationId,
          memoryType: "entity",
          ...(prismaEntityType && { entityType: prismaEntityType }),
        },
        take: limit * 2, // Fetch more to allow filtering
      });

      const queryLower = query.toLowerCase();
      const results: EntityMemory[] = [];

      for (const memory of memories) {
        const content = JSON.parse(memory.content) as EntityData;

        // Search in name
        let matches = content.entityName.toLowerCase().includes(queryLower);

        // Search in attributes
        if (!matches) {
          matches = Object.values(content.attributes).some((v) =>
            v.toLowerCase().includes(queryLower),
          );
        }

        // Search in notes
        if (!matches) {
          matches = content.notes.some((n) => n.toLowerCase().includes(queryLower));
        }

        if (matches) {
          const entityType = ENTITY_TYPE_REVERSE_MAP[memory.entityType] || "project";
          results.push(
            this.buildEntityMemory(memory.entityId, organizationId, entityType, content, memory.createdAt),
          );
        }

        if (results.length >= limit) break;
      }

      return results;
    } catch (error) {
      logger.error("Failed to find entities", {
        organizationId,
        query,
        options,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get all entities of a specific type
   */
  async getEntitiesByType(
    organizationId: string,
    type: EntityType,
    limit: number = 50,
  ): Promise<EntityMemory[]> {
    const prismaEntityType = ENTITY_TYPE_MAP[type] || type;

    try {
      const memories = await db.entityMemory.findMany({
        where: {
          organizationId,
          entityType: prismaEntityType,
          memoryType: "entity",
        },
        take: limit,
      });

      return memories.map((memory) => {
        const content = JSON.parse(memory.content) as EntityData;
        return this.buildEntityMemory(memory.entityId, organizationId, type, content, memory.createdAt);
      });
    } catch (error) {
      logger.error("Failed to get entities by type", {
        organizationId,
        type,
        limit,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get recently mentioned entities
   */
  async getRecentEntities(
    organizationId: string,
    limit: number = 20,
  ): Promise<EntityMemory[]> {
    try {
      const memories = await db.entityMemory.findMany({
        where: {
          organizationId,
          memoryType: "entity",
        },
        take: limit * 2, // Fetch more to sort by lastMentioned
      });

      // Parse and sort by lastMentioned
      const parsed = memories.map((memory) => ({
        memory,
        content: JSON.parse(memory.content) as EntityData,
      }));

      parsed.sort((a, b) =>
        new Date(b.content.lastMentioned).getTime() - new Date(a.content.lastMentioned).getTime(),
      );

      return parsed.slice(0, limit).map(({ memory, content }) => {
        const entityType = ENTITY_TYPE_REVERSE_MAP[memory.entityType] || "project";
        return this.buildEntityMemory(memory.entityId, memory.organizationId, entityType, content, memory.createdAt);
      });
    } catch (error) {
      logger.error("Failed to get recent entities", {
        organizationId,
        limit,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get most frequently mentioned entities
   */
  async getFrequentEntities(
    organizationId: string,
    limit: number = 20,
  ): Promise<EntityMemory[]> {
    try {
      const memories = await db.entityMemory.findMany({
        where: {
          organizationId,
          memoryType: "entity",
        },
        take: limit * 2, // Fetch more to sort by mentionCount
      });

      // Parse and sort by mentionCount
      const parsed = memories.map((memory) => ({
        memory,
        content: JSON.parse(memory.content) as EntityData,
      }));

      parsed.sort((a, b) => b.content.mentionCount - a.content.mentionCount);

      return parsed.slice(0, limit).map(({ memory, content }) => {
        const entityType = ENTITY_TYPE_REVERSE_MAP[memory.entityType] || "project";
        return this.buildEntityMemory(memory.entityId, memory.organizationId, entityType, content, memory.createdAt);
      });
    } catch (error) {
      logger.error("Failed to get frequent entities", {
        organizationId,
        limit,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Delete an entity
   */
  async deleteEntity(id: string): Promise<void> {
    try {
      await db.entityMemory.deleteMany({
        where: {
          entityId: id,
        },
      });

      logger.debug("Deleted entity", { id });
    } catch (error) {
      logger.error("Failed to delete entity", {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Record a mention of an entity (updates lastMentioned and mentionCount)
   */
  async recordMention(entityId: string): Promise<EntityMemory> {
    try {
      const memory = await db.entityMemory.findFirst({
        where: {
          entityId,
          memoryType: "entity",
        },
      });

      if (!memory) {
        throw new Error(`Entity not found: ${entityId}`);
      }

      const content = JSON.parse(memory.content) as EntityData;
      content.mentionCount++;
      content.lastMentioned = new Date();

      await db.entityMemory.update({
        where: { id: memory.id },
        data: {
          content: JSON.stringify(content),
        },
      });

      const entityType = ENTITY_TYPE_REVERSE_MAP[memory.entityType] || "project";
      return this.buildEntityMemory(entityId, memory.organizationId, entityType, content, memory.createdAt);
    } catch (error) {
      logger.error("Failed to record mention", {
        entityId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Internal: Record mention without throwing (used by getOrCreateEntity)
   */
  private async recordMentionInternal(
    entityId: string,
    organizationId: string,
    entityType: string,
  ): Promise<void> {
    try {
      const memory = await db.entityMemory.findFirst({
        where: {
          entityId,
          memoryType: "entity",
        },
      });

      if (memory) {
        const content = JSON.parse(memory.content) as EntityData;
        content.mentionCount++;
        content.lastMentioned = new Date();

        await db.entityMemory.update({
          where: { id: memory.id },
          data: {
            content: JSON.stringify(content),
          },
        });
      }
    } catch (error) {
      logger.debug("Failed to record mention internally", {
        entityId,
        organizationId,
        entityType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Build EntityMemory object from stored data
   */
  private buildEntityMemory(
    id: string,
    organizationId: string,
    entityType: EntityType,
    content: EntityData,
    createdAt: Date,
  ): EntityMemory {
    return {
      id,
      organizationId,
      entityType,
      entityName: content.entityName,
      attributes: content.attributes,
      relationships: content.relationships,
      notes: content.notes,
      lastMentioned: new Date(content.lastMentioned),
      mentionCount: content.mentionCount,
      createdAt,
      updatedAt: new Date(content.lastMentioned),
    };
  }
}

// Export singleton instance
export const entityMemoryManager = new EntityMemoryManager();
