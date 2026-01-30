import { Router, Request, Response } from "express";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import {
  validate,
  uuidParamSchema,
  createApprovalSchema,
  respondApprovalSchema,
  listApprovalsQuerySchema,
  CreateApprovalInput,
  RespondApprovalInput,
  ListApprovalsQuery,
} from "../middleware/validation.middleware";
import { sendApprovalNotification, updateApprovalMessage } from "../services/approval-slack";
import { logger } from "../utils/logger";
import { createAuditLog } from "../services/audit-logger";
import { processApprovalRequest, undoAutoApproval } from "../services/auto-approval.service";
import type { ApprovalRequest as RiskApprovalRequest } from "../services/approval-risk-scorer";

const router = Router();

router.post(
  "/approvals",
  requireAuth,
  requirePermission(Permission.APPROVAL_CREATE),
  validate({ body: createApprovalSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: requesterId } = req.user!;
      const {
        approverId,
        fallbackApproverId,
        type,
        title,
        description,
        context,
        expiresInHours,
        notifyViaSlack,
      } = req.body as CreateApprovalInput;

      if (approverId === requesterId) {
        return res.status(400).json({ error: "Self-approval is not allowed" });
      }

      const approverMembership = await prisma.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId: approverId,
          },
        },
        include: { user: true },
      });

      if (!approverMembership) {
        return res.status(400).json({ error: "Approver is not a member of this organization" });
      }

      if (fallbackApproverId) {
        if (fallbackApproverId === requesterId) {
          return res.status(400).json({ error: "Fallback approver cannot be the requester" });
        }
        const fallbackMembership = await prisma.membership.findUnique({
          where: {
            organizationId_userId: {
              organizationId,
              userId: fallbackApproverId,
            },
          },
        });
        if (!fallbackMembership) {
          return res
            .status(400)
            .json({ error: "Fallback approver is not a member of this organization" });
        }
      }

      const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

      const approval = await prisma.approval.create({
        data: {
          organizationId,
          requesterId,
          approverId,
          fallbackApproverId: fallbackApproverId || null,
          type,
          title,
          description,
          context: context ? (context as object) : undefined,
          status: "pending",
          expiresAt,
        },
      });

      await createAuditLog({
        organizationId,
        action: "approval.created",
        userId: requesterId,
        resourceType: "Approval",
        resourceId: approval.id,
        details: { type, title, approverId, expiresAt: expiresAt.toISOString() },
      });

      // Check if eligible for auto-approval
      const riskApprovalRequest: RiskApprovalRequest = {
        id: approval.id,
        organizationId,
        userId: requesterId,
        requestType: type as any,
        description,
        amount: context?.amount ? Number(context.amount) : undefined,
        impactScope: context?.impactScope as any,
        metadata: context as Record<string, unknown> | undefined,
        createdAt: approval.createdAt,
      };

      const autoApprovalResult = await processApprovalRequest(riskApprovalRequest);

      if (autoApprovalResult.autoApproved) {
        // Update approval status to approved
        await prisma.approval.update({
          where: { id: approval.id },
          data: {
            status: "approved",
            responseNote: "Auto-approved: Low risk routine request",
            respondedAt: new Date(),
          },
        });

        logger.info("Approval auto-approved", {
          approvalId: approval.id,
          riskScore: autoApprovalResult.riskScore.totalScore,
        });

        return res.status(201).json({
          approval: {
            ...approval,
            status: "approved",
            responseNote: "Auto-approved: Low risk routine request",
            respondedAt: new Date(),
          },
          autoApproved: true,
          riskScore: autoApprovalResult.riskScore,
          undoExpiresAt: autoApprovalResult.undoExpiresAt,
        });
      }

      if (notifyViaSlack) {
        try {
          const slackResult = await sendApprovalNotification({
            approval: {
              ...approval,
              context: approval.context as Record<string, unknown> | null,
            },
            requester: req.user!,
            approver: approverMembership.user,
            organizationId,
          });

          if (slackResult?.channelId && slackResult?.messageTs) {
            await prisma.approval.update({
              where: { id: approval.id },
              data: {
                slackChannelId: slackResult.channelId,
                slackMessageTs: slackResult.messageTs,
              },
            });
          }
        } catch (slackError) {
          logger.warn("Failed to send Slack notification for approval", {
            approvalId: approval.id,
            error: slackError instanceof Error ? slackError.message : String(slackError),
          });
        }
      }

      return res.status(201).json({ approval });
    } catch (error) {
      logger.error(
        "Create approval error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to create approval request" });
    }
  },
);

router.get(
  "/approvals",
  requireAuth,
  requirePermission(Permission.APPROVAL_READ),
  validate({ query: listApprovalsQuerySchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const { status, type, page, limit } = req.query as unknown as ListApprovalsQuery;

      const where: any = {
        organizationId,
        OR: [{ approverId: userId }, { requesterId: userId }, { fallbackApproverId: userId }],
      };

      if (status !== "all") {
        where.status = status;
      }

      if (type !== "all") {
        where.type = type;
      }

      const [approvals, total] = await Promise.all([
        prisma.approval.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.approval.count({ where }),
      ]);

      return res.json({
        approvals,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      logger.error(
        "List approvals error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to fetch approvals" });
    }
  },
);

router.get(
  "/approvals/:id",
  requireAuth,
  requirePermission(Permission.APPROVAL_READ),
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const id = String(req.params.id);

      const approval = await prisma.approval.findFirst({
        where: {
          id,
          organizationId,
          OR: [{ approverId: userId }, { requesterId: userId }, { fallbackApproverId: userId }],
        },
      });

      if (!approval) {
        return res.status(404).json({ error: "Approval not found" });
      }

      return res.json({ approval });
    } catch (error) {
      logger.error(
        "Get approval error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to fetch approval" });
    }
  },
);

router.put(
  "/approvals/:id/respond",
  requireAuth,
  requirePermission(Permission.APPROVAL_RESPOND),
  validate({ params: uuidParamSchema, body: respondApprovalSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const id = String(req.params.id);
      const { action, responseNote } = req.body as RespondApprovalInput;

      const approval = await prisma.approval.findFirst({
        where: { id, organizationId },
      });

      if (!approval) {
        return res.status(404).json({ error: "Approval not found" });
      }

      const isApprover = approval.approverId === userId;
      const isFallbackApprover = approval.fallbackApproverId === userId;

      if (!isApprover && !isFallbackApprover) {
        return res
          .status(403)
          .json({ error: "You are not authorized to respond to this approval" });
      }

      if (approval.status !== "pending") {
        return res.status(400).json({ error: `Approval has already been ${approval.status}` });
      }

      if (new Date() > approval.expiresAt) {
        await prisma.approval.update({
          where: { id },
          data: { status: "expired" },
        });
        return res.status(400).json({ error: "Approval has expired" });
      }

      const updatedApproval = await prisma.approval.update({
        where: { id },
        data: {
          status: action,
          responseNote: responseNote || null,
          respondedAt: new Date(),
        },
      });

      await createAuditLog({
        organizationId,
        action: `approval.${action}`,
        userId,
        resourceType: "Approval",
        resourceId: approval.id,
        details: {
          type: approval.type,
          title: approval.title,
          requesterId: approval.requesterId,
          responseNote,
        },
      });

      if (approval.slackChannelId && approval.slackMessageTs) {
        try {
          await updateApprovalMessage({
            approval: {
              ...updatedApproval,
              context: updatedApproval.context as Record<string, unknown> | null,
            },
            responderId: userId,
            organizationId,
          });
        } catch (slackError) {
          logger.warn("Failed to update Slack approval message", {
            approvalId: approval.id,
            error: slackError instanceof Error ? slackError.message : String(slackError),
          });
        }
      }

      return res.json({ approval: updatedApproval });
    } catch (error) {
      logger.error(
        "Respond to approval error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to respond to approval" });
    }
  },
);

router.post(
  "/approvals/auto-approval/:approvalId/undo",
  requireAuth,
  requirePermission(Permission.APPROVAL_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const approvalId = String(req.params.approvalId);

      const result = await undoAutoApproval(approvalId);

      if (!result.success) {
        return res.status(400).json({ error: result.reason });
      }

      logger.info("Auto-approval undone", { approvalId, organizationId });

      return res.json({
        success: true,
        message: "Auto-approval successfully undone",
      });
    } catch (error) {
      logger.error(
        "Undo auto-approval error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to undo auto-approval" });
    }
  },
);

export default router;
