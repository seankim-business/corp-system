import { GitHubClient } from "../client";
import { CreatePullRequestInput, CreatePullRequestOutput } from "../types";

export async function createPullRequestTool(
  accessToken: string,
  input: CreatePullRequestInput,
): Promise<CreatePullRequestOutput> {
  const client = new GitHubClient(accessToken);

  if (!input.owner || !input.repo) {
    throw new Error("owner and repo are required");
  }

  if (!input.title) {
    throw new Error("title is required");
  }

  if (!input.head || !input.base) {
    throw new Error("head and base branches are required");
  }

  const pullRequest = await client.createPullRequest(input);

  return { pullRequest };
}
