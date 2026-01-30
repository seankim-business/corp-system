/**
 * Secrets Manager Usage Examples
 * Demonstrates how to use the secrets manager with different providers
 */

import { createSecretsManager, SecretsConfig } from "./secrets-manager";

// ============================================================================
// Example 1: Environment Variables Provider (Default)
// ============================================================================

async function exampleEnvProvider() {
  const config: SecretsConfig = {
    provider: "env",
    cacheTTL: 300, // 5 minutes
    enableAuditLog: true,
  };

  const secretsManager = createSecretsManager(config);

  // Get a secret from environment
  const apiKey = await secretsManager.getSecret("API_KEY");
  console.log("API Key:", apiKey ? "***" : "Not found");

  // Set a secret (adds to process.env)
  await secretsManager.setSecret("NEW_SECRET", "secret-value-123");

  // List secrets with prefix
  const apiSecrets = await secretsManager.listSecrets("API_");
  console.log("API Secrets:", apiSecrets);

  // Delete a secret
  await secretsManager.deleteSecret("NEW_SECRET");
}

// ============================================================================
// Example 2: File-Based Provider (Encrypted)
// ============================================================================

async function exampleFileProvider() {
  const config: SecretsConfig = {
    provider: "file",
    secretsDir: ".secrets", // Directory where encrypted secrets are stored
    cacheTTL: 300,
    enableAuditLog: true,
  };

  const secretsManager = createSecretsManager(config);

  // Store a secret (encrypted on disk)
  await secretsManager.setSecret("DATABASE_PASSWORD", "super-secret-password");

  // Retrieve the secret (cached for 5 minutes)
  const dbPassword = await secretsManager.getSecret("DATABASE_PASSWORD");
  console.log("DB Password retrieved:", dbPassword ? "***" : "Not found");

  // List all secrets in the .secrets directory
  const allSecrets = await secretsManager.listSecrets();
  console.log("All secrets:", allSecrets);

  // Delete a secret
  await secretsManager.deleteSecret("DATABASE_PASSWORD");
}

// ============================================================================
// Example 3: AWS Secrets Manager Provider (Stubbed)
// ============================================================================

export async function exampleAWSProvider() {
  const config: SecretsConfig = {
    provider: "aws",
    awsRegion: "us-east-1",
    awsSecretPrefix: "nubabel/production",
    cacheTTL: 600, // 10 minutes for AWS (to reduce API calls)
    enableAuditLog: true,
  };

  const secretsManager = createSecretsManager(config);

  try {
    // Note: This will throw an error because AWS SDK integration is stubbed
    const secret = await secretsManager.getSecret("slack-oauth-token");
    console.log("Secret:", secret);
  } catch (error) {
    console.error("AWS provider is stubbed:", (error as Error).message);
  }
}

// ============================================================================
// Example 4: HashiCorp Vault Provider (Stubbed)
// ============================================================================

export async function exampleVaultProvider() {
  const config: SecretsConfig = {
    provider: "vault",
    vaultUrl: "https://vault.example.com",
    vaultToken: "hvs.xxxxxxxxxxxxx",
    vaultPath: "secret",
    cacheTTL: 300,
    enableAuditLog: true,
  };

  const secretsManager = createSecretsManager(config);

  try {
    // Note: This will throw an error because Vault integration is stubbed
    const secret = await secretsManager.getSecret("database/credentials");
    console.log("Secret:", secret);
  } catch (error) {
    console.error("Vault provider is stubbed:", (error as Error).message);
  }
}

// ============================================================================
// Example 5: Practical Use Case - Multi-Environment Setup
// ============================================================================

async function exampleMultiEnvironment() {
  // Determine provider based on environment
  const isProduction = process.env.NODE_ENV === "production";
  const isDevelopment = process.env.NODE_ENV === "development";

  let config: SecretsConfig;

  if (isProduction) {
    // Use AWS Secrets Manager in production
    config = {
      provider: "aws",
      awsRegion: process.env.AWS_REGION || "us-east-1",
      awsSecretPrefix: "nubabel/production",
      cacheTTL: 600,
      enableAuditLog: true,
    };
  } else if (isDevelopment) {
    // Use file-based provider in development
    config = {
      provider: "file",
      secretsDir: ".secrets",
      cacheTTL: 60, // Shorter TTL for development
      enableAuditLog: true,
    };
  } else {
    // Use environment variables for testing
    config = {
      provider: "env",
      cacheTTL: 0, // No caching in tests
      enableAuditLog: false,
    };
  }

  const secretsManager = createSecretsManager(config);

  // Common secret access pattern across all environments
  const slackToken = await secretsManager.getSecret("SLACK_OAUTH_TOKEN");
  const notionToken = await secretsManager.getSecret("NOTION_OAUTH_TOKEN");

  console.log("Slack Token:", slackToken ? "Found" : "Not found");
  console.log("Notion Token:", notionToken ? "Found" : "Not found");
}

// ============================================================================
// Example 6: Secret Rotation (when supported)
// ============================================================================

export async function exampleSecretRotation() {
  // Only certain providers support rotation (e.g., AWS, Vault)
  const config: SecretsConfig = {
    provider: "aws",
    awsRegion: "us-east-1",
    cacheTTL: 300,
  };

  const secretsManager = createSecretsManager(config);

  try {
    // Rotate a secret (generates new value and updates)
    const newSecret = await secretsManager.rotateSecret("database-password");
    console.log("New secret value:", newSecret ? "***" : "Failed");
  } catch (error) {
    console.error("Rotation failed:", (error as Error).message);
  }
}

// ============================================================================
// Example 7: Caching and Performance
// ============================================================================

async function exampleCaching() {
  const config: SecretsConfig = {
    provider: "file",
    secretsDir: ".secrets",
    cacheTTL: 300, // 5 minutes
  };

  const secretsManager = createSecretsManager(config);

  console.time("First fetch (uncached)");
  await secretsManager.getSecret("MY_SECRET");
  console.timeEnd("First fetch (uncached)");

  console.time("Second fetch (cached)");
  await secretsManager.getSecret("MY_SECRET");
  console.timeEnd("Second fetch (cached)"); // Should be much faster

  console.time("Third fetch (cached)");
  await secretsManager.getSecret("MY_SECRET");
  console.timeEnd("Third fetch (cached)"); // Should be very fast
}

// ============================================================================
// Example 8: Singleton Pattern for Application-Wide Use
// ============================================================================

class SecretsService {
  private static instance: ReturnType<typeof createSecretsManager> | null = null;

  static getInstance(): ReturnType<typeof createSecretsManager> {
    if (!SecretsService.instance) {
      const config: SecretsConfig = {
        provider: (process.env.SECRETS_PROVIDER as any) || "env",
        cacheTTL: parseInt(process.env.SECRETS_CACHE_TTL || "300", 10),
        enableAuditLog: process.env.NODE_ENV === "production",
        secretsDir: process.env.SECRETS_DIR || ".secrets",
        awsRegion: process.env.AWS_REGION,
        vaultUrl: process.env.VAULT_URL,
        vaultToken: process.env.VAULT_TOKEN,
      };

      SecretsService.instance = createSecretsManager(config);
    }

    return SecretsService.instance;
  }
}

// Usage in your application
async function exampleSingleton() {
  const secrets = SecretsService.getInstance();

  // Use throughout your application
  const apiKey = await secrets.getSecret("API_KEY");
  console.log("API Key:", apiKey ? "***" : "Not found");
}

// ============================================================================
// Run Examples (uncomment to test)
// ============================================================================

if (require.main === module) {
  (async () => {
    console.log("=== Example 1: Environment Variables ===");
    await exampleEnvProvider();

    console.log("\n=== Example 2: File-Based Provider ===");
    await exampleFileProvider();

    console.log("\n=== Example 5: Multi-Environment Setup ===");
    await exampleMultiEnvironment();

    console.log("\n=== Example 7: Caching Performance ===");
    await exampleCaching();

    console.log("\n=== Example 8: Singleton Pattern ===");
    await exampleSingleton();
  })();
}
