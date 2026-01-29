# Claude API Monitoring System

## Overview

This document describes the monitoring system for Claude API usage in Nubabel. The system tracks requests, token usage, cost, and rate limits to provide visibility and prevent quota exhaustion.

## When to Enable Multi-Account Setup

### Decision Criteria

Enable multi-account Claude Max setup when **ANY** of the following conditions are met:

| Metric              | Threshold           | Action                                       |
| ------------------- | ------------------- | -------------------------------------------- |
| **Requests/Hour**   | >1,000 consistently | Consider multi-account                       |
| **429 Errors**      | >3 per day          | Enable multi-account ASAP                    |
| **Daily Cost**      | >$100               | Consider multi-account or usage optimization |
| **Quota Remaining** | <20% daily          | Enable multi-account                         |
| **Error Rate**      | >5%                 | Investigate + consider multi-account         |

### Current Monitoring

Check `/api/health/anthropic` for real-time metrics:

```bash
curl https://your-nubabel-instance.com/api/health/anthropic
```

**Example Response:**

```json
{
  "success": true,
  "timestamp": "2026-01-30T10:00:00.000Z",
  "current_usage": {
    "last_minute": {
      "requests": 12,
      "tokens": 3500,
      "cost": 0.0105,
      "errors": 0,
      "rate_limit_hits": 0
    },
    "last_hour": {
      "requests": 654,
      "tokens": 185000,
      "cost": 0.555,
      "errors": 2,
      "rate_limit_hits": 0
    },
    "today": {
      "requests": 8234,
      "tokens": 2340000,
      "cost": 7.02,
      "errors": 12,
      "rate_limit_hits": 0
    }
  },
  "quota": {
    "max_requests_per_day": 40000,
    "current_requests": 8234,
    "quota_remaining": "79.42%",
    "estimated_daily_requests": 11000
  },
  "breakdown": {
    "by_model": {
      "claude-3-5-haiku-20241022": { "requests": 4523, "cost": 1.357 },
      "claude-3-5-sonnet-20241022": { "requests": 3711, "cost": 5.663 }
    },
    "by_category": {
      "quick": { "requests": 4523, "cost": 1.357 },
      "artistry": { "requests": 2341, "cost": 3.512 },
      "ultrabrain": { "requests": 1370, "cost": 2.055 }
    }
  },
  "warnings": ["Estimated daily requests (11000) approaching limit (40000)"]
}
```

## Monitoring Architecture

### Components

1. **AnthropicMetricsTracker** (`/src/services/anthropic-metrics.ts`)
   - Tracks all Claude API requests
   - Stores time-series data in Redis (minute, hour, day windows)
   - Calculates quota estimates and usage patterns

2. **AI Executor Integration** (`/src/orchestrator/ai-executor.ts`)
   - Records metrics for every API call (success/failure)
   - Detects rate limit errors (429)
   - Non-blocking metric recording (fire-and-forget)

3. **Health Endpoint** (`/api/health/anthropic`)
   - Exposes real-time usage metrics
   - Provides quota estimation
   - Generates warnings when approaching limits

4. **Slack Alerts** (`/src/services/slack-anthropic-alerts.ts`)
   - Sends alerts to `#eng-alerts` on rate limit hits
   - Quota warnings when <20% remaining
   - Includes cooldown mechanism (5min rate limits, 30min quota)

### Data Flow

```
Claude API Call
  ↓
ai-executor.ts (record request)
  ↓
anthropic-metrics.ts (track in Redis + MetricsCollector)
  ↓
[If 429 error detected]
  ↓
slack-anthropic-alerts.ts (send alert to #eng-alerts)
```

### Redis Keys

| Key Pattern                               | TTL     | Purpose           |
| ----------------------------------------- | ------- | ----------------- |
| `anthropic:stats:minute:YYYY-MM-DD:HH:MM` | 2 min   | Last minute stats |
| `anthropic:stats:hour:YYYY-MM-DD:HH`      | 2 hours | Last hour stats   |
| `anthropic:stats:day:YYYY-MM-DD`          | 2 days  | Today's stats     |

**Stored Fields:**

- `requests` - Total request count
- `tokens` - Total tokens used (input + output)
- `cost` - Total cost in microdollars (×1,000,000)
- `errors` - Error count
- `rateLimitHits` - 429 error count

## Slack Alerts

### Rate Limit Alert

**Sent to:** `#eng-alerts` (configurable via `SLACK_ALERT_CHANNEL`)

**Trigger:** 429 error from Claude API

**Cooldown:** 5 minutes (prevents spam)

**Alert Format:**

```
⚠️ Claude API Rate Limit Hit

Account: Default
Time: 2026-01-30 14:32:18
Requests Today: 8,234
Quota Remaining: 79%

Error:
```

429 Too Many Requests: Request rate limit exceeded

```

Recommendation: Consider enabling multi-account setup to distribute load.

Total rate limit hits today: 1 | Cost: $7.02 | Tokens: 2,340,000
```

### Quota Warning Alert

**Sent to:** `#eng-alerts`

**Trigger:** Quota remaining <20%

**Cooldown:** 30 minutes

**Alert Format:**

```
🚨 Claude API Quota Warning

Quota Remaining: 18%
Estimated Daily: 11,000 / 40,000

Action Required: Consider reducing usage or upgrading tier.
```

## Metrics Available

### MetricsCollector (Prometheus Format)

Exposed at `/metrics` (if Prometheus exporter enabled):

- `anthropic_requests_total` - Total requests (labels: model, category, success)
- `anthropic_tokens_total` - Total tokens (labels: model, category, type=input|output)
- `anthropic_cost_total` - Total cost in USD (labels: model, category)
- `anthropic_rate_limit_hits_total` - Total 429 errors (labels: account)
- `anthropic_request_duration_seconds` - Request duration histogram
- `anthropic_errors_total` - Total errors (labels: error_type)

### OpenTelemetry Spans

All Claude API calls include these attributes:

- `ai.model` - Model used (e.g., "claude-3-5-sonnet-20241022")
- `ai.category` - Category (quick, artistry, ultrabrain, etc.)
- `ai.tokens.input` - Input tokens (actual from API)
- `ai.tokens.output` - Output tokens (actual from API)
- `ai.cost_usd` - Cost in USD
- `ai.duration_ms` - Duration in milliseconds
- `organization.id` - Organization ID (multi-tenant)
- `user.id` - User ID

## Tier Detection

The system automatically estimates your Claude API tier based on usage patterns:

| Tier         | Max Requests/Day | Detection Logic             |
| ------------ | ---------------- | --------------------------- |
| **Free**     | 50               | current + estimated < 60    |
| **Standard** | 1,000            | current + estimated < 1,200 |
| **Pro**      | 5,000            | current + estimated < 6,000 |
| **Max**      | 40,000           | current + estimated ≥ 6,000 |

**Note:** This is an _estimate_ based on observed traffic patterns, not guaranteed accurate.

## Multi-Account Setup (Future)

When monitoring data shows you need multi-account support:

1. **Create 2+ Claude Max accounts**
2. **Configure environment variables:**

   ```bash
   CLAUDE_ACCOUNT_1_API_KEY=sk-ant-api03-xxx
   CLAUDE_ACCOUNT_1_NAME=nubabel-primary
   CLAUDE_ACCOUNT_2_API_KEY=sk-ant-api03-yyy
   CLAUDE_ACCOUNT_2_NAME=nubabel-secondary
   ```

3. **Enable multi-account pooling:**

   ```bash
   ENABLE_ACCOUNT_POOL=true
   ```

4. **Monitor distribution:**
   - Check `/api/health/anthropic` for per-account stats
   - Verify round-robin distribution in logs

## Troubleshooting

### "No metrics showing up"

**Check:**

1. Redis connection working? `curl http://your-instance/health/redis-pool`
2. API calls being made? Check logs for "Executing AI request"
3. MetricsCollector initialized? Check startup logs

### "Rate limit alerts not sending"

**Check:**

1. Slack token configured? `SLACK_BOT_TOKEN` in env
2. Alert channel exists? `#eng-alerts` or configured channel
3. Cooldown active? Alerts limited to 5 min interval
4. Check logs for "Failed to send rate limit alert"

### "Quota estimates seem wrong"

**Reason:** Estimates are based on current day's traffic extrapolated to 24 hours.

**Fix:** Wait until more data collected (at least 4-6 hours of traffic) for accurate estimates.

## Maintenance

### Redis Key Cleanup

Keys auto-expire via TTL:

- Minute keys: 2 min TTL
- Hour keys: 2 hours TTL
- Day keys: 2 days TTL

No manual cleanup needed.

### Cost Tracking Accuracy

Cost calculations use hardcoded model pricing (as of 2026-01-29):

| Model  | Input (per 1K tokens) | Output (per 1K tokens) |
| ------ | --------------------- | ---------------------- |
| Haiku  | $0.001                | $0.005                 |
| Sonnet | $0.003                | $0.015                 |
| Opus   | $0.015                | $0.075                 |

**Important:** Update pricing in `/src/orchestrator/ai-executor.ts` when Anthropic changes pricing.

## API Reference

### GET /api/health/anthropic

Returns real-time Claude API usage metrics.

**Response:**

```json
{
  "success": boolean,
  "timestamp": string,
  "current_usage": {
    "last_minute": UsageStats,
    "last_hour": UsageStats,
    "today": UsageStats
  },
  "quota": QuotaEstimate,
  "breakdown": {
    "by_model": Record<string, ModelStats>,
    "by_category": Record<string, CategoryStats>
  },
  "warnings": string[]
}
```

**Usage Stats:**

```typescript
{
  requests: number;
  tokens: number;
  cost: number; // USD
  errors: number;
  rate_limit_hits: number;
}
```

**Quota Estimate:**

```typescript
{
  max_requests_per_day: number;
  current_requests: number;
  quota_remaining: string; // percentage
  estimated_daily_requests: number;
}
```

## See Also

- [Multi-Account Setup Guide](./MULTI_ACCOUNT_SETUP.md) (future)
- [Cost Optimization Guide](./COST_OPTIMIZATION.md) (future)
- [OpenTelemetry Configuration](./OBSERVABILITY.md)
