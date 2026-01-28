import crypto from "crypto";
import { logger } from "../utils/logger";
import {
  recordMcpPoolAcquisition,
  recordMcpPoolEviction,
  recordMcpPoolSize,
  recordMcpPoolTimeout,
} from "./metrics";

export interface ConnectionPoolConfig {
  min: number;
  max: number;
  acquireTimeoutMillis: number;
  idleTimeoutMillis: number;
}

type PoolItem<T extends object> = {
  resource: T;
  lastUsedAt: number;
  createdAt: number;
};

type PendingRequest<T> = {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
};

export class ConnectionPoolTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionPoolTimeoutError";
  }
}

export class ConnectionPool<T extends object> {
  private available: PoolItem<T>[] = [];
  private inUse: Set<PoolItem<T>> = new Set();
  private pending: PendingRequest<T>[] = [];
  private resourceMap: WeakMap<T, PoolItem<T>> = new WeakMap();
  private lastUsedAt: number = Date.now();

  constructor(
    private config: ConnectionPoolConfig,
    private createConnection: () => T,
  ) {
    this.initialize();
  }

  private initialize(): void {
    for (let i = 0; i < this.config.min; i++) {
      this.addConnection();
    }
  }

  private addConnection(): PoolItem<T> {
    const now = Date.now();
    const resource = this.createConnection();
    const item: PoolItem<T> = {
      resource,
      lastUsedAt: now,
      createdAt: now,
    };
    this.resourceMap.set(resource, item);
    this.available.push(item);
    return item;
  }

  private markUsed(): void {
    this.lastUsedAt = Date.now();
  }

  async acquire(): Promise<T> {
    this.markUsed();

    if (this.available.length > 0) {
      const item = this.available.pop()!;
      this.inUse.add(item);
      item.lastUsedAt = Date.now();
      return item.resource;
    }

    if (this.totalCount() < this.config.max) {
      const item = this.addConnection();
      const idx = this.available.indexOf(item);
      if (idx !== -1) {
        this.available.splice(idx, 1);
      }
      this.inUse.add(item);
      item.lastUsedAt = Date.now();
      return item.resource;
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.pending.findIndex((pending) => pending.timeoutId === timeoutId);
        if (index >= 0) {
          this.pending.splice(index, 1);
        }
        reject(new ConnectionPoolTimeoutError("MCP connection pool timeout"));
      }, this.config.acquireTimeoutMillis);

      this.pending.push({ resolve, reject, timeoutId });
    });
  }

  release(resource: T): void {
    const item = this.resourceMap.get(resource);
    if (!item || !this.inUse.has(item)) {
      return;
    }

    this.markUsed();
    item.lastUsedAt = Date.now();

    if (this.pending.length > 0) {
      const pending = this.pending.shift();
      if (pending) {
        clearTimeout(pending.timeoutId);
        pending.resolve(item.resource);
        return;
      }
    }

    this.inUse.delete(item);
    this.available.push(item);
  }

  evictIdle(now = Date.now()): number {
    if (this.available.length === 0) {
      return 0;
    }

    const maxRemovable = Math.max(0, this.totalCount() - this.config.min);
    if (maxRemovable === 0) {
      return 0;
    }

    let removed = 0;
    const remaining: PoolItem<T>[] = [];

    for (const item of this.available) {
      if (removed >= maxRemovable) {
        remaining.push(item);
        continue;
      }

      const idleFor = now - item.lastUsedAt;
      if (idleFor >= this.config.idleTimeoutMillis) {
        removed += 1;
        this.resourceMap.delete(item.resource);
      } else {
        remaining.push(item);
      }
    }

    this.available = remaining;
    return removed;
  }

  totalCount(): number {
    return this.available.length + this.inUse.size;
  }

  getStats() {
    return {
      total: this.totalCount(),
      active: this.inUse.size,
      idle: this.available.length,
      pending: this.pending.length,
      lastUsedAt: this.lastUsedAt,
    };
  }
}

export type McpPoolStats = {
  provider: string;
  active: number;
  idle: number;
  pending: number;
  total: number;
};

type PoolEntry<T extends object> = {
  provider: string;
  pool: ConnectionPool<T>;
};

export class MCPConnectionPoolManager {
  private pools: Map<string, PoolEntry<any>> = new Map();
  private providers: Set<string> = new Set();
  private evictionInterval: NodeJS.Timeout | null = null;

  constructor(private config: ConnectionPoolConfig) {
    this.startEviction();
  }

  private startEviction(): void {
    this.evictionInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.pools) {
        const evicted = entry.pool.evictIdle(now);
        if (evicted > 0) {
          recordMcpPoolEviction(entry.provider, evicted);
        }

        const stats = entry.pool.getStats();
        if (stats.total === 0 && stats.pending === 0) {
          this.pools.delete(key);
        }
      }
      this.refreshMetrics();
    }, 60_000);

    this.evictionInterval.unref?.();
  }

  async acquire<T extends object>(params: {
    provider: string;
    organizationId: string;
    credentials: Record<string, unknown> | string;
    createClient: () => T;
  }): Promise<{ client: T; release: () => void }> {
    if (!params.organizationId) {
      throw new Error("organizationId is required for MCP connection pooling");
    }

    const provider = params.provider.toLowerCase();
    const key = createPoolKey(provider, params.organizationId, params.credentials);
    this.providers.add(provider);

    let entry = this.pools.get(key) as PoolEntry<T> | undefined;
    if (!entry) {
      entry = { provider, pool: new ConnectionPool<T>(this.config, params.createClient) };
      this.pools.set(key, entry as PoolEntry<any>);
    }

    try {
      const client = await entry.pool.acquire();
      recordMcpPoolAcquisition(provider);
      this.refreshMetrics();
      return {
        client,
        release: () => {
          entry?.pool.release(client);
          this.refreshMetrics();
        },
      };
    } catch (error) {
      if (error instanceof ConnectionPoolTimeoutError) {
        recordMcpPoolTimeout(provider);
      }
      throw error;
    }
  }

  getPoolStats(): McpPoolStats[] {
    const providerStats = new Map<string, McpPoolStats>();

    for (const provider of this.providers) {
      providerStats.set(provider, {
        provider,
        active: 0,
        idle: 0,
        pending: 0,
        total: 0,
      });
    }

    for (const entry of this.pools.values()) {
      const stats = entry.pool.getStats();
      const current = providerStats.get(entry.provider) ?? {
        provider: entry.provider,
        active: 0,
        idle: 0,
        pending: 0,
        total: 0,
      };

      current.active += stats.active;
      current.idle += stats.idle;
      current.pending += stats.pending;
      current.total += stats.total;
      providerStats.set(entry.provider, current);
    }

    return Array.from(providerStats.values());
  }

  private refreshMetrics(): void {
    const stats = this.getPoolStats();
    for (const providerStats of stats) {
      recordMcpPoolSize(providerStats.provider, providerStats.active, providerStats.idle);
    }
  }
}

const DEFAULT_POOL_CONFIG: ConnectionPoolConfig = {
  min: 2,
  max: 5,
  acquireTimeoutMillis: 5000,
  idleTimeoutMillis: 15 * 60 * 1000,
};

export const mcpConnectionPool = new MCPConnectionPoolManager(DEFAULT_POOL_CONFIG);

export function getMcpPoolStats(): McpPoolStats[] {
  return mcpConnectionPool.getPoolStats();
}

export function createPoolKey(
  provider: string,
  organizationId: string,
  credentials: Record<string, unknown> | string,
): string {
  const raw = `${provider}|${organizationId}|${stableStringify(credentials)}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

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

logger.info("MCP connection pool initialized", {
  min: DEFAULT_POOL_CONFIG.min,
  max: DEFAULT_POOL_CONFIG.max,
  idleTimeoutMillis: DEFAULT_POOL_CONFIG.idleTimeoutMillis,
});
