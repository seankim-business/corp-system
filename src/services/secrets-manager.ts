/**
 * Secrets Manager Abstraction
 * Supports multiple backends: Environment Variables, File-based, AWS Secrets Manager, HashiCorp Vault
 */

import { promises as fs } from "fs";
import * as path from "path";
import { logger } from "../utils/logger";
import { redis } from "../db/redis";
import { encryptToString, decryptFromString } from "./encryption.service";

// ============================================================================
// Core Interfaces
// ============================================================================

export interface SecretsManager {
  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;
  listSecrets(prefix?: string): Promise<string[]>;
  rotateSecret(key: string): Promise<string>;
}

export interface SecretsConfig {
  provider: "env" | "file" | "aws" | "vault";
  cacheTTL?: number; // Default: 300 seconds (5 minutes)
  enableAuditLog?: boolean; // Default: true

  // File provider options
  secretsDir?: string; // Default: .secrets/

  // AWS provider options
  awsRegion?: string;
  awsSecretPrefix?: string;

  // Vault provider options
  vaultUrl?: string;
  vaultToken?: string;
  vaultPath?: string; // Default: secret/
}

interface CachedSecret {
  value: string;
  expiresAt: number;
  refreshAt: number;
}

interface AuditLogEntry {
  timestamp: string;
  operation: "get" | "set" | "delete" | "rotate" | "list";
  key: string;
  success: boolean;
  provider: string;
  error?: string;
}

// ============================================================================
// Secrets Provider Interface
// ============================================================================

interface SecretsProvider {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  rotate?(key: string): Promise<string>;
}

// ============================================================================
// Environment Variables Provider
// ============================================================================

class EnvSecretsProvider implements SecretsProvider {
  async get(key: string): Promise<string | null> {
    const value = process.env[key];
    return value || null;
  }

  async set(key: string, value: string): Promise<void> {
    process.env[key] = value;
    logger.info(`Secret set in environment`, { key });
  }

  async delete(key: string): Promise<void> {
    delete process.env[key];
    logger.info(`Secret deleted from environment`, { key });
  }

  async list(prefix?: string): Promise<string[]> {
    const keys = Object.keys(process.env);
    if (prefix) {
      return keys.filter((key) => key.startsWith(prefix));
    }
    return keys;
  }

  async rotate(_key: string): Promise<string> {
    throw new Error("Secret rotation not supported for environment variables");
  }
}

// ============================================================================
// File-Based Provider (with encryption)
// ============================================================================

class FileSecretsProvider implements SecretsProvider {
  private secretsDir: string;

  constructor(secretsDir: string = ".secrets") {
    this.secretsDir = path.resolve(secretsDir);
  }

  private async ensureSecretsDir(): Promise<void> {
    try {
      await fs.access(this.secretsDir);
    } catch {
      await fs.mkdir(this.secretsDir, { recursive: true, mode: 0o700 });
      logger.info(`Created secrets directory`, { dir: this.secretsDir });
    }
  }

  private getSecretPath(key: string): string {
    // Sanitize key to prevent directory traversal
    const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.secretsDir, `${sanitizedKey}.enc`);
  }

  async get(key: string): Promise<string | null> {
    try {
      const secretPath = this.getSecretPath(key);
      const encrypted = await fs.readFile(secretPath, "utf8");
      const decrypted = decryptFromString(encrypted);
      return decrypted;
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return null;
      }
      logger.error(`Failed to read secret from file`, { key, error: error.message });
      throw error;
    }
  }

  async set(key: string, value: string): Promise<void> {
    await this.ensureSecretsDir();
    const secretPath = this.getSecretPath(key);
    const encrypted = encryptToString(value);
    await fs.writeFile(secretPath, encrypted, { mode: 0o600 });
    logger.info(`Secret stored in file`, { key, path: secretPath });
  }

  async delete(key: string): Promise<void> {
    try {
      const secretPath = this.getSecretPath(key);
      await fs.unlink(secretPath);
      logger.info(`Secret deleted from file`, { key, path: secretPath });
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        logger.error(`Failed to delete secret file`, { key, error: error.message });
        throw error;
      }
    }
  }

  async list(prefix?: string): Promise<string[]> {
    try {
      await this.ensureSecretsDir();
      const files = await fs.readdir(this.secretsDir);
      const secretKeys = files
        .filter((file) => file.endsWith(".enc"))
        .map((file) => file.replace(/\.enc$/, ""));

      if (prefix) {
        return secretKeys.filter((key) => key.startsWith(prefix));
      }
      return secretKeys;
    } catch (error: any) {
      logger.error(`Failed to list secrets`, { error: error.message });
      return [];
    }
  }

  async rotate(_key: string): Promise<string> {
    throw new Error("Secret rotation not supported for file-based provider");
  }
}

// ============================================================================
// AWS Secrets Manager Provider (Stubbed)
// ============================================================================

class AWSSecretsProvider implements SecretsProvider {
  private region: string;
  private prefix: string;

  constructor(region: string = "us-east-1", prefix: string = "") {
    this.region = region;
    this.prefix = prefix;
    logger.warn(
      `AWS Secrets Manager provider is stubbed - AWS SDK integration required for production use`,
    );
  }

  private getFullKey(key: string): string {
    return this.prefix ? `${this.prefix}/${key}` : key;
  }

  async get(key: string): Promise<string | null> {
    const fullKey = this.getFullKey(key);
    logger.debug(`[AWS STUB] Would retrieve secret from AWS Secrets Manager`, {
      key: fullKey,
      region: this.region,
    });
    // TODO: Implement AWS SDK integration
    // const client = new SecretsManagerClient({ region: this.region });
    // const response = await client.send(new GetSecretValueCommand({ SecretId: fullKey }));
    // return response.SecretString || null;
    throw new Error("AWS Secrets Manager provider not implemented - stubbed only");
  }

  async set(key: string, _value: string): Promise<void> {
    const fullKey = this.getFullKey(key);
    logger.debug(`[AWS STUB] Would create/update secret in AWS Secrets Manager`, {
      key: fullKey,
      region: this.region,
    });
    // TODO: Implement AWS SDK integration
    throw new Error("AWS Secrets Manager provider not implemented - stubbed only");
  }

  async delete(key: string): Promise<void> {
    const fullKey = this.getFullKey(key);
    logger.debug(`[AWS STUB] Would delete secret from AWS Secrets Manager`, {
      key: fullKey,
      region: this.region,
    });
    // TODO: Implement AWS SDK integration
    throw new Error("AWS Secrets Manager provider not implemented - stubbed only");
  }

  async list(prefix?: string): Promise<string[]> {
    const searchPrefix = prefix ? this.getFullKey(prefix) : this.prefix;
    logger.debug(`[AWS STUB] Would list secrets from AWS Secrets Manager`, {
      prefix: searchPrefix,
      region: this.region,
    });
    // TODO: Implement AWS SDK integration
    throw new Error("AWS Secrets Manager provider not implemented - stubbed only");
  }

  async rotate(key: string): Promise<string> {
    const fullKey = this.getFullKey(key);
    logger.debug(`[AWS STUB] Would rotate secret in AWS Secrets Manager`, {
      key: fullKey,
      region: this.region,
    });
    // TODO: Implement AWS SDK integration with rotation lambda
    throw new Error("AWS Secrets Manager rotation not implemented - stubbed only");
  }
}

// ============================================================================
// HashiCorp Vault Provider (Stubbed)
// ============================================================================

class VaultSecretsProvider implements SecretsProvider {
  private vaultUrl: string;
  private basePath: string;

  constructor(vaultUrl: string, _token: string, basePath: string = "secret") {
    this.vaultUrl = vaultUrl;
    this.basePath = basePath;
    logger.warn(`Vault provider is stubbed - node-vault integration required for production use`);
  }

  private getFullPath(key: string): string {
    return `${this.basePath}/data/${key}`;
  }

  async get(key: string): Promise<string | null> {
    const fullPath = this.getFullPath(key);
    logger.debug(`[VAULT STUB] Would retrieve secret from Vault`, {
      path: fullPath,
      vaultUrl: this.vaultUrl,
    });
    // TODO: Implement node-vault integration
    // const vault = require('node-vault')({ endpoint: this.vaultUrl, token: this.token });
    // const result = await vault.read(fullPath);
    // return result.data.data.value || null;
    throw new Error("Vault provider not implemented - stubbed only");
  }

  async set(key: string, _value: string): Promise<void> {
    const fullPath = this.getFullPath(key);
    logger.debug(`[VAULT STUB] Would write secret to Vault`, {
      path: fullPath,
      vaultUrl: this.vaultUrl,
    });
    // TODO: Implement node-vault integration
    throw new Error("Vault provider not implemented - stubbed only");
  }

  async delete(key: string): Promise<void> {
    const fullPath = this.getFullPath(key);
    logger.debug(`[VAULT STUB] Would delete secret from Vault`, {
      path: fullPath,
      vaultUrl: this.vaultUrl,
    });
    // TODO: Implement node-vault integration
    throw new Error("Vault provider not implemented - stubbed only");
  }

  async list(prefix?: string): Promise<string[]> {
    const listPath = `${this.basePath}/metadata/${prefix || ""}`;
    logger.debug(`[VAULT STUB] Would list secrets from Vault`, {
      path: listPath,
      vaultUrl: this.vaultUrl,
    });
    // TODO: Implement node-vault integration
    throw new Error("Vault provider not implemented - stubbed only");
  }

  async rotate(key: string): Promise<string> {
    logger.debug(`[VAULT STUB] Would rotate secret in Vault`, {
      key,
      vaultUrl: this.vaultUrl,
    });
    // TODO: Implement Vault rotation
    throw new Error("Vault rotation not implemented - stubbed only");
  }
}

// ============================================================================
// Main Secrets Manager Implementation
// ============================================================================

class SecretsManagerImpl implements SecretsManager {
  private provider: SecretsProvider;
  private config: SecretsConfig;
  private cache: Map<string, CachedSecret> = new Map();
  private cacheTTL: number;
  private auditLog: AuditLogEntry[] = [];

  constructor(config: SecretsConfig) {
    this.config = config;
    this.cacheTTL = (config.cacheTTL || 300) * 1000; // Convert to milliseconds
    this.provider = this.createProvider(config);

    // Periodic cache cleanup
    setInterval(() => this.cleanupExpiredCache(), 60000); // Every minute
  }

  private createProvider(config: SecretsConfig): SecretsProvider {
    switch (config.provider) {
      case "env":
        return new EnvSecretsProvider();

      case "file":
        return new FileSecretsProvider(config.secretsDir);

      case "aws":
        return new AWSSecretsProvider(config.awsRegion, config.awsSecretPrefix);

      case "vault":
        if (!config.vaultUrl || !config.vaultToken) {
          throw new Error("Vault provider requires vaultUrl and vaultToken");
        }
        return new VaultSecretsProvider(config.vaultUrl, config.vaultToken, config.vaultPath);

      default:
        throw new Error(`Unknown secrets provider: ${config.provider}`);
    }
  }

  private getCacheKey(key: string): string {
    return `secrets:cache:${this.config.provider}:${key}`;
  }

  private async getCachedSecret(key: string): Promise<string | null> {
    const cacheKey = this.getCacheKey(key);

    // Try in-memory cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      logger.debug(`Secret retrieved from in-memory cache`, { key });

      // Proactive refresh if approaching expiry
      if (Date.now() >= cached.refreshAt) {
        this.refreshSecret(key).catch((err) => {
          logger.warn(`Failed to refresh secret`, { key, error: err.message });
        });
      }

      return cached.value;
    }

    // Try Redis cache
    try {
      const redisValue = await redis.get(cacheKey);
      if (redisValue) {
        const ttl = await redis.ttl(cacheKey);
        if (ttl > 0) {
          const expiresAt = Date.now() + ttl * 1000;
          const refreshAt = expiresAt - this.cacheTTL * 0.2; // Refresh at 80% of TTL

          this.cache.set(cacheKey, {
            value: redisValue,
            expiresAt,
            refreshAt,
          });

          logger.debug(`Secret retrieved from Redis cache`, { key, ttl });
          return redisValue;
        }
      }
    } catch (error: any) {
      logger.warn(`Redis cache lookup failed`, { key, error: error.message });
    }

    return null;
  }

  private async setCachedSecret(key: string, value: string): Promise<void> {
    const cacheKey = this.getCacheKey(key);
    const now = Date.now();
    const expiresAt = now + this.cacheTTL;
    const refreshAt = expiresAt - this.cacheTTL * 0.2; // Refresh at 80% of TTL

    // Set in-memory cache
    this.cache.set(cacheKey, {
      value,
      expiresAt,
      refreshAt,
    });

    // Set Redis cache
    try {
      await redis.set(cacheKey, value, Math.floor(this.cacheTTL / 1000));
    } catch (error: any) {
      logger.warn(`Failed to cache secret in Redis`, { key, error: error.message });
    }
  }

  private async invalidateCache(key: string): Promise<void> {
    const cacheKey = this.getCacheKey(key);
    this.cache.delete(cacheKey);

    try {
      await redis.del(cacheKey);
    } catch (error: any) {
      logger.warn(`Failed to invalidate Redis cache`, { key, error: error.message });
    }
  }

  private cleanupExpiredCache(): void {
    const now = Date.now();
    const expired: string[] = [];

    this.cache.forEach((cached, key) => {
      if (now >= cached.expiresAt) {
        expired.push(key);
      }
    });

    expired.forEach((key) => this.cache.delete(key));

    if (expired.length > 0) {
      logger.debug(`Cleaned up expired cache entries`, { count: expired.length });
    }
  }

  private async refreshSecret(key: string): Promise<void> {
    try {
      const value = await this.provider.get(key);
      if (value) {
        await this.setCachedSecret(key, value);
        logger.debug(`Secret refreshed in cache`, { key });
      }
    } catch (error: any) {
      logger.error(`Failed to refresh secret`, { key, error: error.message });
    }
  }

  private logAudit(
    operation: AuditLogEntry["operation"],
    key: string,
    success: boolean,
    error?: string,
  ): void {
    if (!this.config.enableAuditLog && this.config.enableAuditLog !== undefined) {
      return;
    }

    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      operation,
      key,
      success,
      provider: this.config.provider,
      error,
    };

    this.auditLog.push(entry);

    // Keep only last 1000 entries
    if (this.auditLog.length > 1000) {
      this.auditLog.shift();
    }

    logger.info(`Secret ${operation} operation`, {
      key,
      success,
      provider: this.config.provider,
      error,
    });
  }

  async getSecret(key: string): Promise<string | null> {
    try {
      // Check cache first
      const cached = await this.getCachedSecret(key);
      if (cached !== null) {
        this.logAudit("get", key, true);
        return cached;
      }

      // Fetch from provider
      const value = await this.provider.get(key);

      if (value !== null) {
        // Cache the value
        await this.setCachedSecret(key, value);
      }

      this.logAudit("get", key, true);
      return value;
    } catch (error: any) {
      this.logAudit("get", key, false, error.message);
      throw error;
    }
  }

  async setSecret(key: string, value: string): Promise<void> {
    try {
      await this.provider.set(key, value);
      await this.setCachedSecret(key, value);
      this.logAudit("set", key, true);
    } catch (error: any) {
      this.logAudit("set", key, false, error.message);
      throw error;
    }
  }

  async deleteSecret(key: string): Promise<void> {
    try {
      await this.provider.delete(key);
      await this.invalidateCache(key);
      this.logAudit("delete", key, true);
    } catch (error: any) {
      this.logAudit("delete", key, false, error.message);
      throw error;
    }
  }

  async listSecrets(prefix?: string): Promise<string[]> {
    try {
      const secrets = await this.provider.list(prefix);
      this.logAudit("list", prefix || "*", true);
      return secrets;
    } catch (error: any) {
      this.logAudit("list", prefix || "*", false, error.message);
      throw error;
    }
  }

  async rotateSecret(key: string): Promise<string> {
    try {
      if (!this.provider.rotate) {
        throw new Error(`Secret rotation not supported by ${this.config.provider} provider`);
      }

      const newValue = await this.provider.rotate(key);
      await this.setCachedSecret(key, newValue);
      this.logAudit("rotate", key, true);
      return newValue;
    } catch (error: any) {
      this.logAudit("rotate", key, false, error.message);
      throw error;
    }
  }

  /**
   * Get audit log entries
   */
  getAuditLog(): AuditLogEntry[] {
    return [...this.auditLog];
  }

  /**
   * Clear all cached secrets
   */
  async clearCache(): Promise<void> {
    this.cache.clear();
    logger.info(`Cleared all cached secrets for provider`, { provider: this.config.provider });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a secrets manager instance
 * @param config - Configuration for the secrets manager
 * @returns SecretsManager instance
 */
export function createSecretsManager(config: SecretsConfig): SecretsManager {
  return new SecretsManagerImpl(config);
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  createSecretsManager,
};
