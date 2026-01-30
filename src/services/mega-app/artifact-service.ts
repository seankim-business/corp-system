/**
 * Mega App Artifact Service
 *
 * Manages Value Stream Artifacts - the data that flows between modules.
 * Handles CRUD operations, versioning, lineage tracking, and status management.
 */
import { PrismaClient, Prisma, ValueStreamArtifact, ArtifactLink } from "@prisma/client";
import { Redis } from "ioredis";
import { logger } from "../../utils/logger";
import { db } from "../../db/client";
import { valueStreamQueue } from "../../queue/value-stream.queue";

export type ArtifactStatus = "draft" | "review" | "approved" | "archived" | "failed";

export interface CreateArtifactInput {
  moduleId: string;
  data: Record<string, unknown>;
  seasonCode?: string;
  collectionId?: string;
  tags?: string[];
  upstreamArtifactIds?: string[];
  createdBy?: string;
}

export interface UpdateArtifactInput {
  data?: Record<string, unknown>;
  status?: ArtifactStatus;
  tags?: string[];
}

export interface ArtifactWithLinks extends ValueStreamArtifact {
  upstreamLinks: (ArtifactLink & { upstream: ValueStreamArtifact })[];
  downstreamLinks: (ArtifactLink & { downstream: ValueStreamArtifact })[];
}

export interface ArtifactReference {
  artifactId: string;
  moduleId: string;
  version: number;
  relationshipType: "source" | "derived" | "reference";
}

export interface ListArtifactsOptions {
  moduleId?: string;
  status?: ArtifactStatus;
  seasonCode?: string;
  collectionId?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  orderBy?: "createdAt" | "updatedAt";
  orderDirection?: "asc" | "desc";
}

export class ArtifactService {
  private prisma: PrismaClient;
  private redis: Redis | null;
  private cachePrefix = "mega:artifact:";
  private cacheTTL = 60; // 1 minute for artifacts (frequently updated)

  constructor(prisma: PrismaClient, redis?: Redis) {
    this.prisma = prisma;
    this.redis = redis || null;
  }

  private getCacheKey(orgId: string, suffix: string): string {
    return `${this.cachePrefix}${orgId}:${suffix}`;
  }

  /**
   * Create a new artifact
   */
  async create(
    orgId: string,
    input: CreateArtifactInput
  ): Promise<ValueStreamArtifact> {
    const artifact = await this.prisma.$transaction(async (tx) => {
      // Create the artifact
      const created = await tx.valueStreamArtifact.create({
        data: {
          organizationId: orgId,
          moduleId: input.moduleId,
          data: input.data as Prisma.InputJsonValue,
          seasonCode: input.seasonCode,
          collectionId: input.collectionId,
          tags: input.tags || [],
          createdBy: input.createdBy,
          status: "draft",
          version: 1,
        },
      });

      // Create links to upstream artifacts
      if (input.upstreamArtifactIds && input.upstreamArtifactIds.length > 0) {
        await tx.artifactLink.createMany({
          data: input.upstreamArtifactIds.map((upstreamId) => ({
            upstreamId,
            downstreamId: created.id,
            relationshipType: "source",
          })),
        });
      }

      return created;
    });

    // Emit event
    await valueStreamQueue.emitArtifactCreated(
      orgId,
      input.moduleId,
      artifact.id,
      input.upstreamArtifactIds
    );

    await this.invalidateCache(orgId);
    logger.info(`Created artifact: ${artifact.id}`, {
      orgId,
      moduleId: input.moduleId,
      version: artifact.version,
    });

    return artifact;
  }

  /**
   * Update an artifact (creates a new version)
   */
  async update(
    orgId: string,
    artifactId: string,
    input: UpdateArtifactInput,
    createNewVersion = false
  ): Promise<ValueStreamArtifact> {
    const existing = await this.prisma.valueStreamArtifact.findFirst({
      where: { id: artifactId, organizationId: orgId },
    });

    if (!existing) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }

    const previousStatus = existing.status;

    if (createNewVersion && input.data) {
      // Create a new version
      const newArtifact = await this.prisma.$transaction(async (tx) => {
        // Create new version
        const created = await tx.valueStreamArtifact.create({
          data: {
            organizationId: orgId,
            moduleId: existing.moduleId,
            data: input.data as Prisma.InputJsonValue,
            seasonCode: existing.seasonCode,
            collectionId: existing.collectionId,
            tags: input.tags ?? existing.tags,
            status: input.status ?? "draft",
            version: existing.version + 1,
            previousVersionId: existing.id,
            createdBy: existing.createdBy,
          },
        });

        // Copy upstream links
        const existingLinks = await tx.artifactLink.findMany({
          where: { downstreamId: existing.id },
        });

        if (existingLinks.length > 0) {
          await tx.artifactLink.createMany({
            data: existingLinks.map((link) => ({
              upstreamId: link.upstreamId,
              downstreamId: created.id,
              relationshipType: link.relationshipType,
            })),
          });
        }

        return created;
      });

      await valueStreamQueue.emitArtifactUpdated(
        orgId,
        newArtifact.moduleId,
        newArtifact.id,
        newArtifact.version
      );

      await this.invalidateCache(orgId);
      return newArtifact;
    } else {
      // Update in place
      const updated = await this.prisma.valueStreamArtifact.update({
        where: { id: artifactId },
        data: {
          ...(input.data && { data: input.data as Prisma.InputJsonValue }),
          ...(input.status && { status: input.status }),
          ...(input.tags && { tags: input.tags }),
        },
      });

      if (input.status && input.status !== previousStatus) {
        await valueStreamQueue.emitArtifactStatusChanged(
          orgId,
          updated.moduleId,
          updated.id,
          previousStatus,
          input.status
        );
      }

      await this.invalidateCache(orgId);
      return updated;
    }
  }

  /**
   * Get an artifact by ID
   */
  async get(
    orgId: string,
    artifactId: string
  ): Promise<ValueStreamArtifact | null> {
    const cacheKey = this.getCacheKey(orgId, `get:${artifactId}`);

    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const artifact = await this.prisma.valueStreamArtifact.findFirst({
      where: { id: artifactId, organizationId: orgId },
    });

    if (artifact && this.redis) {
      await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(artifact));
    }

    return artifact;
  }

  /**
   * Get an artifact with all its links
   */
  async getWithLinks(
    orgId: string,
    artifactId: string
  ): Promise<ArtifactWithLinks | null> {
    const artifact = await this.prisma.valueStreamArtifact.findFirst({
      where: { id: artifactId, organizationId: orgId },
      include: {
        upstreamLinks: {
          include: { upstream: true },
        },
        downstreamLinks: {
          include: { downstream: true },
        },
      },
    });

    return artifact as ArtifactWithLinks | null;
  }

  /**
   * List artifacts with filters
   */
  async list(
    orgId: string,
    options: ListArtifactsOptions = {}
  ): Promise<ValueStreamArtifact[]> {
    const where: Record<string, unknown> = { organizationId: orgId };

    if (options.moduleId) where.moduleId = options.moduleId;
    if (options.status) where.status = options.status;
    if (options.seasonCode) where.seasonCode = options.seasonCode;
    if (options.collectionId) where.collectionId = options.collectionId;
    if (options.tags && options.tags.length > 0) {
      where.tags = { hasSome: options.tags };
    }

    return this.prisma.valueStreamArtifact.findMany({
      where,
      take: options.limit,
      skip: options.offset,
      orderBy: {
        [options.orderBy || "createdAt"]: options.orderDirection || "desc",
      },
    });
  }

  /**
   * Get the latest artifact for a module
   */
  async getLatestForModule(
    orgId: string,
    moduleId: string,
    status?: ArtifactStatus
  ): Promise<ValueStreamArtifact | null> {
    const where: Record<string, unknown> = {
      organizationId: orgId,
      moduleId,
    };
    if (status) where.status = status;

    return this.prisma.valueStreamArtifact.findFirst({
      where,
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Link two artifacts
   */
  async linkArtifacts(
    upstreamId: string,
    downstreamId: string,
    relationshipType: "source" | "derived" | "reference" = "derived"
  ): Promise<ArtifactLink> {
    const link = await this.prisma.artifactLink.create({
      data: {
        upstreamId,
        downstreamId,
        relationshipType,
      },
    });

    logger.info(`Linked artifacts: ${upstreamId} -> ${downstreamId}`, {
      relationshipType,
    });

    return link;
  }

  /**
   * Get upstream artifacts (what this artifact was created from)
   */
  async getUpstream(
    orgId: string,
    artifactId: string,
    depth = 1
  ): Promise<ArtifactReference[]> {
    const result: ArtifactReference[] = [];
    const visited = new Set<string>();
    const queue: { id: string; currentDepth: number }[] = [
      { id: artifactId, currentDepth: 0 },
    ];

    while (queue.length > 0) {
      const { id, currentDepth } = queue.shift()!;

      if (currentDepth >= depth || visited.has(id)) continue;
      visited.add(id);

      const links = await this.prisma.artifactLink.findMany({
        where: { downstreamId: id },
        include: { upstream: true },
      });

      for (const link of links) {
        if (link.upstream.organizationId === orgId) {
          result.push({
            artifactId: link.upstream.id,
            moduleId: link.upstream.moduleId,
            version: link.upstream.version,
            relationshipType: link.relationshipType as ArtifactReference["relationshipType"],
          });

          queue.push({ id: link.upstream.id, currentDepth: currentDepth + 1 });
        }
      }
    }

    return result;
  }

  /**
   * Get downstream artifacts (what was created from this artifact)
   */
  async getDownstream(
    orgId: string,
    artifactId: string,
    depth = 1
  ): Promise<ArtifactReference[]> {
    const result: ArtifactReference[] = [];
    const visited = new Set<string>();
    const queue: { id: string; currentDepth: number }[] = [
      { id: artifactId, currentDepth: 0 },
    ];

    while (queue.length > 0) {
      const { id, currentDepth } = queue.shift()!;

      if (currentDepth >= depth || visited.has(id)) continue;
      visited.add(id);

      const links = await this.prisma.artifactLink.findMany({
        where: { upstreamId: id },
        include: { downstream: true },
      });

      for (const link of links) {
        if (link.downstream.organizationId === orgId) {
          result.push({
            artifactId: link.downstream.id,
            moduleId: link.downstream.moduleId,
            version: link.downstream.version,
            relationshipType: link.relationshipType as ArtifactReference["relationshipType"],
          });

          queue.push({ id: link.downstream.id, currentDepth: currentDepth + 1 });
        }
      }
    }

    return result;
  }

  /**
   * Get all artifact IDs for modules (for dependency checking)
   */
  async getAvailableModuleArtifacts(
    orgId: string,
    seasonCode?: string
  ): Promise<Map<string, string>> {
    const where: Record<string, unknown> = {
      organizationId: orgId,
      status: { in: ["approved", "review"] }, // Only approved/review artifacts count
    };
    if (seasonCode) where.seasonCode = seasonCode;

    const artifacts = await this.prisma.valueStreamArtifact.findMany({
      where,
      select: { id: true, moduleId: true },
      orderBy: { createdAt: "desc" },
      distinct: ["moduleId"],
    });

    const map = new Map<string, string>();
    for (const artifact of artifacts) {
      if (!map.has(artifact.moduleId)) {
        map.set(artifact.moduleId, artifact.id);
      }
    }

    return map;
  }

  /**
   * Delete an artifact (soft delete by archiving)
   */
  async delete(
    orgId: string,
    artifactId: string,
    hard = false
  ): Promise<void> {
    if (hard) {
      // Check for downstream dependencies
      const downstream = await this.getDownstream(orgId, artifactId, 1);
      if (downstream.length > 0) {
        throw new Error(
          `Cannot delete artifact ${artifactId}: ${downstream.length} artifacts depend on it`
        );
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.artifactLink.deleteMany({
          where: {
            OR: [{ upstreamId: artifactId }, { downstreamId: artifactId }],
          },
        });
        await tx.valueStreamArtifact.delete({
          where: { id: artifactId },
        });
      });
    } else {
      await this.prisma.valueStreamArtifact.update({
        where: { id: artifactId },
        data: { status: "archived" },
      });
    }

    await this.invalidateCache(orgId);
    logger.info(`Deleted artifact: ${artifactId}`, { orgId, hard });
  }

  /**
   * Invalidate cache for an organization
   */
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
let serviceInstance: ArtifactService | null = null;

export function getArtifactService(
  prisma?: PrismaClient,
  redis?: Redis
): ArtifactService {
  if (!serviceInstance) {
    serviceInstance = new ArtifactService(prisma || db, redis);
  }
  return serviceInstance;
}
