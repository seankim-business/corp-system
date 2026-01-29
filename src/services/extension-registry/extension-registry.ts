/**
 * Extension Registry Service (Stub)
 *
 * TODO: Implement when MarketplaceExtension and AgentSkillAssignment tables are added to Prisma schema
 */
import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";
import { logger } from "../../utils/logger";
import {
  Extension,
  ExtensionDefinition,
  ExtensionDefinitionSchema,
  ExtensionId,
  ListOptions,
  ResolvedSkill,
  SearchOptions,
} from "./types";

export class ExtensionRegistry {
  // @ts-expect-error Prisma client reserved for future use when MarketplaceExtension table is added
  private _prisma: PrismaClient;
  private redis: Redis | null;
  private cachePrefix = "ext:registry:";

  constructor(prisma: PrismaClient, redis?: Redis) {
    this._prisma = prisma;
    this.redis = redis || null;
  }

  private getCacheKey(orgId: string, suffix: string): string {
    return `${this.cachePrefix}${orgId}:${suffix}`;
  }

  async listExtensions(_orgId: string, _options: ListOptions = {}): Promise<Extension[]> {
    // Stub: Return empty array until MarketplaceExtension table is added
    logger.debug("ExtensionRegistry.listExtensions called (stub)");
    return [];
  }

  async listSkills(orgId: string, options: ListOptions = {}): Promise<Extension[]> {
    return this.listExtensions(orgId, { ...options, type: "skill" });
  }

  async getExtension(_orgId: string, _slug: string): Promise<Extension | null> {
    // Stub: Return null until MarketplaceExtension table is added
    logger.debug("ExtensionRegistry.getExtension called (stub)");
    return null;
  }

  async getExtensionById(_id: ExtensionId): Promise<Extension | null> {
    // Stub: Return null until MarketplaceExtension table is added
    logger.debug("ExtensionRegistry.getExtensionById called (stub)");
    return null;
  }

  async searchExtensions(
    _query: string,
    _orgId: string,
    _options: SearchOptions = {},
  ): Promise<Extension[]> {
    // Stub: Return empty array until MarketplaceExtension table is added
    logger.debug("ExtensionRegistry.searchExtensions called (stub)");
    return [];
  }

  async resolveSkillsForRequest(
    _orgId: string,
    _request: string,
    _agentId?: string,
  ): Promise<ResolvedSkill[]> {
    // Stub: Return empty array until extension system is implemented
    return [];
  }

  async registerExtension(
    _orgId: string,
    definition: ExtensionDefinition,
    _createdBy?: string,
  ): Promise<Extension> {
    const validated = ExtensionDefinitionSchema.parse(definition);

    // Stub: Return a mock extension until MarketplaceExtension table is added
    logger.warn("ExtensionRegistry.registerExtension called (stub) - extension not persisted");

    return {
      id: `stub-${Date.now()}` as ExtensionId,
      organizationId: _orgId,
      publisherId: null,
      verified: false,
      slug: validated.slug,
      name: validated.name,
      description: validated.description,
      version: validated.version,
      extensionType: validated.extensionType,
      category: validated.category,
      tags: validated.tags,
      source: validated.source,
      format: validated.format,
      runtimeType: validated.runtimeType,
      runtimeConfig: validated.runtimeConfig,
      triggers: validated.triggers,
      parameters: validated.parameters,
      outputs: validated.outputs,
      dependencies: validated.dependencies,
      toolsRequired: validated.toolsRequired,
      mcpProviders: validated.mcpProviders,
      isPublic: validated.isPublic ?? false,
      enabled: validated.enabled ?? true,
      status: "active",
      downloads: 0,
      rating: null,
      ratingCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async updateExtension(
    id: ExtensionId,
    _updates: Partial<ExtensionDefinition>,
  ): Promise<Extension> {
    // Stub: Return mock until MarketplaceExtension table is added
    logger.warn("ExtensionRegistry.updateExtension called (stub) - update not persisted");

    return {
      id,
      organizationId: null,
      publisherId: null,
      verified: false,
      slug: "stub",
      name: "Stub Extension",
      description: "",
      version: "1.0.0",
      extensionType: "skill" as const,
      category: "general",
      tags: [],
      source: "yaml" as const,
      format: "native" as const,
      runtimeType: "prompt" as const,
      runtimeConfig: {},
      triggers: [],
      parameters: [],
      outputs: [],
      dependencies: [],
      toolsRequired: [],
      mcpProviders: [],
      isPublic: false,
      enabled: true,
      status: "active",
      downloads: 0,
      rating: null,
      ratingCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async deleteExtension(_id: ExtensionId): Promise<void> {
    // Stub: No-op until MarketplaceExtension table is added
    logger.warn("ExtensionRegistry.deleteExtension called (stub) - deletion not persisted");
  }

  async getSkillsForAgent(_agentId: string, _orgId: string): Promise<Extension[]> {
    // Stub: Return empty array until AgentSkillAssignment table is added
    logger.debug("ExtensionRegistry.getSkillsForAgent called (stub)");
    return [];
  }

  async invalidateCache(orgId: string): Promise<void> {
    if (!this.redis) return;

    const pattern = this.getCacheKey(orgId, "*");
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

// Singleton instance
let registryInstance: ExtensionRegistry | null = null;

export function getExtensionRegistry(prisma: PrismaClient, redis?: Redis): ExtensionRegistry {
  if (!registryInstance) {
    registryInstance = new ExtensionRegistry(prisma, redis);
  }
  return registryInstance;
}
