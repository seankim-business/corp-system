/**
 * Extension Registry Service
 *
 * Manages marketplace extensions and skills with Prisma persistence
 */
import { PrismaClient, MarketplaceExtension, ExtensionType as PrismaExtensionType, Prisma } from "@prisma/client";
import { Redis } from "ioredis";
import { createHash } from "crypto";
import { logger } from "../../utils/logger";
import { db } from "../../db/client";
import {
  Extension,
  ExtensionDefinition,
  ExtensionDefinitionSchema,
  ExtensionId,
  ListOptions,
  ResolvedSkill,
  SearchOptions,
  MegaAppModuleConfig,
} from "./types";

export class ExtensionRegistry {
  private prisma: PrismaClient;
  private redis: Redis | null;
  private cachePrefix = "ext:registry:";

  constructor(prisma: PrismaClient, redis?: Redis) {
    this.prisma = prisma;
    this.redis = redis || null;
  }

  private getCacheKey(orgId: string, suffix: string): string {
    return `${this.cachePrefix}${orgId}:${suffix}`;
  }

  private hashKey(obj: Record<string, unknown>): string {
    return createHash("sha256").update(JSON.stringify(obj)).digest("hex").slice(0, 16);
  }

  private mapToExtension(record: MarketplaceExtension): Extension {
    return {
      id: record.id as ExtensionId,
      organizationId: record.organizationId,
      publisherId: record.publisherId,
      slug: record.slug,
      name: record.name,
      description: record.description,
      version: record.version,
      extensionType: record.extensionType as Extension["extensionType"],
      category: record.category,
      tags: record.tags || [],
      source: (record.source as Extension["source"]) || "yaml",
      format: (record.format as Extension["format"]) || "native",
      runtimeType: (record.runtimeType as Extension["runtimeType"]) || "prompt",
      runtimeConfig: (record.runtimeConfig as Record<string, unknown>) || {},
      triggers: record.triggers || [],
      parameters: (record.parameters as Extension["parameters"]) || [],
      outputs: (record.outputs as Extension["outputs"]) || [],
      dependencies: record.dependencies || [],
      toolsRequired: record.toolsRequired || [],
      mcpProviders: record.mcpProviders || [],
      megaAppConfig: (record.megaAppConfig as MegaAppModuleConfig | null) || undefined,
      isPublic: record.isPublic,
      verified: record.verified,
      enabled: record.enabled,
      downloads: record.downloads,
      rating: record.rating,
      ratingCount: record.ratingCount,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  async listExtensions(orgId: string, options: ListOptions = {}): Promise<Extension[]> {
    const cacheKey = this.getCacheKey(orgId, `list:${this.hashKey(options as Record<string, unknown>)}`);

    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached).map((r: MarketplaceExtension) => this.mapToExtension(r));
      }
    }

    const where: {
      OR?: Array<{ organizationId: string | null } | { organizationId?: null; isPublic: boolean }>;
      extensionType?: PrismaExtensionType;
      category?: string;
      enabled?: boolean;
    } = {
      OR: [
        { organizationId: orgId },
        { organizationId: null, isPublic: true },
      ],
    };

    if (options.type) {
      where.extensionType = options.type.toUpperCase() as PrismaExtensionType;
    }
    if (options.category) {
      where.category = options.category;
    }
    if (options.enabled !== undefined) {
      where.enabled = options.enabled;
    }

    const records = await this.prisma.marketplaceExtension.findMany({
      where,
      take: options.limit,
      skip: options.offset,
      orderBy: { createdAt: 'desc' },
    });

    if (this.redis) {
      await this.redis.setex(cacheKey, 300, JSON.stringify(records)); // 5 min cache
    }

    return records.map((r: MarketplaceExtension) => this.mapToExtension(r));
  }

  async listSkills(orgId: string, options: ListOptions = {}): Promise<Extension[]> {
    return this.listExtensions(orgId, { ...options, type: "skill" });
  }

  async getExtension(orgId: string, slug: string): Promise<Extension | null> {
    const record = await this.prisma.marketplaceExtension.findFirst({
      where: {
        slug,
        OR: [
          { organizationId: orgId },
          { isPublic: true },
        ],
      },
    });

    return record ? this.mapToExtension(record) : null;
  }

  async getExtensionById(id: ExtensionId): Promise<Extension | null> {
    const record = await this.prisma.marketplaceExtension.findUnique({
      where: { id },
    });

    return record ? this.mapToExtension(record) : null;
  }

  async searchExtensions(
    query: string,
    orgId: string,
    options: SearchOptions = {},
  ): Promise<Extension[]> {
    const lowerQuery = query.toLowerCase();

    const where: {
      AND: Array<{
        OR?: Array<{ name?: { contains: string; mode: 'insensitive' }; description?: { contains: string; mode: 'insensitive' }; tags?: { hasSome: string[] } }>;
        extensionType?: PrismaExtensionType;
        category?: string;
        enabled?: boolean;
      }>;
      OR?: Array<{ organizationId: string | null } | { organizationId?: null; isPublic: boolean }>;
    } = {
      AND: [
        {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { tags: { hasSome: [query] } },
          ],
        },
      ],
    };

    if (options.includeGlobal !== false) {
      where.OR = [
        { organizationId: orgId },
        { organizationId: null, isPublic: true },
      ];
    } else {
      where.AND.push({ organizationId: orgId } as never);
    }

    if (options.type) {
      where.AND.push({ extensionType: options.type.toUpperCase() as PrismaExtensionType });
    }
    if (options.category) {
      where.AND.push({ category: options.category });
    }
    if (options.enabled !== undefined) {
      where.AND.push({ enabled: options.enabled });
    }

    const records = await this.prisma.marketplaceExtension.findMany({
      where,
      take: options.limit,
      skip: options.offset,
      orderBy: [
        { rating: 'desc' },
        { downloads: 'desc' },
      ],
    });

    // Score results by relevance
    const scored = records.map((r: MarketplaceExtension) => {
      let score = 0;
      const nameLower = r.name.toLowerCase();
      const descLower = r.description.toLowerCase();

      if (nameLower.includes(lowerQuery)) score += 10;
      if (descLower.includes(lowerQuery)) score += 5;
      if (r.tags.some((t: string) => t.toLowerCase().includes(lowerQuery))) score += 3;

      return { record: r, score };
    });

    scored.sort((a: { score: number }, b: { score: number }) => b.score - a.score);

    return scored.map((s: { record: MarketplaceExtension; score: number }) => this.mapToExtension(s.record));
  }

  async resolveSkillsForRequest(
    orgId: string,
    request: string,
    agentId?: string,
  ): Promise<ResolvedSkill[]> {
    const cacheKey = this.getCacheKey(orgId, `resolve:${this.hashKey({ request, agentId })}`);

    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    // Extract keywords from request
    const keywords = request
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2);

    // Find all enabled skills for this org
    const skills = await this.prisma.marketplaceExtension.findMany({
      where: {
        extensionType: 'skill',
        enabled: true,
        OR: [
          { organizationId: orgId },
          { organizationId: null, isPublic: true },
        ],
      },
    });

    // If agentId provided, filter by agent assignments
    let agentSkills: string[] = [];
    if (agentId) {
      const assignments = await this.prisma.agentSkillAssignment.findMany({
        where: {
          organizationId: orgId,
          agentId,
          enabled: true,
        },
        select: { extensionId: true },
      });
      agentSkills = assignments.map(a => a.extensionId);
    }

    // Score each skill by trigger match
    const resolved: ResolvedSkill[] = [];

    for (const skill of skills) {
      // Prefer agent-assigned skills
      const isAgentSkill = agentId ? agentSkills.includes(skill.id) : false;

      const triggers = skill.triggers || [];
      const matchedTriggers: string[] = [];
      let score = 0;

      for (const trigger of triggers) {
        const triggerLower = trigger.toLowerCase();

        // Exact phrase match
        if (request.toLowerCase().includes(triggerLower)) {
          matchedTriggers.push(trigger);
          score += 10;
        } else {
          // Keyword overlap
          const triggerWords = triggerLower.split(/\s+/).filter(w => w.length > 2);
          const overlap = triggerWords.filter(w => keywords.includes(w)).length;

          if (overlap > 0) {
            matchedTriggers.push(trigger);
            score += overlap * 2;
          }
        }
      }

      if (matchedTriggers.length > 0 || isAgentSkill) {
        // Boost for agent-assigned skills
        if (isAgentSkill) {
          score += 5;
        }

        resolved.push({
          skill: this.mapToExtension(skill),
          score,
          matchedTriggers,
        });
      }
    }

    // Sort by score descending
    resolved.sort((a, b) => b.score - a.score);

    if (this.redis) {
      await this.redis.setex(cacheKey, 120, JSON.stringify(resolved)); // 2 min cache
    }

    logger.debug(`Resolved ${resolved.length} skills for request`, {
      orgId,
      request: request.slice(0, 100),
      topSkills: resolved.slice(0, 3).map(r => ({ slug: r.skill.slug, score: r.score })),
    });

    return resolved;
  }

  async registerExtension(
    orgId: string,
    definition: ExtensionDefinition,
    createdBy?: string,
  ): Promise<Extension> {
    const validated = ExtensionDefinitionSchema.parse(definition);

    const record = await this.prisma.marketplaceExtension.create({
      data: {
        organizationId: orgId,
        slug: validated.slug,
        name: validated.name,
        description: validated.description,
        version: validated.version,
        extensionType: validated.extensionType as PrismaExtensionType,
        category: validated.category,
        tags: validated.tags,
        source: validated.source || 'yaml',
        format: validated.format || 'native',
        manifest: {},
        definition: JSON.parse(JSON.stringify(validated)),
        runtimeType: validated.runtimeType || 'prompt',
        runtimeConfig: JSON.parse(JSON.stringify(validated.runtimeConfig || {})),
        triggers: validated.triggers,
        parameters: JSON.parse(JSON.stringify(validated.parameters)),
        outputs: JSON.parse(JSON.stringify(validated.outputs)),
        dependencies: validated.dependencies,
        toolsRequired: validated.toolsRequired,
        mcpProviders: validated.mcpProviders,
        publisherId: null,
        isPublic: validated.isPublic ?? false,
        verified: false,
        downloads: 0,
        rating: null,
        ratingCount: 0,
        status: 'active',
        enabled: validated.enabled ?? true,
        createdBy,
      },
    });

    await this.invalidateCache(orgId);

    logger.info(`Registered extension: ${validated.slug}`, { orgId, extensionId: record.id });

    return this.mapToExtension(record);
  }

  async updateExtension(
    id: ExtensionId,
    updates: Partial<ExtensionDefinition>,
  ): Promise<Extension> {
    const existing = await this.prisma.marketplaceExtension.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error(`Extension not found: ${id}`);
    }

    const data: Record<string, unknown> = {};

    if (updates.name !== undefined) data.name = updates.name;
    if (updates.description !== undefined) data.description = updates.description;
    if (updates.version !== undefined) data.version = updates.version;
    if (updates.category !== undefined) data.category = updates.category;
    if (updates.tags !== undefined) data.tags = updates.tags;
    if (updates.runtimeType !== undefined) data.runtimeType = updates.runtimeType;
    if (updates.runtimeConfig !== undefined) data.runtimeConfig = updates.runtimeConfig;
    if (updates.triggers !== undefined) data.triggers = updates.triggers;
    if (updates.parameters !== undefined) data.parameters = updates.parameters;
    if (updates.outputs !== undefined) data.outputs = updates.outputs;
    if (updates.dependencies !== undefined) data.dependencies = updates.dependencies;
    if (updates.toolsRequired !== undefined) data.toolsRequired = updates.toolsRequired;
    if (updates.mcpProviders !== undefined) data.mcpProviders = updates.mcpProviders;
    if (updates.enabled !== undefined) data.enabled = updates.enabled;

    const record = await this.prisma.marketplaceExtension.update({
      where: { id },
      data,
    });

    await this.invalidateCache(existing.organizationId!);

    logger.info(`Updated extension: ${record.slug}`, { extensionId: id });

    return this.mapToExtension(record);
  }

  async deleteExtension(id: ExtensionId): Promise<void> {
    const existing = await this.prisma.marketplaceExtension.findUnique({
      where: { id },
      select: { organizationId: true, slug: true },
    });

    if (!existing) {
      throw new Error(`Extension not found: ${id}`);
    }

    await this.prisma.marketplaceExtension.delete({
      where: { id },
    });

    await this.invalidateCache(existing.organizationId!);

    logger.info(`Deleted extension: ${existing.slug}`, { extensionId: id });
  }

  async getSkillsForAgent(agentId: string, orgId: string): Promise<Extension[]> {
    const assignments = await this.prisma.agentSkillAssignment.findMany({
      where: {
        organizationId: orgId,
        agentId,
        enabled: true,
      },
      include: {
        extension: true,
      },
      orderBy: {
        priority: 'desc',
      },
    });

    return assignments
      .filter(a => a.extension !== null)
      .map(a => this.mapToExtension(a.extension!));
  }

  /**
   * Register an extension as a MegaApp module
   */
  async registerMegaAppModule(
    extensionId: string,
    config: MegaAppModuleConfig,
  ): Promise<Extension> {
    const existing = await this.prisma.marketplaceExtension.findUnique({
      where: { id: extensionId },
    });

    if (!existing) {
      throw new Error(`Extension not found: ${extensionId}`);
    }

    const updated = await this.prisma.marketplaceExtension.update({
      where: { id: extensionId },
      data: {
        megaAppConfig: config as never,
      },
    });

    await this.invalidateCache(existing.organizationId!);

    logger.info(`Registered MegaApp module: ${config.moduleId}`, {
      extensionId,
      moduleId: config.moduleId,
    });

    return this.mapToExtension(updated);
  }

  /**
   * Get all extensions configured as MegaApp modules for an organization
   */
  async getMegaAppModules(organizationId: string): Promise<MegaAppModuleConfig[]> {
    const cacheKey = this.getCacheKey(organizationId, 'mega-modules');

    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const extensions = await this.prisma.marketplaceExtension.findMany({
      where: {
        organizationId,
        megaAppConfig: { not: Prisma.JsonNull },
        enabled: true,
      },
    });

    const modules = extensions
      .map(ext => ext.megaAppConfig as MegaAppModuleConfig | null)
      .filter((config): config is MegaAppModuleConfig => config !== null);

    if (this.redis) {
      await this.redis.setex(cacheKey, 300, JSON.stringify(modules));
    }

    return modules;
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

export function getExtensionRegistry(prisma?: PrismaClient, redis?: Redis): ExtensionRegistry {
  if (!registryInstance) {
    registryInstance = new ExtensionRegistry(prisma || db, redis);
  }
  return registryInstance;
}
