#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";

function encrypt(text) {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!key) {
    console.error("CREDENTIAL_ENCRYPTION_KEY not set");
    process.exit(1);
  }
  const keyBuffer = crypto.scryptSync(key, "salt", 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

async function main() {
  const prisma = new PrismaClient();

  try {
    const WORKSPACE_ID = "T03KC04T1GT";
    const WORKSPACE_NAME = "Kyndof";
    const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

    if (!BOT_TOKEN) {
      console.error("SLACK_BOT_TOKEN not set");
      process.exit(1);
    }

    console.log("Checking for existing Slack integration...");

    const existing = await prisma.slackIntegration.findFirst({
      where: { workspaceId: WORKSPACE_ID },
    });

    if (existing) {
      console.log(`SlackIntegration already exists for ${WORKSPACE_NAME}`);
      console.log(`  ID: ${existing.id}`);
      console.log(`  Enabled: ${existing.enabled}`);
      return;
    }

    console.log("Finding organization...");
    const org = await prisma.organization.findFirst();

    if (!org) {
      console.error("No organization found. Create one first.");
      process.exit(1);
    }

    console.log(`Using organization: ${org.name} (${org.id})`);

    const encryptedBotToken = encrypt(BOT_TOKEN);
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    const encryptedSigningSecret = signingSecret ? encrypt(signingSecret) : null;

    console.log("Creating SlackIntegration...");

    const integration = await prisma.slackIntegration.create({
      data: {
        organizationId: org.id,
        workspaceId: WORKSPACE_ID,
        workspaceName: WORKSPACE_NAME,
        botToken: encryptedBotToken,
        signingSecret: encryptedSigningSecret,
        botUserId: "U08DGQX4K5M",
        scopes: [
          "app_mentions:read",
          "chat:write",
          "channels:history",
          "groups:history",
          "im:history",
          "mpim:history",
          "users:read",
          "users:read.email",
          "team:read",
        ],
        enabled: true,
        healthStatus: "healthy",
        installedAt: new Date(),
        installedBy: org.id,
      },
    });

    console.log(`✅ Created SlackIntegration: ${integration.id}`);
    console.log(`   Workspace: ${integration.workspaceName} (${integration.workspaceId})`);
    console.log(`   Enabled: ${integration.enabled}`);
  } catch (error) {
    console.error("Error:", error.message);
    if (error.code === "P2002") {
      console.error("Unique constraint violation - integration may already exist");
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
