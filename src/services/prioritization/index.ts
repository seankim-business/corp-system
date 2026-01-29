/**
 * Task Prioritization Service
 * AI-powered task prioritization using urgency, importance, dependencies, and user patterns.
 */

// Urgency scoring
export {
  calculateUrgencyScore,
  calculateBatchUrgencyScores,
  getUrgencyTierThreshold,
  type UrgencyScoreResult,
  type UrgencyTier,
} from "./urgency-scorer";

// Importance scoring
export {
  calculateImportanceScore,
  calculateBatchImportanceScores,
  type ImportanceScoreResult,
  type ImportanceTier,
  type ImportanceFactor,
} from "./importance-scorer";

// Dependency analysis
export {
  analyzeDependencies,
  analyzeBatchDependencies,
  findCriticalPathTasks,
  type DependencyScoreResult,
  type TaskDependency,
  type CriticalPathPosition,
} from "./dependency-analyzer";

// Pattern analysis
export {
  analyzeUserPatterns,
  calculatePatternScore,
  calculateBatchPatternScores,
  type PatternScoreResult,
  type UserPattern,
  type PatternType,
  type TimeSlot,
} from "./pattern-analyzer";

// Priority calculation
export {
  PriorityCalculator,
  getPriorityCalculator,
  calculateTaskPriority,
  getPrioritizedTasks,
  suggestNextTask,
  type TaskPriority,
  type Recommendation,
} from "./priority-calculator";

// Recommendation engine
export {
  generateRecommendation,
  getPrioritizedTaskList,
  getFocusRecommendation,
  batchGenerateRecommendations,
  type TaskRecommendation,
  type AlternativeAction,
  type ContextFactor,
  type PrioritizedTaskList,
  type FocusRecommendation,
} from "./recommendation-engine";
