/**
 * Feature Request Pipeline
 *
 * Automated capture, analysis, and integration of fragmented feature requests
 * from multiple channels (Slack, Web, Notion, Email).
 *
 * Main orchestration service that coordinates:
 * - Multi-channel intake
 * - AI-powered analysis
 * - Duplicate detection and merging
 * - Priority calculation
 * - Event emission for downstream processing
 */
import { db } from "../../../db/client";
import { logger } from "../../../utils/logger";
import { valueStreamQueue } from "../../../queue/value-stream.queue";
import {
  FeatureRequestCapture,
  FeatureRequestPipelineConfig,
  DEFAULT_PIPELINE_CONFIG,
  FeatureAnalysis,
  PriorityCalculation,
  BusinessContext,
  DeduplicationResult,
  SlackCaptureData,
  WebCaptureData,
  NotionCaptureData,
  EmailCaptureData,
  FeatureRequestEventType,
  FeatureRequestSource,
} from "./types";
import {
  captureFromSlack,
  captureFromWeb,
  captureFromNotion,
  captureFromEmail,
  createFeatureRequest,
  getFeatureRequestById,
} from "./capture.service";
import {
  FeatureRequestAnalyzerService,
  getAnalyzerService,
} from "./analyzer.service";
import {
  FeatureRequestDeduplicationService,
  getDeduplicationService,
} from "./deduplication.service";

// Re-export all types
export * from "./types";

// Re-export capture functions
export {
  captureFromSlack,
  captureFromWeb,
  captureFromNotion,
  captureFromEmail,
  createFeatureRequest,
  getFeatureRequestById,
  getFeatureRequestsByOrganization,
} from "./capture.service";

// Re-export analyzer service
export { FeatureRequestAnalyzerService, getAnalyzerService } from "./analyzer.service";

// Re-export deduplication service
export { FeatureRequestDeduplicationService, getDeduplicationService } from "./deduplication.service";

// Re-export feature analyzer agent
export * from "./feature-analyzer.agent";

/**
 * Captured request data
 */
export interface CapturedRequest {
  id: string;
  source: FeatureRequestSource;
  sourceRef: string;
  rawContent: string;
  requesterId?: string;
  organizationId: string;
  status: string;
  createdAt: Date;
}

/**
 * Result of analyzing intent
 */
export interface AnalyzeIntentResult {
  analysis: FeatureAnalysis;
  needsClarification: boolean;
  clarificationQuestions?: string[];
}

/**
 * Result of processing a feature request through the pipeline
 */
export interface PipelineProcessResult {
  requestId: string;
  status: "created" | "merged" | "linked" | "error";
  analysis?: FeatureAnalysis;
  priority?: PriorityCalculation;
  deduplication?: DeduplicationResult;
  needsClarification: boolean;
  clarificationQuestions?: string[];
  error?: string;
}

/**
 * Main Feature Request Pipeline Service
 *
 * Orchestrates the full lifecycle of feature request processing:
 * 1. Capture from various channels
 * 2. Analyze intent and map to modules
 * 3. Detect and handle duplicates
 * 4. Calculate priority
 * 5. Emit events for downstream processing
 */
export class FeatureRequestPipelineService {
  private config: FeatureRequestPipelineConfig;
  private analyzerService: FeatureRequestAnalyzerService;
  private deduplicationService: FeatureRequestDeduplicationService;

  constructor(config: Partial<FeatureRequestPipelineConfig> = {}) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
    this.analyzerService = getAnalyzerService(this.config);
    this.deduplicationService = getDeduplicationService(this.config);
  }

  /**
   * Process a feature request from Slack
   */
  async processFromSlack(
    organizationId: string,
    requesterId: string | undefined,
    data: SlackCaptureData
  ): Promise<PipelineProcessResult> {
    logger.info("Processing feature request from Slack", {
      organizationId,
      channelId: data.channelId,
    });

    const result = await captureFromSlack(organizationId, requesterId, data);
    if (!result.success) {
      return {
        requestId: "",
        status: "error",
        needsClarification: false,
        error: result.error,
      };
    }

    const request = await getFeatureRequestById(result.id);
    if (!request) {
      return {
        requestId: result.id,
        status: "error",
        needsClarification: false,
        error: "Failed to retrieve created request",
      };
    }

    return this.processRequest({
      id: request.id,
      source: request.source as FeatureRequestSource,
      sourceRef: request.sourceRef || "",
      rawContent: request.rawContent,
      requesterId: request.requesterId || undefined,
      organizationId: request.organizationId,
      status: request.status,
      createdAt: request.createdAt,
    });
  }

  /**
   * Process a feature request from web form
   */
  async processFromWeb(
    organizationId: string,
    requesterId: string | undefined,
    data: WebCaptureData
  ): Promise<PipelineProcessResult> {
    logger.info("Processing feature request from web", {
      organizationId,
      title: data.title,
    });

    const result = await captureFromWeb(organizationId, requesterId, data);
    if (!result.success) {
      return {
        requestId: "",
        status: "error",
        needsClarification: false,
        error: result.error,
      };
    }

    const request = await getFeatureRequestById(result.id);
    if (!request) {
      return {
        requestId: result.id,
        status: "error",
        needsClarification: false,
        error: "Failed to retrieve created request",
      };
    }

    return this.processRequest({
      id: request.id,
      source: request.source as FeatureRequestSource,
      sourceRef: request.sourceRef || "",
      rawContent: request.rawContent,
      requesterId: request.requesterId || undefined,
      organizationId: request.organizationId,
      status: request.status,
      createdAt: request.createdAt,
    });
  }

  /**
   * Process a feature request from Notion
   */
  async processFromNotion(
    organizationId: string,
    requesterId: string | undefined,
    data: NotionCaptureData
  ): Promise<PipelineProcessResult> {
    logger.info("Processing feature request from Notion", {
      organizationId,
      pageId: data.pageId,
    });

    const result = await captureFromNotion(organizationId, requesterId, data);
    if (!result.success) {
      return {
        requestId: "",
        status: "error",
        needsClarification: false,
        error: result.error,
      };
    }

    const request = await getFeatureRequestById(result.id);
    if (!request) {
      return {
        requestId: result.id,
        status: "error",
        needsClarification: false,
        error: "Failed to retrieve created request",
      };
    }

    return this.processRequest({
      id: request.id,
      source: request.source as FeatureRequestSource,
      sourceRef: request.sourceRef || "",
      rawContent: request.rawContent,
      requesterId: request.requesterId || undefined,
      organizationId: request.organizationId,
      status: request.status,
      createdAt: request.createdAt,
    });
  }

  /**
   * Process a feature request from email
   */
  async processFromEmail(
    organizationId: string,
    requesterId: string | undefined,
    data: EmailCaptureData
  ): Promise<PipelineProcessResult> {
    logger.info("Processing feature request from email", {
      organizationId,
      subject: data.subject,
    });

    const result = await captureFromEmail(organizationId, requesterId, data);
    if (!result.success) {
      return {
        requestId: "",
        status: "error",
        needsClarification: false,
        error: result.error,
      };
    }

    const request = await getFeatureRequestById(result.id);
    if (!request) {
      return {
        requestId: result.id,
        status: "error",
        needsClarification: false,
        error: "Failed to retrieve created request",
      };
    }

    return this.processRequest({
      id: request.id,
      source: request.source as FeatureRequestSource,
      sourceRef: request.sourceRef || "",
      rawContent: request.rawContent,
      requesterId: request.requesterId || undefined,
      organizationId: request.organizationId,
      status: request.status,
      createdAt: request.createdAt,
    });
  }

  /**
   * Process a generic feature request capture
   */
  async processCapture(data: FeatureRequestCapture): Promise<PipelineProcessResult> {
    logger.info("Processing feature request capture", {
      organizationId: data.organizationId,
      source: data.source,
    });

    const result = await createFeatureRequest(data);
    if (!result.success) {
      return {
        requestId: "",
        status: "error",
        needsClarification: false,
        error: result.error,
      };
    }

    const request = await getFeatureRequestById(result.id);
    if (!request) {
      return {
        requestId: result.id,
        status: "error",
        needsClarification: false,
        error: "Failed to retrieve created request",
      };
    }

    return this.processRequest({
      id: request.id,
      source: request.source as FeatureRequestSource,
      sourceRef: request.sourceRef || "",
      rawContent: request.rawContent,
      requesterId: request.requesterId || undefined,
      organizationId: request.organizationId,
      status: request.status,
      createdAt: request.createdAt,
    });
  }

  /**
   * Process an already-captured request through analysis and deduplication
   */
  private async processRequest(captured: CapturedRequest): Promise<PipelineProcessResult> {
    const { id: requestId, organizationId, rawContent } = captured;

    try {
      // Emit creation event
      await this.emitEvent("request.created", requestId, organizationId, {
        source: captured.source,
        requesterId: captured.requesterId,
      });

      // Step 1: Check for duplicates
      logger.info("Checking for duplicates", { requestId });
      const deduplication = await this.deduplicationService.checkForDuplicates(
        organizationId,
        requestId,
        rawContent
      );

      // Handle auto-merge case
      if (deduplication.action === "auto-merge" && deduplication.primaryRequestId) {
        const mergeResult = await this.deduplicationService.mergeRequests(
          deduplication.primaryRequestId,
          [requestId]
        );

        if (mergeResult.success) {
          await this.emitEvent("request.merged", requestId, organizationId, {
            primaryRequestId: deduplication.primaryRequestId,
            newRequestCount: mergeResult.newRequestCount,
          });

          return {
            requestId,
            status: "merged",
            deduplication,
            needsClarification: false,
          };
        }
      }

      // Handle link-related case
      if (deduplication.action === "link-related" && deduplication.similarRequests.length > 0) {
        await this.deduplicationService.autoLinkSimilarRequests(
          requestId,
          deduplication.similarRequests
        );

        await this.emitEvent("request.linked", requestId, organizationId, {
          linkedRequestIds: deduplication.similarRequests.map((r) => r.requestId),
        });
      }

      // Step 2: Analyze intent
      logger.info("Analyzing request intent", { requestId });
      const analysisResult = await this.analyzerService.analyzeIntent({
        rawContent,
        organizationId,
      });

      // Step 3: Map to modules
      const moduleMappings = await this.analyzerService.mapToModules(
        analysisResult.analysis,
        organizationId
      );

      // Update analysis with mapped modules
      analysisResult.analysis.relatedModules = moduleMappings.map((m) => m.moduleId);

      // Step 4: Calculate priority
      const businessContext: BusinessContext = {
        organizationId,
        activeModules: moduleMappings.map((m) => m.moduleId),
      };

      const priority = await this.analyzerService.calculatePriority(
        requestId,
        analysisResult.analysis,
        businessContext
      );

      // Step 5: Update request with analysis results
      await this.analyzerService.updateRequestWithAnalysis(
        requestId,
        analysisResult.analysis,
        priority
      );

      // Emit analysis event
      await this.emitEvent("request.analyzed", requestId, organizationId, {
        confidence: analysisResult.analysis.confidence,
        relatedModules: analysisResult.analysis.relatedModules,
        priority: priority.priority,
        businessImpact: priority.businessImpact,
      });

      // Emit priority change event
      await this.emitEvent("request.priority-changed", requestId, organizationId, {
        priority: priority.priority,
        businessImpact: priority.businessImpact,
        score: priority.score,
      });

      logger.info("Feature request processed successfully", {
        requestId,
        confidence: analysisResult.analysis.confidence,
        priority: priority.priority,
        relatedModules: analysisResult.analysis.relatedModules,
      });

      return {
        requestId,
        status: deduplication.action === "link-related" ? "linked" : "created",
        analysis: analysisResult.analysis,
        priority,
        deduplication,
        needsClarification: analysisResult.needsClarification,
        clarificationQuestions: analysisResult.clarificationQuestions,
      };
    } catch (error) {
      logger.error(
        "Failed to process feature request",
        { requestId, organizationId },
        error instanceof Error ? error : new Error(String(error))
      );

      return {
        requestId,
        status: "error",
        needsClarification: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Re-analyze an existing request
   */
  async reanalyzeRequest(requestId: string): Promise<PipelineProcessResult> {
    logger.info("Re-analyzing feature request", { requestId });

    const request = await db.featureRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new Error(`Feature request not found: ${requestId}`);
    }

    return this.processRequest({
      id: request.id,
      source: request.source as FeatureRequestSource,
      sourceRef: request.sourceRef || "",
      rawContent: request.rawContent,
      requesterId: request.requesterId || undefined,
      organizationId: request.organizationId,
      status: request.status,
      createdAt: request.createdAt,
    });
  }

  /**
   * Update request status and emit event
   */
  async updateStatus(
    requestId: string,
    newStatus: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    logger.info("Updating feature request status", {
      requestId,
      newStatus,
    });

    const request = await db.featureRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new Error(`Feature request not found: ${requestId}`);
    }

    const previousStatus = request.status;

    await db.featureRequest.update({
      where: { id: requestId },
      data: { status: newStatus },
    });

    await this.emitEvent("request.status-changed", requestId, request.organizationId, {
      previousStatus,
      newStatus,
      ...metadata,
    });

    logger.info("Feature request status updated", {
      requestId,
      previousStatus,
      newStatus,
    });
  }

  /**
   * Get pipeline statistics for an organization
   */
  async getStatistics(organizationId: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<number, number>;
    bySource: Record<string, number>;
    recentActivity: { date: string; count: number }[];
  }> {
    const requests = await db.featureRequest.findMany({
      where: { organizationId },
      select: {
        status: true,
        priority: true,
        source: true,
        createdAt: true,
      },
    });

    const byStatus: Record<string, number> = {};
    const byPriority: Record<number, number> = {};
    const bySource: Record<string, number> = {};
    const byDate: Record<string, number> = {};

    for (const request of requests) {
      byStatus[request.status] = (byStatus[request.status] || 0) + 1;
      byPriority[request.priority] = (byPriority[request.priority] || 0) + 1;
      bySource[request.source] = (bySource[request.source] || 0) + 1;

      const dateKey = request.createdAt.toISOString().split("T")[0];
      byDate[dateKey] = (byDate[dateKey] || 0) + 1;
    }

    // Get recent activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentActivity = Object.entries(byDate)
      .filter(([date]) => new Date(date) >= thirtyDaysAgo)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    return {
      total: requests.length,
      byStatus,
      byPriority,
      bySource,
      recentActivity,
    };
  }

  /**
   * Emit event to value stream queue
   */
  private async emitEvent(
    eventType: FeatureRequestEventType,
    requestId: string,
    organizationId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    try {
      // Emit to value stream queue with feature-request prefix
      await valueStreamQueue.emit({
        eventType: `artifact.${eventType.replace("request.", "")}` as any,
        organizationId,
        moduleId: "feature-request-pipeline",
        artifactId: requestId,
        data: {
          ...data,
          // Store feature request event details in standard data fields
          previousStatus: (data as any).previousStatus,
          newStatus: (data as any).newStatus,
        },
        timestamp: new Date(),
      });

      logger.debug("Feature request event emitted", {
        eventType,
        requestId,
        organizationId,
      });
    } catch (error) {
      // Log but don't fail the operation
      logger.warn("Failed to emit feature request event", {
        eventType,
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// Singleton instance
let pipelineServiceInstance: FeatureRequestPipelineService | null = null;

export function getFeatureRequestPipeline(
  config?: Partial<FeatureRequestPipelineConfig>
): FeatureRequestPipelineService {
  if (!pipelineServiceInstance) {
    pipelineServiceInstance = new FeatureRequestPipelineService(config);
  }
  return pipelineServiceInstance;
}

// Default export for convenience
export default FeatureRequestPipelineService;
