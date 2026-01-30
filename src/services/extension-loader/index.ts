/**
 * Extension Loader Module
 *
 * Provides dynamic loading, unloading, and management of extensions
 */

// Types
export * from './types';

// Manifest Parser
export {
  parseManifestContent,
  parseManifestFile,
  parseManifestFromDirectory,
  validateManifestPaths,
  resolveManifestPaths,
  extractComponentIds,
  validateVersionCompatibility,
  mergeManifestUpdates,
  type ManifestParseResult,
  type ManifestValidationOptions,
} from './manifest-parser';

// Route Registrar
export {
  RouteRegistrar,
  getRouteRegistrar,
  initializeRouteRegistrar,
  wrapRouteHandler,
  createRouteValidator,
  type RouteRegistrarOptions,
  type RegisteredRoute,
} from './route-registrar';

// Extension Loader
export {
  ExtensionLoaderService,
  DefaultHookManager,
  getExtensionLoader,
  resetExtensionLoader,
} from './extension-loader';
