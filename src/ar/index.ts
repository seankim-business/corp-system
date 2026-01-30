/**
 * AR (Agent Resource) Management System
 *
 * Enterprise-grade Agent Resource management that mirrors human HR practices
 * but adapted for AI agents.
 *
 * @module ar
 */

// Types - Main source of truth for all types
export * from './types';

// Error classes
export * from './errors';

// Organization Services - export services and service-specific types only
export {
  ARDepartmentService,
  arDepartmentService,
  type DepartmentFilters,
  type DepartmentHierarchyNode,
  type DateRange as DepartmentDateRange,
  type CostSummary as DepartmentCostSummary,
} from './organization/ar-department.service';

export {
  ARPositionService,
  arPositionService,
  type PositionFilters,
} from './organization/ar-position.service';

export {
  ARAssignmentService,
  arAssignmentService,
  type AssignmentFilters,
} from './organization/ar-assignment.service';

export {
  ARHierarchyService,
  arHierarchyService,
} from './organization/ar-hierarchy.service';

export {
  ARCostService,
  arCostService,
  type CostType,
  type CostSummary,
  type CostTrend,
  type BudgetStatus,
  type RecordCostInput,
  type DateRange,
} from './organization/ar-cost.service';

// Approval Services - export services and service-specific types only
export {
  ARApprovalService,
  arApprovalService,
  type ApprovalLevel as ARApprovalLevel,
  type ApprovalStatus as ARApprovalStatus,
  type RequestType as ARRequestType,
  type RequesterType as ARRequesterType,
  type ARApprovalRequest,
  type ApproverChainEntry,
  type ApprovalResponse,
  type ApproverChain,
  type ApprovalFilters,
} from './approval/ar-approval.service';

// Coordination Services
export * from './coordination';

// Scheduling Services - export classes only (no singleton instances)
export {
  AvailabilityService,
  CapacityService,
  MeetingSchedulerService,
  LeaveManagerService,
} from './scheduling';

// Template Services
export {
  IndustryTemplateService,
  industryTemplateService,
  type ARIndustryTemplateCreateInput,
  type TemplateFilters,
} from './templates/industry-template.service';

// Template Matching and Composition
export {
  TemplateMatcherService,
  templateMatcherService,
  type OrganizationProfile,
  type TemplateMatchScore,
  type MatchResult,
} from './templates/template-matcher.service';

export {
  TeamComposerService,
  teamComposerService,
  type TeamCompositionRequest,
  type AgentCandidate,
  type PositionAssignment,
  type SkillGap,
  type TeamComposition,
} from './templates/team-composer.service';

export {
  RecommendationEngineService,
  recommendationEngineService,
  type RecommendationType,
  type Recommendation,
  type RecommendedAction,
  type RecommendationContext,
  type RecommendationResult,
} from './templates/recommendation-engine.service';

// Meta-Agent Services
export {
  AROpsManagerAgent,
  createAROpsManager,
  type OpsAction,
  type OpsReport,
  type HealthCheckResult,
} from './meta-agents/ar-ops-manager.agent';

export {
  ARAnalystAgent,
  createARAnalyst,
  type PerformanceTrend,
  type DepartmentAnalysis,
  type AgentPerformanceAnalysis,
  type AnalyticsReport,
} from './meta-agents/ar-analyst.agent';

export {
  ARCoachAgent,
  createARCoach,
  type SkillAssessment,
  type DevelopmentGoal,
  type PerformanceFeedback,
  type DevelopmentPlan,
  type CoachingSession,
} from './meta-agents/ar-coach.agent';
