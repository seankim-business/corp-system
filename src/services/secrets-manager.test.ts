/**
 * Secrets Manager Tests
 */

import { promises as fs } from "fs";
import * as path from "path";
import { createSecretsManager, SecretsConfig } from "./secrets-manager";

const TEST_SECRETS_DIR = path.join(__dirname, "../../.test-secrets");

describe("SecretsManager", () => {
  afterEach(async () => {
    // Cleanup test secrets directory
    try {
      await fs.rm(TEST_SECRETS_DIR, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  });

  describe("EnvSecretsProvider", () => {
    it("should get secrets from environment variables", async () => {
      process.env.TEST_SECRET = "test-value";

      const config: SecretsConfig = {
        provider: "env",
        cacheTTL: 60,
      };

      const manager = createSecretsManager(config);
      const secret = await manager.getSecret("TEST_SECRET");

      expect(secret).toBe("test-value");

      delete process.env.TEST_SECRET;
    });

    it("should set secrets in environment variables", async () => {
      const config: SecretsConfig = {
        provider: "env",
      };

      const manager = createSecretsManager(config);
      await manager.setSecret("NEW_TEST_SECRET", "new-value");

      expect(process.env.NEW_TEST_SECRET).toBe("new-value");

      delete process.env.NEW_TEST_SECRET;
    });

    it("should delete secrets from environment variables", async () => {
      process.env.DELETE_ME = "temporary";

      const config: SecretsConfig = {
        provider: "env",
      };

      const manager = createSecretsManager(config);
      await manager.deleteSecret("DELETE_ME");

      expect(process.env.DELETE_ME).toBeUndefined();
    });

    it("should list secrets with prefix", async () => {
      process.env.API_KEY_1 = "value1";
      process.env.API_KEY_2 = "value2";
      process.env.OTHER_SECRET = "value3";

      const config: SecretsConfig = {
        provider: "env",
      };

      const manager = createSecretsManager(config);
      const apiKeys = await manager.listSecrets("API_KEY");

      expect(apiKeys).toContain("API_KEY_1");
      expect(apiKeys).toContain("API_KEY_2");
      expect(apiKeys).not.toContain("OTHER_SECRET");

      delete process.env.API_KEY_1;
      delete process.env.API_KEY_2;
      delete process.env.OTHER_SECRET;
    });

    it("should throw error when rotating secrets", async () => {
      const config: SecretsConfig = {
        provider: "env",
      };

      const manager = createSecretsManager(config);

      await expect(manager.rotateSecret("ANY_KEY")).rejects.toThrow(
        "Secret rotation not supported for environment variables",
      );
    });
  });

  describe("FileSecretsProvider", () => {
    it("should store and retrieve encrypted secrets", async () => {
      const config: SecretsConfig = {
        provider: "file",
        secretsDir: TEST_SECRETS_DIR,
      };

      const manager = createSecretsManager(config);
      await manager.setSecret("FILE_SECRET", "encrypted-value");

      const secret = await manager.getSecret("FILE_SECRET");
      expect(secret).toBe("encrypted-value");
    });

    it("should return null for non-existent secrets", async () => {
      const config: SecretsConfig = {
        provider: "file",
        secretsDir: TEST_SECRETS_DIR,
      };

      const manager = createSecretsManager(config);
      const secret = await manager.getSecret("NON_EXISTENT");

      expect(secret).toBeNull();
    });

    it("should delete secrets", async () => {
      const config: SecretsConfig = {
        provider: "file",
        secretsDir: TEST_SECRETS_DIR,
      };

      const manager = createSecretsManager(config);
      await manager.setSecret("DELETE_ME", "temporary");

      let secret = await manager.getSecret("DELETE_ME");
      expect(secret).toBe("temporary");

      await manager.deleteSecret("DELETE_ME");

      secret = await manager.getSecret("DELETE_ME");
      expect(secret).toBeNull();
    });

    it("should list secrets with prefix", async () => {
      const config: SecretsConfig = {
        provider: "file",
        secretsDir: TEST_SECRETS_DIR,
      };

      const manager = createSecretsManager(config);
      await manager.setSecret("DB_PASSWORD", "pass1");
      await manager.setSecret("DB_USERNAME", "user1");
      await manager.setSecret("API_KEY", "key1");

      const dbSecrets = await manager.listSecrets("DB_");
      expect(dbSecrets).toContain("DB_PASSWORD");
      expect(dbSecrets).toContain("DB_USERNAME");
      expect(dbSecrets).not.toContain("API_KEY");
    });

    it("should throw error when rotating secrets", async () => {
      const config: SecretsConfig = {
        provider: "file",
        secretsDir: TEST_SECRETS_DIR,
      };

      const manager = createSecretsManager(config);

      await expect(manager.rotateSecret("ANY_KEY")).rejects.toThrow(
        "Secret rotation not supported for file-based provider",
      );
    });
  });

  describe("Caching", () => {
    it("should cache secrets for specified TTL", async () => {
      const config: SecretsConfig = {
        provider: "file",
        secretsDir: TEST_SECRETS_DIR,
        cacheTTL: 2, // 2 seconds
      };

      const manager = createSecretsManager(config);
      await manager.setSecret("CACHED_SECRET", "original-value");

      // First fetch (uncached)
      const firstFetch = await manager.getSecret("CACHED_SECRET");
      expect(firstFetch).toBe("original-value");

      // Modify the underlying secret directly
      await manager.setSecret("CACHED_SECRET", "modified-value");

      // Second fetch should return cached value
      const secondFetch = await manager.getSecret("CACHED_SECRET");
      expect(secondFetch).toBe("original-value"); // Still cached

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 2100));

      // Third fetch should return new value
      const thirdFetch = await manager.getSecret("CACHED_SECRET");
      expect(thirdFetch).toBe("modified-value");
    });

    it("should invalidate cache when secret is deleted", async () => {
      const config: SecretsConfig = {
        provider: "file",
        secretsDir: TEST_SECRETS_DIR,
        cacheTTL: 60,
      };

      const manager = createSecretsManager(config);
      await manager.setSecret("DELETE_CACHED", "value");

      // Fetch to cache it
      await manager.getSecret("DELETE_CACHED");

      // Delete should invalidate cache
      await manager.deleteSecret("DELETE_CACHED");

      // Should return null (not cached value)
      const secret = await manager.getSecret("DELETE_CACHED");
      expect(secret).toBeNull();
    });

    it("should invalidate cache when secret is set", async () => {
      const config: SecretsConfig = {
        provider: "file",
        secretsDir: TEST_SECRETS_DIR,
        cacheTTL: 60,
      };

      const manager = createSecretsManager(config);
      await manager.setSecret("UPDATE_CACHED", "original");

      // Fetch to cache it
      const first = await manager.getSecret("UPDATE_CACHED");
      expect(first).toBe("original");

      // Update should invalidate cache
      await manager.setSecret("UPDATE_CACHED", "updated");

      // Should return updated value
      const second = await manager.getSecret("UPDATE_CACHED");
      expect(second).toBe("updated");
    });
  });

  describe("AWS Provider (Stubbed)", () => {
    it("should throw not implemented error", async () => {
      const config: SecretsConfig = {
        provider: "aws",
        awsRegion: "us-east-1",
      };

      const manager = createSecretsManager(config);

      await expect(manager.getSecret("ANY_KEY")).rejects.toThrow(
        "AWS Secrets Manager provider not implemented - stubbed only",
      );
    });
  });

  describe("Vault Provider (Stubbed)", () => {
    it("should throw not implemented error", async () => {
      const config: SecretsConfig = {
        provider: "vault",
        vaultUrl: "https://vault.example.com",
        vaultToken: "token",
      };

      const manager = createSecretsManager(config);

      await expect(manager.getSecret("ANY_KEY")).rejects.toThrow(
        "Vault provider not implemented - stubbed only",
      );
    });

    it("should throw error if vaultUrl is missing", () => {
      const config: SecretsConfig = {
        provider: "vault",
        vaultToken: "token",
      } as any;

      expect(() => createSecretsManager(config)).toThrow(
        "Vault provider requires vaultUrl and vaultToken",
      );
    });

    it("should throw error if vaultToken is missing", () => {
      const config: SecretsConfig = {
        provider: "vault",
        vaultUrl: "https://vault.example.com",
      } as any;

      expect(() => createSecretsManager(config)).toThrow(
        "Vault provider requires vaultUrl and vaultToken",
      );
    });
  });

  describe("Error Handling", () => {
    it("should throw error for unknown provider", () => {
      const config: SecretsConfig = {
        provider: "unknown" as any,
      };

      expect(() => createSecretsManager(config)).toThrow("Unknown secrets provider: unknown");
    });
  });
});
