import { getLinearClient } from "../client";
import { GetIssuesInput, GetIssuesOutput } from "../types";
import { MCPConnection } from "../../../orchestrator/types";

export async function getIssuesTool(
  apiKey: string,
  input: GetIssuesInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<GetIssuesOutput> {
  const { client, release } = await getLinearClient({
    apiKey,
    connection,
    organizationId: connection?.organizationId,
    userId,
  });

  try {
    const result = await client.getIssues(input);

    return {
      issues: result.issues,
      hasMore: result.hasMore,
      endCursor: result.endCursor,
    };
  } finally {
    release();
  }
}
