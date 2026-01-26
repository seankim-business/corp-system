import { getLinearClient } from "../client";
import { CreateIssueInput, CreateIssueOutput } from "../types";
import { MCPConnection } from "../../../orchestrator/types";

export async function createIssueTool(
  apiKey: string,
  input: CreateIssueInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<CreateIssueOutput> {
  const { client, release } = await getLinearClient({
    apiKey,
    connection,
    organizationId: connection?.organizationId,
    userId,
  });

  if (!input.teamId) {
    throw new Error("teamId is required");
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
