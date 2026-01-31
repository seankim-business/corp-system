/**
 * Check users in Kyndof organization
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Find Kyndof organization
  const org = await prisma.organization.findFirst({
    where: { name: { contains: "Kyndof", mode: "insensitive" } }
  });

  if (!org) {
    console.log("❌ Kyndof organization not found!");
    const orgs = await prisma.organization.findMany({ take: 5 });
    console.log("Available orgs:", orgs.map(o => o.name));
    return;
  }

  console.log("📍 Organization:", org.name, org.id);

  // List all users in the org
  const memberships = await prisma.membership.findMany({
    where: { organizationId: org.id },
    include: { user: true }
  });

  console.log("\n👥 Users in organization:");
  for (const m of memberships) {
    console.log(`  - ${m.user.email} (${m.user.displayName || "no display name"}) [role: ${m.role}]`);
    console.log(`    userId: ${m.user.id}`);
  }

  // Check ExternalIdentity for U07NXUUS0FP
  console.log("\n🔍 ExternalIdentity for U07NXUUS0FP:");
  const ei = await prisma.externalIdentity.findFirst({
    where: { providerUserId: "U07NXUUS0FP" },
    include: { user: true }
  });

  if (ei) {
    console.log("  Found! Linked to user:", ei.user?.email || "NULL", "(", ei.userId, ")");
    console.log("  linkStatus:", ei.linkStatus);
    console.log("  displayName:", ei.displayName);
    console.log("  email:", ei.email);
  } else {
    console.log("  Not found");
  }

  // Check SlackUser for U07NXUUS0FP
  console.log("\n🔍 SlackUser for U07NXUUS0FP:");
  const su = await prisma.slackUser.findUnique({
    where: { slackUserId: "U07NXUUS0FP" },
    include: { user: true }
  });

  if (su) {
    console.log("  Found! Linked to user:", su.user?.email || "NULL", "(", su.userId, ")");
    console.log("  slackTeamId:", su.slackTeamId);
    console.log("  email:", su.email);
  } else {
    console.log("  Not found");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
