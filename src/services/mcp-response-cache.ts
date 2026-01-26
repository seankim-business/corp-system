import crypto from "crypto";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";
import { recordMcpCacheHit, recordMcpCacheMiss, recordMcpCacheSize } from "./metrics";

export type MCPResponseCacheDataType = "volatile" | "stable";

export type MCPResponseCacheKeyParams = {
  provider: string;
  toolName: string;
  args?: unknown;
  organizationId: string;
};

export type MCPResponseCacheOptions = {
  ttlSeconds?: number;
  dataType?: MCPResponseCacheDataType;
};

const DEFAULT_TTLS: Record<MCPResponseCacheDataType, number> = {
  volatile: 300,
  stable: 3600,
};

const CACHE_PREFIX = "mcp-response";

// Decision: Environment namespacing is handled by redis key prefixing (NODE_ENV).
// Decision: Eviction is TTL-only; Redis handles expiry without LRU logic here.
// Decision: No cache warming on startup; in-flight de-dupe prevents stampedes.
// Decision: Invalidation is manual via invalidate() plus TTL; no public endpoint.
export class MCPResponseCache {
  private inFlight: Map<string, Promise<unknown>> = new Map();
  private keySizes: Map<string, { provider: string; sizeBytes: number }> = new Map();
  private providerSizes: Map<string, number> = new Map();

  createCacheKey(params: MCPResponseCacheKeyParams): string {
    const raw = `${params.provider}|${params.toolName}|${stableStringify(params.args)}|${
      params.organizationId
    }`;
    const hash = crypto.createHash("sha256").update(raw).digest("hex");
    return `${CACHE_PREFIX}:${hash}`;
  }

  classifyTool(toolName: string): MCPResponseCacheDataType {
    const stablePatterns = [/^get.*Database/i, /^get.*Properties/i, /^describe/i, /^schema/i];
    if (stablePatterns.some((pattern) => pattern.test(toolName))) {
      return "stable";
    }

    const volatilePatterns = [/^search/i, /^list/i, /^get.*Tasks/i, /^query/i, /^fetch/i];
    if (volatilePatterns.some((pattern) => pattern.test(toolName))) {
      return "volatile";
    }

    return "volatile";
  }

  getTtlSeconds(toolName: string, options?: MCPResponseCacheOptions): number {
    if (options?.ttlSeconds && options.ttlSeconds > 0) {
      return options.ttlSeconds;
    }

    const dataType = options?.dataType ?? this.classifyTool(toolName);
    return DEFAULT_TTLS[dataType];
  }

  async get<T>(key: string, meta: { provider: string; toolName: string }): Promise<T | null> {
    try {
      const cached = await redis.get(key);
      if (!cached) {
        recordMcpCacheMiss(meta.provider, meta.toolName);
        this.removeCachedSize(key);
        return null;
      }
      recordMcpCacheHit(meta.provider, meta.toolName);
      this.updateCachedSize(key, meta.provider, Buffer.byteLength(cached));
      return JSON.parse(cached) as T;
    } catch (error) {
      logger.warn("Failed to read MCP cache entry", {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      await redis.del(key);
      this.removeCachedSize(key);
      recordMcpCacheMiss(meta.provider, meta.toolName);
      return null;
    }
  }

  async set<T>(
    key: string,
    value: T,
    meta: { provider: string; toolName: string },
    options?: MCPResponseCacheOptions,
  ): Promise<boolean> {
    const payload = JSON.stringify(value);
    if (!payload) {
      logger.warn("Skipping MCP cache set due to unserializable payload", {
        key,
        provider: meta.provider,
        toolName: meta.toolName,
      });
      return false;
    }

    const ttlSeconds = this.getTtlSeconds(meta.toolName, options);
    const success = await redis.set(key, payload, ttlSeconds);
    if (success) {
      this.updateCachedSize(key, meta.provider, Buffer.byteLength(payload));
    }
    return success;
  }

  async invalidate(params: MCPResponseCacheKeyParams): Promise<boolean> {
    const key = this.createCacheKey(params);
    const success = await redis.del(key);
    if (success) {
      this.removeCachedSize(key);
    }
    return success;
  }

  async getOrSet<T>(
    params: MCPResponseCacheKeyParams,
    fetcher: () => Promise<T>,
    options?: MCPResponseCacheOptions,
  ): Promise<T> {
    const key = this.createCacheKey(params);
    const meta = { provider: params.provider, toolName: params.toolName };

    const cached = await this.get<T>(key, meta);
    if (cached !== null) {
      return cached;
    }

    const existing = this.inFlight.get(key) as Promise<T> | undefined;
    if (existing) {
      return existing;
    }

    const pending = (async () => {
      try {
        const result = await fetcher();
        await this.set(key, result, meta, options);
        return result;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, pending);
    return pending;
  }

  private updateCachedSize(key: string, provider: string, sizeBytes: number): void {
    const existing = this.keySizes.get(key);
    const previousSize = existing?.sizeBytes ?? 0;
    const currentTotal = this.providerSizes.get(provider) ?? 0;
    const nextTotal = Math.max(0, currentTotal - previousSize + sizeBytes);

    this.keySizes.set(key, { provider, sizeBytes });
    this.providerSizes.set(provider, nextTotal);
    recordMcpCacheSize(provider, nextTotal);
  }

  private removeCachedSize(key: string): void {
    const existing = this.keySizes.get(key);
    if (!existing) return;

    const currentTotal = this.providerSizes.get(existing.provider) ?? 0;
    const nextTotal = Math.max(0, currentTotal - existing.sizeBytes);

    this.keySizes.delete(key);
    this.providerSizes.set(existing.provider, nextTotal);
    recordMcpCacheSize(existing.provider, nextTotal);
  }
}

export const mcpResponseCache = new MCPResponseCache();

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value !== "object") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map((key) => `${key}:${stableStringify(record[key])}`);
  return `{${entries.join(",")}}`;
}
