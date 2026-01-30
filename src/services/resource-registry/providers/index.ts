/**
 * Resource Provider Registry
 * Central registry for all resource provider adapters
 */

import { ResourceProviderType } from "@prisma/client";
import { ResourceProviderAdapter } from "./types";

// Re-export types
export * from "./types";

// ============================================================================
// Provider Registry
// ============================================================================

const providerRegistry = new Map<ResourceProviderType, ResourceProviderAdapter>();

/**
 * Register a provider adapter
 */
export function registerProvider(provider: ResourceProviderAdapter): void {
  providerRegistry.set(provider.providerType, provider);
}

/**
 * Get a provider adapter by type
 */
export function getProvider(type: ResourceProviderType): ResourceProviderAdapter | undefined {
  return providerRegistry.get(type);
}

/**
 * Get all registered providers
 */
export function getAllProviders(): ResourceProviderAdapter[] {
  return Array.from(providerRegistry.values());
}

/**
 * Get provider info for API response
 */
export function getProviderInfo(): Array<{
  type: ResourceProviderType;
  displayName: string;
  supportsUrlParsing: boolean;
}> {
  return getAllProviders().map((provider) => ({
    type: provider.providerType,
    displayName: provider.displayName,
    supportsUrlParsing: !!provider.parseResourceUrl,
  }));
}

/**
 * Parse a URL and identify which provider it belongs to
 */
export function parseResourceUrl(
  url: string
): { provider: ResourceProviderAdapter; resourceId: string; type?: string } | null {
  for (const provider of providerRegistry.values()) {
    if (provider.parseResourceUrl) {
      const result = provider.parseResourceUrl(url);
      if (result) {
        return { provider, ...result };
      }
    }
  }
  return null;
}

// ============================================================================
// Provider Registration
// Import and register all providers here
// ============================================================================

// Import providers (will be uncommented as they're implemented)
import { notionProvider } from "./notion";
import { googleSheetsProvider } from "./google-sheets";
// import { slackCanvasProvider } from "./slack-canvas";

// Register providers
registerProvider(notionProvider);
registerProvider(googleSheetsProvider);
// registerProvider(slackCanvasProvider);
