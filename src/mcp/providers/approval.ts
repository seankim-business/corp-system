/**
 * Approval MCP Provider
 *
 * Provides MCP tools for managing approval requests.
 * Agents can list, view, respond to, and count approval requests.
 */

import { MCPTool, CallContext, ToolCallResult } from "../types";
import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import {
  getPendingApprovalsForUser,
  respondToApproval,
  getApprovalStatus,
} from "../../services/approval-checker";

const TOOLS: MCPTool[] = [
  {
    name: "approval__list",
    description: "List pending approvals for the current user or organization",
    inputSchema: {
      type: "object",
      properties: {
        approverId: {
          type: "string",
          description: "Filter by approver user ID (optional, defaults to current user)",
        },
        status: {
          type: "string",
          description: "Filter by status: pending, approved, rejected, expired (optional)",
          enum: ["pending", "approved", "rejected", "expired"],
        },
        limit: {
          type: "number",
          description: "Maximum number of approvals to return (default 50)",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      properties: {
        approvals: {
          type: "array",
          items: { type: "object" },
        },
      },
    },
    provider: "approval",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "approval__get",
    description: "Get details of a specific approval request by ID",
    inputSchema: {
      type: "object",
      properties: {
        approvalId: {
          type: "string",
          description: "The approval ID to retrieve",
        },
      },
      required: ["approvalId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        approval: { type: "object" },
      },
    },
    provider: "approval",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "approval__respond",
    description: "Respond to an approval request (approve or reject)",
    inputSchema: {
      type: "object",
      properties: {
        approvalId: {
          type: "string",
          description: "The approval ID to respond to",
        },
        decision: {
          type: "string",
          description: "The decision: approved or rejected",
          enum: ["approved", "rejected"],
        },
        responseNote: {
          type: "string",
          description: "Optional note explaining the decision",
        },
      },
      required: ["approvalId", "decision"],
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        approval: { type: "object" },
      },
    },
    provider: "approval",
    requiresAuth: false,
    permissions: {
      allowedAgents: ["all"],
      requiresApproval: {
        condition: "always",
        approver: "admin",
      },
    },
  },
  {
    name: "approval__pending_count",
    description: "Get count of pending approvals for the current user",
    inputSchema: {
      type: "object",
      properties: {
        approverId: {
          type: "string",
          description: "Filter by approver user ID (optional, defaults to current user)",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      properties: {
        count: { type: "number" },
      },
    },
    provider: "approval",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
];

interface ListArgs {
  approverId?: string;
  status?: "pending" | "approved" | "rejected" | "expired";
  limit?: number;
}

interface GetArgs {
  approvalId: string;
}

interface RespondArgs {
  approvalId: string;
  decision: "approved" | "rejected";
  responseNote?: string;
}

interface PendingCountArgs {
  approverId?: string;
}

export function createApprovalProvider() {
  return {
    name: "approval",

    getTools(): MCPTool[] {
      return TOOLS;
    },

    async executeTool(
      toolName: string,
      args: Record<string, unknown>,
      context: CallContext,
    ): Promise<ToolCallResult> {
      const startTime = Date.now();

      try {
        let result: unknown;
        const actualToolName = toolName.replace("approval__", "");

        switch (actualToolName) {
          case "list":
            result = await listApprovals(args as any, context);
            break;
          case "get":
            result = await getApproval(args as any, context.organizationId);
            break;
          case "respond":
            result = await respondToApprovalRequest(args as any, context);
            break;
          case "pending_count":
            result = await getPendingCount(args as any, context);
            break;
          default:
            throw new Error(`Unknown tool: ${toolName}`);
        }

        return {
          success: true,
          data: result,
          metadata: {
            duration: Date.now() - startTime,
            cached: false,
          },
        };
      } catch (error) {
        logger.error(
          "Approval tool execution failed",
          { toolName, organizationId: context.organizationId },
          error as Error,
        );
        return {
          success: false,
          error: {
            code: "EXECUTION_ERROR",
            message: (error as Error).message,
          },
          metadata: {
            duration: Date.now() - startTime,
            cached: false,
          },
        };
      }
    },
  };
}

async function listApprovals(
  args: ListArgs,
  context: CallContext,
): Promise<{ approvals: unknown[] }> {
  const { approverId, status, limit = 50 } = args;
  const targetApproverId = approverId || context.userId;

  // If status is provided, use direct Prisma query
  if (status) {
    const approvals = await prisma.approval.findMany({
      where: {
        organizationId: context.organizationId,
        approverId: targetApproverId,
        status,
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
    });

    return { approvals };
  }

  // Otherwise use getPendingApprovalsForUser for pending
  const pendingApprovals = await getPendingApprovalsForUser(
    context.organizationId,
    targetApproverId,
  );

  return { approvals: pendingApprovals };
}

async function getApproval(
  args: GetArgs,
  organizationId: string,
): Promise<{ approval: unknown }> {
  const { approvalId } = args;

  const approval = await prisma.approval.findFirst({
    where: {
      id: approvalId,
      organizationId,
    },
  });

  if (!approval) {
    throw new Error("Approval not found");
  }

  return { approval };
}

async function respondToApprovalRequest(
  args: RespondArgs,
  context: CallContext,
): Promise<{ success: boolean; approval: unknown }> {
  const { approvalId, decision, responseNote } = args;

  // Verify the approval exists and belongs to the organization
  const approval = await prisma.approval.findFirst({
    where: {
      id: approvalId,
      organizationId: context.organizationId,
    },
  });

  if (!approval) {
    throw new Error("Approval not found");
  }

  // Verify the current user is the approver
  if (approval.approverId !== context.userId) {
    throw new Error("You are not authorized to respond to this approval");
  }

  const success = await respondToApproval(approvalId, decision, responseNote);

  if (!success) {
    throw new Error("Failed to respond to approval - it may no longer be pending");
  }

  // Fetch updated approval status
  const updatedStatus = await getApprovalStatus(approvalId);

  logger.info("Approval responded via MCP", {
    approvalId,
    decision,
    organizationId: context.organizationId,
    approverId: context.userId,
  });

  return {
    success: true,
    approval: {
      id: approvalId,
      ...updatedStatus,
    },
  };
}

async function getPendingCount(
  args: PendingCountArgs,
  context: CallContext,
): Promise<{ count: number }> {
  const { approverId } = args;
  const targetApproverId = approverId || context.userId;

  const count = await prisma.approval.count({
    where: {
      organizationId: context.organizationId,
      approverId: targetApproverId,
      status: "pending",
    },
  });

  return { count };
}
