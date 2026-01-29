/**
 * Agent Optimizer Service
 *
 * Barrel export for all agent optimization functionality:
 * - A/B Testing (Experiment Manager)
 * - Prompt Optimization
 * - Routing Optimization
 * - Model Selection
 * - Cost Optimization
 */

// Experiment Manager
export {
  createExperiment,
  startExperiment,
  stopExperiment,
  cancelExperiment,
  getVariant,
  recordMetric,
  analyzeResults,
  promoteWinner,
  getExperiment,
  listExperiments,
  getExperimentVariants,
  type Experiment,
  type ExperimentVariant,
  type MetricData,
  type ExperimentResults,
  type VariantResults,
  type CreateExperimentParams,
} from "./experiment-manager";

// Prompt Optimizer
export {
  generateVariants,
  createPromptVariant,
  testPromptVariant,
  getBestPrompt,
  getPromptVariants,
  setActivePrompt,
  updatePromptMetrics,
  optimizeFromFeedback,
  type PromptVariant,
  type UserFeedback,
  type PromptGenerationOptions,
} from "./prompt-optimizer";

// Routing Optimizer
export {
  upsertRoutingRule,
  getRoutingRule,
  getRoutingRules,
  recordRoutingFeedback,
  analyzeMisroutes,
  suggestKeywords,
  suggestRemovals,
  expandKeywords,
  applyImprovements,
  getRoutingAnalysisSummary,
  type RoutingRule,
  type RoutingFeedback,
  type MisrouteAnalysis,
  type KeywordSuggestion,
} from "./routing-optimizer";

// Model Selector
export {
  getModelProfiles,
  getModelProfile,
  selectModel,
  learnOptimalModels,
  getModelPreference,
  analyzeTradeoffs,
  updateModelBenchmarks,
  type ModelProfile,
  type TaskProfile,
  type AgentModelPreference,
  type TradeoffAnalysis,
} from "./model-selector";

// Cost Optimizer
export {
  analyzeCosts,
  analyzeTokenEfficiency,
  calculatePotentialSavings,
  getDailyCostTrend,
  setCostAlert,
  type CostReduction,
  type CostAnalysis,
  type TokenEfficiencyAnalysis,
} from "./cost-optimizer";
