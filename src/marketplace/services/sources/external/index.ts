// Export all types
export * from "./types";

// Export all source classes
export { SmitherySource } from "./smithery-source";
export { MCPRegistrySource } from "./mcp-registry-source";
export { GlamaSource } from "./glama-source";
export { ComfyUISource } from "./comfyui-source";
export { CivitAISource } from "./civitai-source";
export { LangChainHubSource } from "./langchain-hub-source";

// Import base class for type checking
import { BaseExternalSource } from "./types";
import { SmitherySource } from "./smithery-source";
import { MCPRegistrySource } from "./mcp-registry-source";
import { GlamaSource } from "./glama-source";
import { ComfyUISource } from "./comfyui-source";
import { CivitAISource } from "./civitai-source";
import { LangChainHubSource } from "./langchain-hub-source";

/**
 * Configuration for external sources that require API keys
 */
export interface SourceConfig {
  smitheryApiKey?: string;
  civitaiApiKey?: string;
  langchainApiKey?: string;
}

/**
 * Factory function to create all available external sources
 * @param config Optional configuration with API keys for sources that require them
 * @returns Array of initialized external source instances
 */
export function createAllSources(config?: SourceConfig): BaseExternalSource[] {
  return [
    new SmitherySource(config?.smitheryApiKey),
    new MCPRegistrySource(),
    new GlamaSource(),
    new ComfyUISource(),
    new CivitAISource({ apiKey: config?.civitaiApiKey }),
    new LangChainHubSource({ apiKey: config?.langchainApiKey }),
  ];
}

/**
 * Helper function to retrieve a specific source by its ID
 * @param sources Array of external sources
 * @param sourceId The ID of the source to find
 * @returns The matching source or undefined if not found
 */
export function getSourceById(
  sources: BaseExternalSource[],
  sourceId: string,
): BaseExternalSource | undefined {
  return sources.find((s) => s.sourceId === sourceId);
}
