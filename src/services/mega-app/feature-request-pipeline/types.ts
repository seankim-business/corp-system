/**
 * Feature Request Pipeline Types
 *
 * Type definitions for the multi-channel feature request capture and analysis system.
 */

// =============================================================================
// Source Types
// =============================================================================

export type FeatureRequestSource = "slack" | "web" | "notion" | "email";

export type FeatureRequestStatus =
  | "new"
  | "analyzing"
  | "backlog"
  | "planning"
  | "developing"
  | "released"
  | "merged"
  | "rejected";

export type FeatureRequestPriority = 0 | 1 | 2 | 3; // 0=Critical, 1=High, 2=Medium, 3=Low

export type BusinessImpact = "critical" | "high" | "medium" | "low" | "unknown";

export type LinkType =
  | "duplicate"
  | "related"
  | "depends-on"
  | "conflicts-with"
  | "enhances";

// =============================================================================
// Capture Types
// =============================================================================

/**
 * Raw feature request capture from any channel
 */
export interface FeatureRequestCapture {
  source: FeatureRequestSource;
  sourceRef: string;
  rawContent: string;
  requesterId?: string;
  organizationId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Slack-specific capture data
 */
export interface SlackCaptureData {
  channelId: string;
  channelName?: string;
  messageTs: string;
  threadTs?: string;
  userId: string;
  userName?: string;
  text: string;
  reactions?: string[];
  threadContext?: SlackThreadMessage[];
}

export interface SlackThreadMessage {
  userId: string;
  text: string;
  ts: string;
}

/**
 * Web form capture data
 */
export interface WebCaptureData {
  title: string;
  description: string;
  category?: string;
  urgency?: "low" | "medium" | "high";
  attachments?: string[];
  userId?: string;
  sessionId?: string;
  pageContext?: string;
}

/**
 * Notion page capture data
 */
export interface NotionCaptureData {
  pageId: string;
  title: string;
  properties: Record<string, unknown>;
  blocks: NotionBlock[];
  createdBy?: string;
  lastEditedBy?: string;
}

export interface NotionBlock {
  id: string;
  type: string;
  content: string;
}

/**
 * Email capture data
 */
export interface EmailCaptureData {
  messageId: string;
  from: string;
  subject: string;
  body: string;
  attachments?: EmailAttachment[];
  receivedAt: Date;
  replyTo?: string;
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  url?: string;
}

// =============================================================================
// Analysis Types
// =============================================================================

/**
 * AI-extracted feature analysis
 */
export interface FeatureAnalysis {
  coreIntent: string;
  specificFeature: string;
  problemStatement: string;
  successCriteria: string[];
  affectedWorkflows: string[];
  relatedModules: string[];
  confidence: number; // 0-100
  suggestedTitle?: string;
  suggestedTags?: string[];
}

/**
 * Module mapping result
 */
export interface ModuleMapping {
  moduleId: string;
  moduleName: string;
  confidence: number; // 0-1
  matchReasons: {
    keywords: boolean;
    workflows: boolean;
    semantic: boolean;
  };
}

/**
 * Priority calculation result
 */
export interface PriorityCalculation {
  priority: FeatureRequestPriority;
  businessImpact: BusinessImpact;
  score: number;
  factors: PriorityFactor[];
}

export interface PriorityFactor {
  name: string;
  weight: number;
  value: number;
  contribution: number;
  reason?: string;
}

// =============================================================================
// Deduplication Types
// =============================================================================

/**
 * Similar request match result
 */
export interface SimilarRequest {
  requestId: string;
  similarity: number; // 0-1
  status: FeatureRequestStatus;
  rawContent: string;
  analyzedIntent?: string;
  createdAt: Date;
  requestCount: number;
}

/**
 * Deduplication action recommendation
 */
export interface DeduplicationResult {
  action: "auto-merge" | "suggest-merge" | "link-related" | "no-action";
  primaryRequestId?: string;
  similarRequests: SimilarRequest[];
  reason: string;
}

/**
 * Merge operation result
 */
export interface MergeResult {
  success: boolean;
  primaryRequestId: string;
  mergedRequestIds: string[];
  newRequestCount: number;
  error?: string;
}

// =============================================================================
// Business Context Types
// =============================================================================

/**
 * Business context for priority calculation
 */
export interface BusinessContext {
  organizationId: string;
  currentQuarterPriorities?: string[];
  strategicGoals?: string[];
  activeModules?: string[];
  recentFeatures?: RecentFeature[];
  requesterMetadata?: RequesterMetadata;
}

export interface RecentFeature {
  moduleId: string;
  featureTitle: string;
  releasedAt: Date;
}

export interface RequesterMetadata {
  userId?: string;
  role?: string;
  department?: string;
  previousRequestCount?: number;
  previousRequestSuccessRate?: number;
}

// =============================================================================
// Event Types
// =============================================================================

export type FeatureRequestEventType =
  | "request.created"
  | "request.analyzed"
  | "request.merged"
  | "request.status-changed"
  | "request.priority-changed"
  | "request.linked";

export interface FeatureRequestEvent {
  eventType: FeatureRequestEventType;
  requestId: string;
  organizationId: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

// =============================================================================
// Service Configuration
// =============================================================================

export interface FeatureRequestPipelineConfig {
  /** Minimum similarity score for auto-merge (0-1) */
  autoMergeThreshold: number;
  /** Minimum similarity score for merge suggestion (0-1) */
  suggestMergeThreshold: number;
  /** Minimum similarity score for linking as related (0-1) */
  relatedThreshold: number;
  /** Minimum confidence for AI analysis to be accepted */
  analysisConfidenceThreshold: number;
  /** Enable automatic status transitions */
  autoStatusTransitions: boolean;
  /** Enable notification on new requests */
  notifyOnNewRequest: boolean;
}

export const DEFAULT_PIPELINE_CONFIG: FeatureRequestPipelineConfig = {
  autoMergeThreshold: 0.95,
  suggestMergeThreshold: 0.85,
  relatedThreshold: 0.7,
  analysisConfidenceThreshold: 70,
  autoStatusTransitions: true,
  notifyOnNewRequest: true,
};
