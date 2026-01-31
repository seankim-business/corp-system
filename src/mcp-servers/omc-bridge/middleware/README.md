# OMC Bridge Middleware

Middleware components for the OMC (Oh-My-ClaudeCode) Bridge MCP server.

## Cost Tracking Middleware

The cost tracking middleware (`cost.ts`) provides comprehensive cost estimation and tracking for OMC tool usage.

### Features

- **Pre-execution Cost Estimation**: Estimate tool costs before execution to enforce budget limits
- **Post-execution Tracking**: Record actual usage with accurate token counts
- **Two-Strategy Estimation**:
  - **Fixed**: Predefined estimates for known tools
  - **Response Length**: Dynamic estimation based on expected response size
- **Budget Enforcement**: Check and block execution if it would exceed budget limits

### Tool Cost Estimates

| Tool | Input Tokens | Output Tokens | Notes |
|------|--------------|---------------|-------|
| `lsp_hover` | 50 | 200 | Quick documentation lookup |
| `lsp_goto_definition` | 50 | 100 | Navigate to definition |
| `lsp_find_references` | 50 | 500 | Find all references |
| `lsp_diagnostics` | 30 | 500 | File-level diagnostics |
| `lsp_diagnostics_directory` | 30 | 2000 | Project-level diagnostics (expensive) |
| `ast_grep_search` | 100 | 1000 | AST-based code search |
| `python_repl` | 200 | 500 | Python REPL execution |

### Usage Example

```typescript
import {
  estimateToolCost,
  recordToolUsage,
  checkBudgetLimit,
} from "./middleware/cost";

// 1. Before execution - estimate cost
const estimate = estimateToolCost("lsp_diagnostics_directory");
console.log(`Estimated cost: $${estimate.estimatedCost.toFixed(4)}`);

// 2. Check budget limit
const budgetCheck = await checkBudgetLimit(
  organizationId,
  estimate.estimatedCost,
  currentMonthSpend,
  monthlyBudgetLimit
);

if (!budgetCheck.allowed) {
  throw new Error(budgetCheck.reason);
}

// 3. Execute tool
const result = await executeTool("lsp_diagnostics_directory", params);

// 4. Record actual usage
const usage = recordToolUsage(
  {
    organizationId: "org-123",
    userId: "user-456",
    sessionId: "session-789",
    toolName: "lsp_diagnostics_directory",
  },
  result,
  estimate
);

// 5. Track in cost tracker
await trackOmcToolUsage({
  organizationId: "org-123",
  userId: "user-456",
  sessionId: "session-789",
  toolName: "lsp_diagnostics_directory",
  inputTokens: usage.actualInputTokens,
  outputTokens: usage.actualOutputTokens,
  cost: usage.actualCost,
  success: result.success,
});
```

### Cost Calculation

Costs are calculated using Claude Sonnet pricing:
- Input tokens: $0.003 per 1K tokens
- Output tokens: $0.015 per 1K tokens

Formula: `cost = (inputTokens / 1000) * 0.003 + (outputTokens / 1000) * 0.015`

### Estimation Strategies

#### 1. Fixed Strategy

Used for known tools with predefined estimates in `TOOL_COST_ESTIMATES`.

```typescript
const estimate = estimateToolCost("lsp_hover");
// Uses: { input: 50, output: 200 }
```

#### 2. Response Length Strategy

Used for unknown tools when expected response size is known.

```typescript
const estimate = estimateToolCost("custom_tool", {}, 2000);
// Estimates: 2000 chars / 4 = 500 output tokens
```

#### 3. Default Fallback

Used when no information is available.

```typescript
const estimate = estimateToolCost("unknown_tool");
// Uses: { input: 100, output: 500 }
```

### Integration with Cost Tracker

The middleware integrates with the main cost tracking service (`src/services/cost-tracker.ts`):

```typescript
import { trackOmcToolUsage, getOmcToolUsageSummary } from "../services/cost-tracker";

// Track usage
await trackOmcToolUsage({
  organizationId: "org-123",
  userId: "user-456",
  sessionId: "session-789",
  toolName: "lsp_diagnostics",
  inputTokens: 30,
  outputTokens: 450,
  cost: 0.00765,
  success: true,
});

// Get summary
const summary = await getOmcToolUsageSummary("org-123");
console.log(`Total OMC tool cost: $${summary.totalCost.toFixed(2)}`);
console.log(`Success rate: ${(summary.successCount / summary.requestCount * 100).toFixed(1)}%`);

// Per-tool breakdown
for (const [tool, stats] of Object.entries(summary.byTool)) {
  console.log(`${tool}: $${stats.cost.toFixed(4)} (${stats.requests} requests, ${stats.successRate.toFixed(1)}% success)`);
}
```

### Redis Key Patterns

The cost tracker uses the following Redis keys for OMC tool tracking:

- **Daily usage records**: `usage:omc:daily:{organizationId}:{YYYY-MM-DD}`
  - List of raw usage records (7-day retention)

- **Monthly tool metrics**: `usage:omc:tools:{organizationId}:{YYYY-MM}`
  - Hash with aggregated metrics (45-day retention)
  - Fields:
    - `totalCost` (in micro-dollars, ÷1M for dollars)
    - `totalInputTokens`
    - `totalOutputTokens`
    - `requestCount`
    - `successCount`
    - `failureCount`
    - `tool:{toolName}:cost`
    - `tool:{toolName}:requests`
    - `tool:{toolName}:success`
    - `tool:{toolName}:failure`

### Testing

Run the test suite:

```bash
npm test -- src/mcp-servers/omc-bridge/middleware/__tests__/cost.test.ts
```

### Future Enhancements

- Dynamic cost adjustment based on actual provider pricing
- Cost prediction using historical usage patterns
- Cost optimization recommendations (e.g., "Use lsp_hover instead of lsp_diagnostics for quick lookups")
- Per-user cost tracking and quotas
- Cost alerts and notifications
