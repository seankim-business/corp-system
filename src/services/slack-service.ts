import { db as prisma } from "../db/client";
import { WebClient } from "@slack/web-api";

export async function getUserBySlackId(slackUserId: string, client: WebClient) {
  try {
    const slackUser = await client.users.info({ user: slackUserId });
    const email = slackUser.user?.profile?.email;

    if (!email) {
      throw new Error("Slack user email not found");
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    return user;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("getUserBySlackId error:", error);
    throw new Error(`Failed to get user: ${errorMessage}`);
  }
}

export async function getOrganizationBySlackWorkspace(workspaceId: string) {
  const integration = await prisma.slackIntegration.findUnique({
    where: { workspaceId },
    include: { organization: true },
  });

  if (integration) {
    return integration.organization;
  }

  const org = await prisma.organization.findFirst({
    where: {
      settings: {
        path: ["slackWorkspaceId"],
        equals: workspaceId,
      },
    },
  });

  return org;
}

export async function createOrUpdateSlackWorkspaceMapping(
  workspaceId: string,
  organizationId: string,
): Promise<void> {
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      settings: {
        slackWorkspaceId: workspaceId,
      },
    },
  });
}
