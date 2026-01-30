/**
 * Install Extension Tool
 *
 * Install an extension from an external marketplace source
 */

import { InstallExtensionInput, InstallExtensionOutput } from "../types";
import { InstallationExecutor } from "../../../marketplace/services/installation-executor";
import { createAllSources, BaseExternalSource } from "../../../marketplace/services/sources/external";
import { logger } from "../../../utils/logger";

let sourcesCache: Map<string, BaseExternalSource> | null = null;

function getSources(): Map<string, BaseExternalSource> {
  if (!sourcesCache) {
    sourcesCache = new Map();
    const allSources = createAllSources({
      smitheryApiKey: process.env.SMITHERY_API_KEY,
      civitaiApiKey: process.env.CIVITAI_API_KEY,
      langchainApiKey: process.env.LANGCHAIN_API_KEY,
    });
    for (const source of allSources) {
      sourcesCache.set(source.sourceId, source);
    }
  }
  return sourcesCache;
}

export async function installExtensionTool(
  input: InstallExtensionInput,
  organizationId: string,
  userId: string,
): Promise<InstallExtensionOutput> {
  const { source: sourceId, itemId, config } = input;

  if (!sourceId || !itemId) {
    throw new Error("source and itemId are required");
  }

  const sourcesMap = getSources();
  const source = sourcesMap.get(sourceId);

  if (!source) {
    return {
      success: false,
      error: `Source '${sourceId}' not found`,
    };
  }

  try {
    // Get item details from source
    const item = await source.getById(itemId);

    if (!item) {
      return {
        success: false,
        error: `Item '${itemId}' not found in source '${sourceId}'`,
      };
    }

    // Execute installation
    const executor = new InstallationExecutor();
    const result = await executor.install(item, organizationId, userId, config);

    logger.info("Extension installed via MCP tool", {
      organizationId,
      userId,
      sourceId,
      itemId,
      extensionId: result.extensionId,
    });

    return {
      success: result.success,
      extensionId: result.extensionId,
      instructions: result.instructions,
      error: result.error,
    };
  } catch (error) {
    logger.error("Extension installation failed", { sourceId, itemId }, error as Error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}
