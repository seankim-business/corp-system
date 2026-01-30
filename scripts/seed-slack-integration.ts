/**
 * Seed script to create SlackIntegration record for testing
 * Run with: npx ts-node scripts/seed-slack-integration.ts
 */
import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";

const prisma = new PrismaClient();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-dev-key-32-chars-long!!";
const ENCRYPTION_IV_LENGTH = 16;
const ENCRYPTION_ALGORITHM = "aes-256-cbc";

function encrypt(text: string): string {
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32));
  const iv = crypto.randomBytes(ENCRYPTION_IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

async function main() {
  console.log("Starting Slack integration seed...");

  // Get required environment variables
  const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
  const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN;
  const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

  if (!SLACK_BOT_TOKEN) {
    throw new Error("SLACK_BOT_TOKEN is required");
  }

  // Workspace ID from the error logs
  const WORKSPACE_ID = "T03KC04T1GT";
  const WORKSPACE_NAME = "Kyndof Workspace";

  // First, ensure we have an organization
  let org = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!org) {
    console.log("Creating default organization...");
    org = await prisma.organization.create({
      data: {
        name: "Kyndof",
        slug: "kyndof",
      },
    });
    console.log(`Created organization: ${org.id}`);
  } else {
    console.log(`Using existing organization: ${org.id} (${org.name})`);
  }

  // Check if integration already exists
  const existing = await prisma.slackIntegration.findUnique({
    where: { workspaceId: WORKSPACE_ID },
  });

  if (existing) {
    console.log("Slack integration already exists. Updating...");
    await prisma.slackIntegration.update({
      where: { id: existing.id },
      data: {
        organizationId: org.id,
        workspaceName: WORKSPACE_NAME,
        botToken: encrypt(SLACK_BOT_TOKEN),
        appToken: SLACK_APP_TOKEN ? encrypt(SLACK_APP_TOKEN) : null,
        signingSecret: SLACK_SIGNING_SECRET ? encrypt(SLACK_SIGNING_SECRET) : null,
        enabled: true,
      },
    });
    console.log("Updated Slack integration");
  } else {
    // Create the integration
    const integration = await prisma.slackIntegration.create({
      data: {
        organizationId: org.id,
        workspaceId: WORKSPACE_ID,
        workspaceName: WORKSPACE_NAME,
        botToken: encrypt(SLACK_BOT_TOKEN),
        appToken: SLACK_APP_TOKEN ? encrypt(SLACK_APP_TOKEN) : null,
        signingSecret: SLACK_SIGNING_SECRET ? encrypt(SLACK_SIGNING_SECRET) : null,
        enabled: true,
      },
    });
    console.log(`Created Slack integration: ${integration.id}`);
  }

  console.log("Slack integration seed completed!");
  console.log(`Workspace ID: ${WORKSPACE_ID}`);
  console.log(`Organization ID: ${org.id}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
