/**
 * Pattern Detector Service
 * Main orchestrator for pattern detection and SOP generation
 *
 * Coordinates:
 * - Action data collection
 * - Sequence mining (PrefixSpan)
 * - Request clustering
 * - Time pattern detection
 * - Pattern scoring
 * - SOP draft generation
 */

import { logger } from "../../utils/logger";
import { actionDataCollector, ActionDataCollector } from "./data-collector";
import { sequenceMiner, SequenceMiner } from "./sequence-miner";
import { requestClusterer, RequestClusterer } from "./request-clusterer";
import { timePatternDetector, TimePatternDetector } from "./time-pattern-detector";
import { patternScorer, PatternScorer } from "./pattern-scorer";
import { sopDrafter, SOPDrafter } from "./sop-drafter";
import type {
  AnalyzeOptions,
  DetectedPattern,
  PatternAnalysisResult,
  PatternDetectorConfig,
  PatternFilterOptions,
  RequestCluster,
  SequencePattern,
  SOPDraft,
  SOPDraftFilterOptions,
  TimePattern,
} from "./types";
import { DEFAULT_CONFIG } from "./types";

export class PatternDetector {
  private collector: ActionDataCollector;
  private sequenceMiner: SequenceMiner;
  private clusterer: RequestClusterer;
  private timeDetector: TimePatternDetector;
  private scorer: PatternScorer;
  private drafter: SOPDrafter;
  private config: PatternDetectorConfig;

  constructor(config: Partial<PatternDetectorConfig> = {}) {
    this.collector = actionDataCollector;
    this.sequenceMiner = sequenceMiner;
    this.clusterer = requestClusterer;
    this.timeDetector = timePatternDetector;
    this.scorer = patternScorer;
    this.drafter = sopDrafter;

    // Merge with default config
    this.config = {
      sequence: { ...DEFAULT_CONFIG.sequence, ...config.sequence },
      clustering: { ...DEFAULT_CONFIG.clustering, ...config.clustering },
      time: { ...DEFAULT_CONFIG.time, ...config.time },
      minConfidenceForSOP: config.minConfidenceForSOP ?? 0.7,
      embeddingModel: config.embeddingModel,
    };
  }

  /**
   * Run full pattern analysis for an organization
   */
  async analyze(organizationId: string, options: AnalyzeOptions): Promise<PatternAnalysisResult> {
    const startTime = Date.now();

    logger.info("Starting pattern analysis", {
      organizationId,
      lookbackDays: options.lookbackDays,
    });

    // 1. Get action sequences
    const sequences = await this.collector.getActionSequences(
      organizationId,
      this.config.sequence.minLength,
      options.lookbackDays,
    );

    const totalActions = sequences.reduce((sum, seq) => sum + seq.actions.length, 0);

    // 2. Mine frequent sequences
    const sequencePatterns = await this.sequenceMiner.mineSequences(sequences, {
      ...this.config.sequence,
      minSupport: options.minSupport ?? this.config.sequence.minSupport,
    });

    // 3. Cluster similar requests
    const requests = sequences
      .flatMap((seq) =>
        seq.actions
          .filter((a) => a.originalRequest)
          .map((a) => ({
            id: a.id,
            text: a.originalRequest!,
            userId: a.userId,
            timestamp: a.timestamp,
          })),
      );

    const requestClusters = await this.clusterer.clusterRequests(requests, this.config.clustering);

    // 4. Detect time patterns
    const timestampedPatterns = sequencePatterns.map((pattern) => ({
      pattern,
      timestamps: this.extractTimestamps(sequences, pattern.sequence),
    }));

    const timePatterns = await this.timeDetector.detectTimePatterns(
      timestampedPatterns,
      this.config.time,
    );

    // Add descriptions to time patterns
    for (const tp of timePatterns) {
      tp.description = this.timeDetector.generateDescription(tp);
    }

    // 5. Store detected patterns
    const detectedPatterns: DetectedPattern[] = [];

    // Store sequence patterns
    for (const sp of this.sequenceMiner.filterSOPCandidates(sequencePatterns)) {
      const detected = await this.storePattern(organizationId, "sequence", sp, sp.frequency, sp.confidence);
      detectedPatterns.push(detected);
    }

    // Store cluster patterns
    for (const cluster of requestClusters.filter((c) => c.automatable)) {
      const detected = await this.storePattern(
        organizationId,
        "cluster",
        cluster,
        cluster.size,
        cluster.automatable ? 0.7 : 0.5,
      );
      detectedPatterns.push(detected);
    }

    // Store time patterns
    for (const tp of timePatterns) {
      const detected = await this.storePattern(
        organizationId,
        "time",
        tp,
        tp.occurrences,
        tp.confidence,
      );
      detectedPatterns.push(detected);
    }

    // 6. Score and filter SOP candidates
    const sopCandidates = this.scorer.filterSOPCandidates(
      detectedPatterns,
      this.config.minConfidenceForSOP,
    );

    // 7. Generate SOP drafts if requested
    if (options.generateDrafts) {
      for (const candidate of sopCandidates) {
        try {
          await this.drafter.draftFromPattern(candidate, organizationId);
        } catch (error) {
          logger.warn("Failed to generate SOP draft", {
            patternId: candidate.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const duration = Date.now() - startTime;

    logger.info("Pattern analysis completed", {
      organizationId,
      duration,
      sequencePatterns: sequencePatterns.length,
      requestClusters: requestClusters.length,
      timePatterns: timePatterns.length,
      sopCandidates: sopCandidates.length,
    });

    return {
      organizationId,
      analyzedAt: new Date(),
      lookbackDays: options.lookbackDays,
      sequencePatterns,
      requestClusters,
      timePatterns,
      sopCandidates,
      totalActionsAnalyzed: totalActions,
      totalSequencesFound: sequences.length,
    };
  }

  /**
   * Get detected patterns for an organization
   */
  async getPatterns(
    _organizationId: string,
    _options: PatternFilterOptions = {},
  ): Promise<DetectedPattern[]> {
    // Database implementation commented out - requires DetectedPattern table
    // const patterns = await db.detectedPattern.findMany({
    //   where: {
    //     organizationId,
    //     ...(options.type && { type: options.type }),
    //     ...(options.status && { status: options.status }),
    //     ...(options.minConfidence && { confidence: { gte: options.minConfidence } }),
    //   },
    //   orderBy: { confidence: "desc" },
    //   skip: options.offset,
    //   take: options.limit,
    // });
    // return patterns.map(this.mapToDetectedPattern);
    return [];
  }

  /**
   * Get a single pattern by ID
   */
  async getPattern(_patternId: string): Promise<DetectedPattern | null> {
    // Database implementation commented out - requires DetectedPattern table
    // const pattern = await db.detectedPattern.findUnique({
    //   where: { id: patternId },
    // });
    // return pattern ? this.mapToDetectedPattern(pattern) : null;
    return null;
  }

  /**
   * Dismiss a pattern (won't be suggested again)
   */
  async dismissPattern(patternId: string): Promise<void> {
    // Database implementation commented out - requires DetectedPattern table
    // await db.detectedPattern.update({
    //   where: { id: patternId },
    //   data: { status: "dismissed" },
    // });
    logger.info("Pattern dismissed (no-op, table not created)", { patternId });
  }

  /**
   * Get SOP drafts for an organization
   */
  async getSOPDrafts(
    _organizationId: string,
    _options: SOPDraftFilterOptions = {},
  ): Promise<SOPDraft[]> {
    // Database implementation commented out - requires SOPDraft table
    // const drafts = await db.sOPDraft.findMany({
    //   where: {
    //     organizationId,
    //     ...(options.status && { status: options.status }),
    //   },
    //   orderBy: { createdAt: "desc" },
    //   skip: options.offset,
    //   take: options.limit,
    // });
    // return drafts.map(this.mapToSOPDraft);
    return [];
  }

  /**
   * Get a single SOP draft by ID
   */
  async getSOPDraft(_draftId: string): Promise<SOPDraft | null> {
    // Database implementation commented out - requires SOPDraft table
    // const draft = await db.sOPDraft.findUnique({
    //   where: { id: draftId },
    // });
    // return draft ? this.mapToSOPDraft(draft) : null;
    return null;
  }

  /**
   * Generate SOP draft from a pattern
   */
  async generateSOPFromPattern(patternId: string, organizationId: string): Promise<SOPDraft> {
    const pattern = await this.getPattern(patternId);
    if (!pattern) {
      throw new Error(`Pattern not found: ${patternId}`);
    }

    return this.drafter.draftFromPattern(pattern, organizationId);
  }

  /**
   * Approve an SOP draft
   */
  async approveSOPDraft(draftId: string, reviewerId: string): Promise<void> {
    await this.drafter.approveDraft(draftId, reviewerId);
  }

  /**
   * Reject an SOP draft
   */
  async rejectSOPDraft(draftId: string, reviewerId: string, reason: string): Promise<void> {
    await this.drafter.rejectDraft(draftId, reviewerId, reason);
  }

  /**
   * Convert SOP draft to YAML
   */
  convertToYAML(draft: SOPDraft): string {
    return this.drafter.toYAML(draft);
  }

  /**
   * Store a detected pattern in the database
   */
  private async storePattern(
    organizationId: string,
    type: string,
    data: unknown,
    frequency: number,
    confidence: number,
  ): Promise<DetectedPattern> {
    // Database implementation commented out - requires DetectedPattern table
    // const pattern = await db.detectedPattern.create({
    //   data: {
    //     organizationId,
    //     type,
    //     data: data as any,
    //     frequency,
    //     confidence,
    //     status: "active",
    //   },
    // });
    // return this.mapToDetectedPattern(pattern);

    // Return stub object with required fields
    return {
      id: `stub-${Date.now()}`,
      organizationId,
      type: type as "sequence" | "cluster" | "time",
      data: data as SequencePattern | RequestCluster | TimePattern,
      frequency,
      confidence,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Extract timestamps for a sequence pattern from action sequences
   */
  private extractTimestamps(
    sequences: Array<{ actions: Array<{ timestamp: Date }> }>,
    pattern: string[],
  ): Date[] {
    // This is a simplified version - in production you'd track actual timestamps
    // of when each pattern occurrence was observed
    return sequences
      .filter((seq) => seq.actions.length >= pattern.length)
      .map((seq) => seq.actions[0].timestamp);
  }

  // Database implementation commented out - requires DetectedPattern table
  // private mapToDetectedPattern(record: any): DetectedPattern {
  //   return {
  //     id: record.id,
  //     organizationId: record.organizationId,
  //     type: record.type,
  //     data: record.data,
  //     frequency: record.frequency,
  //     confidence: record.confidence,
  //     status: record.status,
  //     sopDraftId: record.sopDraftId ?? undefined,
  //     createdAt: record.createdAt,
  //     updatedAt: record.updatedAt,
  //   };
  // }

  // Database implementation commented out - requires SOPDraft table
  // private mapToSOPDraft(record: any): SOPDraft {
  //   const content = record.content as any;
  //   return {
  //     id: record.id,
  //     organizationId: record.organizationId,
  //     status: record.status,
  //     name: record.name,
  //     description: record.description ?? "",
  //     function: record.function ?? "",
  //     steps: content?.steps ?? [],
  //     sourcePatternId: record.sourcePatternId,
  //     sourceType: content?.sourceType ?? "sequence",
  //     confidence: record.confidence,
  //     generatedAt: record.createdAt,
  //     reviewedBy: record.reviewedBy ?? undefined,
  //     reviewedAt: record.reviewedAt ?? undefined,
  //     rejectionReason: record.rejectionReason ?? undefined,
  //   };
  // }
}

// Export singleton instance
export const patternDetector = new PatternDetector();

// Re-export types
export * from "./types";

// Re-export components for direct usage
export { actionDataCollector } from "./data-collector";
export { sequenceMiner } from "./sequence-miner";
export { requestClusterer } from "./request-clusterer";
export { timePatternDetector } from "./time-pattern-detector";
export { patternScorer } from "./pattern-scorer";
export { sopDrafter } from "./sop-drafter";
