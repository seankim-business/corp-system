import { LinearClient } from "../client";
import { GetIssuesInput, GetIssuesOutput } from "../types";

export async function getIssuesTool(
  apiKey: string,
  input: GetIssuesInput,
): Promise<GetIssuesOutput> {
  const client = new LinearClient(apiKey);

  const result = await client.getIssues(input);

  return {
    issues: result.issues,
    hasMore: result.hasMore,
    endCursor: result.endCursor,
  };
}
