/**
 * CLO3D MCP Tool: Get Designs
 *
 * Retrieves design list from CLO3D workspace
 */

import { CLO3DClient, ListDesignsParams } from "../client";
import { MCPConnection } from "../../../../../src/orchestrator/types";
import { logger } from "../../../../../src/utils/logger";

export interface GetDesignsInput {
  collectionId?: string;
  season?: string;
  status?: "draft" | "review" | "approved";
  limit?: number;
  offset?: number;
}

export async function getDesignsTool(
  apiKey: string,
  input: GetDesignsInput,
  connection: MCPConnection,
  userId?: string
): Promise<any> {
  logger.info("CLO3D getDesigns tool called", {
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

    const params: ListDesignsParams = {
      workspaceId: config.clo3dWorkspace || "",
      collectionId: input.collectionId,
      season: input.season,
      status: input.status,
      limit: input.limit,
      offset: input.offset,
    };

    const designs = await client.listDesigns(params);

    logger.info("CLO3D designs retrieved successfully", {
      count: designs.length,
      collectionId: input.collectionId,
    });

    return {
      success: true,
      designs: designs.map((d) => ({
        id: d.id,
        name: d.name,
        collectionId: d.collectionId,
        thumbnailUrl: d.thumbnailUrl,
        status: d.status,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
        metadata: d.metadata,
      })),
      total: designs.length,
    };
  } catch (error) {
    logger.error("Failed to get CLO3D designs", {
      error: error instanceof Error ? error.message : String(error),
      input,
    });

    throw error;
  }
}
