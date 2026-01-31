# OMC Bridge Cost Tracking Implementation

## Summary

Implemented comprehensive cost tracking and estimation for OMC (Oh-My-ClaudeCode) tool usage, extending the existing cost tracking service to support tool-level monitoring, budget enforcement, and usage analytics.

## Files Created

### 1. `src/mcp-servers/omc-bridge/middleware/cost.ts`
Core cost tracking middleware with three main functions:

- **`estimateToolCost()`** - Pre-execution cost estimation
  - Strategy 1: Fixed estimates for known tools (7 tools defined)
  - Strategy 2: Response length estimation (chars/4 = tokens)
  - Strategy 3: Default fallback (100 input, 500 output tokens)

- **`recordToolUsage()`** - Post-execution usage recording
  - Uses explicit token count if provided
  - Falls back to response length estimation
  - Returns actual input/output tokens and cost

- **`checkBudgetLimit()`** - Budget enforcement
  - Checks if execution would exceed monthly budget
  - Returns allowed/blocked status with reason

### 2. `src/services/cost-tracker.ts` (Extended)
Added OMC-specific tracking to existing cost service:

**New Interfaces:**
- `OmcToolUsageRecord` - Individual tool usage record
- `OmcToolUsageSummary` - Aggregated usage statistics

**New Functions:**
- `trackOmcToolUsage()` - Record tool usage in Redis
- `getOmcToolUsageSummary()` - Get monthly usage summary with per-tool breakdown

**Redis Keys:**
- `usage:omc:daily:{orgId}:{date}` - Daily usage records (7-day retention)
- `usage:omc:tools:{orgId}:{month}` - Monthly aggregates (45-day retention)

### 3. `src/mcp-servers/omc-bridge/middleware/__tests__/cost.test.ts`
Comprehensive test suite covering:
- Fixed cost estimation for known tools
- Response length estimation strategy
- Default fallback behavior
- Usage recording with different data sources
- Budget limit enforcement
- Tool cost estimate validation

### 4. `src/mcp-servers/omc-bridge/middleware/README.md`
Complete documentation including:
- Feature overview
- Tool cost estimates table
- Usage examples
- Integration guide
- Redis key patterns
- Testing instructions

### 5. `src/mcp-servers/omc-bridge/example-integration.ts`
Production-ready integration examples:
- `executeOmcTool()` - Full cost tracking workflow
- `getOmcCostReport()` - Cost analytics and recommendations
- `executeBatchOmcTools()` - Batch execution with cost limits

## Tool Cost Estimates

| Tool | Input Tokens | Output Tokens | Estimated Cost |
|------|--------------|---------------|----------------|
| `lsp_hover` | 50 | 200 | $0.0032 |
| `lsp_goto_definition` | 50 | 100 | $0.0017 |
| `lsp_find_references` | 50 | 500 | $0.0077 |
| `lsp_diagnostics` | 30 | 500 | $0.0076 |
| `lsp_diagnostics_directory` | 30 | 2000 | $0.0301 |
| `ast_grep_search` | 100 | 1000 | $0.0153 |
| `python_repl` | 200 | 500 | $0.0081 |

*Costs based on Claude Sonnet pricing: $0.003/1K input, $0.015/1K output*

## Architecture

```
┌─────────────────────────────────────────┐
│        MCP Server Tool Handler          │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│   estimateToolCost()                    │
│   - Fixed strategy for known tools      │
│   - Response length for unknown         │
│   - Default fallback                    │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│   checkBudgetLimit()                    │
│   - Query current month spend           │
│   - Check against org budget            │
│   - Allow/block execution               │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│       Execute Tool via MCP              │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│   recordToolUsage()                     │
│   - Measure actual tokens used          │
│   - Calculate actual cost               │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│   trackOmcToolUsage()                   │
│   - Store in Redis (daily + monthly)   │
│   - Aggregate per-tool metrics          │
│   - Track success/failure rates         │
└─────────────────────────────────────────┘
```

## Usage Flow

### 1. Pre-Execution
```typescript
const estimate = estimateToolCost("lsp_diagnostics_directory");
const budgetCheck = await checkBudgetLimit(
  organizationId,
  estimate.estimatedCost,
  currentSpend,
  monthlyLimit
);

if (!budgetCheck.allowed) {
  throw new Error(budgetCheck.reason);
}
```

### 2. Execution
```typescript
const result = await executeMcpTool(toolName, parameters);
```

### 3. Post-Execution
```typescript
const usage = recordToolUsage(context, result, estimate);

await trackOmcToolUsage({
  organizationId,
  userId,
  sessionId,
  toolName,
  inputTokens: usage.actualInputTokens,
  outputTokens: usage.actualOutputTokens,
  cost: usage.actualCost,
  success: result.success,
});
```

### 4. Analytics
```typescript
const summary = await getOmcToolUsageSummary(organizationId);

console.log(`Total cost: $${summary.totalCost.toFixed(2)}`);
console.log(`Success rate: ${(summary.successCount / summary.requestCount * 100).toFixed(1)}%`);

for (const [tool, stats] of Object.entries(summary.byTool)) {
  console.log(`${tool}: $${stats.cost.toFixed(4)} (${stats.requests} requests)`);
}
```

## Redis Data Structure

### Daily Usage Records
```
Key: usage:omc:daily:{orgId}:2026-01-29
Type: List
TTL: 7 days
Value: JSON records of individual tool executions
```

### Monthly Aggregates
```
Key: usage:omc:tools:{orgId}:2026-01
Type: Hash
TTL: 45 days
Fields:
  - totalCost (micro-dollars)
  - totalInputTokens
  - totalOutputTokens
  - requestCount
  - successCount
  - failureCount
  - tool:lsp_hover:cost
  - tool:lsp_hover:requests
  - tool:lsp_hover:success
  - tool:lsp_hover:failure
  - ... (per tool)
```

## Cost Optimization Recommendations

The system can generate recommendations based on usage patterns:

1. **High-cost tool overuse**: "Consider using 'lsp_diagnostics' for specific files instead of directory-wide scans"

2. **Low success rate**: "Tool 'python_repl' has low success rate (65%). Review error logs to reduce wasted costs."

3. **Budget warnings**: "Budget is over 75% consumed. Monitor usage closely to avoid exceeding limit."

## Testing

Run the test suite:
```bash
npm test -- src/mcp-servers/omc-bridge/middleware/__tests__/cost.test.ts
```

Test coverage includes:
- ✅ Fixed cost estimation
- ✅ Response length estimation
- ✅ Default fallback estimation
- ✅ Explicit token usage recording
- ✅ Response length-based recording
- ✅ Budget limit enforcement
- ✅ Cost estimate validation

## Future Enhancements

1. **Dynamic Pricing**: Update costs based on actual provider pricing changes
2. **Cost Prediction**: ML-based prediction of tool costs based on parameters
3. **Per-User Quotas**: Individual user cost limits within organization
4. **Cost Alerts**: Real-time notifications when approaching budget limits
5. **Tool Optimization**: Automatic suggestion of cheaper alternative tools
6. **Historical Trends**: Cost trend analysis and forecasting

## Integration Checklist

- [x] Cost estimation middleware
- [x] Budget enforcement
- [x] Usage tracking in Redis
- [x] Per-tool breakdown
- [x] Success rate tracking
- [x] Test coverage
- [x] Documentation
- [x] Example integration
- [ ] API endpoints for cost queries (future)
- [ ] Frontend cost dashboard (future)
- [ ] Alert system (future)

## Notes

- Costs stored as micro-dollars (multiply by 1M) for integer precision in Redis
- Token estimation uses chars/4 approximation (standard for Claude models)
- Budget checks are advisory (can be overridden for critical operations)
- All Redis operations use atomic increments for thread-safety
- 7-day retention for detailed records, 45-day for aggregates
