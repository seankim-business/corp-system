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

// Feature Request Pipeline
export {
  FeatureRequestPipelineService,
  getFeatureRequestPipeline,
  FeatureRequestAnalyzerService,
  getAnalyzerService,
  FeatureRequestDeduplicationService,
  getDeduplicationService,
  // Capture functions
  captureFromSlack,
  captureFromWeb,
  captureFromNotion,
  captureFromEmail,
  createFeatureRequest,
  getFeatureRequestById,
  // Types
  type PipelineProcessResult,
  type CapturedRequest,
  type AnalyzeIntentResult,
  type FeatureRequestCapture,
  type FeatureRequestSource,
  type FeatureRequestStatus,
  type FeatureAnalysis,
  type PriorityCalculation,
  type BusinessContext,
  type DeduplicationResult,
  type SimilarRequest,
  type MergeResult,
  type SlackCaptureData,
  type WebCaptureData,
  type NotionCaptureData,
  type EmailCaptureData,
  type FeatureRequestPipelineConfig,
  DEFAULT_PIPELINE_CONFIG,
} from "./feature-request-pipeline";

// Agent Evolution
export {
  AgentEvolutionService,
  getAgentEvolutionService,
  MaturityTrackerService,
  getMaturityTrackerService,
  SplitTriggerService,
  getSplitTriggerService,
  OrganizationManagerService,
  getOrganizationManagerService,
  ARIntegrationService,
  getARIntegrationService,
  type ModuleMaturityMetrics,
  type MaturityPhase,
  type SplitTrigger,
  type SplitStrategy,
  type AgentSplitSuggestion,
  type TeamConfig,
  type OrgChangeRecord,
  type ARModuleRegistration,
  type AREvolutionEvent,
  type MaturityAssessmentResult,
  type SplitRecommendationResult,
  type PhaseThresholds,
  type EvolutionServiceConfig,
  DEFAULT_PHASE_THRESHOLDS,
} from "./agent-evolution";

// MegaApp Manager - Central Orchestration
export {
  MegaAppManagerService,
  megaAppManagerService,
  DevelopmentPipelineService,
  developmentPipelineService,
  TroubleshooterService,
  troubleshooterService,
  ARCoordinatorService,
  arCoordinatorService,
  // Types
  type ValueStreamInput,
  type ValueStreamExecution,
  type ExecutionStatus,
  type ExecutionStatusType,
  type ExecutionArtifact,
  type DevelopmentPlan,
  type DevelopmentPlanStatus,
  type DevelopmentTask,
  type AgentAssignment as ManagerAgentAssignment,
  type ApprovalStatus,
  type DevelopmentResult,
  type ModuleIssue,
  type IssueType,
  type IssueDiagnosis,
  type SuggestedFix,
  type FixStep,
  type TroubleshootResult,
  type MaintenanceConfig,
  type MaintenanceType,
  type ModuleHealthReport,
  type ModuleHealth,
  type MaintenanceRecommendation,
  type AgentCapabilityRequirements,
  type AvailableAgent,
  type ARAssignmentRequest,
  type ARAssignmentResult,
  type ARDirectorEscalation,
  type ARAnalystMetrics,
} from "./manager";
