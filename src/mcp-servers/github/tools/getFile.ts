import { getGitHubClient } from "../client";
import { GetFileInput, GetFileOutput } from "../types";
import { MCPConnection } from "../../../orchestrator/types";

export async function getFileTool(
  accessToken: string,
  input: GetFileInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<GetFileOutput> {
  const { client, release } = await getGitHubClient({
    accessToken,
    connection,
    organizationId: connection?.organizationId,
    userId,
  });

  try {
    const file = await client.getFile(input);
    return { file };
  } finally {
    release();
  }
}
