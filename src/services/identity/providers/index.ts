/**
 * Provider Adapters Index
 */

import { slackProvider, SlackProvider } from "./slack-provider";
import { googleProvider, GoogleProvider } from "./google-provider";
import { notionProvider, NotionProvider } from "./notion-provider";
import type { IdentityProviderAdapter, IdentityProvider } from "../types";

const providers: Record<IdentityProvider, IdentityProviderAdapter> = {
  slack: slackProvider,
  google: googleProvider,
  notion: notionProvider,
};

/**
 * Get provider adapter by name
 */
export function getProvider(provider: IdentityProvider): IdentityProviderAdapter {
  const adapter = providers[provider];
  if (!adapter) {
    throw new Error(`Unknown identity provider: ${provider}`);
  }
  return adapter;
}

/**
 * Check if a provider is supported
 */
export function isProviderSupported(provider: string): provider is IdentityProvider {
  return provider in providers;
}

/**
 * Get all supported providers
 */
export function getSupportedProviders(): IdentityProvider[] {
  return Object.keys(providers) as IdentityProvider[];
}

export {
  slackProvider,
  googleProvider,
  notionProvider,
  SlackProvider,
  GoogleProvider,
  NotionProvider,
};
