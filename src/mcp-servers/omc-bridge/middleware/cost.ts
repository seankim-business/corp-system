import { logger } from "../../../utils/logger";

/**
 * Tool cost estimates in tokens (input/output)
 */
export const TOOL_COST_ESTIMATES = {
  lsp_hover: { input: 50, output: 200 },
  lsp_goto_definition: { input: 50, output: 100 },
  lsp_find_references: { input: 50, output: 500 },
  lsp_diagnostics: { input: 30, output: 500 },
  lsp_diagnostics_directory: { input: 30, output: 2000 },
  ast_grep_search: { input: 100, output: 1000 },
  python_repl: { input: 200, output: 500 },
} as const;

export type ToolName = keyof typeof TOOL_COST_ESTIMATES;

export interface ToolCostEstimate {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  strategy: "fixed" | "response_length";
}

export interface ToolExecutionContext {
  organizationId: string;
  userId: string;
  sessionId: string;
  toolName: string;
  parameters?: Record<string, unknown>;
}

export interface ToolExecutionResult {
  success: boolean;
  response?: string;
  error?: string;
  tokensUsed?: number;
}

/**
 * Estimate the cost of a tool execution before it runs
 * Uses two strategies:
 * 1. "fixed" - Use predefined estimates for known tools
 * 2. "response_length" - Estimate from expected response size (chars/4 = tokens)
 */
export function estimateToolCost(
  toolName: string,
  _parameters?: Record<string, unknown>,
  estimatedResponseChars?: number
): ToolCostEstimate {
  // Strategy 1: Use fixed estimates if available
  if (toolName in TOOL_COST_ESTIMATES) {
    const estimate = TOOL_COST_ESTIMATES[toolName as ToolName];
    const totalTokens = estimate.input + estimate.output;

    // Rough cost calculation: $0.003 per 1K input tokens, $0.015 per 1K output tokens (Sonnet pricing)
    const estimatedCost =
      (estimate.input / 1000) * 0.003 + (estimate.output / 1000) * 0.015;

    return {
      inputTokens: estimate.input,
      outputTokens: estimate.output,
      totalTokens,
      estimatedCost,
      strategy: "fixed",
    };
  }

  // Strategy 2: Estimate from response length
  if (estimatedResponseChars) {
    const outputTokens = Math.ceil(estimatedResponseChars / 4);
    const inputTokens = 50; // Default input estimate

    const totalTokens = inputTokens + outputTokens;
    const estimatedCost =
      (inputTokens / 1000) * 0.003 + (outputTokens / 1000) * 0.015;

    return {
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCost,
      strategy: "response_length",
    };
  }

  // Fallback: Conservative default estimate
  const defaultInput = 100;
  const defaultOutput = 500;
  const totalTokens = defaultInput + defaultOutput;
  const estimatedCost =
    (defaultInput / 1000) * 0.003 + (defaultOutput / 1000) * 0.015;

  return {
    inputTokens: defaultInput,
    outputTokens: defaultOutput,
    totalTokens,
    estimatedCost,
    strategy: "fixed",
  };
}

/**
 * Record tool usage after execution
 * Uses actual response length if available, falls back to estimate
 */
export function recordToolUsage(
  context: ToolExecutionContext,
  result: ToolExecutionResult,
  estimate: ToolCostEstimate
): {
  actualInputTokens: number;
  actualOutputTokens: number;
  actualCost: number;
} {
  let actualOutputTokens: number;

  if (result.tokensUsed !== undefined) {
    // Use explicit token count if provided
    actualOutputTokens = result.tokensUsed;
  } else if (result.response) {
    // Estimate from actual response length (chars/4 = tokens)
    actualOutputTokens = Math.ceil(result.response.length / 4);
  } else {
    // Fall back to estimate
    actualOutputTokens = estimate.outputTokens;
  }

  const actualInputTokens = estimate.inputTokens; // Input estimate is usually accurate
  const actualCost =
    (actualInputTokens / 1000) * 0.003 + (actualOutputTokens / 1000) * 0.015;

  logger.debug("OMC tool usage recorded", {
    organizationId: context.organizationId,
    toolName: context.toolName,
    inputTokens: actualInputTokens,
    outputTokens: actualOutputTokens,
    cost: actualCost,
    strategy: result.tokensUsed !== undefined ? "explicit" : "measured",
  });

  return {
    actualInputTokens,
    actualOutputTokens,
    actualCost,
  };
}

/**
 * Check if a tool execution would exceed budget limit
 * Should be called before expensive tool operations
 */
export async function checkBudgetLimit(
  organizationId: string,
  estimatedCost: number,
  currentMonthSpend: number,
  budgetLimit: number | null
): Promise<{ allowed: boolean; reason?: string }> {
  if (budgetLimit === null) {
    return { allowed: true };
  }

  const projectedSpend = currentMonthSpend + estimatedCost;

  if (projectedSpend > budgetLimit) {
    logger.warn("OMC tool execution blocked by budget limit", {
      organizationId,
      currentMonthSpend,
      budgetLimit,
      estimatedCost,
      projectedSpend,
    });

    return {
      allowed: false,
      reason: `Tool execution would exceed monthly budget limit ($${budgetLimit.toFixed(2)}). Current spend: $${currentMonthSpend.toFixed(2)}, Estimated cost: $${estimatedCost.toFixed(2)}`,
    };
  }

  return { allowed: true };
}
