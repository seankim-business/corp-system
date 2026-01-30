/**
 * CLO3D MCP Tool: Render 3D
 *
 * Generates 3D rendering of a CLO3D design
 */

import { CLO3DClient, Render3DParams } from "../client";
import { MCPConnection } from "../../../../../src/orchestrator/types";
import { logger } from "../../../../../src/utils/logger";

export interface Render3DInput {
  designId: string;
  angle?: number;
  quality?: "preview" | "high" | "ultra";
  backgroundColor?: string;
  showAvatar?: boolean;
}

export async function render3DTool(
  apiKey: string,
  input: Render3DInput,
  connection: MCPConnection,
  userId?: string
): Promise<any> {
  logger.info("CLO3D render3D tool called", {
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

    const params: Render3DParams = {
      designId: input.designId,
      angle: input.angle,
      quality: input.quality,
      backgroundColor: input.backgroundColor,
      showAvatar: input.showAvatar,
    };

    const result = await client.render3D(params);

    logger.info("CLO3D 3D rendering completed successfully", {
      designId: input.designId,
      quality: result.quality,
      resolution: result.resolution,
    });

    return {
      success: true,
      render: {
        imageUrl: result.imageUrl,
        resolution: result.resolution,
        angle: result.angle,
        quality: result.quality,
        renderedAt: result.renderedAt.toISOString(),
      },
    };
  } catch (error) {
    logger.error("Failed to render CLO3D 3D design", {
      error: error instanceof Error ? error.message : String(error),
      input,
    });

    throw error;
  }
}
