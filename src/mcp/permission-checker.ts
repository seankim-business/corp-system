import { MCPTool, PermissionCheckResult, ApprovalRequirement } from "./types";
import { logger } from "../utils/logger";

export function checkToolPermission(tool: MCPTool, agentId: string): PermissionCheckResult {
  const { permissions } = tool;
  const { allowedAgents, requiresApproval } = permissions;

  const isAllowed = allowedAgents.includes("all") || allowedAgents.includes(agentId);

  if (!isAllowed) {
    return {
      allowed: false,
      reason: `Agent ${agentId} is not authorized to use tool ${tool.name}`,
      requiresApproval: false,
    };
  }

  return {
    allowed: true,
    requiresApproval: !!requiresApproval,
    approvalRequirement: requiresApproval,
  };
}

export function evaluateApprovalCondition(condition: string, args: unknown): boolean {
  if (!args || typeof args !== "object") {
    return false;
  }

  const argsRecord = args as Record<string, unknown>;

  try {
    const eqMatch = condition.match(/^(\w+)\s*==\s*['"]([^'"]+)['"]$/);
    if (eqMatch) {
      const [, field, value] = eqMatch;
      return String(argsRecord[field]) === value;
    }

    const gtMatch = condition.match(/^(\w+)\s*>\s*(\d+)$/);
    if (gtMatch) {
      const [, field, threshold] = gtMatch;
      const fieldValue = Number(argsRecord[field]);
      return !isNaN(fieldValue) && fieldValue > Number(threshold);
    }

    const gteMatch = condition.match(/^(\w+)\s*>=\s*(\d+)$/);
    if (gteMatch) {
      const [, field, threshold] = gteMatch;
      const fieldValue = Number(argsRecord[field]);
      return !isNaN(fieldValue) && fieldValue >= Number(threshold);
    }

    const ltMatch = condition.match(/^(\w+)\s*<\s*(\d+)$/);
    if (ltMatch) {
      const [, field, threshold] = ltMatch;
      const fieldValue = Number(argsRecord[field]);
      return !isNaN(fieldValue) && fieldValue < Number(threshold);
    }

    const lteMatch = condition.match(/^(\w+)\s*<=\s*(\d+)$/);
    if (lteMatch) {
      const [, field, threshold] = lteMatch;
      const fieldValue = Number(argsRecord[field]);
      return !isNaN(fieldValue) && fieldValue <= Number(threshold);
    }

    const neqMatch = condition.match(/^(\w+)\s*!=\s*['"]([^'"]+)['"]$/);
    if (neqMatch) {
      const [, field, value] = neqMatch;
      return String(argsRecord[field]) !== value;
    }

    logger.warn("Unsupported approval condition format", { condition });
    return true;
  } catch (error) {
    logger.error("Error evaluating approval condition", {
      condition,
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}

export function resolveApprover(
  approverRef: string,
  context: {
    organizationId: string;
    userId: string;
    toolName: string;
  },
): string {
  switch (approverRef) {
    case "function_owner":
      return `function_owner:${context.organizationId}`;
    case "tech_lead":
      return `tech_lead:${context.organizationId}`;
    case "admin":
      return `admin:${context.organizationId}`;
    default:
      return approverRef;
  }
}

export function getApprovalRequirementForArgs(
  tool: MCPTool,
  args: unknown,
): ApprovalRequirement | null {
  const { requiresApproval } = tool.permissions;

  if (!requiresApproval) {
    return null;
  }

  const needsApproval = evaluateApprovalCondition(requiresApproval.condition, args);

  if (needsApproval) {
    return requiresApproval;
  }

  return null;
}
