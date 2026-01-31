/**
 * OMC Tool Proxy
 *
 * Handles tool call forwarding, input validation, response normalization,
 * and error handling for OMC tool execution.
 */

import {
  OmcToolCallRequest,
  OmcToolCallResponse,
  OmcToolName,
} from "../types";
import { OmcBridgeClient, getOmcBridgeClient } from "../client";
import { getToolDefinition, validateToolInput, ToolDefinition } from "./registry";
import { isToolEnabled, loadOmcBridgeConfig } from "../config";
import { logger } from "../../../utils/logger";
import { recordMcpToolCall } from "../../../services/metrics";

/**
 * Tool execution options
 */
export interface ToolProxyOptions {
  /** Client instance to use (defaults to singleton) */
  client?: OmcBridgeClient;

  /** Override timeout in milliseconds */
  timeoutMs?: number;

  /** Skip input validation */
  skipValidation?: boolean;

  /** Organization ID for audit/metrics */
  organizationId: string;

  /** User ID for audit */
  userId?: string;

  /** Session ID for tracking */
  sessionId?: string;

  /** Workflow ID for tracking */
  workflowId?: string;

  /** Correlation ID for distributed tracing */
  correlationId?: string;
}

/**
 * Normalized tool result
 */
export interface NormalizedToolResult {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata: {
    toolName: string;
    durationMs: number;
    estimatedTokens?: number;
    cached: boolean;
    requestId: string;
  };
}

/**
 * Validate tool input against its schema
 */
export function validateInput(
  toolName: string,
  input: unknown,
): { valid: true; data: unknown } | { valid: false; error: string } {
  return validateToolInput(toolName, input);
}

/**
 * Check if a tool is available and enabled
 */
export function isToolAvailable(toolName: string): boolean {
  const definition = getToolDefinition(toolName);
  if (!definition) {
    return false;
  }

  const config = loadOmcBridgeConfig();
  return isToolEnabled(toolName, config);
}

/**
 * Get tool definition if available
 */
export function getAvailableTool(toolName: string): ToolDefinition | null {
  if (!isToolAvailable(toolName)) {
    return null;
  }
  return getToolDefinition(toolName) ?? null;
}

/**
 * Forward a tool call to the OMC runtime
 */
export async function forwardToolCall(
  toolName: string,
  input: unknown,
  options: ToolProxyOptions,
): Promise<OmcToolCallResponse> {
  const client = options.client ?? getOmcBridgeClient();
  const startTime = Date.now();

  // Validate tool availability
  if (!isToolAvailable(toolName)) {
    return {
      requestId: `error-${Date.now()}`,
      status: "error",
      error: {
        code: "TOOL_NOT_AVAILABLE",
        message: `Tool '${toolName}' is not available or disabled`,
      },
      metadata: {
        durationMs: Date.now() - startTime,
      },
    };
  }

  // Validate input unless skipped
  if (!options.skipValidation) {
    const validation = validateInput(toolName, input);
    if (validation.valid === false) {
      return {
        requestId: `error-${Date.now()}`,
        status: "error",
        error: {
          code: "INVALID_INPUT",
          message: validation.error,
        },
        metadata: {
          durationMs: Date.now() - startTime,
        },
      };
    }
  }

  // Build request
  const request: Omit<OmcToolCallRequest, "requestId"> = {
    toolName,
    arguments: input as Record<string, unknown>,
    organizationId: options.organizationId,
    userId: options.userId,
    timeoutMs: options.timeoutMs,
    metadata: {
      sessionId: options.sessionId,
      workflowId: options.workflowId,
      correlationId: options.correlationId,
    },
  };

  try {
    const response = await client.executeToolCall(request);

    // Record metrics
    recordMcpToolCall({
      provider: "omc",
      toolName,
      success: response.status === "success",
      duration: response.metadata.durationMs,
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startTime;

    logger.error("Tool call failed", {
      toolName,
      organizationId: options.organizationId,
      error: message,
      durationMs,
    });

    recordMcpToolCall({
      provider: "omc",
      toolName,
      success: false,
      duration: durationMs,
    });

    return {
      requestId: `error-${Date.now()}`,
      status: "error",
      error: {
        code: "EXECUTION_FAILED",
        message,
      },
      metadata: {
        durationMs,
      },
    };
  }
}

/**
 * Normalize a tool response into a consistent format
 */
export function normalizeResponse(
  toolName: string,
  response: OmcToolCallResponse,
): NormalizedToolResult {
  const success = response.status === "success";

  return {
    success,
    data: success ? response.result : undefined,
    error: !success ? response.error : undefined,
    metadata: {
      toolName,
      durationMs: response.metadata.durationMs,
      estimatedTokens: response.metadata.estimatedTokens,
      cached: response.metadata.cached ?? false,
      requestId: response.requestId,
    },
  };
}

/**
 * Handle timeout with graceful degradation
 */
export function handleTimeout(
  toolName: string,
  timeoutMs: number,
  requestId: string,
): NormalizedToolResult {
  logger.warn("Tool execution timed out", {
    toolName,
    timeoutMs,
    requestId,
  });

  return {
    success: false,
    error: {
      code: "TIMEOUT",
      message: `Tool '${toolName}' execution timed out after ${timeoutMs}ms`,
    },
    metadata: {
      toolName,
      durationMs: timeoutMs,
      cached: false,
      requestId,
    },
  };
}

/**
 * Execute a tool call with full normalization
 */
export async function executeOmcToolProxy(
  toolName: OmcToolName,
  input: unknown,
  options: ToolProxyOptions,
): Promise<NormalizedToolResult> {
  const response = await forwardToolCall(toolName, input, options);
  return normalizeResponse(toolName, response);
}

/**
 * Batch execute multiple tool calls
 */
export async function batchExecuteTools(
  calls: Array<{
    toolName: OmcToolName;
    input: unknown;
  }>,
  options: ToolProxyOptions,
): Promise<NormalizedToolResult[]> {
  const results = await Promise.all(
    calls.map((call) => executeOmcToolProxy(call.toolName, call.input, options)),
  );

  return results;
}

/**
 * Check if a tool requires approval
 */
export function requiresApproval(toolName: string): boolean {
  const definition = getToolDefinition(toolName);
  return definition?.requiresApproval ?? false;
}

/**
 * Get estimated token cost for a tool call
 */
export function estimateTokenCost(toolName: string): number {
  const definition = getToolDefinition(toolName);
  return definition?.estimatedTokens ?? 100;
}
