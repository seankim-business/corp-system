/**
 * Entity Memory Service
 *
 * Manages entity-specific memories (people, projects, companies, products).
 * Tracks attributes, relationships, and mentions.
 *
 * TODO: Implement entity memory functionality once Prisma schema includes EntityMemory table
 * TODO: Add database migrations for entity memory tables
 */

import { db } from "../../db/client";
import { logger } from "../../utils/logger";
import type {
  EntityMemory,
  EntityType,
  CreateEntityInput,
} from "./types";

export class EntityMemoryManager {
  /**
   * Get or create an entity
   */
  async getOrCreateEntity(
    organizationId: string,
    type: EntityType,
    name: string,
  ): Promise<EntityMemory> {
    logger.info("EntityMemoryManager.getOrCreateEntity", { organizationId, type, name });

    // Find existing entity
    const existing = await db.entityMemory.findFirst({
      where: {
        organizationId,
        entityType: type,
        entityName: name,
      },
    });

    if (existing) {
      // Update mention count and timestamp
      const updated = await db.entityMemory.update({
        where: { id: existing.id },
        data: {
          lastMentioned: new Date(),
          mentionCount: { increment: 1 },
        },
      });
      return this.mapToEntityMemory(updated);
    }

    // Create new entity
    const entity = await db.entityMemory.create({
      data: {
        organizationId,
        entityType: type,
        entityName: name,
        attributes: {},
        relationships: [],
        notes: [],
        lastMentioned: new Date(),
        mentionCount: 1,
      },
    });

    return this.mapToEntityMemory(entity);
  }

  /**
   * Create a new entity with full data
   */
  async createEntity(input: CreateEntityInput): Promise<EntityMemory> {
    logger.info("EntityMemoryManager.createEntity", { input });

    const entity = await db.entityMemory.create({
      data: {
        organizationId: input.organizationId,
        entityType: input.entityType,
        entityName: input.entityName,
        attributes: input.attributes || {},
        relationships: (input.relationships || []).map(r => ({ entityId: r.relatedEntityId, type: r.relationship })),
        notes: input.notes || [],
        lastMentioned: new Date(),
        mentionCount: 0,
      },
    });

    return this.mapToEntityMemory(entity);
  }

  /**
   * Get an entity by ID
   */
  async getEntity(id: string): Promise<EntityMemory | null> {
    logger.info("EntityMemoryManager.getEntity", { id });

    const entity = await db.entityMemory.findUnique({
      where: { id },
    });

    return entity ? this.mapToEntityMemory(entity) : null;
  }

  /**
   * Update an entity's attributes
   */
  async updateAttribute(
    entityId: string,
    key: string,
    value: string,
  ): Promise<EntityMemory> {
    logger.info("EntityMemoryManager.updateAttribute", { entityId, key });

    const current = await db.entityMemory.findUnique({
      where: { id: entityId },
    });

    if (!current) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    const attributes = { ...(current.attributes as Record<string, string>), [key]: value };

    const entity = await db.entityMemory.update({
      where: { id: entityId },
      data: { attributes },
    });

    return this.mapToEntityMemory(entity);
  }

  /**
   * Update multiple attributes at once
   */
  async updateAttributes(
    entityId: string,
    updates: Record<string, string>,
  ): Promise<EntityMemory> {
    logger.info("EntityMemoryManager.updateAttributes", { entityId });

    const current = await db.entityMemory.findUnique({
      where: { id: entityId },
    });

    if (!current) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    const attributes = { ...(current.attributes as Record<string, string>), ...updates };

    const entity = await db.entityMemory.update({
      where: { id: entityId },
      data: { attributes },
    });

    return this.mapToEntityMemory(entity);
  }

  /**
   * Add a relationship between entities
   */
  async addRelationship(
    entityId: string,
    relatedEntityId: string,
    relationship: string,
  ): Promise<EntityMemory> {
    logger.info("EntityMemoryManager.addRelationship", { entityId, relatedEntityId, relationship });

    const current = await db.entityMemory.findUnique({
      where: { id: entityId },
    });

    if (!current) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    const relationships = [...(current.relationships as any[]), { entityId: relatedEntityId, type: relationship }];

    const entity = await db.entityMemory.update({
      where: { id: entityId },
      data: { relationships },
    });

    return this.mapToEntityMemory(entity);
  }

  /**
   * Remove a relationship
   */
  async removeRelationship(
    entityId: string,
    relatedEntityId: string,
    relationship?: string,
  ): Promise<EntityMemory> {
    logger.info("EntityMemoryManager.removeRelationship", { entityId, relatedEntityId });

    const current = await db.entityMemory.findUnique({
      where: { id: entityId },
    });

    if (!current) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    const relationships = (current.relationships as any[]).filter(
      (r: any) => r.entityId !== relatedEntityId || (relationship && r.type !== relationship)
    );

    const entity = await db.entityMemory.update({
      where: { id: entityId },
      data: { relationships },
    });

    return this.mapToEntityMemory(entity);
  }

  /**
   * Add a note to an entity
   */
  async addNote(entityId: string, note: string): Promise<EntityMemory> {
    logger.info("EntityMemoryManager.addNote", { entityId });

    const current = await db.entityMemory.findUnique({
      where: { id: entityId },
    });

    if (!current) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    const notes = [...(current.notes as any[]), note];

    const entity = await db.entityMemory.update({
      where: { id: entityId },
      data: { notes },
    });

    return this.mapToEntityMemory(entity);
  }

  /**
   * Find entities by name or attribute value
   */
  async findEntities(
    organizationId: string,
    query: string,
    options: { type?: EntityType; limit?: number } = {},
  ): Promise<EntityMemory[]> {
    logger.info("EntityMemoryManager.findEntities", { organizationId, query, options });

    const where: any = {
      organizationId,
      entityName: { contains: query, mode: 'insensitive' },
    };

    if (options.type) {
      where.entityType = options.type;
    }

    const entities = await db.entityMemory.findMany({
      where,
      take: options.limit || 20,
      orderBy: { lastMentioned: 'desc' },
    });

    return entities.map(e => this.mapToEntityMemory(e));
  }

  /**
   * Get all entities of a specific type
   */
  async getEntitiesByType(
    organizationId: string,
    type: EntityType,
    limit: number = 50,
  ): Promise<EntityMemory[]> {
    logger.info("EntityMemoryManager.getEntitiesByType", { organizationId, type, limit });

    const entities = await db.entityMemory.findMany({
      where: {
        organizationId,
        entityType: type,
      },
      take: limit,
      orderBy: { lastMentioned: 'desc' },
    });

    return entities.map(e => this.mapToEntityMemory(e));
  }

  /**
   * Get recently mentioned entities
   */
  async getRecentEntities(
    organizationId: string,
    limit: number = 20,
  ): Promise<EntityMemory[]> {
    logger.info("EntityMemoryManager.getRecentEntities", { organizationId, limit });

    const entities = await db.entityMemory.findMany({
      where: { organizationId },
      take: limit,
      orderBy: { lastMentioned: 'desc' },
    });

    return entities.map(e => this.mapToEntityMemory(e));
  }

  /**
   * Get most frequently mentioned entities
   */
  async getFrequentEntities(
    organizationId: string,
    limit: number = 20,
  ): Promise<EntityMemory[]> {
    logger.info("EntityMemoryManager.getFrequentEntities", { organizationId, limit });

    const entities = await db.entityMemory.findMany({
      where: { organizationId },
      take: limit,
      orderBy: { mentionCount: 'desc' },
    });

    return entities.map(e => this.mapToEntityMemory(e));
  }

  /**
   * Delete an entity
   */
  async deleteEntity(id: string): Promise<void> {
    logger.info("EntityMemoryManager.deleteEntity", { id });

    await db.entityMemory.delete({
      where: { id },
    });
  }

  /**
   * Record a mention of an entity (updates lastMentioned and mentionCount)
   */
  async recordMention(entityId: string): Promise<EntityMemory> {
    logger.info("EntityMemoryManager.recordMention", { entityId });

    const entity = await db.entityMemory.update({
      where: { id: entityId },
      data: {
        lastMentioned: new Date(),
        mentionCount: { increment: 1 },
      },
    });

    return this.mapToEntityMemory(entity);
  }

  /**
   * Map Prisma entity to EntityMemory interface
   */
  private mapToEntityMemory(entity: any): EntityMemory {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      entityType: entity.entityType as EntityType,
      entityName: entity.entityName,
      attributes: (entity.attributes as Record<string, string>) || {},
      relationships: (entity.relationships as any[]).map((r: any) => ({
        relatedEntityId: r.entityId,
        relationship: r.type,
      })),
      notes: (entity.notes as any[]).map((n: any) =>
        typeof n === 'string' ? n : n.content
      ),
      lastMentioned: entity.lastMentioned,
      mentionCount: entity.mentionCount,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}

// Export singleton instance
export const entityMemoryManager = new EntityMemoryManager();
