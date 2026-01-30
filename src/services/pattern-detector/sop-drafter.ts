/**
 * SOP Drafter
 * Auto-generates SOP drafts from detected patterns
 */

import { v4 as uuidv4 } from "uuid";
import * as yaml from "js-yaml";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../../utils/logger";
import type {
  DetectedPattern,
  RequestCluster,
  SequencePattern,
  SOPDraft,
  SOPDraftStep,
  TimePattern,
} from "./types";

export class SOPDrafter {
  private anthropic: Anthropic | null = null;

  constructor() {
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }
  }

  /**
   * Generate SOP draft from any detected pattern
   */
  async draftFromPattern(pattern: DetectedPattern, organizationId: string): Promise<SOPDraft> {
    switch (pattern.type) {
      case "sequence":
        return this.draftFromSequence(pattern.data as SequencePattern, organizationId, pattern.id);
      case "cluster":
        return this.draftFromCluster(pattern.data as RequestCluster, organizationId, pattern.id);
      case "time":
        return this.draftFromTimePattern(pattern.data as TimePattern, organizationId, pattern.id);
      default:
        throw new Error(`Unknown pattern type: ${pattern.type}`);
    }
  }

  /**
   * Generate SOP draft from sequence pattern
   */
  async draftFromSequence(
    pattern: SequencePattern,
    organizationId: string,
    sourcePatternId: string,
  ): Promise<SOPDraft> {
    logger.debug("Drafting SOP from sequence pattern", {
      patternId: pattern.id,
      sequenceLength: pattern.sequence.length,
    });

    // Generate steps from sequence
    const steps = this.generateStepsFromSequence(pattern.sequence);

    // Generate name and description using AI or fallback
    const {
      name,
      description,
      function: sopFunction,
    } = await this.generateMetadata("sequence", pattern.sequence, steps);

    const draft: SOPDraft = {
      id: uuidv4(),
      organizationId,
      status: "draft",
      name,
      description,
      function: sopFunction,
      steps,
      sourcePatternId,
      sourceType: "sequence",
      confidence: pattern.confidence,
      generatedAt: new Date(),
    };

    // Save to database
    await this.saveDraft(draft);

    return draft;
  }

  /**
   * Generate SOP draft from request cluster
   */
  async draftFromCluster(
    cluster: RequestCluster,
    organizationId: string,
    sourcePatternId: string,
  ): Promise<SOPDraft> {
    logger.debug("Drafting SOP from request cluster", {
      clusterId: cluster.id,
      clusterSize: cluster.size,
    });

    // Generate steps based on common intent
    const steps = await this.generateStepsFromCluster(cluster);

    // Generate metadata
    const name = `Handle ${cluster.commonIntent}`;
    const description = `Automated workflow for handling ${cluster.size} similar requests related to: ${cluster.commonEntities.join(", ")}`;

    const draft: SOPDraft = {
      id: uuidv4(),
      organizationId,
      status: "draft",
      name,
      description,
      function: cluster.commonAgent || "General",
      steps,
      sourcePatternId,
      sourceType: "cluster",
      confidence: cluster.automatable ? 0.7 : 0.5,
      generatedAt: new Date(),
    };

    await this.saveDraft(draft);

    return draft;
  }

  /**
   * Generate SOP draft from time pattern
   */
  async draftFromTimePattern(
    pattern: TimePattern,
    organizationId: string,
    sourcePatternId: string,
  ): Promise<SOPDraft> {
    logger.debug("Drafting SOP from time pattern", {
      patternId: pattern.id,
      type: pattern.type,
    });

    // Generate steps from underlying action pattern
    const steps = this.generateStepsFromSequence(pattern.actionPattern.sequence);

    // Add scheduling metadata
    const scheduleMeta = {
      type: pattern.type,
      dayOfWeek: pattern.dayOfWeek,
      dayOfMonth: pattern.dayOfMonth,
      hourOfDay: pattern.hourOfDay,
      minute: pattern.minute,
    };

    const name = `Scheduled: ${pattern.description}`;
    const description = `Automated workflow that runs ${pattern.description.toLowerCase()}`;

    const draft: SOPDraft = {
      id: uuidv4(),
      organizationId,
      status: "draft",
      name,
      description,
      function: "Scheduled Tasks",
      steps: [
        {
          id: "schedule-trigger",
          name: "Schedule Trigger",
          type: "automated",
          description: `Triggered ${pattern.description.toLowerCase()}`,
          config: { schedule: scheduleMeta },
        },
        ...steps,
      ],
      sourcePatternId,
      sourceType: "time",
      confidence: pattern.confidence,
      generatedAt: new Date(),
    };

    await this.saveDraft(draft);

    return draft;
  }

  /**
   * Convert draft to YAML format
   */
  toYAML(draft: SOPDraft): string {
    const sopDefinition = {
      metadata: {
        id: draft.id,
        name: draft.name,
        function: draft.function,
        owner: "system@organization.com",
        version: "1.0.0",
        status: draft.status,
        generated_from: {
          pattern_id: draft.sourcePatternId,
          type: draft.sourceType,
          confidence: draft.confidence,
        },
      },
      triggers: [
        {
          pattern: `auto:${draft.name.toLowerCase().replace(/\s+/g, "_")}`,
        },
      ],
      steps: draft.steps.map((step) => ({
        id: step.id,
        name: step.name,
        type: step.type,
        agent: step.agentId,
        tool: step.toolName,
        description: step.description,
        input: step.config || {},
        requires_approval: step.type === "approval",
        timeout: step.timeoutMinutes ? `${step.timeoutMinutes}m` : undefined,
        skippable: step.skippable,
      })),
      exception_handling: [
        {
          condition: "step.failed",
          action: "notify_owner",
          message: `Step {{step.name}} failed in ${draft.name}`,
        },
      ],
    };

    return yaml.dump(sopDefinition, { lineWidth: -1 });
  }

  /**
   * Submit draft for human review
   */
  async submitForReview(draftId: string, reviewers: string[]): Promise<void> {
    // Database implementation commented out - requires SOPDraft table
    // await db.sOPDraft.update({
    //   where: { id: draftId },
    //   data: { status: "pending_review" },
    // });

    logger.info("SOP draft submitted for review", {
      draftId,
      reviewers,
      note: "Notifications would be sent via email/Slack when notification service is integrated",
    });
  }

  /**
   * Approve a draft (convert to real SOP)
   */
  async approveDraft(draftId: string, reviewerId: string): Promise<void> {
    // Database implementation commented out - requires SOPDraft and DetectedPattern tables
    // const draft = await db.sOPDraft.findUnique({
    //   where: { id: draftId },
    // });

    // if (!draft) {
    //   throw new Error(`Draft not found: ${draftId}`);
    // }

    // await db.sOPDraft.update({
    //   where: { id: draftId },
    //   data: {
    //     status: "approved",
    //     reviewedBy: reviewerId,
    //     reviewedAt: new Date(),
    //   },
    // });

    // // Update source pattern status
    // await db.detectedPattern.update({
    //   where: { id: draft.sourcePatternId },
    //   data: {
    //     status: "converted",
    //     sopDraftId: draftId,
    //   },
    // });

    logger.info("SOP draft approved (no-op, tables not created)", { draftId, reviewerId });
  }

  /**
   * Reject a draft
   */
  async rejectDraft(draftId: string, reviewerId: string, reason: string): Promise<void> {
    // Database implementation commented out - requires SOPDraft table
    // await db.sOPDraft.update({
    //   where: { id: draftId },
    //   data: {
    //     status: "rejected",
    //     reviewedBy: reviewerId,
    //     reviewedAt: new Date(),
    //     rejectionReason: reason,
    //   },
    // });

    logger.info("SOP draft rejected (no-op, table not created)", { draftId, reviewerId, reason });
  }

  /**
   * Generate steps from action sequence
   */
  private generateStepsFromSequence(sequence: string[]): SOPDraftStep[] {
    return sequence.map((action, index) => {
      const [type, id] = action.split(":");
      const stepId = `step-${index + 1}`;

      switch (type) {
        case "agent":
          return {
            id: stepId,
            name: `Agent: ${this.formatId(id)}`,
            type: "automated",
            agentId: id,
            description: `Delegate to ${this.formatId(id)} agent`,
          };

        case "tool":
          return {
            id: stepId,
            name: `Tool: ${this.formatId(id)}`,
            type: "automated",
            toolName: id,
            description: `Execute ${this.formatId(id)} tool`,
          };

        case "workflow":
          return {
            id: stepId,
            name: `Workflow: ${this.formatId(id)}`,
            type: "automated",
            description: `Run workflow ${this.formatId(id)}`,
            config: { workflowId: id },
          };

        case "approval":
          return {
            id: stepId,
            name: "Approval Required",
            type: "approval",
            description: "Requires manual approval to continue",
            requiredApprovers: [],
          };

        default:
          return {
            id: stepId,
            name: `Action: ${action}`,
            type: "manual",
            description: `Manual step: ${action}`,
          };
      }
    });
  }

  /**
   * Generate steps from request cluster
   */
  private async generateStepsFromCluster(cluster: RequestCluster): Promise<SOPDraftStep[]> {
    // Use AI to suggest steps if available
    if (this.anthropic) {
      try {
        const sampleRequests = cluster.requests.slice(0, 3).map((r) => r.text);

        const response = await this.anthropic.messages.create({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 500,
          messages: [
            {
              role: "user",
              content: `Based on these similar user requests, suggest 2-4 automation steps for an SOP.

Requests:
${sampleRequests.map((r, i) => `${i + 1}. "${r}"`).join("\n")}

Common intent: ${cluster.commonIntent}

Return steps as JSON array with format:
[{"name": "Step name", "type": "automated|manual|approval", "description": "What this step does"}]`,
            },
          ],
        });

        const content = response.content[0];
        if (content.type === "text") {
          const match = content.text.match(/\[[\s\S]*\]/);
          if (match) {
            const steps = JSON.parse(match[0]);
            return steps.map((s: any, i: number) => ({
              id: `step-${i + 1}`,
              name: s.name,
              type: s.type || "manual",
              description: s.description,
            }));
          }
        }
      } catch (error) {
        logger.warn("Failed to generate steps with AI, using fallback", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Fallback: simple steps based on intent
    return [
      {
        id: "step-1",
        name: "Receive Request",
        type: "automated",
        description: `Receive and parse ${cluster.commonIntent} request`,
      },
      {
        id: "step-2",
        name: "Process Request",
        type: "manual",
        description: `Process the ${cluster.commonIntent} request`,
      },
      {
        id: "step-3",
        name: "Complete",
        type: "automated",
        description: "Finalize and respond to request",
      },
    ];
  }

  /**
   * Generate metadata (name, description, function) using AI or fallback
   */
  private async generateMetadata(
    _patternType: string,
    sequence: string[],
    steps: SOPDraftStep[],
  ): Promise<{ name: string; description: string; function: string }> {
    if (this.anthropic) {
      try {
        const response = await this.anthropic.messages.create({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 200,
          messages: [
            {
              role: "user",
              content: `Generate metadata for an SOP with these steps:
${steps.map((s) => `- ${s.name}: ${s.description}`).join("\n")}

Return JSON with format:
{"name": "Short SOP name (max 50 chars)", "description": "One sentence description", "function": "Department/Function area"}`,
            },
          ],
        });

        const content = response.content[0];
        if (content.type === "text") {
          const match = content.text.match(/\{[\s\S]*\}/);
          if (match) {
            return JSON.parse(match[0]);
          }
        }
      } catch (error) {
        logger.warn("Failed to generate metadata with AI, using fallback", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const agents = sequence.filter((s) => s.startsWith("agent:")).map((s) => s.split(":")[1]);
    const primaryAgent = agents[0] || "general";

    return {
      name: `Auto: ${this.formatId(primaryAgent)} Workflow`,
      description: `Automated workflow with ${steps.length} steps detected from user patterns`,
      function: this.inferFunction(primaryAgent),
    };
  }

  /**
   * Save draft to database
   */
  private async saveDraft(draft: SOPDraft): Promise<void> {
    // Database implementation commented out - requires SOPDraft table
    // await db.sOPDraft.create({
    //   data: {
    //     id: draft.id,
    //     organizationId: draft.organizationId,
    //     sourcePatternId: draft.sourcePatternId,
    //     name: draft.name,
    //     description: draft.description,
    //     function: draft.function,
    //     content: {
    //       steps: draft.steps as unknown as Prisma.InputJsonValue,
    //       sourceType: draft.sourceType,
    //     } as Prisma.InputJsonValue,
    //     status: draft.status,
    //     confidence: draft.confidence,
    //   },
    // });

    logger.info("Saved SOP draft (no-op, table not created)", {
      draftId: draft.id,
      name: draft.name,
      sourcePatternId: draft.sourcePatternId,
    });
  }

  /**
   * Format ID for display (e.g., "brand-agent" -> "Brand Agent")
   */
  private formatId(id: string): string {
    return id
      .replace(/-/g, " ")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
  }

  /**
   * Infer function/department from agent name
   */
  private inferFunction(agentName: string): string {
    const name = agentName.toLowerCase();
    if (name.includes("brand") || name.includes("marketing")) return "Marketing";
    if (name.includes("finance") || name.includes("budget")) return "Finance";
    if (name.includes("hr") || name.includes("people")) return "Human Resources";
    if (name.includes("dev") || name.includes("eng")) return "Engineering";
    if (name.includes("ops") || name.includes("operations")) return "Operations";
    if (name.includes("sales")) return "Sales";
    if (name.includes("support") || name.includes("cs")) return "Customer Support";
    return "General";
  }
}

// Export singleton instance
export const sopDrafter = new SOPDrafter();
