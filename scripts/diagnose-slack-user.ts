/**
 * Diagnostic script to check Slack user identity linking
 * Run with: npx tsx scripts/diagnose-slack-user.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const SLACK_USER_ID = "U04U6JY8DRQ"; // Seonbin's Slack ID
  const TARGET_EMAIL = "seonbin.kim@kyndof.com";

  console.log("=== Slack User Identity Diagnostic ===\n");
  console.log(`Slack User ID: ${SLACK_USER_ID}`);
  console.log(`Target Email: ${TARGET_EMAIL}\n`);

  // 1. Check SlackUser table
  console.log("--- 1. SlackUser Table ---");
  const slackUser = await prisma.slackUser.findUnique({
    where: { slackUserId: SLACK_USER_ID },
    include: { user: true },
  });

  if (slackUser) {
    console.log("✅ SlackUser FOUND:");
    console.log(`   ID: ${slackUser.id}`);
    console.log(`   Slack User ID: ${slackUser.slackUserId}`);
    console.log(`   User ID: ${slackUser.userId}`);
    console.log(`   Email: ${slackUser.email}`);
    console.log(`   Display Name: ${slackUser.displayName}`);
    console.log(`   Linked User Email: ${slackUser.user?.email}`);
  } else {
    console.log("❌ SlackUser NOT FOUND");
    console.log("   This explains why Method 1 lookup fails!");
  }

  // 2. Check ExternalIdentity table
  console.log("\n--- 2. ExternalIdentity Table ---");

  // First, find all organizations
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true },
  });

  console.log(`Found ${orgs.length} organizations`);

  for (const org of orgs) {
    const externalIdentity = await prisma.externalIdentity.findUnique({
      where: {
        organizationId_provider_providerUserId: {
          organizationId: org.id,
          provider: "slack",
          providerUserId: SLACK_USER_ID,
        },
      },
      include: { user: true },
    });

    if (externalIdentity) {
      console.log(`\n✅ ExternalIdentity FOUND in org "${org.name}" (${org.id}):`);
      console.log(`   ID: ${externalIdentity.id}`);
      console.log(`   Provider User ID: ${externalIdentity.providerUserId}`);
      console.log(`   Email: ${externalIdentity.email}`);
      console.log(`   Display Name: ${externalIdentity.displayName}`);
      console.log(`   Link Status: ${externalIdentity.linkStatus}`);
      console.log(`   Link Method: ${externalIdentity.linkMethod}`);
      console.log(`   User ID: ${externalIdentity.userId}`);
      console.log(`   Linked User Email: ${externalIdentity.user?.email}`);
    }
  }

  // 3. Check User table
  console.log("\n--- 3. User Table ---");
  const user = await prisma.user.findUnique({
    where: { email: TARGET_EMAIL },
  });

  if (user) {
    console.log("✅ User FOUND:");
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Display Name: ${user.displayName}`);
  } else {
    console.log("❌ User NOT FOUND with email:", TARGET_EMAIL);
  }

  // 4. Check Membership
  console.log("\n--- 4. Membership Check ---");
  if (user) {
    const memberships = await prisma.membership.findMany({
      where: { userId: user.id },
      include: { organization: true },
    });

    console.log(`User has ${memberships.length} memberships:`);
    for (const m of memberships) {
      console.log(`   - ${m.organization.name} (${m.organizationId}): ${m.role}`);
    }
  }

  // 5. Summary and Recommendation
  console.log("\n=== Summary ===");
  if (!slackUser) {
    console.log("ISSUE: SlackUser record missing");
    console.log("FIX: The provisionSlackUser function needs to create this record");
    console.log("     Check logs for provisioning errors");
  }

  console.log("\n=== Done ===");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
