/**
 * Example integration showing how to use OMC Bridge cost tracking
 * in an MCP server tool implementation
 */

import {
  estimateToolCost,
  recordToolUsage,
  checkBudgetLimit,
  ToolExecutionContext,
  ToolExecutionResult,
} from "./middleware/cost";
import { getOrganizationBudget, getMonthlyUsageSummary } from "../../services/cost-tracker";
import { logger } from "../../utils/logger";

/**
 * Example: Execute an OMC tool with full cost tracking
 */
export async function executeOmcTool(
  toolName: string,
  parameters: Record<string, unknown>,
  context: {
    organizationId: string;
    userId: string;
    sessionId: string;
  }
): Promise<{ result: ToolExecutionResult; cost: number }> {
  // Step 1: Estimate cost before execution
  const estimate = estimateToolCost(toolName, parameters);

  logger.info("Estimated tool cost", {
    toolName,
    estimatedCost: estimate.estimatedCost,
    strategy: estimate.strategy,
  });

  // Step 2: Check budget limit
  const budgetLimit = await getOrganizationBudget(context.organizationId);
  if (budgetLimit !== null) {
    const summary = await getMonthlyUsageSummary(context.organizationId);
    const budgetCheck = await checkBudgetLimit(
      context.organizationId,
      estimate.estimatedCost,
      summary.totalCost / 100, // Convert cents to dollars
      budgetLimit
    );

    if (!budgetCheck.allowed) {
      logger.warn("Tool execution blocked by budget limit", {
        organizationId: context.organizationId,
        toolName,
        reason: budgetCheck.reason,
      });

      return {
        result: {
          success: false,
          error: budgetCheck.reason,
        },
        cost: 0,
      };
    }
  }

  // Step 3: Execute the actual tool
  // (This is where you'd call the actual OMC tool via MCP)
  const result = await executeMcpTool(toolName, parameters);

  // Step 4: Record actual usage
  const executionContext: ToolExecutionContext = {
    organizationId: context.organizationId,
    userId: context.userId,
    sessionId: context.sessionId,
    toolName,
    parameters,
  };

  const usage = recordToolUsage(executionContext, result, estimate);

  // Step 5: Log usage (cost tracker records via recordToolUsage middleware)
  logger.debug("Tool usage recorded", {
    organizationId: context.organizationId,
    userId: context.userId,
    sessionId: context.sessionId,
    toolName,
    inputTokens: usage.actualInputTokens,
    outputTokens: usage.actualOutputTokens,
    cost: usage.actualCost,
    success: result.success,
  });

  logger.info("Tool execution completed", {
    toolName,
    success: result.success,
    actualCost: usage.actualCost,
    estimatedCost: estimate.estimatedCost,
    costDelta: usage.actualCost - estimate.estimatedCost,
  });

  return {
    result,
    cost: usage.actualCost,
  };
}

/**
 * Example: Get cost report for organization
 */
export async function getOmcCostReport(organizationId: string): Promise<{
  summary: Awaited<ReturnType<typeof getMonthlyUsageSummary>>;
  budget: {
    limit: number | null;
    remaining: number | null;
    percentUsed: number | null;
  };
  recommendations: string[];
}> {
  const summary = await getMonthlyUsageSummary(organizationId);
  const budgetLimit = await getOrganizationBudget(organizationId);
  const totalCost = summary.totalCost / 100; // Convert cents to dollars

  let remaining: number | null = null;
  let percentUsed: number | null = null;

  if (budgetLimit !== null) {
    remaining = budgetLimit - totalCost;
    percentUsed = (totalCost / budgetLimit) * 100;
  }

  // Generate cost optimization recommendations
  const recommendations: string[] = [];

  // Check budget status
  if (percentUsed !== null) {
    if (percentUsed > 90) {
      recommendations.push("Budget is over 90% consumed. Consider increasing limit or reducing tool usage.");
    } else if (percentUsed > 75) {
      recommendations.push("Budget is over 75% consumed. Monitor usage closely to avoid exceeding limit.");
    }
  }

  return {
    summary,
    budget: {
      limit: budgetLimit,
      remaining,
      percentUsed,
    },
    recommendations,
  };
}

/**
 * Mock MCP tool execution (replace with actual implementation)
 */
async function executeMcpTool(
  toolName: string,
  parameters: Record<string, unknown>
): Promise<ToolExecutionResult> {
  // This would be replaced with actual MCP tool execution
  // For example, calling the LSP server via MCP protocol

  try {
    // Simulate tool execution
    const response = `Result from ${toolName} with params: ${JSON.stringify(parameters)}`;

    return {
      success: true,
      response,
      tokensUsed: Math.ceil(response.length / 4), // Estimate tokens
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Example: Batch tool execution with cost tracking
 */
export async function executeBatchOmcTools(
  tools: Array<{ name: string; parameters: Record<string, unknown> }>,
  context: {
    organizationId: string;
    userId: string;
    sessionId: string;
  },
  maxTotalCost?: number
): Promise<{
  results: Array<{ toolName: string; result: ToolExecutionResult; cost: number }>;
  totalCost: number;
  stopped: boolean;
}> {
  const results: Array<{ toolName: string; result: ToolExecutionResult; cost: number }> = [];
  let totalCost = 0;
  let stopped = false;

  for (const tool of tools) {
    // Check if we've exceeded max cost
    if (maxTotalCost !== undefined && totalCost >= maxTotalCost) {
      logger.warn("Batch execution stopped due to cost limit", {
        organizationId: context.organizationId,
        totalCost,
        maxTotalCost,
        executedTools: results.length,
        totalTools: tools.length,
      });
      stopped = true;
      break;
    }

    const { result, cost } = await executeOmcTool(tool.name, tool.parameters, context);

    results.push({
      toolName: tool.name,
      result,
      cost,
    });

    totalCost += cost;
  }

  return {
    results,
    totalCost,
    stopped,
  };
}
