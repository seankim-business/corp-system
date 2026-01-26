import { GitHubClient } from "../client";
import { CreateIssueInput, CreateIssueOutput } from "../types";

export async function createIssueTool(
  accessToken: string,
  input: CreateIssueInput,
): Promise<CreateIssueOutput> {
  const client = new GitHubClient(accessToken);

  if (!input.owner || !input.repo) {
    throw new Error("owner and repo are required");
  }

  if (!input.title) {
    throw new Error("title is required");
  }

  const issue = await client.createIssue(input);

  return { issue };
}
