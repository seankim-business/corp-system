/**
 * AR Meta-Agents Module
 *
 * Specialized meta-agents for AR system management:
 * - AR Ops Manager: Daily operations, escalations, health monitoring
 * - AR Analyst: Performance analysis, trends, reporting
 * - AR Coach: Development guidance, feedback, career growth
 */

export {
  AROpsManagerAgent,
  createAROpsManager,
  type OpsAction,
  type OpsReport,
  type HealthCheckResult,
} from './ar-ops-manager.agent';

export {
  ARAnalystAgent,
  createARAnalyst,
  type PerformanceTrend,
  type DepartmentAnalysis,
  type AgentPerformanceAnalysis,
  type AnalyticsReport,
} from './ar-analyst.agent';

export {
  ARCoachAgent,
  createARCoach,
  type SkillAssessment,
  type DevelopmentGoal,
  type PerformanceFeedback,
  type DevelopmentPlan,
  type CoachingSession,
} from './ar-coach.agent';
