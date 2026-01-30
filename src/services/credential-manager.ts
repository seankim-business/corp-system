/**
 * Secure Credential Manager
 *
 * Encrypted credential storage in Redis with rotation and expiry support.
 * Uses AES-256-GCM for authenticated encryption.
 */
import crypto from "crypto";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";

// =============================================================================
// Types
// =============================================================================

export type CredentialType = "api_key" | "oauth_token" | "secret" | "webhook_secret";

export interface StoredCredential {
  type: CredentialType;
  encryptedValue: string;
  iv: string;
  authTag: string;
  createdAt: number;
  rotatedAt?: number;
  expiresAt?: number;
  metadata?: Record<string, string>;
}

export interface CredentialMetadata {
  orgId: string;
  providerId: string;
  type: CredentialType;
  createdAt: number;
  rotatedAt?: number;
  expiresAt?: number;
  hasExpiry: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const KEY_PREFIX = "cred";
const INDEX_PREFIX = "cred:index";

// =============================================================================
// Encryption Helpers
// =============================================================================

function getEncryptionKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey) {
    return crypto.createHash("sha256").update(envKey).digest();
  }
  logger.warn("ENCRYPTION_KEY not set, using default dev key — do NOT use in production");
  return crypto.createHash("sha256").update("nubabel-dev-encryption-key-not-for-prod").digest();
}

function encrypt(plaintext: string): { encrypted: string; iv: string; authTag: string } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

function decrypt(encrypted: string, iv: string, authTag: string): string {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

// =============================================================================
// Key Helpers
// =============================================================================

function credentialKey(orgId: string, providerId: string): string {
  return `${KEY_PREFIX}:${orgId}:${providerId}`;
}

function indexKey(orgId: string): string {
  return `${INDEX_PREFIX}:${orgId}`;
}

// =============================================================================
// CredentialManager
// =============================================================================

class CredentialManager {
  /**
   * Store an encrypted credential in Redis.
   */
  async storeCredential(
    orgId: string,
    providerId: string,
    value: string,
    type: CredentialType,
    metadata?: Record<string, string>,
    ttlSeconds?: number,
  ): Promise<void> {
    const { encrypted, iv, authTag } = encrypt(value);

    const stored: StoredCredential = {
      type,
      encryptedValue: encrypted,
      iv,
      authTag,
      createdAt: Date.now(),
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
      metadata,
    };

    const key = credentialKey(orgId, providerId);
    await redis.set(key, JSON.stringify(stored), ttlSeconds);

    // Maintain provider index for listing
    await this.addToIndex(orgId, providerId);

    logger.info("Credential stored", {
      orgId,
      providerId,
      type,
      hasTtl: !!ttlSeconds,
    });
  }

  /**
   * Retrieve and decrypt a credential. Returns null if not found.
   */
  async getCredential(orgId: string, providerId: string): Promise<string | null> {
    const key = credentialKey(orgId, providerId);
    const raw = await redis.get(key);
    if (!raw) {
      return null;
    }

    try {
      const stored: StoredCredential = JSON.parse(raw);
      return decrypt(stored.encryptedValue, stored.iv, stored.authTag);
    } catch (err) {
      logger.error("Failed to decrypt credential", {
        orgId,
        providerId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Rotate a credential: preserve metadata and createdAt, update value and rotatedAt.
   */
  async rotateCredential(
    orgId: string,
    providerId: string,
    newValue: string,
  ): Promise<boolean> {
    const key = credentialKey(orgId, providerId);
    const raw = await redis.get(key);
    if (!raw) {
      logger.warn("Cannot rotate non-existent credential", { orgId, providerId });
      return false;
    }

    let existing: StoredCredential;
    try {
      existing = JSON.parse(raw);
    } catch {
      logger.error("Failed to parse existing credential for rotation", { orgId, providerId });
      return false;
    }

    const { encrypted, iv, authTag } = encrypt(newValue);

    // Compute remaining TTL if the original had an expiry
    let ttlSeconds: number | undefined;
    if (existing.expiresAt) {
      const remaining = Math.max(0, Math.floor((existing.expiresAt - Date.now()) / 1000));
      ttlSeconds = remaining > 0 ? remaining : undefined;
    }

    const rotated: StoredCredential = {
      type: existing.type,
      encryptedValue: encrypted,
      iv,
      authTag,
      createdAt: existing.createdAt,
      rotatedAt: Date.now(),
      expiresAt: existing.expiresAt,
      metadata: existing.metadata,
    };

    await redis.set(key, JSON.stringify(rotated), ttlSeconds);

    logger.info("Credential rotated", {
      orgId,
      providerId,
      type: existing.type,
    });

    return true;
  }

  /**
   * Revoke (delete) a credential.
   */
  async revokeCredential(orgId: string, providerId: string): Promise<void> {
    const key = credentialKey(orgId, providerId);
    await redis.del(key);
    await this.removeFromIndex(orgId, providerId);

    logger.info("Credential revoked", { orgId, providerId });
  }

  /**
   * List metadata for all credentials belonging to an org (no decrypted values).
   */
  async listCredentials(orgId: string): Promise<CredentialMetadata[]> {
    const providerIds = await this.getIndex(orgId);
    const results: CredentialMetadata[] = [];

    for (const providerId of providerIds) {
      const key = credentialKey(orgId, providerId);
      const raw = await redis.get(key);
      if (!raw) {
        // Credential expired or was deleted outside of revokeCredential; clean index
        await this.removeFromIndex(orgId, providerId);
        continue;
      }

      try {
        const stored: StoredCredential = JSON.parse(raw);
        results.push({
          orgId,
          providerId,
          type: stored.type,
          createdAt: stored.createdAt,
          rotatedAt: stored.rotatedAt,
          expiresAt: stored.expiresAt,
          hasExpiry: stored.expiresAt !== undefined,
        });
      } catch {
        logger.warn("Skipping unparseable credential in listing", { orgId, providerId });
      }
    }

    return results;
  }

  /**
   * Check whether a credential exists.
   */
  async hasCredential(orgId: string, providerId: string): Promise<boolean> {
    const key = credentialKey(orgId, providerId);
    return redis.exists(key);
  }

  /**
   * Get expiry information for a credential.
   */
  async getCredentialExpiry(
    orgId: string,
    providerId: string,
  ): Promise<{ expiresAt?: number; isExpired: boolean; ttlSeconds: number }> {
    const key = credentialKey(orgId, providerId);
    const raw = await redis.get(key);

    if (!raw) {
      return { isExpired: true, ttlSeconds: -1 };
    }

    const ttlSeconds = await redis.ttl(key);

    try {
      const stored: StoredCredential = JSON.parse(raw);
      const isExpired = stored.expiresAt !== undefined && stored.expiresAt <= Date.now();
      return {
        expiresAt: stored.expiresAt,
        isExpired,
        ttlSeconds,
      };
    } catch {
      return { isExpired: false, ttlSeconds };
    }
  }

  // ===========================================================================
  // Index Management (provider list per org)
  // ===========================================================================

  private async getIndex(orgId: string): Promise<string[]> {
    const key = indexKey(orgId);
    const raw = await redis.get(key);
    if (!raw) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }

  private async setIndex(orgId: string, providerIds: string[]): Promise<void> {
    const key = indexKey(orgId);
    await redis.set(key, JSON.stringify(providerIds));
  }

  private async addToIndex(orgId: string, providerId: string): Promise<void> {
    const current = await this.getIndex(orgId);
    if (!current.includes(providerId)) {
      current.push(providerId);
      await this.setIndex(orgId, current);
    }
  }

  private async removeFromIndex(orgId: string, providerId: string): Promise<void> {
    const current = await this.getIndex(orgId);
    const updated = current.filter((id) => id !== providerId);
    if (updated.length !== current.length) {
      await this.setIndex(orgId, updated);
    }
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const credentialManager = new CredentialManager();
