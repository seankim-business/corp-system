import { GitHubClient } from "../client";
import { GetPullRequestsInput, GetPullRequestsOutput } from "../types";

export async function getPullRequestsTool(
  accessToken: string,
  input: GetPullRequestsInput,
): Promise<GetPullRequestsOutput> {
  const client = new GitHubClient(accessToken);

  if (!input.owner || !input.repo) {
    throw new Error("owner and repo are required");
  }

  const pullRequests = await client.getPullRequests(input);

  return { pullRequests };
}
