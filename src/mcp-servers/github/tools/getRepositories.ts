import { GitHubClient } from "../client";
import { GetRepositoriesInput, GetRepositoriesOutput } from "../types";

export async function getRepositoriesTool(
  accessToken: string,
  input: GetRepositoriesInput,
): Promise<GetRepositoriesOutput> {
  const client = new GitHubClient(accessToken);

  const repositories = await client.getRepositories(input.type, input.limit);

  return { repositories };
}
