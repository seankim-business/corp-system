import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Searching for Seonbin Slack Identity ===\n");

  // Find all Slack identities that might match
  const identities = await prisma.externalIdentity.findMany({
    where: {
      provider: "slack",
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      realName: true,
      linkStatus: true,
      userId: true,
      providerUserId: true,
    },
    orderBy: { displayName: "asc" },
  });

  console.log(`Total Slack identities: ${identities.length}\n`);

  // Show all identities
  console.log("All Slack Identities:");
  identities.forEach((i, idx) => {
    console.log(
      `${idx + 1}. ${i.displayName || i.realName || "N/A"} | ${i.email || "no email"} | ${i.linkStatus} | userId: ${i.userId || "null"}`,
    );
  });

  // Find Seonbin user
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: "seonbin.kim@kyndof.com" },
        { name: { contains: "Seonbin", mode: "insensitive" } },
        { name: { contains: "선빈", mode: "insensitive" } },
      ],
    },
    select: { id: true, email: true, name: true },
  });

  console.log("\n=== Seonbin User in Nubabel ===");
  console.log(JSON.stringify(user, null, 2));

  // Check for unlinked identities that could be Seonbin
  const potentialMatches = identities.filter(
    (i) =>
      i.linkStatus !== "linked" &&
      (i.displayName?.toLowerCase().includes("seonbin") ||
        i.displayName?.includes("선빈") ||
        i.realName?.toLowerCase().includes("seonbin") ||
        i.realName?.includes("선빈")),
  );

  if (potentialMatches.length > 0) {
    console.log("\n=== Potential Matches (Unlinked) ===");
    potentialMatches.forEach((m) => {
      console.log(`ID: ${m.id}`);
      console.log(`  Slack User ID: ${m.providerUserId}`);
      console.log(`  Display Name: ${m.displayName}`);
      console.log(`  Email: ${m.email}`);
      console.log(`  Status: ${m.linkStatus}`);
    });
  } else {
    console.log("\n=== No unlinked identities matching 'seonbin' or '선빈' ===");
    console.log(
      "The Slack user might be using a different display name in Slack.",
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
