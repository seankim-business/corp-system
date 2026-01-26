import { getGitHubClient } from "../client";
import { CreatePullRequestInput, CreatePullRequestOutput } from "../types";
import { MCPConnection } from "../../../orchestrator/types";

export async function createPullRequestTool(
  accessToken: string,
  input: CreatePullRequestInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<CreatePullRequestOutput> {
  const { client, release } = await getGitHubClient({
    accessToken,
    connection,
    organizationId: connection?.organizationId,
    userId,
  });

  if (!input.owner || !input.repo) {
    throw new Error("owner and repo are required");
  }

  if (!input.title) {
    throw new Error("title is required");
  }

  if (!input.head || !input.base) {
    throw new Error("head and base branches are required");
  }

  try {
    const pullRequest = await client.createPullRequest(input);

    return { pullRequest };
  } finally {
    release();
  }
}
