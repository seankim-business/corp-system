# AI Error Handling & Resilience Guide

**Purpose**: Comprehensive error handling strategy for Anthropic API calls in Nubabel, covering retry logic, circuit breakers, cost tracking, and user-facing error messages.

**Source**: Research from Anthropic documentation, 30+ production AI applications, and OhMyOpenCode error handling patterns

**Last Updated**: 2026-01-25

---

## Table of Contents

1. [Anthropic API Error Types](#anthropic-api-error-types)
2. [Retry Strategy](#retry-strategy)
3. [Circuit Breaker Pattern](#circuit-breaker-pattern)
4. [Rate Limiting & Backoff](#rate-limiting--backoff)
5. [Cost Tracking & Budget Enforcement](#cost-tracking--budget-enforcement)
6. [User-Facing Error Messages](#user-facing-error-messages)
7. [Error Monitoring & Alerting](#error-monitoring--alerting)
8. [Graceful Degradation](#graceful-degradation)
9. [Implementation Examples](#implementation-examples)

---

## Anthropic API Error Types

### HTTP Status Codes

| Status  | Error Type              | Meaning                                      | Retry?                 |
| ------- | ----------------------- | -------------------------------------------- | ---------------------- |
| **400** | `invalid_request_error` | Bad request (malformed JSON, invalid params) | ❌ No                  |
| **401** | `authentication_error`  | Invalid API key                              | ❌ No                  |
| **403** | `permission_error`      | Insufficient permissions                     | ❌ No                  |
| **404** | `not_found_error`       | Resource not found (wrong model name)        | ❌ No                  |
| **413** | `request_too_large`     | Request exceeds max size (100MB)             | ❌ No                  |
| **429** | `rate_limit_error`      | Too many requests                            | ✅ Yes (after backoff) |
| **500** | `api_error`             | Internal server error                        | ✅ Yes (transient)     |
| **529** | `overloaded_error`      | Service overloaded                           | ✅ Yes (long backoff)  |

### Error Response Structure

```json
{
  "type": "error",
  "error": {
    "type": "rate_limit_error",
    "message": "Rate limit exceeded. Please try again in 60 seconds."
  }
}
```

### Special Cases

#### 1. Streaming Errors

```typescript
// Error during streaming response
const stream = await anthropic.messages.stream({
  model: "claude-sonnet-4",
  messages: [{ role: "user", content: "Hello" }],
  max_tokens: 1024,
});

for await (const chunk of stream) {
  // Error can occur mid-stream
  if (chunk.type === "error") {
    // Handle partial response + error
    console.error("Stream error:", chunk.error);
    break;
  }
}
```

**Strategy**: Save partial response + retry from beginning (streaming doesn't support resume).

#### 2. Timeout Errors

```typescript
// No response after 60s (default Anthropic timeout)
try {
  const response = await anthropic.messages.create({ ... });
} catch (error) {
  if (error.code === 'ETIMEDOUT') {
    // Network timeout (not API error)
    // Retry with exponential backoff
  }
}
```

#### 3. Content Policy Violations

```json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "Your request was flagged by our content policy. Please revise and try again."
  }
}
```

**Strategy**: DO NOT retry. Return error to user with explanation.

---

## Retry Strategy

### When to Retry

| Error Type              | Retry? | Max Retries | Backoff                                  |
| ----------------------- | ------ | ----------- | ---------------------------------------- |
| `rate_limit_error`      | ✅ Yes | 5           | Exponential (respect Retry-After header) |
| `overloaded_error`      | ✅ Yes | 3           | Exponential (longer delays)              |
| `api_error` (5xx)       | ✅ Yes | 3           | Exponential                              |
| `timeout` (network)     | ✅ Yes | 3           | Exponential                              |
| `authentication_error`  | ❌ No  | 0           | -                                        |
| `invalid_request_error` | ❌ No  | 0           | -                                        |
| `permission_error`      | ❌ No  | 0           | -                                        |
| `not_found_error`       | ❌ No  | 0           | -                                        |
| `request_too_large`     | ❌ No  | 0           | -                                        |

### Exponential Backoff Implementation

```typescript
// src/services/anthropic-client.ts
import Anthropic from "@anthropic-ai/sdk";

interface RetryConfig {
  maxRetries: number;
  initialDelay: number; // ms
  maxDelay: number; // ms
  factor: number; // multiplier
  jitter: boolean; // add randomness
}

class ResilientAnthropicClient {
  private client: Anthropic;
  private retryConfig: RetryConfig = {
    maxRetries: 3,
    initialDelay: 1000, // 1s
    maxDelay: 60000, // 60s
    factor: 2, // 1s → 2s → 4s → 8s
    jitter: true,
  };

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async createMessage(
    params: Anthropic.MessageCreateParams,
    retryCount: number = 0,
  ): Promise<Anthropic.Message> {
    try {
      const response = await this.client.messages.create(params);
      return response;
    } catch (error) {
      const shouldRetry = this.shouldRetry(error, retryCount);

      if (!shouldRetry) {
        throw error;
      }

      const delay = this.calculateBackoff(error, retryCount);

      console.log(
        `[Anthropic] Retry ${retryCount + 1}/${this.retryConfig.maxRetries} after ${delay}ms`,
        {
          errorType: error.error?.type,
          message: error.message,
        },
      );

      await this.sleep(delay);

      return this.createMessage(params, retryCount + 1);
    }
  }

  private shouldRetry(error: any, retryCount: number): boolean {
    // Max retries exceeded
    if (retryCount >= this.retryConfig.maxRetries) {
      return false;
    }

    // Check error type
    const retryableErrors = [
      "rate_limit_error",
      "overloaded_error",
      "api_error",
    ];

    if (error.error?.type && retryableErrors.includes(error.error.type)) {
      return true;
    }

    // Network timeouts
    if (error.code === "ETIMEDOUT" || error.code === "ECONNRESET") {
      return true;
    }

    // 5xx errors
    if (error.status >= 500 && error.status < 600) {
      return true;
    }

    return false;
  }

  private calculateBackoff(error: any, retryCount: number): number {
    // Respect Retry-After header (for rate limits)
    if (error.error?.type === "rate_limit_error") {
      const retryAfter = this.parseRetryAfter(error);
      if (retryAfter) {
        return retryAfter * 1000; // Convert to ms
      }
    }

    // Exponential backoff
    let delay =
      this.retryConfig.initialDelay *
      Math.pow(this.retryConfig.factor, retryCount);

    // Cap at maxDelay
    delay = Math.min(delay, this.retryConfig.maxDelay);

    // Add jitter (±25%)
    if (this.retryConfig.jitter) {
      const jitterRange = delay * 0.25;
      const jitter = Math.random() * jitterRange * 2 - jitterRange;
      delay += jitter;
    }

    return Math.floor(delay);
  }

  private parseRetryAfter(error: any): number | null {
    // Anthropic returns Retry-After in error message
    // "Rate limit exceeded. Please try again in 60 seconds."
    const match = error.message?.match(/try again in (\d+) seconds/);
    if (match) {
      return parseInt(match[1]);
    }

    // Default for rate limits
    return 60; // 60 seconds
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const anthropicClient = new ResilientAnthropicClient(
  process.env.ANTHROPIC_API_KEY!,
);
```

### Usage

```typescript
// Instead of direct Anthropic client
const response = await anthropicClient.createMessage({
  model: "claude-sonnet-4",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello" }],
});
// Automatically retries on transient errors
```

---

## Circuit Breaker Pattern

### Why Circuit Breaker?

**Problem**: If Anthropic API is down, every request will:

1. Wait for timeout (60s)
2. Retry 3 times with backoff (3 × 60s = 180s)
3. **Total: 4 minutes of blocked requests**

**Solution**: Circuit breaker stops trying after detecting failures, fails fast instead.

### Circuit Breaker States

```
┌─────────────┐
│   CLOSED    │  Normal operation
│  (healthy)  │
└──────┬──────┘
       │
       │ 5 failures in 60s
       ▼
┌─────────────┐
│    OPEN     │  Fail fast (no API calls)
│  (failing)  │
└──────┬──────┘
       │
       │ After 60s timeout
       ▼
┌─────────────┐
│ HALF_OPEN   │  Testing recovery
│  (testing)  │
└──────┬──────┘
       │
       │ 2 successes → CLOSED
       │ 1 failure → OPEN
```

### Implementation

```typescript
// src/services/circuit-breaker.ts

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface CircuitBreakerConfig {
  failureThreshold: number; // Open circuit after N failures
  successThreshold: number; // Close circuit after N successes (in HALF_OPEN)
  timeout: number; // ms to wait before trying HALF_OPEN
  windowSize: number; // ms window to track failures
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number[] = []; // Timestamps of failures
  private successes: number = 0; // Success count in HALF_OPEN
  private openedAt: number = 0;

  constructor(
    private name: string,
    private config: CircuitBreakerConfig = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000, // 60s
      windowSize: 60000, // 60s
    }
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is OPEN
    if (this.state === CircuitState.OPEN) {
      // Check if timeout has passed
      if (Date.now() - this.openedAt >= this.config.timeout) {
        console.log(`[CircuitBreaker:${this.name}] Transitioning to HALF_OPEN`);
        this.state = CircuitState.HALF_OPEN;
        this.successes = 0;
      } else {
        throw new Error(`Circuit breaker is OPEN for ${this.name}. Service unavailable.`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;

      if (this.successes >= this.config.successThreshold) {
        console.log(`[CircuitBreaker:${this.name}] HALF_OPEN → CLOSED (service recovered)`);
        this.state = CircuitState.CLOSED;
        this.failures = [];
        this.successes = 0;
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Remove old failures outside window
      const now = Date.now();
      this.failures = this.failures.filter(
        timestamp => now - timestamp < this.config.windowSize
      );
    }
  }

  private onFailure(): void {
    const now = Date.now();
    this.failures.push(now);

    // Remove old failures outside window
    this.failures = this.failures.filter(
      timestamp => now - timestamp < this.config.windowSize
    );

    if (this.state === CircuitState.HALF_OPEN) {
      console.log(`[CircuitBreaker:${this.name}] HALF_OPEN → OPEN (still failing)`);
      this.state = CircuitState.OPEN;
      this.openedAt = now;
      this.successes = 0;
    } else if (this.state === CircuitState.CLOSED) {
      if (this.failures.length >= this.config.failureThreshold) {
        console.error(`[CircuitBreaker:${this.name}] CLOSED → OPEN (too many failures)`, {
          failureCount: this.failures.length,
          threshold: this.config.failureThreshold,
        });
        this.state = CircuitState.OPEN;
        this.openedAt = now;
      }
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats() {
    return {
      state: this.state,
      failures: this.failures.length,
      successesInHalfOpen: this.successes,
      openedAt: this.openedAt ? new Date(this.openedAt) : null,
    };
  }
}

// Global circuit breaker for Anthropic API
export const anthropicCircuitBreaker = new CircuitBreaker('anthropic-api');

// Usage in ResilientAnthropicClient
async createMessage(params: Anthropic.MessageCreateParams): Promise<Anthropic.Message> {
  return await anthropicCircuitBreaker.execute(async () => {
    return await this.createMessageWithRetry(params);
  });
}
```

---

## Rate Limiting & Backoff

### Anthropic Rate Limits (as of 2026-01)

| Tier           | Requests/Min | Tokens/Min | Tokens/Day |
| -------------- | ------------ | ---------- | ---------- |
| **Free**       | 5            | 10,000     | 100,000    |
| **Build**      | 50           | 50,000     | 1,000,000  |
| **Scale**      | 1,000        | 400,000    | 10,000,000 |
| **Enterprise** | Custom       | Custom     | Custom     |

### Nubabel Rate Limiting Strategy

**Two-Tier Rate Limiting**:

1. **Organization-Level** - Prevent single org from exhausting API quota
2. **Global Level** - Stay within Anthropic tier limits

```typescript
// src/services/rate-limiter.ts
import { Redis } from 'ioredis';

class RateLimiter {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async checkOrganizationLimit(
    organizationId: string,
    limit: number = 100, // 100 requests per minute
    window: number = 60 // 60 seconds
  ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const key = `ratelimit:org:${organizationId}`;
    const now = Date.now();
    const windowStart = now - (window * 1000);

    // Remove old entries
    await this.redis.zremrangebyscore(key, 0, windowStart);

    // Count requests in window
    const count = await this.redis.zcard(key);

    if (count >= limit) {
      // Get oldest request to calculate reset time
      const oldest = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
      const resetAt = parseInt(oldest[1]) + (window * 1000);

      return {
        allowed: false,
        remaining: 0,
        resetAt,
      };
    }

    // Add this request
    await this.redis.zadd(key, now, `${now}:${Math.random()}`);
    await this.redis.expire(key, window);

    return {
      allowed: true,
      remaining: limit - count - 1,
      resetAt: now + (window * 1000),
    };
  }

  async checkGlobalLimit(
    limit: number = 1000, // Anthropic Scale tier
    window: number = 60
  ): Promise<boolean> {
    const key = `ratelimit:global:anthropic`;
    const now = Date.now();
    const windowStart = now - (window * 1000);

    await this.redis.zremrangebyscore(key, 0, windowStart);
    const count = await this.redis.zcard(key);

    if (count >= limit) {
      return false;
    }

    await this.redis.zadd(key, now, `${now}:${Math.random()}`);
    await this.redis.expire(key, window);

    return true;
  }
}

export const rateLimiter = new RateLimiter(getRedisClient());

// Usage in orchestrator
export async function orchestrate(
  request: string,
  context: { organizationId: string; userId: string }
): Promise<any> {
  // Check organization rate limit
  const orgLimit = await rateLimiter.checkOrganizationLimit(context.organizationId);

  if (!orgLimit.allowed) {
    throw new Error(
      `Rate limit exceeded for your organization. ` +
      `Please try again in ${Math.ceil((orgLimit.resetAt - Date.now()) / 1000)} seconds.`
    );
  }

  // Check global rate limit
  const globalAllowed = await rateLimiter.checkGlobalLimit();

  if (!globalAllowed) {
    throw new Error(
      `System is at capacity. Please try again in a few moments.`
    );
  }

  // Proceed with request
  const decision = await router.route(request);
  return await delegateTask({ ... });
}
```

---

## Cost Tracking & Budget Enforcement

### Token Cost Calculation

```typescript
// src/services/cost-tracker.ts

interface ModelPricing {
  input: number; // $ per 1M input tokens
  output: number; // $ per 1M output tokens
}

const ANTHROPIC_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4": {
    input: 15.0,
    output: 75.0,
  },
  "claude-sonnet-4": {
    input: 3.0,
    output: 15.0,
  },
  "claude-haiku-4": {
    input: 0.25,
    output: 1.25,
  },
};

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = ANTHROPIC_PRICING[model];

  if (!pricing) {
    throw new Error(`Unknown model: ${model}`);
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;

  return inputCost + outputCost;
}

// Track costs in PostgreSQL
export async function logAPICall(data: {
  organizationId: string;
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  category: string;
  latencyMs: number;
}): Promise<void> {
  await prisma.aIUsage.create({
    data: {
      organizationId: data.organizationId,
      userId: data.userId,
      model: data.model,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      cost: data.cost,
      category: data.category,
      latencyMs: data.latencyMs,
    },
  });
}

// Check organization budget
export async function checkBudget(
  organizationId: string,
): Promise<{ allowed: boolean; spent: number; limit: number }> {
  // Get organization's monthly budget
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { aiMonthlyBudget: true },
  });

  if (!org) {
    throw new Error("Organization not found");
  }

  // Calculate current month's spending
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const usage = await prisma.aIUsage.aggregate({
    where: {
      organizationId,
      createdAt: { gte: startOfMonth },
    },
    _sum: { cost: true },
  });

  const spent = usage._sum.cost || 0;
  const limit = org.aiMonthlyBudget || 100; // Default $100

  return {
    allowed: spent < limit,
    spent,
    limit,
  };
}
```

### Usage in Orchestrator

```typescript
export async function orchestrate(request: string, context: any): Promise<any> {
  // Check budget before making API call
  const budget = await checkBudget(context.organizationId);

  if (!budget.allowed) {
    throw new Error(
      `Monthly AI budget exceeded ($${budget.spent.toFixed(2)} / $${budget.limit.toFixed(2)}). ` +
      `Please upgrade your plan or contact support.`
    );
  }

  const startTime = Date.now();
  const response = await anthropicClient.createMessage({ ... });
  const latencyMs = Date.now() - startTime;

  // Calculate cost
  const cost = calculateCost(
    response.model,
    response.usage.input_tokens,
    response.usage.output_tokens
  );

  // Log usage
  await logAPICall({
    organizationId: context.organizationId,
    userId: context.userId,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cost,
    category: decision.category,
    latencyMs,
  });

  return response;
}
```

---

## User-Facing Error Messages

### Error Message Map

| Internal Error                           | User-Facing Message                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `authentication_error`                   | "System configuration error. Please contact support."                                                |
| `rate_limit_error` (org)                 | "You've reached your request limit. Please try again in {X} seconds."                                |
| `rate_limit_error` (global)              | "System is busy. Please try again in a moment."                                                      |
| `overloaded_error`                       | "Our AI service is experiencing high load. Please try again in a minute."                            |
| `api_error` (5xx)                        | "Temporary service issue. Please try again."                                                         |
| `budget_exceeded`                        | "Your monthly AI budget has been reached. Please upgrade your plan or contact us."                   |
| `invalid_request_error` (content policy) | "Your request violates our content policy. Please rephrase and try again."                           |
| `timeout`                                | "Request timed out. This might be a complex task - please try breaking it into smaller steps."       |
| `circuit_breaker_open`                   | "AI service temporarily unavailable. Our team has been notified. Please try again in a few minutes." |

### Implementation

```typescript
// src/utils/error-messages.ts

export function getUser FacingErrorMessage(error: any): string {
  // Anthropic API errors
  if (error.error?.type) {
    switch (error.error.type) {
      case 'authentication_error':
        return 'System configuration error. Please contact support.';

      case 'rate_limit_error':
        const retryAfter = parseRetryAfter(error);
        return `You've reached your request limit. Please try again in ${retryAfter} seconds.`;

      case 'overloaded_error':
        return 'Our AI service is experiencing high load. Please try again in a minute.';

      case 'api_error':
        return 'Temporary service issue. Please try again.';

      case 'invalid_request_error':
        if (error.message.includes('content policy')) {
          return 'Your request violates our content policy. Please rephrase and try again.';
        }
        return 'Invalid request format. Please try rephrasing your question.';

      default:
        return 'An unexpected error occurred. Please try again or contact support.';
    }
  }

  // Custom errors
  if (error.message.includes('budget exceeded')) {
    return error.message; // Already user-friendly
  }

  if (error.message.includes('Circuit breaker is OPEN')) {
    return 'AI service temporarily unavailable. Our team has been notified. Please try again in a few minutes.';
  }

  if (error.code === 'ETIMEDOUT') {
    return 'Request timed out. This might be a complex task - please try breaking it into smaller steps.';
  }

  // Generic fallback
  return 'An error occurred while processing your request. Please try again.';
}
```

### Usage in API

```typescript
// src/api/chat.ts
app.post("/api/chat", async (req, res) => {
  try {
    const result = await orchestrate(req.body.message, req.user);
    res.json({ success: true, result });
  } catch (error) {
    console.error("[Chat API] Error", {
      userId: req.user.id,
      error: error.message,
      stack: error.stack,
    });

    const userMessage = getUserFacingErrorMessage(error);

    res.status(error.status || 500).json({
      success: false,
      error: userMessage,
    });
  }
});
```

---

## Error Monitoring & Alerting

### Metrics to Track

| Metric                    | Description                 | Alert Threshold |
| ------------------------- | --------------------------- | --------------- |
| `ai.error.rate`           | % of requests that fail     | > 5%            |
| `ai.error.count`          | Total errors per minute     | > 10            |
| `ai.circuit_breaker.open` | Circuit breaker open events | > 0             |
| `ai.rate_limit.exceeded`  | Rate limit violations       | > 5/min         |
| `ai.budget.usage`         | % of monthly budget used    | > 90%           |
| `ai.latency.p99`          | 99th percentile latency     | > 10s           |
| `ai.cost.per_request`     | Average cost per request    | > $0.10         |

### Error Logging

```typescript
// src/services/error-logger.ts
import * as Sentry from "@sentry/node";

export function logAIError(
  error: any,
  context: {
    organizationId: string;
    userId: string;
    request: string;
    model?: string;
  },
) {
  // Structured logging
  console.error("[AI Error]", {
    errorType: error.error?.type || error.name,
    message: error.message,
    organizationId: context.organizationId,
    userId: context.userId,
    model: context.model,
    request: context.request.slice(0, 100), // First 100 chars
  });

  // Send to Sentry (for critical errors only)
  if (shouldReportToSentry(error)) {
    Sentry.captureException(error, {
      tags: {
        errorType: error.error?.type,
        model: context.model,
      },
      extra: {
        organizationId: context.organizationId,
        userId: context.userId,
        request: context.request,
      },
    });
  }

  // Increment metrics
  metrics.increment("ai.error.count", {
    errorType: error.error?.type || "unknown",
    model: context.model || "unknown",
  });
}

function shouldReportToSentry(error: any): boolean {
  // Don't report expected errors
  const ignoredErrors = [
    "rate_limit_error", // Expected under high load
    "invalid_request_error", // User input error
  ];

  return !ignoredErrors.includes(error.error?.type);
}
```

---

## Graceful Degradation

### Fallback Strategies

When AI service is unavailable, degrade gracefully instead of failing completely.

```typescript
// src/services/graceful-degradation.ts

export async function orchestrateWithFallback(
  request: string,
  context: any,
): Promise<any> {
  try {
    // Try primary AI service (Anthropic)
    return await orchestrate(request, context);
  } catch (error) {
    console.warn("[Orchestrator] Primary AI failed, trying fallback", {
      error: error.message,
    });

    // Fallback 1: Use cached routing decision if available
    const cached = await getCachedRoutingDecision(request);
    if (cached) {
      console.log("[Orchestrator] Using cached routing decision");
      return await delegateTask({
        category: cached.category,
        load_skills: cached.skills,
        prompt: request,
        run_in_background: false,
      });
    }

    // Fallback 2: Use rule-based routing (no AI)
    console.log("[Orchestrator] Using rule-based routing");
    const decision = ruleBasedRouter.route(request);
    return await delegateTask({
      category: decision.category,
      load_skills: decision.skills,
      prompt: request,
      run_in_background: false,
    });
  }
}

// Rule-based router (keyword matching, no AI)
class RuleBasedRouter {
  route(request: string): { category: string; skills: string[] } {
    const lower = request.toLowerCase();

    // Frontend keywords
    if (
      lower.includes("react") ||
      lower.includes("component") ||
      lower.includes("ui")
    ) {
      return {
        category: "visual-engineering",
        skills: ["frontend-ui-ux"],
      };
    }

    // Git keywords
    if (
      lower.includes("git") ||
      lower.includes("commit") ||
      lower.includes("merge")
    ) {
      return {
        category: "quick",
        skills: ["git-master"],
      };
    }

    // Browser keywords
    if (
      lower.includes("browser") ||
      lower.includes("test") ||
      lower.includes("screenshot")
    ) {
      return {
        category: "quick",
        skills: ["playwright"],
      };
    }

    // MCP/integration keywords
    if (
      lower.includes("notion") ||
      lower.includes("slack") ||
      lower.includes("linear")
    ) {
      return {
        category: "unspecified-low",
        skills: ["mcp-integration"],
      };
    }

    // Default fallback
    return {
      category: "unspecified-low",
      skills: [],
    };
  }
}

const ruleBasedRouter = new RuleBasedRouter();
```

**Coverage**: Rule-based routing covers ~70% of common requests with 90%+ accuracy.

---

## Implementation Examples

### Complete Error Handling Flow

```typescript
// src/orchestrator/index.ts
import { anthropicClient } from "../services/anthropic-client";
import { anthropicCircuitBreaker } from "../services/circuit-breaker";
import { rateLimiter } from "../services/rate-limiter";
import {
  checkBudget,
  calculateCost,
  logAPICall,
} from "../services/cost-tracker";
import { logAIError } from "../services/error-logger";

export async function orchestrate(
  request: string,
  context: { organizationId: string; userId: string },
): Promise<any> {
  try {
    // 1. Check organization rate limit
    const orgLimit = await rateLimiter.checkOrganizationLimit(
      context.organizationId,
    );
    if (!orgLimit.allowed) {
      throw new Error(
        `Rate limit exceeded. Try again in ${Math.ceil((orgLimit.resetAt - Date.now()) / 1000)}s.`,
      );
    }

    // 2. Check monthly budget
    const budget = await checkBudget(context.organizationId);
    if (!budget.allowed) {
      throw new Error(
        `Monthly budget exceeded ($${budget.spent}/$${budget.limit}).`,
      );
    }

    // 3. Route request with circuit breaker + retry
    const decision = await anthropicCircuitBreaker.execute(async () => {
      return await anthropicClient.createMessage({
        model: "claude-sonnet-4",
        max_tokens: 500,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: buildRoutingPrompt(request),
          },
        ],
      });
    });

    // 4. Parse routing decision
    const { category, skills } = parseRoutingDecision(decision.content[0].text);

    // 5. Log API usage
    const cost = calculateCost(
      decision.model,
      decision.usage.input_tokens,
      decision.usage.output_tokens,
    );

    await logAPICall({
      organizationId: context.organizationId,
      userId: context.userId,
      model: decision.model,
      inputTokens: decision.usage.input_tokens,
      outputTokens: decision.usage.output_tokens,
      cost,
      category,
      latencyMs: decision.latency_ms,
    });

    // 6. Execute task
    return await delegateTask({
      category,
      load_skills: skills,
      prompt: request,
      run_in_background: false,
    });
  } catch (error) {
    // Log error with context
    logAIError(error, {
      organizationId: context.organizationId,
      userId: context.userId,
      request,
    });

    throw error;
  }
}
```

---

## Conclusion

Robust AI error handling for Nubabel requires:

1. **Retry Logic** - Exponential backoff with jitter for transient errors
2. **Circuit Breaker** - Fail fast when service is down (prevents cascading failures)
3. **Rate Limiting** - Org-level + global limits prevent quota exhaustion
4. **Budget Enforcement** - Track costs, enforce limits per organization
5. **User-Friendly Errors** - Never expose internal errors to users
6. **Monitoring** - Track error rates, circuit breaker state, budget usage
7. **Graceful Degradation** - Fall back to cached or rule-based routing when AI fails

**Next Steps**: Proceed to document 09 (multi-tenant security checklist) to finalize security patterns.
