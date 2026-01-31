/**
 * One-time fix script to create ExternalIdentity for U07NXUUS0FP
 * and link it to Seonbin's Nubabel account
 *
 * Run with: npx tsx scripts/fix-seonbin-identity.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const slackUserId = "U07NXUUS0FP";
  const seonbinEmail = "seonbin.kim@kyndof.com";

  console.log("🔍 Looking up Seonbin's Nubabel account...");

  // Find Seonbin's Nubabel user
  const nubabelUser = await prisma.user.findUnique({
    where: { email: seonbinEmail },
    include: { memberships: true }
  });

  if (!nubabelUser) {
    console.error("❌ Seonbin's Nubabel account not found!");
    return;
  }

  console.log(`✅ Found Nubabel user: ${nubabelUser.id} (${nubabelUser.displayName})`);

  // Get the organization from membership
  const membership = nubabelUser.memberships[0];
  if (!membership) {
    console.error("❌ No organization membership found!");
    return;
  }

  const organizationId = membership.organizationId;
  console.log(`📍 Organization: ${organizationId}`);

  // Check if ExternalIdentity already exists
  const existingIdentity = await prisma.externalIdentity.findUnique({
    where: {
      organizationId_provider_providerUserId: {
        organizationId,
        provider: "slack",
        providerUserId: slackUserId
      }
    }
  });

  if (existingIdentity) {
    console.log("⚠️ ExternalIdentity already exists:", existingIdentity);

    if (existingIdentity.userId !== nubabelUser.id) {
      console.log("🔄 Updating userId to link properly...");
      await prisma.externalIdentity.update({
        where: { id: existingIdentity.id },
        data: {
          userId: nubabelUser.id,
          linkStatus: "linked",
          linkMethod: "admin",
          linkedAt: new Date()
        }
      });
      console.log("✅ Identity updated and linked!");
    } else {
      console.log("✅ Identity already properly linked");
    }
    return;
  }

  // Create new ExternalIdentity
  console.log("📝 Creating new ExternalIdentity for U07NXUUS0FP...");

  const newIdentity = await prisma.externalIdentity.create({
    data: {
      organizationId,
      provider: "slack",
      providerUserId: slackUserId,
      email: seonbinEmail,
      displayName: "선빈 Seonbin",
      userId: nubabelUser.id,
      linkStatus: "linked",
      linkMethod: "admin",
      linkedAt: new Date(),
      lastSyncedAt: new Date()
    }
  });

  console.log("✅ ExternalIdentity created:", newIdentity.id);

  // Also check/update SlackUser if needed
  const slackUser = await prisma.slackUser.findUnique({
    where: { slackUserId }
  });

  if (slackUser) {
    if (slackUser.userId !== nubabelUser.id) {
      console.log("🔄 Updating SlackUser userId...");
      await prisma.slackUser.update({
        where: { slackUserId },
        data: { userId: nubabelUser.id }
      });
      console.log("✅ SlackUser updated!");
    } else {
      console.log("✅ SlackUser already has correct userId");
    }
  } else {
    // Get slackTeamId from SlackIntegration
    console.log("📌 Looking up SlackIntegration for workspaceId...");
    const slackIntegration = await prisma.slackIntegration.findFirst({
      where: { organizationId }
    });

    if (!slackIntegration?.workspaceId) {
      console.error("❌ No SlackIntegration.workspaceId found for organization!");
      console.log("   Available SlackIntegrations:");
      const allIntegrations = await prisma.slackIntegration.findMany({
        include: { organization: true }
      });
      for (const i of allIntegrations) {
        console.log(`   → ${i.workspaceName} (${i.workspaceId}) → ${i.organization.name}`);
      }
      return;
    }

    console.log(`📝 Creating SlackUser with slackTeamId: ${slackIntegration.workspaceId}`);
    await prisma.slackUser.create({
      data: {
        slackUserId,
        slackTeamId: slackIntegration.workspaceId,
        userId: nubabelUser.id,
        organizationId,
        email: seonbinEmail,
        displayName: nubabelUser.displayName || seonbinEmail
      }
    });
    console.log("✅ SlackUser created!");
  }

  console.log("\n🎉 Fix complete! Test the Slack bot now.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
