// Feedback Service Module
// Provides feedback collection, processing, categorization, and improvement recommendations

export {
  collectFeedback,
  collectRating,
  collectReaction,
  collectCorrection,
  recordImplicitSignal,
  handleSlackReaction,
  type CollectFeedbackParams,
  type CorrectionData,
  type ImplicitSignal,
} from "./collector";

export {
  processFeedback,
  batchProcess,
  identifyPatterns,
  type FeedbackCategory,
  type RootCause,
  type ProcessedFeedback,
  type FeedbackPattern,
} from "./processor";

export {
  categorizeFeedback,
  analyzeCorrection,
  type CorrectionAnalysis,
} from "./categorizer";

export {
  recommendActions,
  prioritizeActions,
  saveRecommendedActions,
  type FeedbackAction,
} from "./action-recommender";

export {
  validateImprovement,
  applyAutoImprovements,
  rollbackIfNeeded,
  getImprovementStats,
  type ApplyResult,
  type ValidationResult,
} from "./auto-improver";
