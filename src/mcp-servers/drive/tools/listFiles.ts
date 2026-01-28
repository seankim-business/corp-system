import { getDriveClient } from "../client";
import { ListFilesInput, ListFilesOutput } from "../types";
import { MCPConnection } from "../../../orchestrator/types";

export async function listFilesTool(
  accessToken: string,
  input: ListFilesInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<ListFilesOutput> {
  const { client, release } = await getDriveClient({
    accessToken,
    connection,
    organizationId: connection?.organizationId,
    userId,
  });

  const { folderId, query, mimeType, pageSize = 50, pageToken } = input;

  try {
    const result = await client.listFiles(folderId, query, mimeType, pageSize, pageToken);

    return {
      files: result.files,
      nextPageToken: result.nextPageToken,
    };
  } finally {
    release();
  }
}
