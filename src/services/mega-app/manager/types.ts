/**
 * MegaApp Manager - Type Definitions
 *
 * Types for value stream orchestration, auto-development, and troubleshooting.
 */

import type { ArtifactStatus } from '../artifact-service';
import type { ImpactScope, ApprovalLevel } from '../../../ar/types';
import type { HealthReport } from '../../../ar/meta-agents/types';

// =============================================================================
// Value Stream Types
// =============================================================================

/**
 * Input for initiating a value stream execution
 */
export interface ValueStreamInput {
  organizationId: string;
  userId?: string;
  seasonCode?: string;
  collectionId?: string;
  targetModuleId?: string;
  initialData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Status of a value stream execution
 */
export type ExecutionStatusType =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Execution status details
 */
export interface ExecutionStatus {
  executionId: string;
  templateId: string;
  status: ExecutionStatusType;
  progress: number;
  currentModule?: string;
  completedModules: string[];
  pendingModules: string[];
  failedModules: string[];
  artifacts: ExecutionArtifact[];
  startedAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  error?: {
    moduleId: string;
    message: string;
    code?: string;
    recoverable: boolean;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Artifact produced during execution
 */
export interface ExecutionArtifact {
  artifactId: string;
  moduleId: string;
  status: ArtifactStatus;
  createdAt: Date;
}

/**
 * Result of a value stream execution
 */
export interface ValueStreamExecution {
  executionId: string;
  templateId: string;
  status: ExecutionStatus;
  artifacts: ExecutionArtifact[];
  duration: number;
  cost?: number;
}

// =============================================================================
// Auto-Development Types
// =============================================================================

/**
 * Development plan for a feature request
 */
export interface DevelopmentPlan {
  planId: string;
  featureRequestId: string;
  organizationId: string;
  title: string;
  description: string;
  status: DevelopmentPlanStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  complexity: 'simple' | 'medium' | 'complex';
  estimatedHours: number;
  tasks: DevelopmentTask[];
  dependencies: string[];
  assignedAgents: AgentAssignment[];
  approvalRequired: boolean;
  approvalStatus?: ApprovalStatus;
  createdAt: Date;
  updatedAt: Date;
  targetCompletionDate?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Status of a development plan
 */
export type DevelopmentPlanStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'in_progress'
  | 'testing'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Individual task in a development plan
 */
export interface DevelopmentTask {
  taskId: string;
  title: string;
  description: string;
  type: 'design' | 'implementation' | 'testing' | 'documentation' | 'review';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  assignedAgentId?: string;
  dependencies: string[]; // Other task IDs
  estimatedHours: number;
  actualHours?: number;
  artifactIds?: string[];
  order: number;
  metadata?: Record<string, unknown>;
}

/**
 * Agent assignment for a task
 */
export interface AgentAssignment {
  agentId: string;
  taskIds: string[];
  capability: string;
  assignedAt: Date;
  status: 'active' | 'completed' | 'released';
}

/**
 * Approval status for plans
 */
export interface ApprovalStatus {
  required: boolean;
  level: ApprovalLevel;
  requestId?: string;
  approvedBy?: string;
  approvedAt?: Date;
  rejectedReason?: string;
}

/**
 * Result of auto-development
 */
export interface DevelopmentResult {
  planId: string;
  status: 'success' | 'partial' | 'failed';
  completedTasks: string[];
  failedTasks: { taskId: string; error: string }[];
  artifacts: string[];
  duration: number;
  cost?: number;
  summary: string;
}

// =============================================================================
// Troubleshooting Types
// =============================================================================

/**
 * Module issue detected by monitoring
 */
export interface ModuleIssue {
  issueId: string;
  organizationId: string;
  moduleId: string;
  type: IssueType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  detectedAt: Date;
  affectedArtifacts?: string[];
  context?: Record<string, unknown>;
}

/**
 * Types of issues
 */
export type IssueType =
  | 'execution_failure'
  | 'performance_degradation'
  | 'data_quality'
  | 'dependency_error'
  | 'configuration_error'
  | 'resource_exhaustion'
  | 'timeout'
  | 'unknown';

/**
 * Diagnosis of an issue
 */
export interface IssueDiagnosis {
  issueId: string;
  rootCause: string;
  confidence: number; // 0-1
  relatedIssues?: string[];
  suggestedFixes: SuggestedFix[];
  diagnosticData: Record<string, unknown>;
  diagnosedAt: Date;
}

/**
 * Suggested fix for an issue
 */
export interface SuggestedFix {
  fixId: string;
  title: string;
  description: string;
  type: 'automatic' | 'semi-automatic' | 'manual';
  confidence: number;
  estimatedDuration: number; // minutes
  risk: 'low' | 'medium' | 'high';
  steps: FixStep[];
  requiresApproval: boolean;
}

/**
 * Step in a fix
 */
export interface FixStep {
  order: number;
  action: string;
  description: string;
  automated: boolean;
  rollbackAction?: string;
}

/**
 * Result of applying a fix
 */
export interface TroubleshootResult {
  issueId: string;
  fixId: string;
  status: 'success' | 'partial' | 'failed' | 'rolled_back';
  stepsCompleted: number;
  totalSteps: number;
  duration: number;
  verificationPassed: boolean;
  rollbackPerformed: boolean;
  details?: string;
}

// =============================================================================
// Maintenance Types
// =============================================================================

/**
 * Maintenance configuration
 */
export interface MaintenanceConfig {
  organizationId: string;
  moduleIds?: string[]; // If not specified, all modules
  type: MaintenanceType;
  scheduledAt: Date;
  estimatedDuration: number; // minutes
  impactScope: ImpactScope;
  notifyUsers: boolean;
  autoApprove: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Types of maintenance
 */
export type MaintenanceType =
  | 'health_check'
  | 'optimization'
  | 'cleanup'
  | 'upgrade'
  | 'backup'
  | 'validation';

/**
 * Extended health report with module info
 */
export interface ModuleHealthReport extends HealthReport {
  moduleHealth: ModuleHealth[];
  recommendations: MaintenanceRecommendation[];
}

/**
 * Health status of a module
 */
export interface ModuleHealth {
  moduleId: string;
  moduleName: string;
  status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  lastExecuted?: Date;
  successRate: number;
  averageExecutionTime: number;
  errorCount: number;
  issues: string[];
}

/**
 * Maintenance recommendation
 */
export interface MaintenanceRecommendation {
  moduleId: string;
  type: MaintenanceType;
  priority: 'low' | 'medium' | 'high';
  reason: string;
  estimatedImpact: string;
}

// =============================================================================
// AR Coordinator Types
// =============================================================================

/**
 * Agent capability requirements
 */
export interface AgentCapabilityRequirements {
  primaryCapability: string;
  secondaryCapabilities?: string[];
  minPerformanceScore?: number;
  preferredTier?: 'haiku' | 'sonnet' | 'opus';
  requiredSkills?: string[];
  maxWorkload?: number;
}

/**
 * Agent from AR system
 */
export interface AvailableAgent {
  agentId: string;
  positionId: string;
  capabilities: string[];
  performanceScore: number;
  currentWorkload: number;
  tier: string;
  status: 'available' | 'busy' | 'offline';
}

/**
 * Assignment request to AR
 */
export interface ARAssignmentRequest {
  taskId: string;
  requirements: AgentCapabilityRequirements;
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedDuration: number;
  deadline?: Date;
  context?: Record<string, unknown>;
}

/**
 * Assignment result from AR
 */
export interface ARAssignmentResult {
  taskId: string;
  agentId: string;
  positionId: string;
  assignmentId: string;
  estimatedStartTime: Date;
  confidence: number;
}

/**
 * Escalation to AR Director
 */
export interface ARDirectorEscalation {
  type: 'approval' | 'resource_conflict' | 'performance' | 'emergency';
  title: string;
  description: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  context: Record<string, unknown>;
  affectedModules?: string[];
  affectedAgents?: string[];
  requiredAction: string;
}

/**
 * Performance metrics for AR Analyst
 */
export interface ARAnalystMetrics {
  moduleId: string;
  period: 'daily' | 'weekly' | 'monthly';
  executions: number;
  successRate: number;
  averageDuration: number;
  costTotal: number;
  agentUtilization: number;
  bottlenecks?: string[];
}
