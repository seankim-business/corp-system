/**
 * Pattern Detection Types
 * Types for action event collection, pattern detection, and SOP draft generation
 */

// ============================================================================
// ACTION EVENT TYPES
// ============================================================================

export type ActionType = "agent_call" | "workflow_run" | "tool_use" | "approval";

export interface ActionEvent {
  id: string;
  organizationId: string;
  userId: string;
  sessionId: string;
  timestamp: Date;

  actionType: ActionType;
  agentId?: string;
  workflowId?: string;
  toolName?: string;

  originalRequest?: string;
  parameters?: Record<string, unknown>;

  success: boolean;
  duration: number;

  previousActionId?: string;
  sequencePosition: number;
}

export interface ActionSequence {
  sessionId: string;
  userId: string;
  organizationId: string;
  actions: ActionEvent[];
  startTime: Date;
  endTime: Date;
  duration: number;
}

// ============================================================================
// SEQUENCE PATTERN TYPES
// ============================================================================

export interface SequencePattern {
  id: string;
  sequence: string[]; // ['agent:brand', 'tool:notion_create', 'agent:finance']
  frequency: number;
  confidence: number;
  users: string[];
  avgDuration: number;

  firstSeen: Date;
  lastSeen: Date;

  sopCandidate: boolean;
  sopDraftId?: string;
}

export interface SequenceMiningOptions {
  minSupport: number; // Minimum frequency (e.g., 3)
  minLength: number; // Minimum sequence length (e.g., 2)
  maxLength: number; // Maximum sequence length (e.g., 10)
  maxGap: number; // Max time gap between actions (hours)
}

// ============================================================================
// REQUEST CLUSTER TYPES
// ============================================================================

export interface ClusteredRequest {
  id: string;
  text: string;
  embedding: number[];
  userId: string;
  timestamp: Date;
  distance: number;
}

export interface RequestCluster {
  id: string;
  centroid: string;
  requests: ClusteredRequest[];
  size: number;

  commonIntent: string;
  commonEntities: string[];
  commonAgent: string;

  automatable: boolean;
  suggestedSOP?: SOPDraft;
}

export interface ClusteringOptions {
  minClusterSize: number;
  similarityThreshold: number;
}

// ============================================================================
// TIME PATTERN TYPES
// ============================================================================

export type TimePatternType = "daily" | "weekly" | "monthly" | "quarterly";

export interface TimePattern {
  id: string;
  type: TimePatternType;
  description: string;

  dayOfWeek?: number; // 0-6 for weekly (0 = Sunday)
  dayOfMonth?: number; // 1-31 for monthly
  hourOfDay?: number; // 0-23
  minute?: number; // 0-59

  actionPattern: SequencePattern;

  occurrences: number;
  confidence: number;
}

export interface TimePatternOptions {
  minOccurrences: number;
  toleranceHours: number;
}

// ============================================================================
// SOP DRAFT TYPES
// ============================================================================

export type SOPDraftStatus = "draft" | "pending_review" | "approved" | "rejected";
export type SOPStepType = "automated" | "manual" | "approval";
export type PatternSourceType = "sequence" | "cluster" | "time";

export interface SOPDraftStep {
  id: string;
  name: string;
  type: SOPStepType;
  agentId?: string;
  toolName?: string;
  description: string;
  config?: Record<string, unknown>;
  requiredApprovers?: string[];
  timeoutMinutes?: number;
  skippable?: boolean;
}

export interface SOPDraft {
  id: string;
  organizationId: string;
  status: SOPDraftStatus;

  name: string;
  description: string;
  function: string;

  steps: SOPDraftStep[];

  sourcePatternId: string;
  sourceType: PatternSourceType;
  confidence: number;

  generatedAt: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
  rejectionReason?: string;
}

// ============================================================================
// DETECTED PATTERN TYPES
// ============================================================================

export type PatternType = "sequence" | "cluster" | "time";
export type PatternStatus = "active" | "dismissed" | "converted";

export interface DetectedPattern {
  id: string;
  organizationId: string;
  type: PatternType;
  data: SequencePattern | RequestCluster | TimePattern;
  frequency: number;
  confidence: number;
  status: PatternStatus;
  sopDraftId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// ANALYSIS RESULT TYPES
// ============================================================================

export interface PatternAnalysisResult {
  organizationId: string;
  analyzedAt: Date;
  lookbackDays: number;

  sequencePatterns: SequencePattern[];
  requestClusters: RequestCluster[];
  timePatterns: TimePattern[];

  sopCandidates: DetectedPattern[];
  totalActionsAnalyzed: number;
  totalSequencesFound: number;
}

export interface PatternScoreFactors {
  frequency: number;
  consistency: number;
  userDiversity: number;
  timeSavings: number;
  complexity: number;
}

// ============================================================================
// SERVICE CONFIGURATION
// ============================================================================

export interface PatternDetectorConfig {
  sequence: SequenceMiningOptions;
  clustering: ClusteringOptions;
  time: TimePatternOptions;
  minConfidenceForSOP: number;
  embeddingModel?: string;
}

export const DEFAULT_CONFIG: PatternDetectorConfig = {
  sequence: {
    minSupport: 3,
    minLength: 2,
    maxLength: 10,
    maxGap: 24, // hours
  },
  clustering: {
    minClusterSize: 3,
    similarityThreshold: 0.8,
  },
  time: {
    minOccurrences: 3,
    toleranceHours: 2,
  },
  minConfidenceForSOP: 0.7,
};

// ============================================================================
// API TYPES
// ============================================================================

export interface CreateActionEventInput {
  organizationId: string;
  userId: string;
  sessionId: string;
  actionType: ActionType;
  agentId?: string;
  workflowId?: string;
  toolName?: string;
  originalRequest?: string;
  parameters?: Record<string, unknown>;
  success?: boolean;
  duration?: number;
  previousActionId?: string;
  sequencePosition?: number;
}

export interface PatternFilterOptions {
  type?: PatternType;
  status?: PatternStatus;
  minConfidence?: number;
  limit?: number;
  offset?: number;
}

export interface SOPDraftFilterOptions {
  status?: SOPDraftStatus;
  limit?: number;
  offset?: number;
}

export interface AnalyzeOptions {
  lookbackDays: number;
  minSupport?: number;
  generateDrafts?: boolean;
}
