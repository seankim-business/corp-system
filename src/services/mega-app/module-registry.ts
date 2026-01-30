/**
 * Mega App Module Registry
 *
 * Manages module definitions and their dependencies for the Value Stream system.
 * Modules are the building blocks of the Mega App - each module represents a step
 * in the fashion value stream (Research → Planning → Design → Production).
 */
import { PrismaClient, Prisma, MegaAppModule } from "@prisma/client";
import { Redis } from "ioredis";
import { createHash } from "crypto";
import { logger } from "../../utils/logger";
import { db } from "../../db/client";

export interface ModuleDefinition {
  id: string;
  name: string;
  description?: string;
  version: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  requiredInputs: string[]; // Module IDs that must provide input
  optionalInputs: string[]; // Module IDs that can enhance if available
  executorType: "ai-agent" | "workflow" | "mcp-tool" | "hybrid";
  executorConfig: {
    agentId?: string;
    workflowId?: string;
    mcpTool?: string;
    skillIds?: string[];
    [key: string]: unknown;
  };
  enabled?: boolean;
  status?: "draft" | "active" | "deprecated";
}

export interface ModuleFilter {
  enabled?: boolean;
  status?: string;
  executorType?: string;
}

export interface CanExecuteResult {
  canExecute: boolean;
  missingInputs: string[];
  availableInputs: string[];
  reason?: string;
}

export interface MissingInput {
  moduleId: string;
  moduleName: string;
  required: boolean;
}

export interface ExecutionPath {
  modules: string[];
  estimatedDuration?: number;
  complexity: "simple" | "medium" | "complex";
}

export class ModuleRegistry {
  private prisma: PrismaClient;
  private redis: Redis | null;
  private cachePrefix = "mega:module:";
  private cacheTTL = 300; // 5 minutes

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

  private mapToDefinition(record: MegaAppModule): ModuleDefinition {
    return {
      id: record.id,
      name: record.name,
      description: record.description || undefined,
      version: record.version,
      inputSchema: record.inputSchema as Record<string, unknown>,
      outputSchema: record.outputSchema as Record<string, unknown>,
      requiredInputs: record.requiredInputs,
      optionalInputs: record.optionalInputs,
      executorType: record.executorType as ModuleDefinition["executorType"],
      executorConfig: record.executorConfig as ModuleDefinition["executorConfig"],
      enabled: record.enabled,
      status: record.status as ModuleDefinition["status"],
    };
  }

  /**
   * Register a new module definition
   */
  async register(orgId: string, module: ModuleDefinition): Promise<ModuleDefinition> {
    // Validate no circular dependencies
    await this.validateNoCycles(orgId, module.id, module.requiredInputs);

    const record = await this.prisma.megaAppModule.upsert({
      where: {
        organizationId_id: {
          organizationId: orgId,
          id: module.id,
        },
      },
      create: {
        id: module.id,
        organizationId: orgId,
        name: module.name,
        description: module.description,
        version: module.version,
        inputSchema: module.inputSchema as Prisma.InputJsonValue,
        outputSchema: module.outputSchema as Prisma.InputJsonValue,
        requiredInputs: module.requiredInputs,
        optionalInputs: module.optionalInputs,
        executorType: module.executorType,
        executorConfig: module.executorConfig as Prisma.InputJsonValue,
        enabled: module.enabled ?? true,
        status: module.status ?? "draft",
      },
      update: {
        name: module.name,
        description: module.description,
        version: module.version,
        inputSchema: module.inputSchema as Prisma.InputJsonValue,
        outputSchema: module.outputSchema as Prisma.InputJsonValue,
        requiredInputs: module.requiredInputs,
        optionalInputs: module.optionalInputs,
        executorType: module.executorType,
        executorConfig: module.executorConfig as Prisma.InputJsonValue,
        enabled: module.enabled,
        status: module.status,
      },
    });

    await this.invalidateCache(orgId);
    logger.info(`Registered module: ${module.id}`, { orgId, moduleId: module.id });

    return this.mapToDefinition(record);
  }

  /**
   * Unregister a module
   */
  async unregister(orgId: string, moduleId: string): Promise<void> {
    // Check if any other modules depend on this one
    const dependents = await this.getDependents(orgId, moduleId);
    if (dependents.length > 0) {
      throw new Error(
        `Cannot unregister module ${moduleId}: it is required by ${dependents.join(", ")}`
      );
    }

    await this.prisma.megaAppModule.delete({
      where: {
        organizationId_id: {
          organizationId: orgId,
          id: moduleId,
        },
      },
    });

    await this.invalidateCache(orgId);
    logger.info(`Unregistered module: ${moduleId}`, { orgId });
  }

  /**
   * Get a module by ID
   */
  async get(orgId: string, moduleId: string): Promise<ModuleDefinition | null> {
    const cacheKey = this.getCacheKey(orgId, `get:${moduleId}`);

    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const record = await this.prisma.megaAppModule.findUnique({
      where: {
        organizationId_id: {
          organizationId: orgId,
          id: moduleId,
        },
      },
    });

    if (!record) return null;

    const definition = this.mapToDefinition(record);

    if (this.redis) {
      await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(definition));
    }

    return definition;
  }

  /**
   * List all modules with optional filtering
   */
  async list(orgId: string, filter?: ModuleFilter): Promise<ModuleDefinition[]> {
    const cacheKey = this.getCacheKey(orgId, `list:${this.hashKey(filter as Record<string, unknown> || {})}`);

    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const where: Record<string, unknown> = { organizationId: orgId };
    if (filter?.enabled !== undefined) where.enabled = filter.enabled;
    if (filter?.status) where.status = filter.status;
    if (filter?.executorType) where.executorType = filter.executorType;

    const records = await this.prisma.megaAppModule.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });

    const definitions = records.map((r) => this.mapToDefinition(r));

    if (this.redis) {
      await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(definitions));
    }

    return definitions;
  }

  /**
   * Get all modules that this module depends on (required inputs)
   */
  async getDependencies(orgId: string, moduleId: string): Promise<string[]> {
    const module = await this.get(orgId, moduleId);
    if (!module) return [];

    // Get transitive dependencies (recursive)
    const allDeps = new Set<string>();
    const queue = [...module.requiredInputs];

    while (queue.length > 0) {
      const depId = queue.shift()!;
      if (allDeps.has(depId)) continue;

      allDeps.add(depId);

      const dep = await this.get(orgId, depId);
      if (dep) {
        queue.push(...dep.requiredInputs);
      }
    }

    return Array.from(allDeps);
  }

  /**
   * Get all modules that depend on this module
   */
  async getDependents(orgId: string, moduleId: string): Promise<string[]> {
    const modules = await this.list(orgId);
    return modules
      .filter((m) => m.requiredInputs.includes(moduleId))
      .map((m) => m.id);
  }

  /**
   * Get the execution order for a set of target modules
   * Returns modules sorted topologically (dependencies first)
   */
  async getExecutionOrder(orgId: string, targetModuleIds: string[]): Promise<string[]> {
    const modules = await this.list(orgId);
    const moduleMap = new Map(modules.map((m) => [m.id, m]));

    // Build dependency graph
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    // Initialize
    for (const id of targetModuleIds) {
      inDegree.set(id, 0);
      adjList.set(id, []);
    }

    // Add all dependencies to the graph
    const allModules = new Set(targetModuleIds);
    const queue = [...targetModuleIds];

    while (queue.length > 0) {
      const moduleId = queue.shift()!;
      const module = moduleMap.get(moduleId);
      if (!module) continue;

      for (const depId of module.requiredInputs) {
        if (!allModules.has(depId)) {
          allModules.add(depId);
          queue.push(depId);
          inDegree.set(depId, 0);
          adjList.set(depId, []);
        }
        // depId -> moduleId (dependency points to dependent)
        adjList.get(depId)!.push(moduleId);
        inDegree.set(moduleId, (inDegree.get(moduleId) || 0) + 1);
      }
    }

    // Topological sort using Kahn's algorithm
    const result: string[] = [];
    const zeroInDegree = [...inDegree.entries()]
      .filter(([_, deg]) => deg === 0)
      .map(([id]) => id);

    while (zeroInDegree.length > 0) {
      const moduleId = zeroInDegree.shift()!;
      result.push(moduleId);

      for (const dependent of adjList.get(moduleId) || []) {
        const newDegree = inDegree.get(dependent)! - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) {
          zeroInDegree.push(dependent);
        }
      }
    }

    // Check for cycles
    if (result.length !== allModules.size) {
      throw new Error("Circular dependency detected in module graph");
    }

    return result;
  }

  /**
   * Check if a module can be executed given the current state
   */
  canExecute(
    module: ModuleDefinition,
    availableArtifactModuleIds: string[]
  ): CanExecuteResult {
    const available = new Set(availableArtifactModuleIds);
    const missingInputs: string[] = [];
    const availableInputs: string[] = [];

    for (const requiredId of module.requiredInputs) {
      if (available.has(requiredId)) {
        availableInputs.push(requiredId);
      } else {
        missingInputs.push(requiredId);
      }
    }

    return {
      canExecute: missingInputs.length === 0,
      missingInputs,
      availableInputs,
      reason: missingInputs.length > 0
        ? `Missing required inputs: ${missingInputs.join(", ")}`
        : undefined,
    };
  }

  /**
   * Get detailed information about missing inputs
   */
  async getMissingInputs(
    orgId: string,
    moduleId: string,
    availableArtifactModuleIds: string[]
  ): Promise<MissingInput[]> {
    const module = await this.get(orgId, moduleId);
    if (!module) return [];

    const available = new Set(availableArtifactModuleIds);
    const missing: MissingInput[] = [];

    for (const requiredId of module.requiredInputs) {
      if (!available.has(requiredId)) {
        const requiredModule = await this.get(orgId, requiredId);
        missing.push({
          moduleId: requiredId,
          moduleName: requiredModule?.name || requiredId,
          required: true,
        });
      }
    }

    return missing;
  }

  /**
   * Suggest execution paths to reach a target module from current state
   */
  async suggestPath(
    orgId: string,
    targetModuleId: string,
    availableArtifactModuleIds: string[]
  ): Promise<ExecutionPath[]> {
    const available = new Set(availableArtifactModuleIds);
    const target = await this.get(orgId, targetModuleId);
    if (!target) return [];

    // Get all modules needed to reach target
    const allDeps = await this.getDependencies(orgId, targetModuleId);
    const needed = [...allDeps, targetModuleId].filter((id) => !available.has(id));

    if (needed.length === 0) {
      return [{
        modules: [targetModuleId],
        complexity: "simple",
      }];
    }

    // Get execution order for needed modules
    const orderedModules = await this.getExecutionOrder(orgId, needed);

    return [{
      modules: orderedModules,
      complexity: orderedModules.length <= 2 ? "simple" : orderedModules.length <= 4 ? "medium" : "complex",
    }];
  }

  /**
   * Validate that adding dependencies won't create a cycle
   */
  private async validateNoCycles(
    orgId: string,
    moduleId: string,
    requiredInputs: string[]
  ): Promise<void> {
    const visited = new Set<string>();
    const queue = [...requiredInputs];

    while (queue.length > 0) {
      const depId = queue.shift()!;
      if (depId === moduleId) {
        throw new Error(`Circular dependency detected: ${moduleId} depends on itself`);
      }
      if (visited.has(depId)) continue;
      visited.add(depId);

      const dep = await this.get(orgId, depId);
      if (dep) {
        queue.push(...dep.requiredInputs);
      }
    }
  }

  /**
   * Invalidate all cached data for an organization
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
let registryInstance: ModuleRegistry | null = null;

export function getModuleRegistry(prisma?: PrismaClient, redis?: Redis): ModuleRegistry {
  if (!registryInstance) {
    registryInstance = new ModuleRegistry(prisma || db, redis);
  }
  return registryInstance;
}
