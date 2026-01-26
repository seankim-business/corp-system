import { GitHubClient } from "../client";
import { UpdateIssueInput, UpdateIssueOutput } from "../types";

export async function updateIssueTool(
  accessToken: string,
  input: UpdateIssueInput,
): Promise<UpdateIssueOutput> {
  const client = new GitHubClient(accessToken);

  if (!input.owner || !input.repo) {
    throw new Error("owner and repo are required");
  }

  if (!input.issueNumber) {
    throw new Error("issueNumber is required");
  }

  const issue = await client.updateIssue(input);

  return { issue };
}
