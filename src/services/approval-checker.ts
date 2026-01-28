import { db as prisma } from "../db/client";
import { logger } from "../utils/logger";

export type ApprovalType = "budget" | "deployment" | "content" | "personnel" | "contract";

export interface ApprovalRequirement {
  required: boolean;
  type?: ApprovalType;
  reason?: string;
  suggestedApprover?: string;
  estimatedValue?: number;
}

interface ApprovalKeywords {
  type: ApprovalType;
  keywords: string[];
  valueThreshold?: number;
}

const APPROVAL_PATTERNS: ApprovalKeywords[] = [
  {
    type: "budget",
    keywords: [
      "spend",
      "purchase",
      "buy",
      "budget",
      "payment",
      "invoice",
      "cost",
      "expense",
      "pay for",
    ],
    valueThreshold: 100,
  },
  {
    type: "deployment",
    keywords: ["deploy", "release", "production", "live", "publish", "rollout", "push to prod"],
  },
  {
    type: "content",
    keywords: [
      "publish",
      "post",
      "announce",
      "send to all",
      "broadcast",
      "newsletter",
      "press release",
    ],
  },
  {
    type: "personnel",
    keywords: [
      "hire",
      "fire",
      "terminate",
      "promote",
      "salary",
      "compensation",
      "bonus",
      "headcount",
    ],
  },
  {
    type: "contract",
    keywords: ["contract", "agreement", "sign", "legal", "binding", "terms", "nda", "partnership"],
  },
];

export async function checkApprovalRequired(
  organizationId: string,
  userRequest: string,
  userId: string,
): Promise<ApprovalRequirement> {
  const lowerRequest = userRequest.toLowerCase();

  for (const pattern of APPROVAL_PATTERNS) {
    for (const keyword of pattern.keywords) {
      if (lowerRequest.includes(keyword)) {
        const estimatedValue = extractValueFromRequest(lowerRequest);

        if (pattern.valueThreshold && estimatedValue !== undefined) {
          if (estimatedValue < pattern.valueThreshold) {
            continue;
          }
        }

        const approver = await findApproverForType(organizationId, pattern.type, userId);

        logger.info("Approval required for request", {
          organizationId,
          userId,
          approvalType: pattern.type,
          matchedKeyword: keyword,
          estimatedValue,
        });

        return {
          required: true,
          type: pattern.type,
          reason: `Request contains "${keyword}" which requires ${pattern.type} approval`,
          suggestedApprover: approver,
          estimatedValue,
        };
      }
    }
  }

  return { required: false };
}

function extractValueFromRequest(text: string): number | undefined {
  const dollarMatch = text.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
  if (dollarMatch) {
    return parseFloat(dollarMatch[1].replace(/,/g, ""));
  }

  const numberWithUnitMatch = text.match(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*(dollars?|usd|k|thousand)/i);
  if (numberWithUnitMatch) {
    let value = parseFloat(numberWithUnitMatch[1].replace(/,/g, ""));
    const unit = numberWithUnitMatch[2].toLowerCase();
    if (unit === "k" || unit === "thousand") {
      value *= 1000;
    }
    return value;
  }

  return undefined;
}

async function findApproverForType(
  organizationId: string,
  _approvalType: ApprovalType,
  requesterId: string,
): Promise<string | undefined> {
  const admins = await prisma.membership.findMany({
    where: {
      organizationId,
      role: { in: ["owner", "admin"] },
      userId: { not: requesterId },
    },
    include: {
      user: {
        select: { id: true, email: true, displayName: true },
      },
    },
    take: 1,
  });

  if (admins.length > 0) {
    return admins[0].userId;
  }

  return undefined;
}

export async function createApprovalRequest(
  organizationId: string,
  requesterId: string,
  approverId: string,
  type: ApprovalType,
  title: string,
  description: string,
  context?: Record<string, unknown>,
): Promise<string> {
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

  const approval = await prisma.approval.create({
    data: {
      organizationId,
      requesterId,
      approverId,
      type,
      title,
      description,
      context: context ? JSON.parse(JSON.stringify(context)) : {},
      status: "pending",
      expiresAt,
    },
  });

  logger.info("Approval request created", {
    approvalId: approval.id,
    organizationId,
    requesterId,
    approverId,
    type,
  });

  return approval.id;
}

export async function getApprovalStatus(approvalId: string): Promise<{
  status: string;
  respondedAt?: Date;
  responseNote?: string;
} | null> {
  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
    select: {
      status: true,
      respondedAt: true,
      responseNote: true,
    },
  });

  if (!approval) return null;

  return {
    status: approval.status,
    respondedAt: approval.respondedAt ?? undefined,
    responseNote: approval.responseNote ?? undefined,
  };
}

export async function getPendingApprovalsForUser(
  organizationId: string,
  approverId: string,
): Promise<
  Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    createdAt: Date;
    expiresAt: Date;
  }>
> {
  const approvals = await prisma.approval.findMany({
    where: {
      organizationId,
      approverId,
      status: "pending",
    },
    select: {
      id: true,
      type: true,
      title: true,
      description: true,
      createdAt: true,
      expiresAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return approvals;
}

export async function respondToApproval(
  approvalId: string,
  decision: "approved" | "rejected",
  responseNote?: string,
): Promise<boolean> {
  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
  });

  if (!approval || approval.status !== "pending") {
    return false;
  }

  await prisma.approval.update({
    where: { id: approvalId },
    data: {
      status: decision,
      responseNote,
      respondedAt: new Date(),
    },
  });

  logger.info("Approval responded", {
    approvalId,
    decision,
    responseNote,
  });

  return true;
}

export async function isApprovalPending(approvalId: string): Promise<boolean> {
  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
    select: { status: true },
  });

  return approval?.status === "pending";
}
