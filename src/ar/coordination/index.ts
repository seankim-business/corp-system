/**
 * AR Coordination Module
 *
 * Real-time event-driven coordination system for agent collaboration.
 * Exports the coordination engine and all related components.
 */

export {
  CoordinationEngine,
  ARCoordinationEventBus,
  AgentCoordinationStateMachine,
  NegotiationService,
  ARDirectorDecisionEngine,
} from './coordination-engine';

export type { EventHandler, AgentCoordinationContext } from './coordination-engine';

// Priority Optimizer
export {
  PriorityOptimizerService,
  priorityOptimizerService,
  type PriorityFactor,
  type TaskPriorityScore,
  type PriorityOptimizationResult,
  type OptimizationConfig,
} from './priority-optimizer.service';

// Issue Detector
export {
  IssueDetectorService,
  issueDetectorService,
  type IssueSeverity,
  type IssueCategory,
  type DetectedIssue,
  type IssueDetectionResult,
  type DetectionThresholds,
} from './issue-detector.service';

// Workload Rebalancer
export {
  WorkloadRebalancerService,
  workloadRebalancerService,
  type RebalanceTrigger,
  type RebalanceAction,
  type WorkloadSnapshot,
  type RebalanceChange,
  type RebalanceProposal,
  type RebalanceConfig,
} from './workload-rebalancer.service';
