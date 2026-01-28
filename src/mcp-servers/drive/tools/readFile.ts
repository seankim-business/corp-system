import { getDriveClient } from "../client";
import { ReadFileInput, ReadFileOutput } from "../types";
import { MCPConnection } from "../../../orchestrator/types";

export async function readFileTool(
  accessToken: string,
  input: ReadFileInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<ReadFileOutput> {
  const { client, release } = await getDriveClient({
    accessToken,
    connection,
    organizationId: connection?.organizationId,
    userId,
  });

  const { fileId } = input;

  if (!fileId) {
    throw new Error("fileId is required");
  }

  try {
    const result = await client.readFile(fileId);

    return {
      file: result.file,
      content: result.content,
      mimeType: result.mimeType,
    };
  } finally {
    release();
  }
}
