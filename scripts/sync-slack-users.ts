/**
 * Simple script to sync Slack users to ExternalIdentity
 * Run via: npx ts-node --transpile-only scripts/sync-slack-users.ts
 */

import { PrismaClient } from "@prisma/client";
import { WebClient } from "@slack/web-api";

const prisma = new PrismaClient();

async function main() {
  console.log("🔄 Starting Slack user sync...\n");

  // Get Kyndof organization (has Slack integration)
  const org = await prisma.organization.findFirst({
    where: {
      slackIntegrations: {
        some: { enabled: true },
      },
    },
    include: {
      slackIntegrations: true,
    },
  });

  if (!org) {
    console.error("❌ No organization found");
    return;
  }

  console.log(`📍 Organization: ${org.name} (${org.id})`);

  // Get first enabled Slack integration
  const integration = org.slackIntegrations?.find((i: any) => i.enabled && i.botToken);

  if (!integration || !integration.botToken) {
    console.error("❌ Slack integration not configured or no bot token");
    return;
  }

  const slackClient = new WebClient(integration.botToken);
  const workspaceId = integration.workspaceId;

  if (!workspaceId) {
    console.error("❌ Slack workspace ID not found");
    return;
  }

  console.log(`📱 Slack workspace: ${workspaceId}\n`);

  // Stats
  const stats = {
    total: 0,
    processed: 0,
    created: 0,
    updated: 0,
    skippedBots: 0,
    errors: 0,
  };

  // Fetch all users from Slack workspace
  console.log("📥 Fetching Slack workspace members...");

  let cursor: string | undefined;
  const allSlackMembers: any[] = [];

  do {
    const response = await slackClient.users.list({ cursor, limit: 200 });
    if (response.members) {
      allSlackMembers.push(...response.members);
    }
    cursor = response.response_metadata?.next_cursor;
  } while (cursor);

  stats.total = allSlackMembers.length;
  console.log(`✅ Found ${stats.total} members\n`);

  console.log("🔄 Processing members...\n");

  for (const member of allSlackMembers) {
    // Skip bots and deactivated users
    if (member.is_bot || member.deleted || member.id === "USLACKBOT") {
      stats.skippedBots++;
      continue;
    }

    try {
      const profile = member.profile || {};
      const email = profile.email;
      const displayName = profile.display_name || profile.real_name || member.name;

      // Check if SlackUser already exists
      const existingSlackUser = await prisma.slackUser.findUnique({
        where: { slackUserId: member.id },
        include: { user: true },
      });

      let userId: string;

      if (existingSlackUser) {
        // Update existing SlackUser
        await prisma.slackUser.update({
          where: { slackUserId: member.id },
          data: {
            lastSyncedAt: new Date(),
            displayName: displayName,
            realName: profile.real_name,
            email: email,
            avatarUrl: profile.image_192 || profile.image_72,
          },
        });
        userId = existingSlackUser.userId;
        stats.updated++;
        console.log(`  📝 Updated: ${displayName} (${email || "no email"})`);
      } else {
        // Find or create User
        let user = email
          ? await prisma.user.findUnique({ where: { email } })
          : null;

        if (!user) {
          // Create placeholder email for users without email
          const userEmail = email || `slack+${member.id}@placeholder.nubabel.com`;
          user = await prisma.user.create({
            data: {
              email: userEmail,
              displayName: displayName,
              avatarUrl: profile.image_192 || profile.image_72,
            },
          });
          console.log(`  👤 Created user: ${userEmail}`);
        }

        userId = user.id;

        // Create SlackUser
        await prisma.slackUser.create({
          data: {
            slackUserId: member.id,
            slackTeamId: workspaceId,
            userId: user.id,
            organizationId: org.id,
            displayName: displayName,
            realName: profile.real_name,
            email: email,
            avatarUrl: profile.image_192 || profile.image_72,
            isBot: member.is_bot || false,
            isAdmin: member.is_admin || false,
            lastSyncedAt: new Date(),
          },
        });
        stats.created++;
        console.log(`  ➕ Created SlackUser: ${displayName} (${email || "no email"})`);
      }

      // Check/create ExternalIdentity
      const existingIdentity = await prisma.externalIdentity.findFirst({
        where: {
          organizationId: org.id,
          provider: "slack",
          providerUserId: member.id,
        },
      });

      if (!existingIdentity) {
        await prisma.externalIdentity.create({
          data: {
            organizationId: org.id,
            provider: "slack",
            providerUserId: member.id,
            providerTeamId: workspaceId,
            email: email,
            displayName: displayName,
            realName: profile.real_name,
            avatarUrl: profile.image_192 || profile.image_72,
            status: "linked",
            userId: userId,
            autoLinkedAt: new Date(),
            autoLinkMethod: "slack_sync",
          },
        });
        console.log(`  🔗 Created ExternalIdentity for ${displayName}`);
      }

      // Ensure membership exists
      const existingMembership = await prisma.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: org.id,
            userId: userId,
          },
        },
      });

      if (!existingMembership) {
        await prisma.membership.create({
          data: {
            organizationId: org.id,
            userId: userId,
            role: "member",
          },
        });
        console.log(`  🏢 Created membership for ${displayName}`);
      }

      stats.processed++;
    } catch (error) {
      stats.errors++;
      console.error(`  ❌ Error processing ${member.name}: ${error}`);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("📊 SYNC COMPLETE\n");
  console.log(`Total members:    ${stats.total}`);
  console.log(`Processed:        ${stats.processed}`);
  console.log(`Created:          ${stats.created}`);
  console.log(`Updated:          ${stats.updated}`);
  console.log(`Skipped bots:     ${stats.skippedBots}`);
  console.log(`Errors:           ${stats.errors}`);
  console.log("=".repeat(50));

  // Look for seonbin specifically
  console.log("\n🔍 Checking for Seonbin...");
  const seonbinIdentity = await prisma.externalIdentity.findFirst({
    where: {
      organizationId: org.id,
      OR: [
        { email: { contains: "seonbin", mode: "insensitive" } },
        { displayName: { contains: "seonbin", mode: "insensitive" } },
      ],
    },
  });

  if (seonbinIdentity) {
    console.log(`✅ Found Seonbin's identity:`);
    console.log(`   Provider: ${seonbinIdentity.provider}`);
    console.log(`   Provider User ID: ${seonbinIdentity.providerUserId}`);
    console.log(`   Email: ${seonbinIdentity.email}`);
    console.log(`   Display Name: ${seonbinIdentity.displayName}`);
    console.log(`   Status: ${seonbinIdentity.status}`);
    console.log(`   User ID: ${seonbinIdentity.userId || "NOT LINKED"}`);
  } else {
    console.log("❌ Seonbin's identity NOT FOUND after sync");

    // Also check SlackUser table
    console.log("\n🔍 Checking SlackUser table for Seonbin...");
    const seonbinSlack = await prisma.slackUser.findFirst({
      where: {
        OR: [
          { email: { contains: "seonbin", mode: "insensitive" } },
          { displayName: { contains: "seonbin", mode: "insensitive" } },
          { realName: { contains: "seonbin", mode: "insensitive" } },
        ],
      },
      include: { user: true },
    });

    if (seonbinSlack) {
      console.log(`✅ Found in SlackUser table:`);
      console.log(`   Slack ID: ${seonbinSlack.slackUserId}`);
      console.log(`   Email: ${seonbinSlack.email}`);
      console.log(`   Display Name: ${seonbinSlack.displayName}`);
      console.log(`   User: ${seonbinSlack.user?.email}`);
    } else {
      console.log("❌ Not found in SlackUser table either");
    }
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  prisma.$disconnect();
  process.exit(1);
});
