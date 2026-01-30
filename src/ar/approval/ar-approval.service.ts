/**
 * AR Approval Service - Human-in-the-Loop Approval Management
 *
 * Manages multi-level approval workflows for AR (Agent Resource) requests.
 * Implements approval chain building, routing, escalation, and Slack integration.
 *
 * Key Features:
 * - Multi-level approval chains (Task → Process → Project → Function → Objective)
 * - Auto-approval integration for low-risk requests
 * - Slack interactive approval buttons
 * - Timeout and auto-escalation handling
 * - Audit logging for compliance
 *
 * Based on AR Management System Plan - Module 2 and Addendum C
 */

import { db as prisma } from "../../db/client";
import { redis } from "../../db/redis";
import { logger } from "../../utils/logger";
import { metrics } from "../../utils/metrics";
import { auditLogger } from "../../services/audit-logger";
import { processApprovalRequest } from "../../services/auto-approval.service";
import { WebClient } from "@slack/web-api";
import { getSlackIntegrationByOrg } from "../../api/slack-integration";

// ============================================================================
// TYPES
// ============================================================================

export type ApprovalLevel = 1 | 2 | 3 | 4 | 5;
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "escalated";
export type RequestType = "task" | "budget" | "assignment" | "schedule" | "leave" | "policy";
export type RequesterType = "agent" | "human";

export interface ARApprovalRequestCreateInput {
  organizationId: string;
  requestType: RequestType;
  level: ApprovalLevel;
  title: string;
  description: string;
  context?: Record<string, unknown>;
  impactScope?: "individual" | "team" | "department" | "org";
  estimatedValue?: number;
  requesterType: RequesterType;
  requesterId: string;
}

export interface ARApprovalRequest {
  id: string;
  organizationId: string;
  requestType: RequestType;
  level: ApprovalLevel;
  title: string;
  description: string;
  context: Record<string, unknown>;
  impactScope?: string;
  estimatedValue?: number;
  requesterType: RequesterType;
  requesterId: string;
  approverChain: ApproverChainEntry[];
  currentLevel: number;
  status: ApprovalStatus;
  responses: ApprovalResponse[];
  expiresAt: Date;
  escalationAt?: Date;
  slackChannelId?: string;
  slackMessageTs?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApproverChainEntry {
  level: number;
  approverId: string;
  approverType: RequesterType;
  roleTitle?: string;
}

export interface ApprovalResponse {
  level: number;
  approverId: string;
  decision: "approved" | "rejected";
  note?: string;
  timestamp: Date;
}

export interface ApproverChain {
  entries: ApproverChainEntry[];
  totalLevels: number;
}

export interface ApprovalFilters {
  status?: ApprovalStatus;
  requestType?: RequestType;
  requesterType?: RequesterType;
  level?: ApprovalLevel;
  startDate?: Date;
  endDate?: Date;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_APPROVAL_TIMEOUT_MINUTES = 60;
const ESCALATION_TIMEOUT_MINUTES = 30;
const REDIS_CACHE_TTL = 300; // 5 minutes

// Approval level mapping (from Addendum C)
const APPROVAL_LEVEL_NAMES: Record<ApprovalLevel, string> = {
  1: "TASK",
  2: "PROCESS",
  3: "PROJECT",
  4: "FUNCTION",
  5: "OBJECTIVE",
};

// ============================================================================
// AR APPROVAL SERVICE CLASS
// ============================================================================

export class ARApprovalService {
  // ==========================================================================
  // REQUEST MANAGEMENT
  // ==========================================================================

  /**
   * Create a new approval request with auto-approval check
   */
  async createRequest(data: ARApprovalRequestCreateInput): Promise<ARApprovalRequest> {
    const startTime = Date.now();

    try {
      logger.info("Creating AR approval request", {
        requestType: data.requestType,
        level: data.level,
        requesterType: data.requesterType,
      });

      // Step 1: Check auto-approval eligibility
      const autoApprovalResult = await this.checkAutoApproval(data);

      if (autoApprovalResult.autoApprove) {
        logger.info("Request eligible for auto-approval", {
          requestType: data.requestType,
          reason: autoApprovalResult.reason,
        });

        // Create approved request directly
        const request = await this.createApprovedRequest(data, autoApprovalResult.reason);

        metrics.increment("ar_approval.auto_approved", {
          requestType: data.requestType,
          level: String(data.level),
        });

        return request;
      }

      // Step 2: Build approval chain
      const expiresAt = new Date(Date.now() + DEFAULT_APPROVAL_TIMEOUT_MINUTES * 60 * 1000);
      const escalationAt = new Date(Date.now() + ESCALATION_TIMEOUT_MINUTES * 60 * 1000);

      // Create temporary request for chain building
      const tempRequest: Partial<ARApprovalRequest> = {
        ...data,
        context: data.context || {},
        approverChain: [],
        currentLevel: 1,
        status: "pending",
        responses: [],
        expiresAt,
        escalationAt,
      };

      const approverChain = await this.buildApprovalChain(tempRequest as ARApprovalRequest);

      // Step 3: Create request in database
      const request = await prisma.aRApprovalRequest.create({
        data: {
          organizationId: data.organizationId,
          requestType: data.requestType,
          level: data.level,
          title: data.title,
          description: data.description,
          context: (data.context || {}) as any,
          impactScope: data.impactScope,
          estimatedValue: data.estimatedValue,
          requesterType: data.requesterType,
          requesterId: data.requesterId,
          approverChain: approverChain.entries as any,
          currentLevel: 1,
          status: "pending",
          responses: [],
          expiresAt,
          escalationAt,
        },
      });

      // Step 4: Audit log
      await auditLogger.log({
        action: "approval.created",
        organizationId: data.organizationId,
        userId: data.requesterId,
        resourceType: "ar_approval_request",
        resourceId: request.id,
        details: {
          requestType: data.requestType,
          level: data.level,
          title: data.title,
          approverCount: approverChain.entries.length,
        },
        success: true,
      });

      // Step 5: Notify first level approvers
      await this.notifyApprovers(request as any, 1);

      metrics.histogram("ar_approval.create_duration", Date.now() - startTime);
      metrics.increment("ar_approval.created", {
        requestType: data.requestType,
        level: String(data.level),
      });

      logger.info("AR approval request created", {
        requestId: request.id,
        approverCount: approverChain.entries.length,
      });

      return this.mapToARApprovalRequest(request);
    } catch (error) {
      logger.error(
        "Failed to create AR approval request",
        { requestType: data.requestType },
        error instanceof Error ? error : new Error(String(error))
      );
      metrics.increment("ar_approval.create_errors");
      throw error;
    }
  }

  /**
   * Find approval request by ID
   */
  async findById(id: string): Promise<ARApprovalRequest | null> {
    try {
      const request = await prisma.aRApprovalRequest.findUnique({
        where: { id },
      });

      if (!request) return null;

      return this.mapToARApprovalRequest(request);
    } catch (error) {
      logger.error("Failed to find approval request", { id }, error as Error);
      return null;
    }
  }

  /**
   * Find pending requests for a specific approver
   */
  async findPendingForApprover(
    approverId: string,
    approverType: RequesterType
  ): Promise<ARApprovalRequest[]> {
    try {
      const requests = await prisma.aRApprovalRequest.findMany({
        where: {
          status: "pending",
        },
      });

      // Filter by approver in current level
      const filtered = requests.filter((req) => {
        const chain = req.approverChain as any[];
        const currentLevelEntry = chain.find((entry) => entry.level === req.currentLevel);
        return (
          currentLevelEntry &&
          currentLevelEntry.approverId === approverId &&
          currentLevelEntry.approverType === approverType
        );
      });

      return filtered.map((r) => this.mapToARApprovalRequest(r));
    } catch (error) {
      logger.error(
        "Failed to find pending approvals",
        { approverId },
        error as Error
      );
      return [];
    }
  }

  /**
   * Find all requests for an organization with optional filters
   */
  async findAll(
    organizationId: string,
    filters?: ApprovalFilters
  ): Promise<ARApprovalRequest[]> {
    try {
      const where: any = { organizationId };

      if (filters?.status) where.status = filters.status;
      if (filters?.requestType) where.requestType = filters.requestType;
      if (filters?.requesterType) where.requesterType = filters.requesterType;
      if (filters?.level) where.level = filters.level;

      if (filters?.startDate || filters?.endDate) {
        where.createdAt = {};
        if (filters.startDate) where.createdAt.gte = filters.startDate;
        if (filters.endDate) where.createdAt.lte = filters.endDate;
      }

      const requests = await prisma.aRApprovalRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });

      return requests.map((r) => this.mapToARApprovalRequest(r));
    } catch (error) {
      logger.error(
        "Failed to find approval requests",
        { organizationId },
        error as Error
      );
      return [];
    }
  }

  // ==========================================================================
  // APPROVAL FLOW
  // ==========================================================================

  /**
   * Build approval chain based on request level and organization structure
   *
   * Approval levels (from Addendum C):
   * - Level 1 (TASK): direct_supervisor or auto-approve
   * - Level 2 (PROCESS): team_lead
   * - Level 3 (PROJECT): project_manager
   * - Level 4 (FUNCTION): function_owner
   * - Level 5 (OBJECTIVE): c_level
   */
  async buildApprovalChain(request: ARApprovalRequest): Promise<ApproverChain> {
    try {
      logger.debug("Building approval chain", {
        requestId: request.id,
        level: request.level,
        requestType: request.requestType,
      });

      const entries: ApproverChainEntry[] = [];

      // Get applicable rules for this request type
      const rules = await this.getApplicableRules(
        request.organizationId,
        request.requestType
      );

      if (rules.length > 0) {
        // Use rule-based chain building
        const rule = rules[0]; // Take highest priority rule
        const chainTemplate = rule.chainTemplate as any;

        for (let level = 1; level <= request.level; level++) {
          const approver = await this.resolveApproverForLevel(
            request.organizationId,
            level as ApprovalLevel,
            request.requesterId,
            chainTemplate
          );

          if (approver) {
            entries.push({
              level,
              approverId: approver.id,
              approverType: approver.type,
              roleTitle: approver.roleTitle,
            });
          }
        }
      } else {
        // Fallback to default chain building
        entries.push(...(await this.buildDefaultChain(request)));
      }

      logger.debug("Approval chain built", {
        requestId: request.id,
        totalLevels: entries.length,
      });

      return {
        entries,
        totalLevels: entries.length,
      };
    } catch (error) {
      logger.error(
        "Failed to build approval chain",
        { requestId: request.id },
        error as Error
      );
      throw error;
    }
  }

  /**
   * Process approval/rejection response
   */
  async respond(
    requestId: string,
    decision: "approved" | "rejected",
    responderId: string,
    note?: string
  ): Promise<ARApprovalRequest> {
    try {
      logger.info("Processing approval response", {
        requestId,
        decision,
        responderId,
      });

      const request = await this.findById(requestId);
      if (!request) {
        throw new Error(`Approval request ${requestId} not found`);
      }

      // Validate responder is authorized for current level
      const currentLevelEntry = request.approverChain.find(
        (e) => e.level === request.currentLevel
      );
      if (!currentLevelEntry || currentLevelEntry.approverId !== responderId) {
        throw new Error("Responder not authorized for current approval level");
      }

      // Check if already responded or expired
      if (request.status !== "pending") {
        throw new Error(`Request already ${request.status}`);
      }

      if (new Date() > request.expiresAt) {
        await this.expire(requestId);
        throw new Error("Request has expired");
      }

      // Record response
      const response: ApprovalResponse = {
        level: request.currentLevel,
        approverId: responderId,
        decision,
        note,
        timestamp: new Date(),
      };

      const updatedResponses = [...request.responses, response];

      // Determine next state
      let newStatus: ApprovalStatus = "pending";
      let newLevel = request.currentLevel;

      if (decision === "rejected") {
        newStatus = "rejected";
      } else if (request.currentLevel >= request.approverChain.length) {
        // Last level approved - request is fully approved
        newStatus = "approved";
      } else {
        // Move to next level
        newLevel = request.currentLevel + 1;
      }

      // Update request
      const updated = await prisma.aRApprovalRequest.update({
        where: { id: requestId },
        data: {
          status: newStatus,
          currentLevel: newLevel,
          responses: updatedResponses as any,
        },
      });

      // Audit log
      await auditLogger.log({
        action: decision === "approved" ? "approval.approved" : "approval.rejected",
        organizationId: request.organizationId,
        userId: responderId,
        resourceType: "ar_approval_request",
        resourceId: requestId,
        details: {
          level: request.currentLevel,
          decision,
          note,
          finalStatus: newStatus,
        },
        success: true,
      });

      // If still pending, notify next level
      if (newStatus === "pending" && newLevel > request.currentLevel) {
        await this.notifyApprovers(updated as any, newLevel);
      }

      // Update Slack message if exists
      if (request.slackChannelId && request.slackMessageTs) {
        await this.updateSlackApprovalMessage(request, newStatus, responderId);
      }

      metrics.increment("ar_approval.responded", {
        decision,
        level: String(request.currentLevel),
      });

      logger.info("Approval response processed", {
        requestId,
        decision,
        newStatus,
      });

      return this.mapToARApprovalRequest(updated);
    } catch (error) {
      logger.error(
        "Failed to process approval response",
        { requestId, decision },
        error as Error
      );
      metrics.increment("ar_approval.respond_errors");
      throw error;
    }
  }

  /**
   * Escalate a request to the next level or designated escalation path
   */
  async escalate(requestId: string, reason: string): Promise<ARApprovalRequest> {
    try {
      logger.info("Escalating approval request", { requestId, reason });

      const request = await this.findById(requestId);
      if (!request) {
        throw new Error(`Approval request ${requestId} not found`);
      }

      if (request.status !== "pending") {
        throw new Error("Can only escalate pending requests");
      }

      // Check if there's a higher level to escalate to
      if (request.currentLevel >= request.approverChain.length) {
        // Already at highest level - mark as escalated with special handling
        const updated = await prisma.aRApprovalRequest.update({
          where: { id: requestId },
          data: {
            status: "escalated",
          },
        });

        await auditLogger.log({
          action: "approval.approved", // Use existing action
          organizationId: request.organizationId,
          resourceType: "ar_approval_request",
          resourceId: requestId,
          details: {
            escalated: true,
            reason,
            fromLevel: request.currentLevel,
          },
          success: true,
        });

        return this.mapToARApprovalRequest(updated);
      }

      // Move to next level
      const newLevel = request.currentLevel + 1;
      const updated = await prisma.aRApprovalRequest.update({
        where: { id: requestId },
        data: {
          currentLevel: newLevel,
          escalationAt: new Date(Date.now() + ESCALATION_TIMEOUT_MINUTES * 60 * 1000),
        },
      });

      await auditLogger.log({
        action: "approval.approved", // Use existing action
        organizationId: request.organizationId,
        resourceType: "ar_approval_request",
        resourceId: requestId,
        details: {
          escalated: true,
          reason,
          fromLevel: request.currentLevel,
          toLevel: newLevel,
        },
        success: true,
      });

      // Notify new level
      await this.notifyApprovers(updated as any, newLevel);

      metrics.increment("ar_approval.escalated", {
        level: String(request.currentLevel),
      });

      logger.info("Approval request escalated", {
        requestId,
        fromLevel: request.currentLevel,
        toLevel: newLevel,
      });

      return this.mapToARApprovalRequest(updated);
    } catch (error) {
      logger.error(
        "Failed to escalate approval request",
        { requestId },
        error as Error
      );
      throw error;
    }
  }

  /**
   * Mark a request as expired
   */
  async expire(requestId: string): Promise<ARApprovalRequest> {
    try {
      const updated = await prisma.aRApprovalRequest.update({
        where: { id: requestId },
        data: { status: "expired" },
      });

      await auditLogger.log({
        action: "approval.expired",
        organizationId: updated.organizationId,
        resourceType: "ar_approval_request",
        resourceId: requestId,
        details: { expiredAt: new Date() },
        success: true,
      });

      metrics.increment("ar_approval.expired");

      return this.mapToARApprovalRequest(updated);
    } catch (error) {
      logger.error(
        "Failed to expire approval request",
        { requestId },
        error as Error
      );
      throw error;
    }
  }

  // ==========================================================================
  // AUTO-APPROVAL INTEGRATION
  // ==========================================================================

  /**
   * Check if request is eligible for auto-approval
   */
  async checkAutoApproval(
    request: ARApprovalRequestCreateInput
  ): Promise<{ autoApprove: boolean; reason: string }> {
    try {
      // Only auto-approve TASK level (level 1) requests
      if (request.level > 1) {
        return {
          autoApprove: false,
          reason: `Level ${request.level} requests require human approval`,
        };
      }

      // Map to auto-approval request format
      const autoApprovalRequest = {
        id: "temp_" + Date.now(),
        organizationId: request.organizationId,
        userId: request.requesterId,
        requestType: request.requestType as any,
        description: request.description,
        amount: request.estimatedValue || 0,
        metadata: request.context || {},
      };

      const result = await processApprovalRequest(autoApprovalRequest as any);

      return {
        autoApprove: result.autoApproved,
        reason: result.reason,
      };
    } catch (error) {
      logger.error(
        "Failed to check auto-approval",
        { requestType: request.requestType },
        error as Error
      );
      return {
        autoApprove: false,
        reason: "Error checking auto-approval eligibility",
      };
    }
  }

  // ==========================================================================
  // NOTIFICATIONS
  // ==========================================================================

  /**
   * Notify approvers at a specific level via Slack
   */
  async notifyApprovers(request: ARApprovalRequest, level: number): Promise<void> {
    try {
      logger.debug("Notifying approvers", { requestId: request.id, level });

      const approver = request.approverChain.find((e) => e.level === level);
      if (!approver) {
        logger.warn("No approver found for level", { requestId: request.id, level });
        return;
      }

      // Send Slack notification
      await this.sendSlackApprovalRequest(request);

      metrics.increment("ar_approval.notification_sent", {
        level: String(level),
      });
    } catch (error) {
      logger.error(
        "Failed to notify approvers",
        { requestId: request.id, level },
        error as Error
      );
      // Don't throw - notification failure shouldn't block approval creation
    }
  }

  /**
   * Send Slack notification with interactive approval buttons
   */
  async sendSlackApprovalRequest(request: ARApprovalRequest): Promise<void> {
    try {
      const integration = await getSlackIntegrationByOrg(request.organizationId);
      if (!integration || !integration.enabled) {
        logger.warn("No Slack integration found", {
          organizationId: request.organizationId,
        });
        return;
      }

      const slackClient = new WebClient(integration.botToken);

      // Get approver info
      const currentLevel = request.approverChain.find(
        (e) => e.level === request.currentLevel
      );
      if (!currentLevel) return;

      // Get approver's Slack ID
      const approverSlackId = await this.getSlackIdForUser(
        currentLevel.approverId,
        currentLevel.approverType
      );
      if (!approverSlackId) {
        logger.warn("No Slack ID found for approver", {
          approverId: currentLevel.approverId,
        });
        return;
      }

      const levelName = APPROVAL_LEVEL_NAMES[request.level];

      const blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🔔 *New Approval Request* (${levelName} Level)\n\n*${request.title}*\n\n${request.description}`,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Type:*\n${request.requestType}`,
            },
            {
              type: "mrkdwn",
              text: `*Level:*\n${request.level} - ${levelName}`,
            },
            {
              type: "mrkdwn",
              text: `*Impact:*\n${request.impactScope || "N/A"}`,
            },
            {
              type: "mrkdwn",
              text: `*Value:*\n${request.estimatedValue ? `$${(request.estimatedValue / 100).toFixed(2)}` : "N/A"}`,
            },
          ],
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "✅ Approve",
                emoji: true,
              },
              style: "primary",
              action_id: `ar_approve_${request.id}`,
              value: request.id,
            },
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "❌ Reject",
                emoji: true,
              },
              style: "danger",
              action_id: `ar_reject_${request.id}`,
              value: request.id,
            },
          ],
        },
      ];

      const result = await slackClient.chat.postMessage({
        channel: approverSlackId,
        text: `New approval request: ${request.title}`,
        blocks,
      });

      // Store Slack message info for updates
      if (result.ts && result.channel) {
        await prisma.aRApprovalRequest.update({
          where: { id: request.id },
          data: {
            slackChannelId: result.channel as string,
            slackMessageTs: result.ts,
          },
        });
      }

      logger.info("Slack approval request sent", {
        requestId: request.id,
        approver: approverSlackId,
      });
    } catch (error) {
      logger.error(
        "Failed to send Slack approval request",
        { requestId: request.id },
        error as Error
      );
      // Don't throw
    }
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Map Prisma model to ARApprovalRequest type
   */
  private mapToARApprovalRequest(data: any): ARApprovalRequest {
    return {
      id: data.id,
      organizationId: data.organizationId,
      requestType: data.requestType,
      level: data.level,
      title: data.title,
      description: data.description,
      context: data.context as Record<string, unknown>,
      impactScope: data.impactScope,
      estimatedValue: data.estimatedValue,
      requesterType: data.requesterType,
      requesterId: data.requesterId,
      approverChain: data.approverChain as ApproverChainEntry[],
      currentLevel: data.currentLevel,
      status: data.status,
      responses: data.responses as ApprovalResponse[],
      expiresAt: data.expiresAt,
      escalationAt: data.escalationAt,
      slackChannelId: data.slackChannelId,
      slackMessageTs: data.slackMessageTs,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  /**
   * Create an auto-approved request
   */
  private async createApprovedRequest(
    data: ARApprovalRequestCreateInput,
    reason: string
  ): Promise<ARApprovalRequest> {
    const request = await prisma.aRApprovalRequest.create({
      data: {
        organizationId: data.organizationId,
        requestType: data.requestType,
        level: data.level,
        title: data.title,
        description: data.description,
        context: (data.context || {}) as any,
        impactScope: data.impactScope,
        estimatedValue: data.estimatedValue,
        requesterType: data.requesterType,
        requesterId: data.requesterId,
        approverChain: [] as any,
        currentLevel: 1,
        status: "approved",
        responses: [
          {
            level: 1,
            approverId: "system",
            decision: "approved",
            note: reason,
            timestamp: new Date(),
          },
        ] as any,
        expiresAt: new Date(Date.now() + DEFAULT_APPROVAL_TIMEOUT_MINUTES * 60 * 1000),
      },
    });

    await auditLogger.log({
      action: "approval.auto_approved",
      organizationId: data.organizationId,
      userId: data.requesterId,
      resourceType: "ar_approval_request",
      resourceId: request.id,
      details: {
        requestType: data.requestType,
        level: data.level,
        reason,
      },
      success: true,
    });

    return this.mapToARApprovalRequest(request);
  }

  /**
   * Get applicable approval rules for a request type
   */
  private async getApplicableRules(
    organizationId: string,
    requestType: RequestType
  ): Promise<any[]> {
    try {
      const cacheKey = `ar_approval_rules:${organizationId}:${requestType}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      const rules = await prisma.aRApprovalRule.findMany({
        where: {
          organizationId,
          requestType,
          enabled: true,
        },
        orderBy: { priority: "desc" },
      });

      await redis.set(cacheKey, JSON.stringify(rules));
      await redis.expire(cacheKey, REDIS_CACHE_TTL);

      return rules;
    } catch (error) {
      logger.error(
        "Failed to get approval rules",
        { organizationId, requestType },
        error as Error
      );
      return [];
    }
  }

  /**
   * Resolve approver for a specific level
   */
  private async resolveApproverForLevel(
    organizationId: string,
    level: ApprovalLevel,
    _requesterId: string,
    _chainTemplate: any
  ): Promise<{ id: string; type: RequesterType; roleTitle?: string } | null> {
    try {
      // Default role mapping based on level (from Addendum C)
      const roleMapping: Record<ApprovalLevel, string> = {
        1: "direct_supervisor",
        2: "team_lead",
        3: "project_manager",
        4: "function_owner",
        5: "c_level",
      };

      const targetRole = roleMapping[level];

      // TODO: Implement actual lookup based on agent assignments and positions
      // For now, return placeholder
      logger.debug("Resolving approver", { level, targetRole });

      return null;
    } catch (error) {
      logger.error(
        "Failed to resolve approver",
        { organizationId, level },
        error as Error
      );
      return null;
    }
  }

  /**
   * Build default approval chain when no rules are configured
   */
  private async buildDefaultChain(
    request: ARApprovalRequest
  ): Promise<ApproverChainEntry[]> {
    const entries: ApproverChainEntry[] = [];

    // Simple default: one approver per level
    // TODO: Replace with actual organizational hierarchy lookup
    for (let level = 1; level <= request.level; level++) {
      entries.push({
        level,
        approverId: "placeholder_approver_" + level,
        approverType: "human",
        roleTitle: APPROVAL_LEVEL_NAMES[level as ApprovalLevel],
      });
    }

    return entries;
  }

  /**
   * Get Slack ID for a user
   */
  private async getSlackIdForUser(
    userId: string,
    _userType: RequesterType
  ): Promise<string | null> {
    try {
      // TODO: Implement actual Slack ID lookup from user profile
      return null;
    } catch (error) {
      logger.error("Failed to get Slack ID", { userId }, error as Error);
      return null;
    }
  }

  /**
   * Update Slack message with approval status
   */
  private async updateSlackApprovalMessage(
    request: ARApprovalRequest,
    status: ApprovalStatus,
    _responderId: string
  ): Promise<void> {
    try {
      if (!request.slackChannelId || !request.slackMessageTs) return;

      const integration = await getSlackIntegrationByOrg(request.organizationId);
      if (!integration || !integration.enabled) return;

      const slackClient = new WebClient(integration.botToken);

      const statusEmoji = status === "approved" ? "✅" : status === "rejected" ? "❌" : "⏳";
      const statusText = status.toUpperCase();

      await slackClient.chat.update({
        channel: request.slackChannelId,
        ts: request.slackMessageTs,
        text: `${statusEmoji} Approval ${statusText}: ${request.title}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${statusEmoji} *Approval ${statusText}*\n\n*${request.title}*\n\n${request.description}`,
            },
          },
        ],
      });
    } catch (error) {
      logger.error(
        "Failed to update Slack message",
        { requestId: request.id },
        error as Error
      );
      // Don't throw
    }
  }
}

// Export singleton instance
export const arApprovalService = new ARApprovalService();
