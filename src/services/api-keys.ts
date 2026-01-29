/**
 * API Key Service
 *
 * Manages API keys for external developer access to Nubabel.
 * - Secure key generation with hashing
 * - Scope-based permissions
 * - Tiered rate limiting
 * - Usage tracking
 */

import { randomBytes, createHash } from "crypto";
// import { db as prisma } from "../db/client"; // TODO: Uncomment when aPIKey table exists
import { redis } from "../db/redis";
import { logger } from "../utils/logger";
// import { createAuditLog } from "./audit-logger"; // TODO: Uncomment when aPIKey table exists

// =============================================================================
// TYPES
// =============================================================================

export type APIScope =
  | "agents:read"
  | "agents:execute"
  | "workflows:read"
  | "workflows:write"
  | "workflows:execute"
  | "executions:read"
  | "webhooks:manage"
  | "organization:read";

export type RateLimitTier = "free" | "pro" | "enterprise";

export interface APIKey {
  id: string;
  organizationId: string;
  name: string;
  keyPrefix: string;
  scopes: APIScope[];
  rateLimitTier: RateLimitTier;
  requestsPerMinute: number;
  requestsPerDay: number;
  lastUsedAt?: Date;
  totalRequests: number;
  status: "active" | "revoked";
  expiresAt?: Date;
  createdAt: Date;
  createdBy: string;
}

export interface CreateAPIKeyInput {
  name: string;
  scopes: APIScope[];
  rateLimitTier?: RateLimitTier;
  expiresAt?: Date;
}

export interface CreateAPIKeyResult {
  key: string;
  apiKey: APIKey;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const KEY_PREFIX = "nbl_";
const KEY_LENGTH = 32;
// const CACHE_TTL_SECONDS = 300; // TODO: Uncomment when aPIKey table exists
const CACHE_PREFIX = "apikey";

export const RATE_LIMITS: Record<RateLimitTier, { perMinute: number; perDay: number }> = {
  free: { perMinute: 60, perDay: 1000 },
  pro: { perMinute: 300, perDay: 10000 },
  enterprise: { perMinute: 1000, perDay: 100000 },
};

export const ALL_SCOPES: APIScope[] = [
  "agents:read",
  "agents:execute",
  "workflows:read",
  "workflows:write",
  "workflows:execute",
  "executions:read",
  "webhooks:manage",
  "organization:read",
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateApiKey(): string {
  const randomPart = randomBytes(KEY_LENGTH).toString("base64url");
  return `${KEY_PREFIX}${randomPart}`;
}

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function extractKeyPrefix(key: string): string {
  return key.substring(0, 12);
}

// TODO: Uncomment when aPIKey table exists
// function mapPrismaToAPIKey(data: any): APIKey {
//   return {
//     id: data.id,
//     organizationId: data.organizationId,
//     name: data.name,
//     keyPrefix: data.keyPrefix,
//     scopes: data.scopes as APIScope[],
//     rateLimitTier: data.rateLimitTier as RateLimitTier,
//     requestsPerMinute: data.requestsPerMinute,
//     requestsPerDay: data.requestsPerDay,
//     lastUsedAt: data.lastUsedAt || undefined,
//     totalRequests: data.totalRequests,
//     status: data.status as "active" | "revoked",
//     expiresAt: data.expiresAt || undefined,
//     createdAt: data.createdAt,
//     createdBy: data.createdBy,
//   };
// }

// =============================================================================
// API KEY SERVICE
// =============================================================================

export class APIKeyService {
  /**
   * Generate a new API key for an organization.
   * Returns the plain key only once - it cannot be retrieved later.
   */
  async create(
    organizationId: string,
    _userId: string, // Prefixed with _ to indicate intentionally unused (TODO: use when aPIKey table exists)
    input: CreateAPIKeyInput,
  ): Promise<CreateAPIKeyResult> {
    const tier = input.rateLimitTier || "free";
    const limits = RATE_LIMITS[tier];

    const plainKey = generateApiKey();
    // const keyHash = hashApiKey(plainKey); // TODO: Uncomment when aPIKey table exists
    const keyPrefix = extractKeyPrefix(plainKey);

    // TODO: Implement when aPIKey table exists in Prisma schema
    // const apiKeyRecord = await prisma.aPIKey.create({
    //   data: {
    //     organizationId,
    //     name: input.name,
    //     keyHash,
    //     keyPrefix,
    //     scopes: input.scopes,
    //     rateLimitTier: tier,
    //     requestsPerMinute: limits.perMinute,
    //     requestsPerDay: limits.perDay,
    //     totalRequests: 0,
    //     status: "active",
    //     expiresAt: input.expiresAt,
    //     createdBy: userId,
    //   },
    // });

    logger.warn("create: aPIKey table not yet implemented", { organizationId, name: input.name });

    // Return stub data
    const apiKey: APIKey = {
      id: `stub-${Date.now()}`,
      organizationId,
      name: input.name,
      keyPrefix,
      scopes: input.scopes,
      rateLimitTier: tier,
      requestsPerMinute: limits.perMinute,
      requestsPerDay: limits.perDay,
      totalRequests: 0,
      status: "active",
      expiresAt: input.expiresAt,
      createdAt: new Date(),
      createdBy: _userId,
    };

    return { key: plainKey, apiKey };
  }

  /**
   * Validate an API key and return its details if valid.
   * Uses caching to reduce database lookups.
   */
  async validate(key: string): Promise<APIKey | null> {
    if (!key.startsWith(KEY_PREFIX)) {
      return null;
    }

    const keyHash = hashApiKey(key);
    const cacheKey = `${CACHE_PREFIX}:${keyHash}`;

    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      const apiKey = JSON.parse(cached) as APIKey;

      // Check expiration
      if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
        await redis.del(cacheKey);
        return null;
      }

      // Check status
      if (apiKey.status !== "active") {
        return null;
      }

      return apiKey;
    }

    // TODO: Implement when aPIKey table exists in Prisma schema
    // Database lookup
    // const apiKeyRecord = await prisma.aPIKey.findUnique({
    //   where: { keyHash },
    // });

    logger.warn("validate: aPIKey table not yet implemented", { keyHash: keyHash.substring(0, 8) });
    return null;
  }

  /**
   * Revoke an API key.
   */
  async revoke(
    keyId: string,
    organizationId: string,
    _userId: string, // Prefixed with _ to indicate intentionally unused (TODO: use when aPIKey table exists)
    reason?: string,
  ): Promise<void> {
    // TODO: Implement when aPIKey table exists in Prisma schema
    // const apiKeyRecord = await prisma.aPIKey.findFirst({
    //   where: { id: keyId, organizationId },
    // });

    // if (!apiKeyRecord) {
    //   throw new Error("API key not found");
    // }

    // await prisma.aPIKey.update({
    //   where: { id: keyId },
    //   data: { status: "revoked" },
    // });

    logger.warn("revoke: aPIKey table not yet implemented", { keyId, organizationId, reason });
  }

  /**
   * List all API keys for an organization.
   * Does not return the actual key values.
   */
  async list(organizationId: string): Promise<APIKey[]> {
    // TODO: Implement when aPIKey table exists in Prisma schema
    // const apiKeyRecords = await prisma.aPIKey.findMany({
    //   where: { organizationId },
    //   orderBy: { createdAt: "desc" },
    // });

    logger.warn("list: aPIKey table not yet implemented", { organizationId });
    return [];
  }

  /**
   * Get a specific API key by ID.
   */
  async get(keyId: string, organizationId: string): Promise<APIKey | null> {
    // TODO: Implement when aPIKey table exists in Prisma schema
    // const apiKeyRecord = await prisma.aPIKey.findFirst({
    //   where: { id: keyId, organizationId },
    // });

    logger.warn("get: aPIKey table not yet implemented", { keyId, organizationId });
    return null;
  }

  /**
   * Update API key properties.
   */
  async update(
    keyId: string,
    organizationId: string,
    _userId: string, // Prefixed with _ to indicate intentionally unused (TODO: use when aPIKey table exists)
    _data: Partial<Pick<APIKey, "name" | "scopes" | "rateLimitTier" | "expiresAt">>, // Prefixed with _ to indicate intentionally unused (TODO: use when aPIKey table exists)
  ): Promise<APIKey> {
    // TODO: Implement when aPIKey table exists in Prisma schema
    // const existing = await prisma.aPIKey.findFirst({
    //   where: { id: keyId, organizationId },
    // });

    logger.warn("update: aPIKey table not yet implemented", { keyId, organizationId });
    throw new Error("API key not found");
  }

  /**
   * Track API key usage.
   * Updates lastUsedAt and increments totalRequests.
   */
  async trackUsage(keyId: string): Promise<void> {
    // TODO: Implement when aPIKey table exists in Prisma schema
    // await prisma.aPIKey.update({
    //   where: { id: keyId },
    //   data: {
    //     lastUsedAt: new Date(),
    //     totalRequests: { increment: 1 },
    //   },
    // });

    logger.warn("trackUsage: aPIKey table not yet implemented", { keyId });
  }

  /**
   * Get usage statistics for an API key.
   */
  async getUsageStats(keyId: string): Promise<{
    minuteCount: number;
    dayCount: number;
    totalRequests: number;
  }> {
    // TODO: Implement when aPIKey table exists in Prisma schema
    // const apiKeyRecord = await prisma.aPIKey.findUnique({
    //   where: { id: keyId },
    // });

    // if (!apiKeyRecord) {
    //   throw new Error("API key not found");
    // }

    logger.warn("getUsageStats: aPIKey table not yet implemented", { keyId });

    const redisKey = `ratelimit:${keyId}`;
    const [minuteCount, dayCount] = await Promise.all([
      redis.get(`${redisKey}:minute`),
      redis.get(`${redisKey}:day`),
    ]);

    return {
      minuteCount: parseInt(minuteCount || "0", 10),
      dayCount: parseInt(dayCount || "0", 10),
      totalRequests: 0,
    };
  }

  /**
   * Check if a key has a specific scope.
   */
  hasScope(apiKey: APIKey, scope: APIScope): boolean {
    return apiKey.scopes.includes(scope);
  }

  /**
   * Check if a key has all required scopes.
   */
  hasAllScopes(apiKey: APIKey, scopes: APIScope[]): boolean {
    return scopes.every((scope) => apiKey.scopes.includes(scope));
  }
}

export const apiKeyService = new APIKeyService();
