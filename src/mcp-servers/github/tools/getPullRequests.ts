import { getGitHubClient } from "../client";
import { GetPullRequestsInput, GetPullRequestsOutput } from "../types";
import { MCPConnection } from "../../../orchestrator/types";

export async function getPullRequestsTool(
  accessToken: string,
  input: GetPullRequestsInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<GetPullRequestsOutput> {
  const { client, release } = await getGitHubClient({
    accessToken,
    connection,
    organizationId: connection?.organizationId,
    userId,
  });

  if (!input.owner || !input.repo) {
    throw new Error("owner and repo are required");
  }

  try {
    const pullRequests = await client.getPullRequests(input);

    return { pullRequests };
  } finally {
    release();
  }
}
