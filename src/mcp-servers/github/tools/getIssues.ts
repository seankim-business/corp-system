import { GitHubClient } from "../client";
import { GetIssuesInput, GetIssuesOutput } from "../types";

export async function getIssuesTool(
  accessToken: string,
  input: GetIssuesInput,
): Promise<GetIssuesOutput> {
  const client = new GitHubClient(accessToken);

  if (!input.owner || !input.repo) {
    throw new Error("owner and repo are required");
  }

  const issues = await client.getIssues(input);

  return { issues };
}
