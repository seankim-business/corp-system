/**
 * Agent Evolution Service - Type Definitions
 *
 * Types for module maturity tracking, split triggers, and agent organization evolution
 * in the Mega App system.
 */

// =============================================================================
// Maturity Tracking Types
// =============================================================================

/**
 * Module maturity phase based on operational metrics
 */
export type MaturityPhase = "mvp" | "growth" | "mature";

/**
 * Module maturity metrics for determining evolution state
 */
export interface ModuleMaturityMetrics {
  moduleId: string;
  phase: MaturityPhase;
  metrics: {
    /** Percentage of tasks completed successfully */
    taskCompletionRate: number;
    /** Average number of pending tasks in queue */
    averageQueueDepth: number;
    /** Average time tasks wait before being picked up (ms) */
    averageWaitTime: number;
    /** Percentage of agent capacity being utilized */
    utilizationRate: number;
    /** Percentage of tasks that result in errors */
    errorRate: number;
    /** Number of unique task types handled */
    taskDiversity: number;
  };
  /** Timestamp of last assessment */
  lastAssessed: Date;
  /** Optional assessment notes */
  notes?: string;
}

/**
 * Thresholds for triggering phase transitions
 */
export interface PhaseThresholds {
  /** MVP to Growth triggers */
  mvpToGrowth: {
    queueDepthThreshold: number; // >10
    queueDepthDurationMs: number; // 1 hour
    waitTimeThreshold: number; // >15 min
    utilizationThreshold: number; // >80%
  };
  /** Growth to Mature triggers */
  growthToMature: {
    minAgentCount: number; // 5+
    hasSpecializedTeams: boolean;
    hasDedicatedQA: boolean;
    minTaskDiversity: number;
  };
}

// =============================================================================
// Split Trigger Types
// =============================================================================

/**
 * Type of trigger that initiated split recommendation
 */
export type SplitTriggerType = "workload" | "complexity" | "quality";

/**
 * Strategy for splitting an agent's responsibilities
 */
export type SplitStrategy = "functional-split" | "quality-tier-split" | "pipeline-split";

/**
 * Split trigger detection result
 */
export interface SplitTrigger {
  type: SplitTriggerType;
  reason: string;
  moduleId: string;
  recommendedStrategy: SplitStrategy;
  suggestedAgents: AgentSplitSuggestion[];
  metrics: {
    currentValue: number;
    threshold: number;
    duration?: number;
  };
  detectedAt: Date;
  severity: "low" | "medium" | "high";
}

/**
 * Suggested agent configuration for a split
 */
export interface AgentSplitSuggestion {
  agentId?: string; // null for new agents
  name: string;
  role: string;
  specialization: string;
  taskTypes: string[];
  modelTier: "haiku" | "sonnet" | "opus";
  capabilities: string[];
}

/**
 * Workload-based trigger conditions
 */
export interface WorkloadTriggerConditions {
  queueDepthExceedsThreshold: boolean;
  queueDepthDuration: number;
  avgWaitTimeExceedsThreshold: boolean;
  utilizationExceedsThreshold: boolean;
}

/**
 * Complexity-based trigger conditions
 */
export interface ComplexityTriggerConditions {
  highTaskDiversity: boolean;
  taskTypeCount: number;
  distinctSkillSetsRequired: string[];
  expertiseGapDetected: boolean;
}

/**
 * Quality-based trigger conditions
 */
export interface QualityTriggerConditions {
  qualityDeclining: boolean;
  errorRateByTaskType: Map<string, number>;
  revisionRequestRate: number;
  complexTaskErrorRate: number;
}

// =============================================================================
// Organization Management Types
// =============================================================================

/**
 * Agent team configuration for creation
 */
export interface TeamConfig {
  name: string;
  description?: string;
  moduleId: string;
  parentTeamId?: string;
  leadAgentId?: string;
  maxAgents: number;
  scalingPolicy: "manual" | "auto" | "demand-based";
  agents: TeamAgentConfig[];
}

/**
 * Agent configuration within a team
 */
export interface TeamAgentConfig {
  agentId?: string; // null for new agents to be created
  name: string;
  role: "lead" | "worker" | "qa";
  modelTier: "haiku" | "sonnet" | "opus";
  specialization?: string;
  taskTypes: string[];
  capabilities: string[];
}

/**
 * Agent split configuration
 */
export interface AgentSplitConfig {
  originalAgentId: string;
  strategy: SplitStrategy;
  resultingAgents: AgentSplitSuggestion[];
  taskMigration: {
    taskType: string;
    fromAgentId: string;
    toAgentId: string;
  }[];
  transitionPeriodDays: number;
}

/**
 * Agent promotion configuration
 */
export interface AgentPromotionConfig {
  agentId: string;
  newRole: "lead" | "supervisor" | "manager";
  newResponsibilities: string[];
  subordinateAgentIds: string[];
  effectiveDate: Date;
}

/**
 * Agent retirement configuration
 */
export interface AgentRetirementConfig {
  agentId: string;
  reason: "consolidation" | "performance" | "redundancy" | "upgrade";
  taskHandoffAgentId: string;
  gracePeriodDays: number;
  retainKnowledge: boolean;
}

/**
 * Organization change record
 */
export interface OrgChangeRecord {
  id: string;
  type: "team_created" | "agent_split" | "agent_promoted" | "agent_retired";
  moduleId: string;
  organizationId: string;
  details: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "completed";
  requestedAt: Date;
  approvedAt?: Date;
  completedAt?: Date;
  requestedBy: string;
  approvedBy?: string;
}

// =============================================================================
// AR Integration Types
// =============================================================================

/**
 * Module registration with AR system
 */
export interface ARModuleRegistration {
  moduleId: string;
  organizationId: string;
  departmentId?: string;
  positionIds: string[];
  assignmentIds: string[];
  registeredAt: Date;
}

/**
 * AR approval request for org changes
 */
export interface ARApprovalRequest {
  changeType: OrgChangeRecord["type"];
  moduleId: string;
  organizationId: string;
  description: string;
  impactScope: "individual" | "team" | "department" | "organization";
  estimatedCost?: number;
  requestContext: Record<string, unknown>;
}

/**
 * AR evolution event notification
 */
export interface AREvolutionEvent {
  eventType:
    | "maturity_transition"
    | "split_triggered"
    | "team_created"
    | "agent_promoted"
    | "agent_retired";
  moduleId: string;
  organizationId: string;
  timestamp: Date;
  data: Record<string, unknown>;
  severity: "info" | "warning" | "action_required";
}

/**
 * Agent assignment sync data
 */
export interface AgentAssignmentSync {
  moduleId: string;
  megaAppTeamId: string;
  arDepartmentId?: string;
  agentAssignments: {
    agentId: string;
    positionId?: string;
    assignmentId?: string;
    status: "synced" | "pending" | "error";
  }[];
  lastSynced: Date;
}

// =============================================================================
// Evolution Service Result Types
// =============================================================================

/**
 * Maturity assessment result
 */
export interface MaturityAssessmentResult {
  moduleId: string;
  currentPhase: MaturityPhase;
  recommendedPhase: MaturityPhase;
  phaseTransitionRecommended: boolean;
  metrics: ModuleMaturityMetrics["metrics"];
  triggers: SplitTrigger[];
  recommendations: string[];
  assessedAt: Date;
}

/**
 * Split recommendation result
 */
export interface SplitRecommendationResult {
  trigger: SplitTrigger;
  strategy: SplitStrategy;
  suggestedAgents: AgentSplitSuggestion[];
  estimatedBenefits: {
    expectedQueueReduction: number;
    expectedWaitTimeReduction: number;
    expectedErrorRateReduction: number;
  };
  estimatedCosts: {
    additionalAgentCost: number;
    transitionPeriodCost: number;
  };
  implementationSteps: string[];
  risks: string[];
  confidence: number; // 0-1
}

/**
 * Evolution service configuration
 */
export interface EvolutionServiceConfig {
  /** How often to assess module maturity (ms) */
  assessmentIntervalMs: number;
  /** Whether to auto-approve non-critical changes */
  autoApproveMinorChanges: boolean;
  /** Maximum agents per team */
  maxAgentsPerTeam: number;
  /** Default transition period for splits */
  defaultTransitionPeriodDays: number;
  /** Phase transition thresholds */
  thresholds: PhaseThresholds;
}

/**
 * Default thresholds based on the plan
 */
export const DEFAULT_PHASE_THRESHOLDS: PhaseThresholds = {
  mvpToGrowth: {
    queueDepthThreshold: 10,
    queueDepthDurationMs: 60 * 60 * 1000, // 1 hour
    waitTimeThreshold: 15 * 60 * 1000, // 15 minutes
    utilizationThreshold: 0.8, // 80%
  },
  growthToMature: {
    minAgentCount: 5,
    hasSpecializedTeams: true,
    hasDedicatedQA: true,
    minTaskDiversity: 5,
  },
};
