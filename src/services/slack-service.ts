import { db as prisma } from "../db/client";
import { WebClient } from "@slack/web-api";

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

export async function getUserBySlackId(slackUserId: string) {
  try {
    const slackUser = await slackClient.users.info({ user: slackUserId });
    const email = slackUser.user?.profile?.email;

    if (!email) {
      throw new Error("Slack user email not found");
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    return user;
  } catch (error: any) {
    console.error("getUserBySlackId error:", error);
    throw new Error(`Failed to get user: ${error.message}`);
  }
}

export async function getOrganizationBySlackWorkspace(workspaceId: string) {
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
