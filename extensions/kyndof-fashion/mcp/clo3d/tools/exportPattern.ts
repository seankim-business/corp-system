/**
 * CLO3D MCP Tool: Export Pattern
 *
 * Exports garment pattern from CLO3D design
 */

import { CLO3DClient, ExportPatternParams } from "../client";
import { MCPConnection } from "../../../../../src/orchestrator/types";
import { logger } from "../../../../../src/utils/logger";

export interface ExportPatternInput {
  designId: string;
  format: "dxf" | "pdf" | "ai";
  includeSeamAllowance?: boolean;
  sizes?: string[];
}

export async function exportPatternTool(
  apiKey: string,
  input: ExportPatternInput,
  connection: MCPConnection,
  userId?: string
): Promise<any> {
  logger.info("CLO3D exportPattern tool called", {
    input,
    userId,
    connectionId: connection.id,
  });

  try {
    const config = connection.config || {};
    const client = new CLO3DClient({
      apiKey: config.clo3dApiKey || apiKey,
      workspaceId: config.clo3dWorkspace || "",
      baseUrl: config.clo3dApiUrl,
    });

    const params: ExportPatternParams = {
      designId: input.designId,
      format: input.format,
      includeSeamAllowance: input.includeSeamAllowance,
      sizes: input.sizes,
    };

    const result = await client.exportPattern(params);

    logger.info("CLO3D pattern exported successfully", {
      designId: input.designId,
      format: input.format,
      pieces: result.pieces,
    });

    return {
      success: true,
      export: {
        fileUrl: result.fileUrl,
        fileName: result.fileName,
        format: result.format,
        pieces: result.pieces,
        exportedAt: result.exportedAt.toISOString(),
      },
    };
  } catch (error) {
    logger.error("Failed to export CLO3D pattern", {
      error: error instanceof Error ? error.message : String(error),
      input,
    });

    throw error;
  }
}
