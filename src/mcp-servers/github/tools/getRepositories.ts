import { getGitHubClient } from "../client";
import { GetRepositoriesInput, GetRepositoriesOutput } from "../types";
import { MCPConnection } from "../../../orchestrator/types";

export async function getRepositoriesTool(
  accessToken: string,
  input: GetRepositoriesInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<GetRepositoriesOutput> {
  const { client, release } = await getGitHubClient({
    accessToken,
    connection,
    organizationId: connection?.organizationId,
    userId,
  });

  try {
    const repositories = await client.getRepositories(input.type, input.limit);

    return { repositories };
  } finally {
    release();
  }
}
