import { getGitHubClient } from "../client";
import { UpdateIssueInput, UpdateIssueOutput } from "../types";
import { MCPConnection } from "../../../orchestrator/types";

export async function updateIssueTool(
  accessToken: string,
  input: UpdateIssueInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<UpdateIssueOutput> {
  const { client, release } = await getGitHubClient({
    accessToken,
    connection,
    organizationId: connection?.organizationId,
    userId,
  });

  if (!input.owner || !input.repo) {
    throw new Error("owner and repo are required");
  }

  if (!input.issueNumber) {
    throw new Error("issueNumber is required");
  }

  try {
    const issue = await client.updateIssue(input);

    return { issue };
  } finally {
    release();
  }
}
