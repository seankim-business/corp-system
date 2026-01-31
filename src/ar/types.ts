/**
 * AR Management System - Type Definitions
 *
 * Comprehensive TypeScript types for the Agent Resource (AR) management system,
 * including organizational structure, approvals, coordination, scheduling, and templates.
 */

// =============================================================================
// Agent Organization Types
// =============================================================================

/**
 * Status of a department within the organization
 */
export type DepartmentStatus = 'active' | 'inactive' | 'archived';

/**
 * Hierarchical position level within the organization
 * 1 = Entry level, 5 = Head/Director level
 */
export type PositionLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Type of agent assignment to a position
 */
export type AssignmentType = 'permanent' | 'temporary' | 'acting';

/**
 * Current status of an agent assignment
 */
export type AssignmentStatus = 'active' | 'on_leave' | 'suspended' | 'terminated';

/**
 * Input data for creating a new department
 */
export interface ARDepartmentCreateInput {
  name: string;
  description?: string;
  parentId?: string;
  headPositionId?: string;
  budgetCents?: number;
  status?: DepartmentStatus;
  metadata?: Record<string, any>;
}

/**
 * Input data for creating a new position
 */
export interface ARPositionCreateInput {
  departmentId: string;
  title: string;
  description?: string;
  level: PositionLevel;
  reportsToId?: string;
  requiredCapabilities?: string[];
  metadata?: Record<string, any>;
}

/**
 * Input data for creating an agent assignment
 */
export interface ARAssignmentCreateInput {
  agentId: string;
  positionId: string;
  type: AssignmentType;
  startDate: Date;
  endDate?: Date;
  status?: AssignmentStatus;
  metadata?: Record<string, any>;
}

// =============================================================================
// Approval Types (Addendum C Integration)
// =============================================================================

/**
 * Hierarchical approval levels based on impact scope
 * 1 = Task-level, 5 = Objective-level
 */
export type ApprovalLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Categories of actions requiring approval
 */
export type ARActionCategory =
  | 'task_execution'
  | 'budget_spend'
  | 'external_communication'
  | 'data_modification'
  | 'agent_assignment'
  | 'policy_change'
  | 'emergency_action';

/**
 * Types of approval requests
 */
export type ApprovalRequestType =
  | 'task'
  | 'budget'
  | 'assignment'
  | 'schedule'
  | 'rebalancing'
  | 'department'
  | 'meta_agent'
  | 'emergency';

/**
 * Current status of an approval request
 */
export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'escalated';

/**
 * Scope of impact for an approval request
 */
export type ImpactScope =
  | 'individual'
  | 'team'
  | 'department'
  | 'organization';

/**
 * Type of entity making an approval request
 */
export type RequesterType = 'agent' | 'human';

/**
 * Roles that can approve specific types of requests
 */
export type ApproverRole =
  | 'direct_supervisor'
  | 'department_head'
  | 'function_owner'
  | 'project_manager'
  | 'budget_owner'
  | 'c_level'
  | 'ar_director'
  | 'security_officer';

/**
 * Input data for creating an approval request
 */
export interface ARApprovalRequestCreateInput {
  requesterId: string;
  requesterType: RequesterType;
  type: ApprovalRequestType;
  actionCategory: ARActionCategory;
  title: string;
  description: string;
  impactScope: ImpactScope;
  requiredLevel: ApprovalLevel;
  approverRoles: ApproverRole[];
  context?: Record<string, any>;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

/**
 * Escalation path for approval requests
 */
export interface EscalationPath {
  level: ApprovalLevel;
  approverRoles: ApproverRole[];
  timeoutMinutes: number;
  autoEscalate: boolean;
  notificationChannels: string[];
}

// =============================================================================
// Coordination Types (Addendum B Integration)
// =============================================================================

/**
 * Real-time coordination event types
 */
export type ARCoordinationEventType =
  | 'TASK_BLOCKED'
  | 'OVERLOAD_DETECTED'
  | 'DEADLINE_RISK'
  | 'RESOURCE_CONFLICT'
  | 'AGENT_IDLE'
  | 'NEGOTIATION_REQUEST'
  | 'NEGOTIATION_RESPONSE'
  | 'DIRECTOR_DECISION';

/**
 * Agent coordination states during task execution
 */
export type AgentCoordinationState =
  | 'IDLE'
  | 'WORKING'
  | 'SEEKING_HELP'
  | 'NEGOTIATING'
  | 'WAITING_DIRECTOR'
  | 'EXECUTING_DECISION';

/**
 * Types of negotiation requests between agents
 */
export type NegotiationRequestType =
  | 'task_handoff'
  | 'resource_share'
  | 'priority_swap'
  | 'workload_help';

/**
 * Negotiation decision outcomes
 */
export type NegotiationDecision = 'accept' | 'reject' | 'counter';

/**
 * Negotiation request data structure
 */
export interface NegotiationRequest {
  id: string;
  type: NegotiationRequestType;
  requesterId: string;
  targetAgentId: string;
  taskId?: string;
  resourceId?: string;
  proposedTerms: Record<string, any>;
  justification: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  deadline?: Date;
  createdAt: Date;
}

/**
 * Negotiation response data structure
 */
export interface NegotiationResponse {
  requestId: string;
  responderId: string;
  decision: NegotiationDecision;
  counterTerms?: Record<string, any>;
  reason?: string;
  respondedAt: Date;
}

/**
 * Director decision for escalated negotiations
 */
export interface DirectorDecision {
  negotiationId: string;
  directorId: string;
  decision: 'approve_original' | 'approve_counter' | 'reject_both' | 'override';
  overrideTerms?: Record<string, any>;
  rationale: string;
  decidedAt: Date;
  notifyAgents: string[];
}

/**
 * Coordination event data structure
 */
export interface CoordinationEvent {
  id: string;
  type: ARCoordinationEventType;
  agentId: string;
  state: AgentCoordinationState;
  taskId?: string;
  data: Record<string, any>;
  priority: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
}

// =============================================================================
// Scheduling Types
// =============================================================================

/**
 * Availability status for agents and humans
 */
export type AvailabilityStatus = 'available' | 'busy' | 'vacation' | 'sick';

/**
 * Types of scheduled meetings
 */
export type MeetingType = 'standup' | 'review' | 'planning' | 'adhoc';

/**
 * Types of scheduled leave
 */
export type LeaveType = 'vacation' | 'sick' | 'maintenance' | 'upgrade';

/**
 * Entity type for scheduling
 */
export type EntityType = 'human' | 'agent';

/**
 * Scheduling rule for automated scheduling decisions
 */
export interface SchedulingRule {
  id: string;
  name: string;
  description?: string;
  priority: number;
  conditions: {
    participantRoles?: string[];
    meetingTypes?: MeetingType[];
    timeRanges?: {
      start: string; // HH:mm format
      end: string;
    }[];
    daysOfWeek?: number[]; // 0-6 (Sunday-Saturday)
    excludeStatuses?: AvailabilityStatus[];
  };
  scoring: {
    preferredTimes?: number; // Bonus points
    avoidTimes?: number; // Penalty points
    consecutiveMeetings?: number; // Penalty for back-to-back
    travelTime?: number; // Minutes to account for between meetings
  };
  enabled: boolean;
  metadata?: Record<string, any>;
}

/**
 * Scheduling score for a proposed time slot
 */
export interface SchedulingScore {
  timeSlot: {
    start: Date;
    end: Date;
  };
  totalScore: number;
  participantScores: {
    entityId: string;
    entityType: EntityType;
    score: number;
    conflicts: string[];
    preferences: string[];
  }[];
  ruleApplications: {
    ruleId: string;
    ruleName: string;
    impact: number;
  }[];
  feasible: boolean;
}

/**
 * Leave request data structure
 */
export interface LeaveRequest {
  id: string;
  entityId: string;
  entityType: EntityType;
  type: LeaveType;
  startDate: Date;
  endDate: Date;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  approverId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Template Types
// =============================================================================

/**
 * Industry categories for organizational templates
 */
export type IndustryType =
  | 'technology'
  | 'fashion'
  | 'ecommerce'
  | 'manufacturing'
  | 'finance'
  | 'healthcare';

/**
 * Company size categories
 */
export type CompanySize = 'startup' | 'smb' | 'enterprise';

/**
 * Growth stage of the organization
 */
export type GrowthStage = 'seed' | 'growth' | 'mature';

/**
 * Triggers for template recommendations
 */
export type TemplateRecommendationTrigger =
  | 'new_project'
  | 'scaling'
  | 'optimization';

/**
 * Template effectiveness metrics
 */
export interface TemplateEffectivenessMetrics {
  templateId: string;
  usageCount: number;
  successRate: number;
  avgTimeToValue: number; // Days until organization becomes productive
  avgAgentUtilization: number; // Percentage
  avgTaskCompletionRate: number; // Percentage
  industryBenchmark?: {
    percentile: number;
    industry: IndustryType;
  };
  userSatisfaction?: number; // 1-5 rating
  lastUpdated: Date;
}

/**
 * Organizational template data structure
 */
export interface OrganizationalTemplate {
  id: string;
  name: string;
  description: string;
  industry: IndustryType;
  companySize: CompanySize;
  growthStage: GrowthStage;
  departments: {
    name: string;
    description: string;
    positions: {
      title: string;
      level: PositionLevel;
      requiredCapabilities: string[];
      reportsTo?: string;
    }[];
  }[];
  recommendedWorkflows?: string[];
  approvalMatrix?: {
    actionCategory: ARActionCategory;
    approverRoles: ApproverRole[];
    requiredLevel: ApprovalLevel;
  }[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// AR Department Types (Meta AR Organization)
// =============================================================================

/**
 * Roles within the AR meta-organization
 */
export type ARMetaRole =
  | 'director'
  | 'ops_manager'
  | 'analyst'
  | 'coach';

/**
 * Categories of AR departments
 */
export type ARDepartmentCategory =
  | 'monitoring'
  | 'analysis'
  | 'coaching'
  | 'coordination';

/**
 * AR meta-agent assignment
 */
export interface ARMetaAgentAssignment {
  agentId: string;
  role: ARMetaRole;
  category: ARDepartmentCategory;
  capabilities: string[];
  monitoringScope?: {
    departmentIds?: string[];
    agentIds?: string[];
    all?: boolean;
  };
  assignedAt: Date;
  metadata?: Record<string, any>;
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Common pagination parameters
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Common filter parameters for queries
 */
export interface FilterParams {
  search?: string;
  status?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  metadata?: Record<string, any>;
}

/**
 * API response wrapper
 */
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

/**
 * Audit log entry for tracking changes
 */
export interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: 'create' | 'update' | 'delete';
  actorId: string;
  actorType: 'agent' | 'human' | 'system';
  changes?: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  timestamp: Date;
  metadata?: Record<string, any>;
}

// =============================================================================
// All types are exported inline via 'export' keyword on their declarations
// =============================================================================
