import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { logger } from '../../utils/logger';
import {
  Extension,
  ExtensionDefinition,
  ExtensionDefinitionSchema,
  ExtensionId,
  ListOptions,
  ResolvedSkill,
  SearchOptions,
} from './types';

export class ExtensionRegistry {
  private prisma: PrismaClient;
  private redis: Redis | null;
  private cachePrefix = 'ext:registry:';
  private cacheTTL = 300; // 5 minutes

  constructor(prisma: PrismaClient, redis?: Redis) {
    this.prisma = prisma;
    this.redis = redis || null;
  }

  private getCacheKey(orgId: string, suffix: string): string {
    return `${this.cachePrefix}${orgId}:${suffix}`;
  }

  async listExtensions(orgId: string, options: ListOptions = {}): Promise<Extension[]> {
    const cacheKey = this.getCacheKey(orgId, `list:${JSON.stringify(options)}`);

    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    const where: any = {
      OR: [
        { organizationId: orgId },
        { organizationId: null, isPublic: true },
      ],
      status: 'active',
    };

    if (options.type) where.extensionType = options.type;
    if (options.category) where.category = options.category;
    if (options.enabled !== undefined) where.enabled = options.enabled;

    const extensions = await this.prisma.marketplaceExtension.findMany({
      where,
      take: options.limit || 100,
      skip: options.offset || 0,
      orderBy: { updatedAt: 'desc' },
    });

    const result = extensions.map(this.toExtension);

    if (this.redis) {
      await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
    }

    return result;
  }

  async listSkills(orgId: string, options: ListOptions = {}): Promise<Extension[]> {
    return this.listExtensions(orgId, { ...options, type: 'skill' });
  }

  async getExtension(orgId: string, slug: string): Promise<Extension | null> {
    const extension = await this.prisma.marketplaceExtension.findFirst({
      where: {
        slug,
        OR: [
          { organizationId: orgId },
          { organizationId: null, isPublic: true },
        ],
      },
    });

    return extension ? this.toExtension(extension) : null;
  }

  async getExtensionById(id: ExtensionId): Promise<Extension | null> {
    const extension = await this.prisma.marketplaceExtension.findUnique({
      where: { id },
    });

    return extension ? this.toExtension(extension) : null;
  }

  async searchExtensions(query: string, orgId: string, options: SearchOptions = {}): Promise<Extension[]> {
    const where: any = {
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { tags: { has: query.toLowerCase() } },
      ],
      AND: {
        OR: [
          { organizationId: orgId },
          ...(options.includeGlobal !== false ? [{ organizationId: null, isPublic: true }] : []),
        ],
      },
      status: 'active',
    };

    if (options.type) where.extensionType = options.type;

    const extensions = await this.prisma.marketplaceExtension.findMany({
      where,
      take: options.limit || 50,
      orderBy: [{ downloads: 'desc' }, { rating: 'desc' }],
    });

    return extensions.map(this.toExtension);
  }

  async resolveSkillsForRequest(
    orgId: string,
    request: string,
    _agentId?: string
  ): Promise<ResolvedSkill[]> {
    const skills = await this.listSkills(orgId, { enabled: true });
    const requestLower = request.toLowerCase();
    const words = requestLower.split(/\s+/);

    const matches: ResolvedSkill[] = [];

    for (const skill of skills) {
      const matchedTriggers: string[] = [];
      let score = 0;

      for (const trigger of skill.triggers) {
        const triggerLower = trigger.toLowerCase();
        if (requestLower.includes(triggerLower)) {
          matchedTriggers.push(trigger);
          score += triggerLower.length;
        } else if (words.some(w => triggerLower.includes(w))) {
          matchedTriggers.push(trigger);
          score += 1;
        }
      }

      if (matchedTriggers.length > 0) {
        matches.push({ skill, score, matchedTriggers });
      }
    }

    return matches.sort((a, b) => b.score - a.score);
  }

  async registerExtension(
    orgId: string,
    definition: ExtensionDefinition,
    createdBy?: string
  ): Promise<Extension> {
    const validated = ExtensionDefinitionSchema.parse(definition);

    const extension = await this.prisma.marketplaceExtension.create({
      data: {
        organizationId: orgId,
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
        runtimeConfig: validated.runtimeConfig as any,
        triggers: validated.triggers,
        parameters: validated.parameters as any,
        outputs: validated.outputs as any,
        dependencies: validated.dependencies,
        toolsRequired: validated.toolsRequired,
        mcpProviders: validated.mcpProviders,
        isPublic: validated.isPublic,
        enabled: validated.enabled,
        manifest: {},
        createdBy,
      },
    });

    await this.invalidateCache(orgId);
    logger.info('Extension registered', { slug: validated.slug, orgId });

    return this.toExtension(extension);
  }

  async updateExtension(
    id: ExtensionId,
    updates: Partial<ExtensionDefinition>
  ): Promise<Extension> {
    const extension = await this.prisma.marketplaceExtension.update({
      where: { id },
      data: updates as any,
    });

    if (extension.organizationId) {
      await this.invalidateCache(extension.organizationId);
    }

    return this.toExtension(extension);
  }

  async deleteExtension(id: ExtensionId): Promise<void> {
    const extension = await this.prisma.marketplaceExtension.delete({
      where: { id },
    });

    if (extension.organizationId) {
      await this.invalidateCache(extension.organizationId);
    }
  }

  async getSkillsForAgent(agentId: string, _orgId: string): Promise<Extension[]> {
    const assignments = await this.prisma.agentSkillAssignment.findMany({
      where: { agentId, enabled: true },
      include: { extension: true },
      orderBy: { priority: 'desc' },
    });

    return assignments
      .filter((a: { extension: { status: string } }) => a.extension.status === 'active')
      .map((a: { extension: any }) => this.toExtension(a.extension));
  }

  private async invalidateCache(orgId: string): Promise<void> {
    if (!this.redis) return;

    const keys = await this.redis.keys(`${this.cachePrefix}${orgId}:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  private toExtension(row: any): Extension {
    return {
      id: row.id as ExtensionId,
      organizationId: row.organizationId,
      publisherId: row.publisherId,
      slug: row.slug,
      name: row.name,
      description: row.description,
      version: row.version,
      extensionType: row.extensionType,
      category: row.category,
      tags: row.tags || [],
      source: row.source,
      format: row.format,
      runtimeType: row.runtimeType,
      runtimeConfig: row.runtimeConfig,
      triggers: row.triggers || [],
      parameters: row.parameters || [],
      outputs: row.outputs || [],
      dependencies: row.dependencies || [],
      toolsRequired: row.toolsRequired || [],
      mcpProviders: row.mcpProviders || [],
      isPublic: row.isPublic,
      verified: row.verified,
      downloads: row.downloads,
      rating: row.rating,
      ratingCount: row.ratingCount,
      status: row.status,
      enabled: row.enabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
