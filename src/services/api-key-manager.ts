/**
 * API Key Manager
 * Secure API key generation, validation, and rotation
 */

import * as crypto from "crypto";
import { db } from "../db/client";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";

const API_KEY_PREFIX = "nb_";
const API_KEY_LENGTH = 32;
const KEY_CACHE_TTL = 300; // 5 minutes

interface ApiKeyMetadata {
  id: string;
  organizationId: string;
  userId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimitTier: string;
  expiresAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  isActive: boolean;
}

interface CreateApiKeyOptions {
  organizationId: string;
  userId: string;
  name: string;
  scopes?: string[];
  rateLimitTier?: string;
  expiresInDays?: number;
}

interface ValidatedKey {
  valid: boolean;
  metadata?: ApiKeyMetadata;
  error?: string;
}

function generateSecureKey(): string {
  return crypto.randomBytes(API_KEY_LENGTH).toString("base64url");
}

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function generateKeyId(): string {
  return crypto.randomBytes(8).toString("hex");
}

export async function createApiKey(options: CreateApiKeyOptions): Promise<{
  key: string;
  metadata: ApiKeyMetadata;
}> {
  const { organizationId, userId, name, scopes = ["read"], rateLimitTier = "standard", expiresInDays } = options;

  const keyId = generateKeyId();
  const secretPart = generateSecureKey();
  const fullKey = `${API_KEY_PREFIX}${keyId}_${secretPart}`;
  const keyHash = hashKey(fullKey);
  const keyPrefix = `${API_KEY_PREFIX}${keyId}_${secretPart.substring(0, 4)}...`;

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  // Store in database
  const createdKey = await db.aPIKey.create({
    data: {
      organizationId,
      userId,
      name,
      keyHash,
      keyPrefix,
      scopes,
      rateLimitTier,
      expiresAt,
      isActive: true,
    },
  });

  const metadata: ApiKeyMetadata = {
    id: createdKey.id,
    organizationId,
    userId,
    name,
    keyPrefix,
    scopes,
    rateLimitTier,
    expiresAt: expiresAt ?? undefined,
    createdAt: createdKey.createdAt,
    isActive: true,
  };

  logger.info("API key created", {
    keyId: createdKey.id,
    organizationId,
    name,
    scopes,
    expiresAt: expiresAt?.toISOString(),
  });

  return { key: fullKey, metadata };
}

export async function validateApiKey(key: string): Promise<ValidatedKey> {
  // Check format
  if (!key.startsWith(API_KEY_PREFIX)) {
    return { valid: false, error: "Invalid key format" };
  }

  const keyHash = hashKey(key);

  // Check cache first
  const cached = await redis.get(`apikey:${keyHash}`);
  if (cached) {
    const metadata = JSON.parse(cached) as ApiKeyMetadata;

    // Check isActive
    if (!metadata.isActive) {
      return { valid: false, error: "Key disabled" };
    }

    // Check expiration
    if (metadata.expiresAt && new Date(metadata.expiresAt) < new Date()) {
      return { valid: false, error: "Key expired" };
    }

    // Update last used asynchronously
    updateLastUsed(metadata.id).catch(() => {});

    return { valid: true, metadata };
  }

  // Query database
  const apiKey = await db.aPIKey.findUnique({
    where: { keyHash },
  });

  if (!apiKey) {
    return { valid: false, error: "Key not found" };
  }

  if (!apiKey.isActive) {
    return { valid: false, error: "Key disabled" };
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return { valid: false, error: "Key expired" };
  }

  const metadata: ApiKeyMetadata = {
    id: apiKey.id,
    organizationId: apiKey.organizationId,
    userId: apiKey.userId,
    name: apiKey.name,
    keyPrefix: apiKey.keyPrefix,
    scopes: apiKey.scopes,
    rateLimitTier: apiKey.rateLimitTier,
    expiresAt: apiKey.expiresAt ?? undefined,
    lastUsedAt: apiKey.lastUsedAt ?? undefined,
    createdAt: apiKey.createdAt,
    isActive: apiKey.isActive,
  };

  // Cache the key
  await redis.set(`apikey:${keyHash}`, JSON.stringify(metadata), KEY_CACHE_TTL);

  // Update last used asynchronously
  updateLastUsed(apiKey.id).catch(() => {});

  return { valid: true, metadata };
}

async function updateLastUsed(keyId: string): Promise<void> {
  try {
    await db.aPIKey.update({
      where: { id: keyId },
      data: { lastUsedAt: new Date() },
    });
  } catch (error) {
    logger.error("Failed to update API key last used", {
      keyId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function revokeApiKey(
  keyId: string,
  organizationId: string
): Promise<void> {
  const apiKey = await db.aPIKey.findFirst({
    where: { id: keyId, organizationId },
  });

  if (!apiKey) {
    throw new Error("API key not found");
  }

  await db.aPIKey.update({
    where: { id: keyId },
    data: { isActive: false },
  });

  // Invalidate cache
  await redis.del(`apikey:${apiKey.keyHash}`);

  logger.info("API key revoked", { keyId, organizationId });
}

export async function rotateApiKey(
  keyId: string,
  organizationId: string,
  userId: string
): Promise<{ key: string; metadata: ApiKeyMetadata }> {
  const existingKey = await db.aPIKey.findFirst({
    where: { id: keyId, organizationId },
  });

  if (!existingKey) {
    throw new Error("API key not found");
  }

  // Create new key with same settings
  const result = await createApiKey({
    organizationId,
    userId,
    name: `${existingKey.name} (rotated)`,
    scopes: existingKey.scopes,
    rateLimitTier: existingKey.rateLimitTier,
  });

  // Revoke old key after grace period (keep active for 24 hours)
  setTimeout(async () => {
    await revokeApiKey(keyId, organizationId).catch(() => {});
  }, 24 * 60 * 60 * 1000);

  logger.info("API key rotated", {
    oldKeyId: keyId,
    newKeyId: result.metadata.id,
    organizationId,
  });

  return result;
}

export async function listApiKeys(organizationId: string): Promise<ApiKeyMetadata[]> {
  const keys = await db.aPIKey.findMany({
    where: {
      organizationId,
      isActive: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return keys.map((key) => ({
    id: key.id,
    organizationId: key.organizationId,
    userId: key.userId,
    name: key.name,
    keyPrefix: key.keyPrefix,
    scopes: key.scopes,
    rateLimitTier: key.rateLimitTier,
    expiresAt: key.expiresAt ?? undefined,
    lastUsedAt: key.lastUsedAt ?? undefined,
    createdAt: key.createdAt,
    isActive: key.isActive,
  }));
}

export async function updateApiKeyScopes(
  keyId: string,
  organizationId: string,
  scopes: string[]
): Promise<void> {
  const apiKey = await db.aPIKey.findFirst({
    where: { id: keyId, organizationId },
  });

  if (!apiKey) {
    throw new Error("API key not found");
  }

  await db.aPIKey.update({
    where: { id: keyId },
    data: { scopes },
  });

  // Invalidate cache
  await redis.del(`apikey:${apiKey.keyHash}`);

  logger.info("API key scopes updated", { keyId, organizationId, scopes });
}

export function hasScope(metadata: ApiKeyMetadata, requiredScope: string): boolean {
  if (metadata.scopes.includes("*")) return true;
  if (metadata.scopes.includes(requiredScope)) return true;

  // Check wildcard patterns (e.g., "read:*" matches "read:users")
  const [category] = requiredScope.split(":");
  return metadata.scopes.includes(`${category}:*`);
}

// Available scopes
export const API_SCOPES = {
  READ: "read",
  WRITE: "write",
  ADMIN: "admin",
  READ_SESSIONS: "read:sessions",
  WRITE_SESSIONS: "write:sessions",
  READ_ORCHESTRATIONS: "read:orchestrations",
  WRITE_ORCHESTRATIONS: "write:orchestrations",
  MANAGE_INTEGRATIONS: "manage:integrations",
  MANAGE_USERS: "manage:users",
  ALL: "*",
} as const;
