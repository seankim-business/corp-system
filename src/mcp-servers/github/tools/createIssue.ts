import { getGitHubClient } from "../client";
import { CreateIssueInput, CreateIssueOutput } from "../types";
import { MCPConnection } from "../../../orchestrator/types";

export async function createIssueTool(
  accessToken: string,
  input: CreateIssueInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<CreateIssueOutput> {
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

  try {
    const issue = await client.createIssue(input);

    return { issue };
  } finally {
    release();
  }
}
