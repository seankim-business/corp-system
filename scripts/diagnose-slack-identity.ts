/**
 * Diagnostic script to identify and fix Slack identity mapping issues
 *
 * Run with: npx ts-node scripts/diagnose-slack-identity.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function diagnoseSlackIdentity() {
  console.log("\n=== Slack Identity Diagnosis ===\n");

  // 1. Check all SlackIntegration records
  console.log("1. SlackIntegration records:");
  const integrations = await prisma.slackIntegration.findMany({
    include: { organization: true },
  });

  console.log(`   Total: ${integrations.length}`);
  for (const integration of integrations) {
    console.log(`   Workspace: ${integration.workspaceId}`);
    console.log(`   → Organization: ${integration.organization.name} (${integration.organizationId})`);
    console.log(`   → Workspace Name: ${integration.workspaceName}`);
    console.log("");
  }

  // 2. Check ExternalIdentity records by organization for slack
  console.log("2. Slack ExternalIdentity counts by organization:");
  const externalIdentities = await prisma.externalIdentity.findMany({
    where: { provider: "slack" },
    include: { organization: true },
  });

  const orgCounts = new Map<string, { name: string; linked: number; pending: number }>();
  for (const ei of externalIdentities) {
    const key = ei.organizationId;
    if (!orgCounts.has(key)) {
      orgCounts.set(key, { name: ei.organization.name, linked: 0, pending: 0 });
    }
    const counts = orgCounts.get(key)!;
    if (ei.linkStatus === "linked") {
      counts.linked++;
    } else {
      counts.pending++;
    }
  }

  for (const [orgId, counts] of orgCounts) {
    console.log(`   Organization: ${counts.name} (${orgId})`);
    console.log(`   → linked: ${counts.linked}, pending: ${counts.pending}`);
    console.log("");
  }

  // 3. Check SlackUser records
  console.log("3. SlackUser records:");
  const slackUsers = await prisma.slackUser.findMany({
    include: { user: true },
    take: 10,
  });

  console.log(`   Total SlackUser records found (showing up to 10): ${slackUsers.length}`);
  for (const su of slackUsers) {
    console.log(`   → SlackUserId: ${su.slackUserId}`);
    console.log(`     SlackTeamId: ${su.slackTeamId}`);
    console.log(`     Email: ${su.email}`);
    console.log(`     User: ${su.user?.displayName || "NULL"} (${su.user?.email || "NULL"})`);
    console.log("");
  }

  // 4. Check for Seonbin specifically
  console.log("4. Seonbin identity lookup:");

  // Look for Seonbin in ExternalIdentity
  const seonbinIdentities = await prisma.externalIdentity.findMany({
    where: {
      provider: "slack",
      OR: [
        { displayName: { contains: "seonbin", mode: "insensitive" } },
        { realName: { contains: "seonbin", mode: "insensitive" } },
        { email: { contains: "seonbin", mode: "insensitive" } },
        { displayName: { contains: "선빈" } },
        { realName: { contains: "선빈" } },
      ],
    },
    include: { organization: true, user: true },
  });

  console.log(`   Found ${seonbinIdentities.length} ExternalIdentity records for Seonbin:`);
  for (const identity of seonbinIdentities) {
    console.log(`   → ProviderUserId: ${identity.providerUserId}`);
    console.log(`     ProviderTeamId: ${identity.providerTeamId}`);
    console.log(`     Organization: ${identity.organization.name} (${identity.organizationId})`);
    console.log(`     DisplayName: ${identity.displayName}`);
    console.log(`     LinkStatus: ${identity.linkStatus}`);
    console.log(`     User: ${identity.user?.displayName || "NULL"} (${identity.user?.email || "NULL"})`);
    console.log("");
  }

  // 5. Check specific workspace T03KC04T1GT mapping
  const workspaceId = "T03KC04T1GT";
  console.log(`5. Workspace ${workspaceId} analysis:`);

  const integration = await prisma.slackIntegration.findUnique({
    where: { workspaceId },
    include: { organization: true },
  });

  if (integration) {
    console.log(`   SlackIntegration maps to: ${integration.organization.name} (${integration.organizationId})`);

    // Count ExternalIdentity in this org
    const identitiesInOrg = await prisma.externalIdentity.count({
      where: { organizationId: integration.organizationId, provider: "slack" },
    });
    console.log(`   ExternalIdentity records in this org: ${identitiesInOrg}`);

    // Count ExternalIdentity with this providerTeamId
    const identitiesWithTeam = await prisma.externalIdentity.count({
      where: { providerTeamId: workspaceId, provider: "slack" },
    });
    console.log(`   ExternalIdentity records with providerTeamId=${workspaceId}: ${identitiesWithTeam}`);

    // Find which org has the identities
    const identitiesWithTeamList = await prisma.externalIdentity.findMany({
      where: { providerTeamId: workspaceId, provider: "slack" },
      include: { organization: true },
    });

    const teamOrgCounts = new Map<string, { name: string; count: number }>();
    for (const ei of identitiesWithTeamList) {
      const key = ei.organizationId;
      if (!teamOrgCounts.has(key)) {
        teamOrgCounts.set(key, { name: ei.organization.name, count: 0 });
      }
      teamOrgCounts.get(key)!.count++;
    }

    if (teamOrgCounts.size > 0) {
      console.log(`\n   Organizations with ExternalIdentity for workspace ${workspaceId}:`);
      for (const [orgId, counts] of teamOrgCounts) {
        console.log(`   → ${counts.name} (${orgId}): ${counts.count} identities`);

        // This is the mismatch!
        if (orgId !== integration.organizationId) {
          console.log(`\n   ⚠️  MISMATCH DETECTED!`);
          console.log(`   SlackIntegration points to: ${integration.organizationId} (${integration.organization.name})`);
          console.log(`   ExternalIdentities are in: ${orgId} (${counts.name})`);
          console.log(`\n   🔧 FIX: Update SlackIntegration to point to ${orgId}`);
        }
      }
    }
  } else {
    console.log(`   No SlackIntegration found for workspace ${workspaceId}`);
  }

  console.log("\n=== Diagnosis Complete ===\n");
}

async function main() {
  try {
    await diagnoseSlackIdentity();
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
