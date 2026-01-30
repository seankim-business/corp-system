/**
 * Mega App Services
 *
 * Core services for the Fashion Value Stream Mega App.
 */
export {
  ModuleRegistry,
  getModuleRegistry,
  type ModuleDefinition,
  type ModuleFilter,
  type CanExecuteResult,
  type MissingInput,
  type ExecutionPath,
} from "./module-registry";

export {
  ArtifactService,
  getArtifactService,
  type ArtifactStatus,
  type CreateArtifactInput,
  type UpdateArtifactInput,
  type ArtifactWithLinks,
  type ArtifactReference,
  type ListArtifactsOptions,
} from "./artifact-service";

export {
  PermissionService,
  getPermissionService,
  type PermissionAction,
  type DataScope,
  type ModulePermissions,
  type RoleDefinition,
  type PermissionOverride,
} from "./permission-service";
