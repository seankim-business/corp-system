/**
 * Identity Linking System
 *
 * Unified cross-platform user identity linking for Slack, Google, and Notion.
 */

// Types
export * from "./types";

// Services
export { IdentityResolver, identityResolver } from "./identity-resolver";
export { IdentityLinker, identityLinker } from "./identity-linker";
export { SuggestionEngine, suggestionEngine } from "./suggestion-engine";
export { FuzzyMatcher, fuzzyMatcher } from "./fuzzy-matcher";

// Provider Adapters
export {
  getProvider,
  isProviderSupported,
  getSupportedProviders,
  slackProvider,
  googleProvider,
  notionProvider,
} from "./providers";
