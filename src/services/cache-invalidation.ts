import { redis } from "../db/redis";
import { logger } from "../utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InvalidationStrategy = "ttl_only" | "write_through" | "event_driven" | "tag_based";

interface InvalidationRule {
  entity: string;
  operations: ("create" | "update" | "delete")[];
  keyPatterns: string[];
  tags?: string[];
}

interface CacheTag {
  tag: string;
  keys: string[];
}

interface InvalidationStats {
  totalInvalidations: number;
  byEntity: Record<string, number>;
  byTag: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAG_INDEX_PREFIX = "ci:tag:";
const KEY_INDEX_PREFIX = "ci:idx:";
const STATS_KEY = "ci:stats";
const TAG_INDEX_TTL = 86400; // 24 hours
const KEY_INDEX_TTL = 86400; // 24 hours

// ---------------------------------------------------------------------------
// CacheInvalidator
// ---------------------------------------------------------------------------

class CacheInvalidator {
  private rules: Map<string, InvalidationRule[]> = new Map();
  private strategy: InvalidationStrategy;

  constructor(strategy: InvalidationStrategy = "event_driven") {
    this.strategy = strategy;
    this.registerDefaultRules();
  }

  // -------------------------------------------------------------------------
  // Rule registration
  // -------------------------------------------------------------------------

  registerRule(rule: InvalidationRule): void {
    const existing = this.rules.get(rule.entity) ?? [];
    existing.push(rule);
    this.rules.set(rule.entity, existing);

    logger.info("Cache invalidation rule registered", {
      entity: rule.entity,
      operations: rule.operations,
      keyPatterns: rule.keyPatterns,
      tags: rule.tags,
      strategy: this.strategy,
    });
  }

  // -------------------------------------------------------------------------
  // Write-triggered invalidation
  // -------------------------------------------------------------------------

  async invalidateOnWrite(
    entity: string,
    operation: string,
    recordId?: string,
    orgId?: string,
  ): Promise<void> {
    const entityRules = this.rules.get(entity);
    if (!entityRules) {
      logger.debug("No invalidation rules for entity", { entity, operation });
      return;
    }

    const matchingRules = entityRules.filter((rule) =>
      rule.operations.includes(operation as "create" | "update" | "delete"),
    );

    if (matchingRules.length === 0) {
      logger.debug("No matching invalidation rules", { entity, operation });
      return;
    }

    let invalidatedCount = 0;

    for (const rule of matchingRules) {
      // Expand key patterns and delete matching keys
      for (const pattern of rule.keyPatterns) {
        const expandedKeys = this.expandKeyPattern(pattern, recordId, orgId);
        for (const key of expandedKeys) {
          await this.invalidateByPattern(key, orgId);
          invalidatedCount++;
        }
      }

      // Invalidate by tags if the rule specifies them
      if (rule.tags) {
        for (const tag of rule.tags) {
          await this.invalidateByTag(tag);
        }
      }
    }

    await this.recordStats(entity, undefined, invalidatedCount);

    logger.info("Cache invalidation completed on write", {
      entity,
      operation,
      recordId,
      orgId,
      rulesMatched: matchingRules.length,
      keysInvalidated: invalidatedCount,
    });
  }

  // -------------------------------------------------------------------------
  // Tag-based invalidation
  // -------------------------------------------------------------------------

  async invalidateByTag(tag: string): Promise<void> {
    const tagIndexKey = `${TAG_INDEX_PREFIX}${tag}`;
    const keysJson = await redis.get(tagIndexKey);

    if (!keysJson) {
      logger.debug("No keys found for tag", { tag });
      return;
    }

    let taggedKeys: string[];
    try {
      taggedKeys = JSON.parse(keysJson) as string[];
    } catch {
      logger.warn("Corrupt tag index, clearing", { tag });
      await redis.del(tagIndexKey);
      return;
    }

    let deletedCount = 0;
    for (const key of taggedKeys) {
      const deleted = await redis.del(key);
      if (deleted) {
        deletedCount++;
      }
    }

    // Clear the tag index itself
    await redis.del(tagIndexKey);

    await this.recordStats(undefined, tag, deletedCount);

    logger.info("Cache invalidation by tag completed", {
      tag,
      totalKeys: taggedKeys.length,
      deleted: deletedCount,
    });
  }

  async tagCacheEntry(key: string, tags: string[]): Promise<void> {
    for (const tag of tags) {
      const tagIndexKey = `${TAG_INDEX_PREFIX}${tag}`;
      const existing = await redis.get(tagIndexKey);

      let taggedKeys: string[];
      if (existing) {
        try {
          taggedKeys = JSON.parse(existing) as string[];
        } catch {
          taggedKeys = [];
        }
      } else {
        taggedKeys = [];
      }

      if (!taggedKeys.includes(key)) {
        taggedKeys.push(key);
      }

      await redis.set(tagIndexKey, JSON.stringify(taggedKeys), TAG_INDEX_TTL);
    }

    logger.debug("Cache entry tagged", { key, tags });
  }

  // -------------------------------------------------------------------------
  // Pattern-based invalidation (using key index, not redis.keys())
  // -------------------------------------------------------------------------

  async invalidateByPattern(prefix: string, orgId?: string): Promise<void> {
    const indexKey = orgId
      ? `${KEY_INDEX_PREFIX}${prefix}:${orgId}`
      : `${KEY_INDEX_PREFIX}${prefix}`;

    const indexJson = await redis.get(indexKey);

    if (!indexJson) {
      // No indexed keys; attempt direct delete on the prefix itself
      // in case it is a concrete key rather than a pattern
      await redis.del(prefix);
      return;
    }

    let indexedKeys: string[];
    try {
      indexedKeys = JSON.parse(indexJson) as string[];
    } catch {
      logger.warn("Corrupt key index, clearing", { prefix, orgId });
      await redis.del(indexKey);
      return;
    }

    for (const key of indexedKeys) {
      await redis.del(key);
    }

    // Clear the index itself
    await redis.del(indexKey);

    logger.debug("Pattern invalidation completed", {
      prefix,
      orgId,
      keysDeleted: indexedKeys.length,
    });
  }

  async registerKeyInIndex(prefix: string, key: string): Promise<void> {
    const indexKey = `${KEY_INDEX_PREFIX}${prefix}`;
    const existing = await redis.get(indexKey);

    let indexedKeys: string[];
    if (existing) {
      try {
        indexedKeys = JSON.parse(existing) as string[];
      } catch {
        indexedKeys = [];
      }
    } else {
      indexedKeys = [];
    }

    if (!indexedKeys.includes(key)) {
      indexedKeys.push(key);
    }

    await redis.set(indexKey, JSON.stringify(indexedKeys), KEY_INDEX_TTL);

    logger.debug("Key registered in index", { prefix, key });
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  async getInvalidationStats(): Promise<InvalidationStats> {
    const statsJson = await redis.get(STATS_KEY);

    if (!statsJson) {
      return { totalInvalidations: 0, byEntity: {}, byTag: {} };
    }

    try {
      return JSON.parse(statsJson) as InvalidationStats;
    } catch {
      return { totalInvalidations: 0, byEntity: {}, byTag: {} };
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private expandKeyPattern(
    pattern: string,
    recordId?: string,
    orgId?: string,
  ): string[] {
    let expanded = pattern;

    if (recordId) {
      expanded = expanded.replace(/\{id\}/g, recordId);
    }

    if (orgId) {
      expanded = expanded.replace(/\{orgId\}/g, orgId);
    }

    // If the pattern still contains un-expanded placeholders, return the
    // base prefix (everything before the first placeholder) so the
    // index-based invalidation can still locate relevant keys.
    if (expanded.includes("{")) {
      const basePrefix = expanded.substring(0, expanded.indexOf("{"));
      return basePrefix.length > 0 ? [basePrefix] : [];
    }

    // Strip trailing wildcard; the pattern prefix is used for index lookup
    const cleaned = expanded.replace(/\*$/, "");
    return cleaned.length > 0 ? [cleaned] : [];
  }

  private async recordStats(
    entity?: string,
    tag?: string,
    count: number = 1,
  ): Promise<void> {
    try {
      const stats = await this.getInvalidationStats();

      stats.totalInvalidations += count;

      if (entity) {
        stats.byEntity[entity] = (stats.byEntity[entity] ?? 0) + count;
      }

      if (tag) {
        stats.byTag[tag] = (stats.byTag[tag] ?? 0) + count;
      }

      await redis.set(STATS_KEY, JSON.stringify(stats), 86400);
    } catch (error) {
      logger.warn("Failed to record invalidation stats", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Pre-configured rules
  // -------------------------------------------------------------------------

  private registerDefaultRules(): void {
    // Session entity: on create/update/delete invalidate "qcache:session:*"
    this.registerRule({
      entity: "Session",
      operations: ["create", "update", "delete"],
      keyPatterns: ["qcache:session:*"],
    });

    // Skill entity: on create/update/delete invalidate "qcache:skill:*", tag "skills"
    this.registerRule({
      entity: "Skill",
      operations: ["create", "update", "delete"],
      keyPatterns: ["qcache:skill:*"],
      tags: ["skills"],
    });

    // Organization entity: on update invalidate feature flags and route cache
    this.registerRule({
      entity: "Organization",
      operations: ["update"],
      keyPatterns: ["ff:*", "rcache:*"],
    });
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const cacheInvalidator = new CacheInvalidator();

// Re-export types for consumers
export type { InvalidationStrategy, InvalidationRule, CacheTag, InvalidationStats };
