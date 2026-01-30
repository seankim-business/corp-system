/**
 * Development Pipeline Types
 *
 * Types for automated feature development from approved requests.
 */

// =============================================================================
// Development Task Types
// =============================================================================

export type DevelopmentTaskType = "code" | "config" | "skill" | "agent" | "test";

export type DevelopmentTaskStatus =
  | "pending"
  | "assigned"
  | "in_progress"
  | "review"
  | "done"
  | "failed";

export interface DevelopmentTask {
  id: string;
  type: DevelopmentTaskType;
  description: string;
  targetFiles: string[];
  assignedAgentType: string;
  category: string; // For delegateTask
  status: DevelopmentTaskStatus;
  dependencies: string[]; // Task IDs this task depends on
  estimatedTokens?: number;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Development Plan Types
// =============================================================================

export interface DevelopmentPlan {
  id: string;
  featureRequestId: string;
  moduleId: string;
  tasks: DevelopmentTask[];
  estimatedEffort: string;
  dependencies: string[];
  riskAssessment: string;
  status: "draft" | "in_progress" | "completed" | "failed";
  createdAt: Date;
  completedAt?: Date;
}

// =============================================================================
// QA Types
// =============================================================================

export interface QAResult {
  planId: string;
  success: boolean;
  typeCheckPassed: boolean;
  testsPassed: boolean;
  breakingChanges: BreakingChange[];
  successCriteriaValidation: CriteriaValidation[];
  timestamp: Date;
  errors?: QAError[];
}

export interface BreakingChange {
  type: "api" | "schema" | "config" | "dependency";
  description: string;
  affectedModules: string[];
  severity: "critical" | "high" | "medium" | "low";
}

export interface CriteriaValidation {
  criterion: string;
  passed: boolean;
  evidence?: string;
  notes?: string;
}

export interface QAError {
  type: "type" | "test" | "lint" | "runtime";
  file?: string;
  line?: number;
  message: string;
  severity: "error" | "warning";
}

// =============================================================================
// Development Result Types
// =============================================================================

export interface DevelopmentResult {
  planId: string;
  success: boolean;
  artifacts: DevelopmentArtifacts;
  qaResult: QAResult;
  approvalStatus: ApprovalStatus;
  createdAt: Date;
  completedAt?: Date;
  errors?: string[];
}

export interface DevelopmentArtifacts {
  filesCreated: string[];
  filesModified: string[];
  testsAdded: string[];
  skillsCreated?: string[];
  agentsConfigured?: string[];
}

export type ApprovalStatus = "pending" | "approved" | "rejected";

// =============================================================================
// Release Types
// =============================================================================

export interface ReleaseRequest {
  planId: string;
  summary: string;
  artifacts: DevelopmentArtifacts;
  qaResult: QAResult;
  releaseNotes: string;
  moduleVersion: string;
  requestedBy: string;
}

export interface ReleaseResult {
  success: boolean;
  releaseId?: string;
  moduleVersion: string;
  deployedAt?: Date;
  error?: string;
}

// =============================================================================
// Task Generation Context
// =============================================================================

export interface TaskGenerationContext {
  featureAnalysis: {
    coreIntent: string;
    specificFeature: string;
    problemStatement: string;
    successCriteria: string[];
    affectedWorkflows: string[];
    relatedModules: string[];
  };
  moduleInfo: {
    id: string;
    name: string;
    type: string;
    currentVersion: string;
    existingFiles: string[];
    dependencies: string[];
  };
  organizationContext: {
    organizationId: string;
    codingStandards?: string[];
    testingRequirements?: string[];
    approvalLevel?: number;
  };
}

// =============================================================================
// Progress Tracking
// =============================================================================

export interface DevelopmentProgress {
  planId: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  currentPhase: "planning" | "execution" | "qa" | "approval" | "release";
  currentTask?: DevelopmentTask;
  lastUpdate: Date;
  estimatedCompletion?: Date;
}

// =============================================================================
// Event Types
// =============================================================================

export type DevelopmentEventType =
  | "plan.created"
  | "task.started"
  | "task.completed"
  | "task.failed"
  | "qa.started"
  | "qa.completed"
  | "approval.requested"
  | "release.completed";

export interface DevelopmentEvent {
  eventType: DevelopmentEventType;
  planId: string;
  taskId?: string;
  organizationId: string;
  data: Record<string, unknown>;
  timestamp: Date;
}
