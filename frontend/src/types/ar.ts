// =============================================================================
// DEPARTMENT TYPES
// =============================================================================

export type DepartmentStatus = 'active' | 'inactive' | 'archived';

export interface ARDepartment {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  parentId?: string | null;
  headPositionId?: string | null;
  budgetCents: number;
  status: DepartmentStatus;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DepartmentHierarchy {
  department: ARDepartment;
  children: ARDepartment[];
  ancestors: ARDepartment[];
}

export interface CreateDepartmentInput {
  name: string;
  description?: string;
  parentId?: string;
  headPositionId?: string;
  budgetCents?: number;
  status?: DepartmentStatus;
  metadata?: Record<string, unknown>;
}

export interface UpdateDepartmentInput {
  name?: string;
  description?: string | null;
  parentId?: string | null;
  headPositionId?: string | null;
  status?: DepartmentStatus;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// POSITION TYPES
// =============================================================================

export type PositionStatus = 'active' | 'inactive' | 'archived';
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface RequiredSkill {
  name: string;
  level: SkillLevel;
  weight: number;
}

export interface ARPosition {
  id: string;
  organizationId: string;
  departmentId: string;
  title: string;
  description?: string | null;
  requiredSkills: RequiredSkill[];
  minExperience: number;
  maxCapacity: number;
  currentCount: number;
  status: PositionStatus;
  reportsTo?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePositionInput {
  title: string;
  departmentId: string;
  description?: string;
  requiredSkills?: RequiredSkill[];
  minExperience?: number;
  maxCapacity?: number;
  status?: PositionStatus;
  reportsTo?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdatePositionInput {
  title?: string;
  departmentId?: string;
  description?: string | null;
  requiredSkills?: RequiredSkill[];
  minExperience?: number;
  maxCapacity?: number;
  status?: PositionStatus;
  reportsTo?: string | null;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// ASSIGNMENT TYPES
// =============================================================================

export type AssignmentStatus = 'active' | 'on_leave' | 'suspended' | 'terminated';
export type AssignmentType = 'permanent' | 'temporary' | 'acting';

export interface ARAssignment {
  id: string;
  organizationId: string;
  agentId: string;
  positionId: string;
  humanSupervisor?: string | null;
  assignmentType: AssignmentType;
  startDate?: string | null;
  endDate?: string | null;
  status: AssignmentStatus;
  performanceScore?: number | null;
  workload: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  // Expanded relations (optional)
  agent?: { id: string; name: string; type: string };
  position?: ARPosition;
}

export interface CreateAssignmentInput {
  agentId: string;
  positionId: string;
  humanSupervisor?: string;
  assignmentType?: AssignmentType;
  startDate?: string;
  endDate?: string;
  status?: AssignmentStatus;
  performanceScore?: number;
  workload?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateAssignmentInput {
  positionId?: string;
  humanSupervisor?: string | null;
  assignmentType?: AssignmentType;
  startDate?: string | null;
  endDate?: string | null;
  status?: AssignmentStatus;
  performanceScore?: number | null;
  workload?: number;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// APPROVAL TYPES
// =============================================================================

export type ApprovalLevel = 1 | 2 | 3 | 4 | 5;
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'escalated';
export type RequestType = 'task' | 'budget' | 'assignment' | 'schedule' | 'leave' | 'policy';
export type RequesterType = 'agent' | 'human';

export interface ApproverChainEntry {
  level: number;
  approverId: string;
  approverType: RequesterType;
  roleTitle?: string;
}

export interface ApprovalResponse {
  level: number;
  approverId: string;
  decision: 'approved' | 'rejected';
  note?: string;
  timestamp: string;
}

export interface ARApprovalRequest {
  id: string;
  organizationId: string;
  requestType: RequestType;
  level: ApprovalLevel;
  title: string;
  description: string;
  context: Record<string, unknown>;
  impactScope?: string;
  estimatedValue?: number;
  requesterType: RequesterType;
  requesterId: string;
  approverChain: ApproverChainEntry[];
  currentLevel: number;
  status: ApprovalStatus;
  responses: ApprovalResponse[];
  expiresAt: string;
  escalationAt?: string;
  slackChannelId?: string;
  slackMessageTs?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApprovalInput {
  requestType: RequestType;
  level: ApprovalLevel;
  title: string;
  description: string;
  context?: Record<string, unknown>;
  impactScope?: string;
  estimatedValue?: number;
}

// =============================================================================
// COORDINATION TYPES
// =============================================================================

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IssueCategory = 'workload' | 'performance' | 'deadline' | 'resource' | 'skill_gap';

export interface Issue {
  id: string;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  affectedAgents: string[];
  suggestedActions: string[];
  detectedAt: string;
}

export interface IssueSummary {
  total: number;
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  byCategory: Record<string, number>;
  topIssues: Issue[];
}

export interface WorkloadSnapshot {
  agentId: string;
  agentName: string;
  currentWorkload: number;
  targetWorkload: number;
  taskCount: number;
  status: 'overloaded' | 'balanced' | 'underutilized';
}

export interface WorkloadAnalysis {
  stats: {
    avgWorkload: number;
    stdDeviation: number;
    totalAgents: number;
    overloaded: number;
    underutilized: number;
    balanced: number;
  };
  snapshots: WorkloadSnapshot[];
}

export interface RebalanceChange {
  id: number;
  fromAgentId: string;
  toAgentId: string;
  taskIds: string[];
  estimatedImpact: {
    fromWorkload: { before: number; after: number };
    toWorkload: { before: number; after: number };
  };
}

export interface RebalanceProposal {
  id: string;
  organizationId: string;
  trigger: string;
  proposedChanges: RebalanceChange[];
  estimatedImprovement: number;
  status: 'pending' | 'applied' | 'rejected';
  createdAt: string;
}

// =============================================================================
// ANALYTICS TYPES
// =============================================================================

export type HealthStatus = 'healthy' | 'warning' | 'critical';

export interface AgentHealthCheck {
  agentId: string;
  agentName: string;
  status: HealthStatus;
  workload: number;
  issues: string[];
  lastActive: string;
}

export type RecommendationType =
  | 'template'
  | 'team_composition'
  | 'position'
  | 'skill_development'
  | 'resource_allocation'
  | 'structure_optimization';

export interface Recommendation {
  id: string;
  type: RecommendationType;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  actions: Array<{
    label: string;
    action: string;
    params?: Record<string, unknown>;
  }>;
  estimatedImpact?: string;
  createdAt: string;
}

export interface AnalyticsReport {
  period: {
    start: string;
    end: string;
    days: number;
  };
  metrics: {
    totalTasks: number;
    completedTasks: number;
    avgPerformance: number;
    totalCost: number;
    costPerTask: number;
  };
  trends: {
    completion: number;
    performance: number;
    cost: number;
  };
}

// =============================================================================
// DASHBOARD TYPES
// =============================================================================

export interface ARDashboardStats {
  totalDepartments: number;
  totalPositions: number;
  activeAssignments: number;
  pendingApprovals: number;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ARFilters {
  status?: string;
  search?: string;
  departmentId?: string;
  positionId?: string;
  agentId?: string;
  page?: number;
  pageSize?: number;
}
