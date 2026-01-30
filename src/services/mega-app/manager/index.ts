/**
 * MegaApp Manager
 *
 * Central orchestration service for the entire value stream.
 * Provides auto-development, maintenance, troubleshooting, and AR integration.
 */

// Main manager service
export {
  MegaAppManagerService,
  megaAppManagerService,
} from './mega-app-manager.service';

// Development pipeline
export {
  DevelopmentPipelineService,
  developmentPipelineService,
} from './development-pipeline.service';

// Troubleshooter
export {
  TroubleshooterService,
  troubleshooterService,
} from './troubleshooter.service';

// AR Coordinator
export {
  ARCoordinatorService,
  arCoordinatorService,
} from './ar-coordinator.service';

// Types
export type {
  // Value Stream Types
  ValueStreamInput,
  ValueStreamExecution,
  ExecutionStatus,
  ExecutionStatusType,
  ExecutionArtifact,

  // Development Types
  DevelopmentPlan,
  DevelopmentPlanStatus,
  DevelopmentTask,
  AgentAssignment,
  ApprovalStatus,
  DevelopmentResult,

  // Troubleshooting Types
  ModuleIssue,
  IssueType,
  IssueDiagnosis,
  SuggestedFix,
  FixStep,
  TroubleshootResult,

  // Maintenance Types
  MaintenanceConfig,
  MaintenanceType,
  ModuleHealthReport,
  ModuleHealth,
  MaintenanceRecommendation,

  // AR Coordinator Types
  AgentCapabilityRequirements,
  AvailableAgent,
  ARAssignmentRequest,
  ARAssignmentResult,
  ARDirectorEscalation,
  ARAnalystMetrics,
} from './types';
