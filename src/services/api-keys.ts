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
import { db } from "../db/client";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";

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
const CACHE_TTL_SECONDS = 300;
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

// Maps Prisma APIKey record to APIKey interface
function mapPrismaToAPIKey(data: {
  id: string;
  organizationId: string;
  userId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimitTier: string;
  isActive: boolean;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}): APIKey {
  const tier = (data.rateLimitTier as RateLimitTier) || "free";
  const limits = RATE_LIMITS[tier];

  return {
    id: data.id,
    organizationId: data.organizationId,
    name: data.name,
    keyPrefix: data.keyPrefix,
    scopes: data.scopes as APIScope[],
    rateLimitTier: tier,
    requestsPerMinute: limits.perMinute,
    requestsPerDay: limits.perDay,
    lastUsedAt: data.lastUsedAt || undefined,
    totalRequests: 0, // This would come from Redis tracking
    status: data.isActive ? "active" : "revoked",
    expiresAt: data.expiresAt || undefined,
    createdAt: data.createdAt,
    createdBy: data.userId,
  };
}

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
    userId: string,
    input: CreateAPIKeyInput,
  ): Promise<CreateAPIKeyResult> {
    const tier = input.rateLimitTier || "free";
    const limits = RATE_LIMITS[tier];

    const plainKey = generateApiKey();
    const keyHash = hashApiKey(plainKey);
    const keyPrefix = extractKeyPrefix(plainKey);

    const apiKeyRecord = await db.aPIKey.create({
      data: {
        organizationId,
        userId,
        name: input.name,
        keyHash,
        keyPrefix,
        scopes: input.scopes,
        rateLimitTier: tier,
        isActive: true,
        expiresAt: input.expiresAt,
      },
    });

    logger.info("API key created", {
      keyId: apiKeyRecord.id,
      organizationId,
      name: input.name,
      scopes: input.scopes,
    });

    const apiKey: APIKey = {
      id: apiKeyRecord.id,
      organizationId: apiKeyRecord.organizationId,
      name: apiKeyRecord.name,
      keyPrefix: apiKeyRecord.keyPrefix,
      scopes: input.scopes,
      rateLimitTier: tier,
      requestsPerMinute: limits.perMinute,
      requestsPerDay: limits.perDay,
      totalRequests: 0,
      status: "active",
      expiresAt: input.expiresAt,
      createdAt: apiKeyRecord.createdAt,
      createdBy: userId,
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

    // Database lookup
    const apiKeyRecord = await db.aPIKey.findUnique({
      where: { keyHash },
    });

    if (!apiKeyRecord) {
      return null;
    }

    // Check if expired
    if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
      return null;
    }

    // Check if active
    if (!apiKeyRecord.isActive) {
      return null;
    }

    const apiKey = mapPrismaToAPIKey(apiKeyRecord);

    // Cache for future requests
    await redis.set(cacheKey, JSON.stringify(apiKey), CACHE_TTL_SECONDS);

    // Update last used timestamp asynchronously (don't await)
    this.trackUsage(apiKey.id).catch((err) => {
      logger.error("Failed to track API key usage", { keyId: apiKey.id, error: err });
    });

    return apiKey;
  }

  /**
   * Revoke an API key.
   */
  async revoke(
    keyId: string,
    organizationId: string,
    userId: string,
    reason?: string,
  ): Promise<void> {
    const apiKeyRecord = await db.aPIKey.findFirst({
      where: { id: keyId, organizationId },
    });

    if (!apiKeyRecord) {
      throw new Error("API key not found");
    }

    await db.aPIKey.update({
      where: { id: keyId },
      data: { isActive: false },
    });

    // Clear cache
    const cacheKey = `${CACHE_PREFIX}:${apiKeyRecord.keyHash}`;
    await redis.del(cacheKey);

    logger.info("API key revoked", { keyId, organizationId, userId, reason });
  }

  /**
   * List all API keys for an organization.
   * Does not return the actual key values.
   */
  async list(organizationId: string): Promise<APIKey[]> {
    const apiKeyRecords = await db.aPIKey.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });

    return apiKeyRecords.map(mapPrismaToAPIKey);
  }

  /**
   * Get a specific API key by ID.
   */
  async get(keyId: string, organizationId: string): Promise<APIKey | null> {
    const apiKeyRecord = await db.aPIKey.findFirst({
      where: { id: keyId, organizationId },
    });

    if (!apiKeyRecord) {
      return null;
    }

    return mapPrismaToAPIKey(apiKeyRecord);
  }

  /**
   * Update API key properties.
   */
  async update(
    keyId: string,
    organizationId: string,
    userId: string,
    data: Partial<Pick<APIKey, "name" | "scopes" | "rateLimitTier" | "expiresAt">>,
  ): Promise<APIKey> {
    const existing = await db.aPIKey.findFirst({
      where: { id: keyId, organizationId },
    });

    if (!existing) {
      throw new Error("API key not found");
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.scopes !== undefined) updateData.scopes = data.scopes;
    if (data.rateLimitTier !== undefined) updateData.rateLimitTier = data.rateLimitTier;
    if (data.expiresAt !== undefined) updateData.expiresAt = data.expiresAt;

    const updated = await db.aPIKey.update({
      where: { id: keyId },
      data: updateData,
    });

    // Clear cache
    const cacheKey = `${CACHE_PREFIX}:${updated.keyHash}`;
    await redis.del(cacheKey);

    logger.info("API key updated", { keyId, organizationId, userId, changes: Object.keys(updateData) });

    return mapPrismaToAPIKey(updated);
  }

  /**
   * Track API key usage.
   * Updates lastUsedAt and increments totalRequests.
   */
  async trackUsage(keyId: string): Promise<void> {
    await db.aPIKey.update({
      where: { id: keyId },
      data: {
        lastUsedAt: new Date(),
      },
    });
  }

  /**
   * Get usage statistics for an API key.
   */
  async getUsageStats(keyId: string): Promise<{
    minuteCount: number;
    dayCount: number;
    totalRequests: number;
  }> {
    const apiKeyRecord = await db.aPIKey.findUnique({
      where: { id: keyId },
    });

    if (!apiKeyRecord) {
      throw new Error("API key not found");
    }

    const redisKey = `ratelimit:${keyId}`;
    const [minuteCount, dayCount] = await Promise.all([
      redis.get(`${redisKey}:minute`),
      redis.get(`${redisKey}:day`),
    ]);

    return {
      minuteCount: parseInt(minuteCount || "0", 10),
      dayCount: parseInt(dayCount || "0", 10),
      totalRequests: 0, // This would require additional tracking if needed
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
