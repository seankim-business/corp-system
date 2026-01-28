import { auditLogger } from "../services/audit-logger";
import { logger } from "../utils/logger";

export interface MCPToolCallLogEntry {
  toolName: string;
  provider?: string;
  agentId: string;
  userId: string;
  organizationId: string;
  args?: unknown;
  result?: unknown;
  success: boolean;
  errorCode?: number;
  errorMessage?: string;
  duration: number;
  approvalId?: string;
  requiresApproval?: boolean;
  approvalCondition?: string;
  approver?: string;
}

const SENSITIVE_ARG_PATTERNS = [/password/i, /secret/i, /token/i, /apikey/i, /credential/i];

function maskSensitiveData(data: unknown): unknown {
  if (!data || typeof data !== "object") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(maskSensitiveData);
  }

  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const isSensitive = SENSITIVE_ARG_PATTERNS.some((pattern) => pattern.test(key));
    if (isSensitive) {
      masked[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      masked[key] = maskSensitiveData(value);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

function truncateResult(result: unknown, maxLength = 1000): unknown {
  if (result === null || result === undefined) {
    return result;
  }

  const stringified = typeof result === "string" ? result : JSON.stringify(result);

  if (stringified.length <= maxLength) {
    return result;
  }

  return {
    _truncated: true,
    _originalLength: stringified.length,
    _preview: stringified.slice(0, maxLength),
  };
}

export async function logMCPToolCall(entry: MCPToolCallLogEntry): Promise<void> {
  const maskedArgs = entry.args ? maskSensitiveData(entry.args) : undefined;
  const truncatedResult = entry.result ? truncateResult(entry.result) : undefined;

  logger.info("MCP tool call", {
    toolName: entry.toolName,
    provider: entry.provider,
    agentId: entry.agentId,
    userId: entry.userId,
    organizationId: entry.organizationId,
    success: entry.success,
    duration: entry.duration,
    ...(entry.errorCode && { errorCode: entry.errorCode }),
    ...(entry.errorMessage && { errorMessage: entry.errorMessage }),
    ...(entry.approvalId && { approvalId: entry.approvalId }),
    ...(entry.requiresApproval && {
      requiresApproval: entry.requiresApproval,
      approvalCondition: entry.approvalCondition,
      approver: entry.approver,
    }),
  });

  try {
    await auditLogger.log({
      action: "mcp.tool_call",
      organizationId: entry.organizationId,
      userId: entry.userId,
      resourceType: "mcp_tool",
      resourceId: entry.toolName,
      details: {
        provider: entry.provider,
        agentId: entry.agentId,
        args: maskedArgs,
        result: truncatedResult,
        duration: entry.duration,
        ...(entry.errorCode && { errorCode: entry.errorCode }),
        ...(entry.errorMessage && { errorMessage: entry.errorMessage }),
        ...(entry.approvalId && { approvalId: entry.approvalId }),
        ...(entry.requiresApproval && {
          requiresApproval: entry.requiresApproval,
          approvalCondition: entry.approvalCondition,
          approver: entry.approver,
        }),
      },
      success: entry.success,
      errorMessage: entry.errorMessage,
    });
  } catch (error) {
    logger.error("Failed to log MCP tool call to audit", {
      error: error instanceof Error ? error.message : String(error),
      toolName: entry.toolName,
    });
  }
}

export async function getMCPToolCallHistory(params: {
  organizationId: string;
  toolName?: string;
  agentId?: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}): Promise<{
  calls: Array<{
    timestamp: number;
    toolName: string;
    provider?: string;
    agentId: string;
    userId?: string;
    success: boolean;
    duration: number;
    errorMessage?: string;
  }>;
  total: number;
}> {
  const result = await auditLogger.query({
    organizationId: params.organizationId,
    action: "mcp.tool_call",
    userId: params.userId,
    resourceType: "mcp_tool",
    resourceId: params.toolName,
    startDate: params.startDate,
    endDate: params.endDate,
    limit: params.limit,
    offset: params.offset,
  });

  const calls = result.logs.map((log) => ({
    timestamp: log.timestamp,
    toolName: log.resourceId || "unknown",
    provider: (log.details as Record<string, unknown>)?.provider as string | undefined,
    agentId: ((log.details as Record<string, unknown>)?.agentId as string) || "unknown",
    userId: log.userId,
    success: log.success,
    duration: ((log.details as Record<string, unknown>)?.duration as number) || 0,
    errorMessage: log.errorMessage,
  }));

  return { calls, total: result.total };
}

export async function getMCPToolStats(
  organizationId: string,
  days = 7,
): Promise<{
  totalCalls: number;
  successRate: number;
  callsByTool: Record<string, number>;
  callsByAgent: Record<string, number>;
  averageDuration: number;
}> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const result = await auditLogger.query({
    organizationId,
    action: "mcp.tool_call",
    startDate,
    limit: 10000,
  });

  const callsByTool: Record<string, number> = {};
  const callsByAgent: Record<string, number> = {};
  let successCount = 0;
  let totalDuration = 0;

  for (const log of result.logs) {
    const toolName = log.resourceId || "unknown";
    const details = log.details as Record<string, unknown>;
    const agentId = (details?.agentId as string) || "unknown";
    const duration = (details?.duration as number) || 0;

    callsByTool[toolName] = (callsByTool[toolName] || 0) + 1;
    callsByAgent[agentId] = (callsByAgent[agentId] || 0) + 1;

    if (log.success) successCount++;
    totalDuration += duration;
  }

  return {
    totalCalls: result.logs.length,
    successRate: result.logs.length > 0 ? successCount / result.logs.length : 1,
    callsByTool,
    callsByAgent,
    averageDuration: result.logs.length > 0 ? totalDuration / result.logs.length : 0,
  };
}
