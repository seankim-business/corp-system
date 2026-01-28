import { getDriveClient } from "../client";
import { ReadSheetInput, ReadSheetOutput } from "../types";
import { MCPConnection } from "../../../orchestrator/types";

export async function readSheetTool(
  accessToken: string,
  input: ReadSheetInput,
  connection?: MCPConnection,
  userId?: string,
): Promise<ReadSheetOutput> {
  const { client, release } = await getDriveClient({
    accessToken,
    connection,
    organizationId: connection?.organizationId,
    userId,
  });

  const { spreadsheetId, sheetName, range } = input;

  if (!spreadsheetId) {
    throw new Error("spreadsheetId is required");
  }

  try {
    const result = await client.readSheet(spreadsheetId, sheetName, range);

    return {
      spreadsheetId: result.spreadsheetId,
      spreadsheetTitle: result.spreadsheetTitle,
      sheets: result.sheets,
    };
  } finally {
    release();
  }
}
