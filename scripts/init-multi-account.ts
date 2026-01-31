/**
 * Multi-Account System Initialization Script
 *
 * This script initializes the multi-account system by:
 * 1. Checking ENCRYPTION_KEY is configured
 * 2. Creating default ClaudeAccount if ANTHROPIC_API_KEY exists
 * 3. Verifying all required tables exist
 * 4. Running health checks on all services
 *
 * Usage:
 *   tsx scripts/init-multi-account.ts
 */

import { PrismaClient } from "@prisma/client";
import { createClient } from "redis";
import * as crypto from "crypto";

const prisma = new PrismaClient();

interface HealthCheckResult {
  service: string;
  status: "healthy" | "degraded" | "offline";
  message?: string;
  details?: any;
}

/**
 * Check if ENCRYPTION_KEY is configured
 */
async function checkEncryptionKey(): Promise<HealthCheckResult> {
  const encryptionKey = process.env.ENCRYPTION_KEY;

  if (!encryptionKey) {
    return {
      service: "ENCRYPTION_KEY",
      status: "offline",
      message: "ENCRYPTION_KEY is not set in environment variables",
    };
  }

  if (encryptionKey.length !== 64) {
    return {
      service: "ENCRYPTION_KEY",
      status: "degraded",
      message: `ENCRYPTION_KEY must be 64 hex characters (currently ${encryptionKey.length})`,
    };
  }

  if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
    return {
      service: "ENCRYPTION_KEY",
      status: "degraded",
      message: "ENCRYPTION_KEY must contain only hexadecimal characters",
    };
  }

  return {
    service: "ENCRYPTION_KEY",
    status: "healthy",
    message: "ENCRYPTION_KEY is properly configured",
  };
}

/**
 * Check PostgreSQL connection and required tables
 */
async function checkDatabase(): Promise<HealthCheckResult> {
  try {
    await prisma.$queryRaw`SELECT 1`;

    const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'claude_accounts'
      );
    `;

    if (!result[0]?.exists) {
      return {
        service: "PostgreSQL",
        status: "degraded",
        message: "claude_accounts table does not exist. Run migrations first.",
      };
    }

    const quotaResult = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'quota_alerts'
      );
    `;

    if (!quotaResult[0]?.exists) {
      return {
        service: "PostgreSQL",
        status: "degraded",
        message: "quota_alerts table does not exist. Run migrations first.",
      };
    }

    const accountCount = await prisma.claudeAccount.count();

    return {
      service: "PostgreSQL",
      status: "healthy",
      message: "Database connection successful",
      details: { accountCount },
    };
  } catch (error) {
    return {
      service: "PostgreSQL",
      status: "offline",
      message: `Database connection failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check Redis connection
 */
async function checkRedis(): Promise<HealthCheckResult> {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  let client;

  try {
    client = createClient({ url: redisUrl });
    await client.connect();

    // Test set/get
    const testKey = "health:check:" + Date.now();
    await client.set(testKey, "ok", { EX: 10 });
    const value = await client.get(testKey);
    await client.del(testKey);

    if (value !== "ok") {
      return {
        service: "Redis",
        status: "degraded",
        message: "Redis set/get operation failed",
      };
    }

    return {
      service: "Redis",
      status: "healthy",
      message: "Redis connection successful",
    };
  } catch (error) {
    return {
      service: "Redis",
      status: "offline",
      message: `Redis connection failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    if (client) {
      await client.disconnect();
    }
  }
}

/**
 * Check Slack API (optional)
 */
async function checkSlack(): Promise<HealthCheckResult> {
  const slackBotToken = process.env.SLACK_BOT_TOKEN;

  if (!slackBotToken) {
    return {
      service: "Slack",
      status: "offline",
      message: "SLACK_BOT_TOKEN not configured (optional)",
    };
  }

  try {
    const response = await fetch("https://slack.com/api/auth.test", {
      headers: {
        Authorization: `Bearer ${slackBotToken}`,
      },
    });

    const data = (await response.json()) as { ok: boolean; error?: string };

    if (!data.ok) {
      return {
        service: "Slack",
        status: "degraded",
        message: `Slack API check failed: ${data.error || "Unknown error"}`,
      };
    }

    return {
      service: "Slack",
      status: "healthy",
      message: "Slack API connection successful",
    };
  } catch (error) {
    return {
      service: "Slack",
      status: "offline",
      message: `Slack API check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check Railway CLI (optional)
 */
async function checkRailway(): Promise<HealthCheckResult> {
  const railwayToken = process.env.RAILWAY_TOKEN;

  if (!railwayToken) {
    return {
      service: "Railway",
      status: "offline",
      message: "RAILWAY_TOKEN not configured (optional)",
    };
  }

  return {
    service: "Railway",
    status: "healthy",
    message: "RAILWAY_TOKEN is configured",
  };
}

/**
 * Create default Claude account if ANTHROPIC_API_KEY exists
 */
async function createDefaultAccount(): Promise<HealthCheckResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return {
      service: "Default Account",
      status: "offline",
      message: "ANTHROPIC_API_KEY not set, skipping default account creation",
    };
  }

  try {
    let org = await prisma.organization.findFirst({
      where: { slug: "default" },
    });

    if (!org) {
      console.log("Creating default organization...");
      org = await prisma.organization.create({
        data: {
          slug: "default",
          name: "Default Organization",
          settings: {},
        },
      });
    }

    const existing = await prisma.claudeAccount.findFirst({
      where: {
        organizationId: org.id,
        name: "Default Account",
      },
    });

    if (existing) {
      return {
        service: "Default Account",
        status: "healthy",
        message: "Default Claude account already exists",
        details: { id: existing.id },
      };
    }

    const account = await prisma.claudeAccount.create({
      data: {
        organizationId: org.id,
        name: "Default Account",
        status: "active",
        metadata: {
          apiKey: apiKey, // In production, this should be encrypted
          tier: "pro",
          createdBy: "init-script",
        },
      },
    });

    console.log(`✅ Created default Claude account: ${account.id}`);

    return {
      service: "Default Account",
      status: "healthy",
      message: "Default Claude account created successfully",
      details: { id: account.id },
    };
  } catch (error) {
    return {
      service: "Default Account",
      status: "offline",
      message: `Failed to create default account: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Print health check results
 */
function printResults(results: HealthCheckResult[]) {
  console.log("\n========================================");
  console.log("Multi-Account System Health Check");
  console.log("========================================\n");

  const statusEmoji = {
    healthy: "✅",
    degraded: "⚠️ ",
    offline: "❌",
  };

  for (const result of results) {
    const emoji = statusEmoji[result.status];
    console.log(`${emoji} ${result.service.padEnd(20)} ${result.status.toUpperCase()}`);

    if (result.message) {
      console.log(`   ${result.message}`);
    }

    if (result.details) {
      console.log(`   Details: ${JSON.stringify(result.details)}`);
    }

    console.log("");
  }

  const allHealthy = results.every((r) => r.status === "healthy");
  const criticalOffline = results.filter(
    (r) => r.status === "offline" && ["ENCRYPTION_KEY", "PostgreSQL", "Redis"].includes(r.service),
  );

  console.log("========================================");

  if (allHealthy) {
    console.log("✅ All systems operational");
    return 0;
  } else if (criticalOffline.length > 0) {
    console.log("❌ Critical services offline:");
    criticalOffline.forEach((r) => console.log(`   - ${r.service}`));
    return 1;
  } else {
    console.log("⚠️  Some services degraded, but system is operational");
    return 0;
  }
}

/**
 * Main initialization function
 */
async function main() {
  console.log("Initializing multi-account system...\n");

  const results: HealthCheckResult[] = [];

  results.push(await checkEncryptionKey());
  results.push(await checkDatabase());
  results.push(await checkRedis());
  results.push(await checkSlack());
  results.push(await checkRailway());
  results.push(await createDefaultAccount());

  const exitCode = printResults(results);

  await prisma.$disconnect();

  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error during initialization:", error);
    process.exit(1);
  });
}

export {
  main,
  checkEncryptionKey,
  checkDatabase,
  checkRedis,
  checkSlack,
  checkRailway,
  createDefaultAccount,
};
