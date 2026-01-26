import { getLinearClient } from "../client";
import { UpdateIssueInput, UpdateIssueOutput } from "../types";
import { MCPConnection } from "../../../orchestrator/types";

export async function updateIssueTool(
  apiKey: string,
  input: UpdateIssueInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<UpdateIssueOutput> {
  const { client, release } = await getLinearClient({
    apiKey,
    connection,
    organizationId: connection?.organizationId,
    userId,
  });

  if (!input.issueId) {
    throw new Error("issueId is required");
  }

  try {
    const issue = await client.updateIssue(input);

    return { issue };
  } finally {
    release();
  }
}
