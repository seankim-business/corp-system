import { getGitHubClient } from "../client";
import { GetIssuesInput, GetIssuesOutput } from "../types";
import { MCPConnection } from "../../../orchestrator/types";

export async function getIssuesTool(
  accessToken: string,
  input: GetIssuesInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<GetIssuesOutput> {
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
    const issues = await client.getIssues(input);

    return { issues };
  } finally {
    release();
  }
}
