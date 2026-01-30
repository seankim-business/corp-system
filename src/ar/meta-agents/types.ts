/**
 * AR Meta-Agents - Type Definitions
 *
 * Types specific to AR meta-agent operations
 */

import {
  ApprovalLevel,
  ImpactScope,
} from '../types';

// =============================================================================
// Common Meta-Agent Types
// =============================================================================

/**
 * Report time period
 */
export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly';

/**
 * Meta-agent role types
 */
export type MetaAgentRole = 'director' | 'ops_manager' | 'analyst' | 'coach';

/**
 * AR event categories
 */
export type ARDepartmentEventType =
  | 'AGENT_HEALTH_ALERT'
  | 'COST_THRESHOLD_EXCEEDED'
  | 'PERFORMANCE_DEGRADATION'
  | 'SKILL_GAP_DETECTED'
  | 'ONBOARDING_COMPLETE'
  | 'MAINTENANCE_REQUIRED'
  | 'INCIDENT_DETECTED'
  | 'OPTIMIZATION_OPPORTUNITY';

/**
 * AR department event
 */
export interface ARDepartmentEvent {
  id: string;
  type: ARDepartmentEventType;
  organizationId: string;
  agentId?: string;
  departmentId?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  data: Record<string, any>;
  timestamp: Date;
}

/**
 * Meta-agent status
 */
export interface MetaAgentStatus {
  role: MetaAgentRole;
  active: boolean;
  lastRun?: Date;
  nextScheduledRun?: Date;
  health: 'healthy' | 'degraded' | 'failed';
  metadata?: Record<string, any>;
}

/**
 * Daily cycle report
 */
export interface DailyCycleReport {
  date: Date;
  organizationId: string;
  directorReview?: DirectorReview;
  healthReport?: HealthReport;
  performanceReport?: PerformanceReport;
  trainingActivities?: string[];
  incidents?: IncidentResolution[];
  recommendations?: string[];
}

// =============================================================================
// AR Director Types
// =============================================================================

/**
 * Director review of daily operations
 */
export interface DirectorReview {
  date: Date;
  organizationId: string;
  summary: string;
  keyMetrics: {
    activeAgents: number;
    tasksCompleted: number;
    averagePerformance: number;
    costSpent: number;
  };
  escalations: EscalationContext[];
  decisions: DirectorDecision[];
  recommendations: string[];
  approvalStatus: 'approved' | 'requires_action' | 'escalated';
}

/**
 * Escalation context for director review
 */
export interface EscalationContext {
  id: string;
  type: 'budget' | 'performance' | 'structural' | 'emergency';
  severity: 'medium' | 'high' | 'critical';
  description: string;
  affectedAgents?: string[];
  affectedDepartments?: string[];
  proposedAction?: string;
  deadline?: Date;
  metadata?: Record<string, any>;
}

/**
 * Director decision on escalated issue
 */
export interface DirectorDecision {
  escalationId: string;
  decision: 'approve' | 'reject' | 'defer' | 'escalate_to_human';
  action: string;
  rationale: string;
  implementationPlan?: string[];
  notifyAgents?: string[];
  notifyHumans?: string[];
  decidedAt: Date;
}

/**
 * Executive report for leadership
 */
export interface ExecutiveReport {
  period: ReportPeriod;
  startDate: Date;
  endDate: Date;
  organizationId: string;
  summary: {
    totalAgents: number;
    totalDepartments: number;
    tasksCompleted: number;
    totalCost: number;
    averageUtilization: number;
  };
  highlights: string[];
  concerns: string[];
  recommendations: string[];
  keyMetrics: Record<string, number>;
  trends: {
    metric: string;
    direction: 'up' | 'down' | 'stable';
    change: number;
  }[];
}

/**
 * Leadership coordination request
 */
export interface LeadershipCoordinationRequest {
  type: 'approval' | 'consultation' | 'escalation';
  subject: string;
  description: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  context: Record<string, any>;
  requiredApprovalLevel?: ApprovalLevel;
  deadline?: Date;
}

// =============================================================================
// AR Ops Manager Types
// =============================================================================

/**
 * Health report for agents
 */
export interface HealthReport {
  organizationId: string;
  timestamp: Date;
  overallHealth: 'healthy' | 'degraded' | 'critical';
  agentHealth: AgentHealthStatus[];
  systemMetrics: {
    avgResponseTime: number;
    errorRate: number;
    availabilityPercent: number;
  };
  alerts: HealthAlert[];
}

/**
 * Individual agent health status
 */
export interface AgentHealthStatus {
  agentId: string;
  positionId?: string;
  status: 'healthy' | 'degraded' | 'failed' | 'maintenance';
  metrics: {
    uptime: number;
    responseTime: number;
    errorRate: number;
    taskSuccessRate: number;
  };
  lastActive?: Date;
  issues?: string[];
}

/**
 * Health alert
 */
export interface HealthAlert {
  agentId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'performance' | 'availability' | 'error' | 'resource';
  message: string;
  detectedAt: Date;
}

/**
 * AR incident
 */
export interface ARIncident {
  id: string;
  organizationId: string;
  type: 'outage' | 'degradation' | 'error' | 'security' | 'resource';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  affectedAgents: string[];
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  detectedAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Incident resolution
 */
export interface IncidentResolution {
  incidentId: string;
  resolution: string;
  actions: string[];
  preventionMeasures?: string[];
  resolvedAt: Date;
  resolvedBy: string;
  followUp?: string[];
}

/**
 * Agent lifecycle action
 */
export interface LifecycleAction {
  type: 'hire' | 'retire' | 'reassign' | 'upgrade' | 'downgrade';
  agentId?: string;
  positionId?: string;
  reason: string;
  effectiveDate?: Date;
  metadata?: Record<string, any>;
}

/**
 * Maintenance window
 */
export interface MaintenanceWindow {
  id?: string;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  affectedAgents?: string[];
  impactScope: ImpactScope;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
}

// =============================================================================
// AR Analyst Types
// =============================================================================

/**
 * Performance report
 */
export interface PerformanceReport {
  period: ReportPeriod;
  startDate: Date;
  endDate: Date;
  organizationId: string;
  agentMetrics: AgentPerformanceMetrics[];
  departmentMetrics: DepartmentPerformanceMetrics[];
  topPerformers: string[];
  needsImprovement: string[];
  recommendations: string[];
}

/**
 * Agent performance metrics
 */
export interface AgentPerformanceMetrics {
  agentId: string;
  positionId?: string;
  tasksCompleted: number;
  successRate: number;
  averageCompletionTime: number;
  costEfficiency: number;
  utilizationRate: number;
  qualityScore: number;
}

/**
 * Department performance metrics
 */
export interface DepartmentPerformanceMetrics {
  departmentId: string;
  totalAgents: number;
  totalTasks: number;
  averageSuccessRate: number;
  totalCost: number;
  utilization: number;
}

/**
 * Cost optimization opportunity
 */
export interface CostOptimization {
  type: 'model_downgrade' | 'consolidation' | 'scheduling' | 'workflow';
  description: string;
  estimatedSavings: number;
  impact: ImpactScope;
  affectedAgents?: string[];
  implementationSteps: string[];
  risks: string[];
  confidence: number;
}

/**
 * Workload analysis
 */
export interface WorkloadAnalysis {
  organizationId: string;
  period: ReportPeriod;
  patterns: WorkloadPattern[];
  peakHours: { hour: number; load: number }[];
  recommendations: string[];
}

/**
 * Workload pattern
 */
export interface WorkloadPattern {
  name: string;
  description: string;
  frequency: string;
  affectedAgents: string[];
  optimization?: string;
}

/**
 * Agent benchmarks
 */
export interface AgentBenchmarks {
  organizationId: string;
  period: ReportPeriod;
  benchmarks: {
    agentId: string;
    positionId?: string;
    metrics: Record<string, number>;
    percentile: number;
    comparison: 'above_average' | 'average' | 'below_average';
  }[];
  industryComparison?: Record<string, number>;
}

// =============================================================================
// AR Coach Types
// =============================================================================

/**
 * Onboarding plan for new agent
 */
export interface OnboardingPlan {
  agentId: string;
  positionId: string;
  startDate: Date;
  estimatedDuration: number; // days
  phases: OnboardingPhase[];
  checkpoints: OnboardingCheckpoint[];
  resources: string[];
}

/**
 * Onboarding phase
 */
export interface OnboardingPhase {
  name: string;
  description: string;
  duration: number; // days
  tasks: string[];
  successCriteria: string[];
}

/**
 * Onboarding checkpoint
 */
export interface OnboardingCheckpoint {
  day: number;
  milestone: string;
  assessment?: string;
  status: 'pending' | 'completed' | 'failed';
}

/**
 * Skill assessment
 */
export interface SkillAssessment {
  agentId: string;
  assessmentDate: Date;
  skills: SkillEvaluation[];
  overallScore: number;
  gaps: SkillGap[];
  strengths: string[];
  recommendations: string[];
}

/**
 * Skill evaluation
 */
export interface SkillEvaluation {
  skill: string;
  level: 'novice' | 'intermediate' | 'advanced' | 'expert';
  score: number; // 0-100
  evidence: string[];
}

/**
 * Skill gap
 */
export interface SkillGap {
  skill: string;
  currentLevel: string;
  requiredLevel: string;
  priority: 'low' | 'medium' | 'high';
  impact: string;
}

/**
 * Training plan
 */
export interface TrainingPlan {
  agentId: string;
  createdDate: Date;
  targetCompletionDate: Date;
  modules: TrainingModule[];
  estimatedDuration: number; // hours
  status: 'planned' | 'in_progress' | 'completed';
}

/**
 * Training module
 */
export interface TrainingModule {
  id: string;
  skill: string;
  name: string;
  description: string;
  duration: number; // hours
  materials: string[];
  exercises?: string[];
  assessment?: string;
  status: 'pending' | 'in_progress' | 'completed';
}

// =============================================================================
// AR Services Interface
// =============================================================================

/**
 * Common services available to all meta-agents
 */
export interface ARServices {
  organizationId: string;
  // Add service references as they're implemented
  // departmentService?: ARDepartmentService;
  // positionService?: ARPositionService;
  // assignmentService?: ARAssignmentService;
  // costService?: ARCostService;
  // approvalService?: ARApprovalService;
  // schedulingService?: ARSchedulingService;
}
