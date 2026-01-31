/**
 * Create Seonbin's Nubabel user account and link her Slack identity
 *
 * Run with: npx tsx scripts/create-seonbin-user.ts
 */

import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

const SEONBIN_EMAIL = "seonbin.kim@kyndof.com";
const SEONBIN_SLACK_ID = "U07NXUUS0FP";
const SEONBIN_DISPLAY_NAME = "선빈 Seonbin";
// Kyndof org ID from earlier logs
const KYNDOF_ORG_ID = "b2e9db62-9c4a-4aac-b996-9346a08ebad8";

async function main() {
  console.log("=== Creating Seonbin's Nubabel Account ===\n");

  // 1. Check if organization exists
  console.log("1. Verifying organization...");
  const org = await prisma.organization.findUnique({
    where: { id: KYNDOF_ORG_ID }
  });

  if (!org) {
    console.error("❌ Organization not found!");
    return;
  }
  console.log(`   ✅ Organization: ${org.name}`);

  // 2. Check if user already exists
  console.log("\n2. Checking if user exists...");
  let user = await prisma.user.findUnique({
    where: { email: SEONBIN_EMAIL },
    include: { memberships: true }
  });

  if (user) {
    console.log(`   ✅ User already exists: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Display Name: ${user.displayName}`);
  } else {
    console.log("   📝 Creating new user...");
    user = await prisma.user.create({
      data: {
        email: SEONBIN_EMAIL,
        displayName: SEONBIN_DISPLAY_NAME,
        emailVerified: true, // Skip email verification for admin-created user
      },
      include: { memberships: true }
    });
    console.log(`   ✅ User created: ${user.id}`);
  }

  // 3. Check/create membership
  console.log("\n3. Checking membership...");
  const existingMembership = user.memberships.find(m => m.organizationId === KYNDOF_ORG_ID);

  if (existingMembership) {
    console.log(`   ✅ Membership exists with role: ${existingMembership.role}`);
  } else {
    console.log("   📝 Creating membership...");
    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: KYNDOF_ORG_ID,
        role: "member",
      }
    });
    console.log("   ✅ Membership created!");
  }

  // 4. Get SlackIntegration for workspaceId
  console.log("\n4. Getting SlackIntegration...");
  const slackIntegration = await prisma.slackIntegration.findFirst({
    where: { organizationId: KYNDOF_ORG_ID }
  });

  if (!slackIntegration?.workspaceId) {
    console.error("❌ No SlackIntegration.workspaceId found!");
    // List all integrations for debugging
    const allIntegrations = await prisma.slackIntegration.findMany({
      include: { organization: true }
    });
    console.log("   Available integrations:");
    for (const i of allIntegrations) {
      console.log(`   - ${i.organization.name}: workspaceId=${i.workspaceId}`);
    }
    return;
  }
  console.log(`   ✅ WorkspaceId: ${slackIntegration.workspaceId}`);

  // 5. Update/Create ExternalIdentity
  console.log("\n5. Handling ExternalIdentity...");
  const existingIdentity = await prisma.externalIdentity.findUnique({
    where: {
      organizationId_provider_providerUserId: {
        organizationId: KYNDOF_ORG_ID,
        provider: "slack",
        providerUserId: SEONBIN_SLACK_ID,
      }
    }
  });

  if (existingIdentity) {
    if (existingIdentity.userId !== user.id) {
      console.log(`   ⚠️ ExternalIdentity linked to wrong user: ${existingIdentity.userId}`);
      console.log("   📝 Updating to correct user...");
      await prisma.externalIdentity.update({
        where: { id: existingIdentity.id },
        data: {
          userId: user.id,
          linkStatus: "linked",
          linkMethod: "admin",
          linkedAt: new Date(),
        }
      });
      console.log("   ✅ ExternalIdentity updated!");
    } else {
      console.log("   ✅ ExternalIdentity already linked correctly");
    }
  } else {
    console.log("   📝 Creating ExternalIdentity...");
    await prisma.externalIdentity.create({
      data: {
        organizationId: KYNDOF_ORG_ID,
        provider: "slack",
        providerUserId: SEONBIN_SLACK_ID,
        providerTeamId: slackIntegration.workspaceId,
        email: SEONBIN_EMAIL,
        displayName: SEONBIN_DISPLAY_NAME,
        userId: user.id,
        linkStatus: "linked",
        linkMethod: "admin",
        linkedAt: new Date(),
        lastSyncedAt: new Date(),
      }
    });
    console.log("   ✅ ExternalIdentity created!");
  }

  // 6. Update/Create SlackUser
  console.log("\n6. Handling SlackUser...");
  const existingSlackUser = await prisma.slackUser.findUnique({
    where: { slackUserId: SEONBIN_SLACK_ID }
  });

  if (existingSlackUser) {
    if (existingSlackUser.userId !== user.id) {
      console.log(`   ⚠️ SlackUser linked to wrong user: ${existingSlackUser.userId}`);
      console.log("   📝 Updating to correct user...");
      await prisma.slackUser.update({
        where: { slackUserId: SEONBIN_SLACK_ID },
        data: { userId: user.id }
      });
      console.log("   ✅ SlackUser updated!");
    } else {
      console.log("   ✅ SlackUser already linked correctly");
    }
  } else {
    console.log("   📝 Creating SlackUser...");
    await prisma.slackUser.create({
      data: {
        slackUserId: SEONBIN_SLACK_ID,
        slackTeamId: slackIntegration.workspaceId,
        userId: user.id,
        organizationId: KYNDOF_ORG_ID,
        email: SEONBIN_EMAIL,
        displayName: SEONBIN_DISPLAY_NAME,
      }
    });
    console.log("   ✅ SlackUser created!");
  }

  console.log("\n=== Fix Complete! ===");
  console.log(`\nSeonbin (${SEONBIN_EMAIL}) now has:`);
  console.log(`- User account: ${user.id}`);
  console.log(`- Membership in Kyndof organization`);
  console.log(`- ExternalIdentity linked to Slack ${SEONBIN_SLACK_ID}`);
  console.log(`- SlackUser entry for direct lookup`);
  console.log("\n🎉 Test the Slack bot now!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
