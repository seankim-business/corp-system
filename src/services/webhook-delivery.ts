/**
 * Webhook Delivery Service
 * Reliable webhook delivery with exponential backoff retries and DLQ
 */

import { redis } from "../db/redis";
import { logger } from "../utils/logger";

interface WebhookPayload {
  id: string;
  url: string;
  method: "POST" | "PUT" | "PATCH";
  headers: Record<string, string>;
  body: unknown;
  organizationId: string;
  eventType: string;
  createdAt: string;
}

interface DeliveryAttempt {
  attemptNumber: number;
  timestamp: string;
  statusCode?: number;
  error?: string;
  duration?: number;
}

interface WebhookDeliveryRecord {
  payload: WebhookPayload;
  attempts: DeliveryAttempt[];
  status: "pending" | "delivered" | "failed" | "dlq";
  nextRetry?: string;
  lastAttempt?: string;
}

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 300000; // 5 minutes

function calculateBackoff(attempt: number): number {
  const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
  // Add jitter (±10%)
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  return Math.floor(delay + jitter);
}

function generateWebhookId(): string {
  return `wh_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

async function signPayload(payload: unknown, secret: string): Promise<string> {
  const crypto = await import("crypto");
  const data = JSON.stringify(payload);
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

export async function enqueueWebhook(
  url: string,
  eventType: string,
  body: unknown,
  organizationId: string,
  options: {
    headers?: Record<string, string>;
    secret?: string;
  } = {},
): Promise<string> {
  const webhookId = generateWebhookId();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Webhook-ID": webhookId,
    "X-Event-Type": eventType,
    "X-Timestamp": new Date().toISOString(),
    ...options.headers,
  };

  if (options.secret) {
    headers["X-Signature"] = await signPayload(body, options.secret);
  }

  const payload: WebhookPayload = {
    id: webhookId,
    url,
    method: "POST",
    headers,
    body,
    organizationId,
    eventType,
    createdAt: new Date().toISOString(),
  };

  const record: WebhookDeliveryRecord = {
    payload,
    attempts: [],
    status: "pending",
  };

  await redis.set(`webhook:${webhookId}`, JSON.stringify(record), 86400 * 7);
  await redis.lpush("webhook:queue:pending", webhookId);

  logger.info("Webhook enqueued", { webhookId, url, eventType, organizationId });

  return webhookId;
}

export async function processWebhookQueue(): Promise<void> {
  while (true) {
    // Get webhook from pending queue and move to processing
    const webhookId = await rpoplpush("webhook:queue:pending", "webhook:queue:processing");
    if (!webhookId) break;

    await deliverWebhook(webhookId);
  }
}

async function rpoplpush(source: string, destination: string): Promise<string | null> {
  // Redis rpoplpush atomically pops from right of source and pushes to left of destination
  const lua = `
    local val = redis.call('RPOP', KEYS[1])
    if val then
      redis.call('LPUSH', KEYS[2], val)
    end
    return val
  `;

  const result = await redis.eval(lua, 2, source, destination);
  return result as string | null;
}

async function lrem(key: string, count: number, value: string): Promise<number> {
  // Redis lrem removes count occurrences of value from list
  const lua = `
    return redis.call('LREM', KEYS[1], ARGV[1], ARGV[2])
  `;

  const result = await redis.eval(lua, 1, key, count.toString(), value);
  return result as number;
}

async function zadd(key: string, score: number, member: string): Promise<number> {
  // Redis zadd adds member with score to sorted set
  const lua = `
    return redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2])
  `;

  const result = await redis.eval(lua, 1, key, score.toString(), member);
  return result as number;
}

async function zrangebyscore(key: string, min: string, max: string): Promise<string[]> {
  // Redis zrangebyscore returns members with scores between min and max
  const lua = `
    return redis.call('ZRANGEBYSCORE', KEYS[1], ARGV[1], ARGV[2])
  `;

  const result = await redis.eval(lua, 1, key, min, max);
  return result as string[];
}

async function zrem(key: string, member: string): Promise<number> {
  // Redis zrem removes member from sorted set
  const lua = `
    return redis.call('ZREM', KEYS[1], ARGV[1])
  `;

  const result = await redis.eval(lua, 1, key, member);
  return result as number;
}

async function zcard(key: string): Promise<number> {
  // Redis zcard returns cardinality of sorted set
  const lua = `
    return redis.call('ZCARD', KEYS[1])
  `;

  const result = await redis.eval(lua, 1, key);
  return result as number;
}

async function llen(key: string): Promise<number> {
  // Redis llen returns length of list
  const lua = `
    return redis.call('LLEN', KEYS[1])
  `;

  const result = await redis.eval(lua, 1, key);
  return result as number;
}

async function deliverWebhook(webhookId: string): Promise<void> {
  const recordJson = await redis.get(`webhook:${webhookId}`);
  if (!recordJson) {
    logger.warn("Webhook record not found", { webhookId });
    await lrem("webhook:queue:processing", 1, webhookId);
    return;
  }

  const record: WebhookDeliveryRecord = JSON.parse(recordJson);
  const attemptNumber = record.attempts.length + 1;

  const attempt: DeliveryAttempt = {
    attemptNumber,
    timestamp: new Date().toISOString(),
  };

  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(record.payload.url, {
      method: record.payload.method,
      headers: record.payload.headers,
      body: JSON.stringify(record.payload.body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    attempt.statusCode = response.status;
    attempt.duration = Date.now() - startTime;

    if (response.ok) {
      record.status = "delivered";
      record.lastAttempt = attempt.timestamp;
      record.attempts.push(attempt);

      await redis.set(`webhook:${webhookId}`, JSON.stringify(record), 86400);
      await lrem("webhook:queue:processing", 1, webhookId);

      logger.info("Webhook delivered", {
        webhookId,
        statusCode: response.status,
        duration: attempt.duration,
        attempts: attemptNumber,
      });

      // Record success metrics
      await redis.hincrby("webhook:metrics:delivered", record.payload.eventType, 1);
      return;
    }

    // Non-2xx response
    attempt.error = `HTTP ${response.status}: ${await response.text().catch(() => "Unknown error")}`;
  } catch (error) {
    attempt.duration = Date.now() - startTime;
    attempt.error = error instanceof Error ? error.message : String(error);
  }

  record.attempts.push(attempt);
  record.lastAttempt = attempt.timestamp;

  if (attemptNumber >= MAX_RETRIES) {
    // Move to DLQ
    record.status = "dlq";
    await redis.set(`webhook:${webhookId}`, JSON.stringify(record), 86400 * 30);
    await lrem("webhook:queue:processing", 1, webhookId);
    await redis.lpush("webhook:queue:dlq", webhookId);

    logger.error("Webhook moved to DLQ after max retries", {
      webhookId,
      attempts: attemptNumber,
      lastError: attempt.error,
    });

    await redis.hincrby("webhook:metrics:failed", record.payload.eventType, 1);
    return;
  }

  // Schedule retry
  const delay = calculateBackoff(attemptNumber);
  record.status = "pending";
  record.nextRetry = new Date(Date.now() + delay).toISOString();

  await redis.set(`webhook:${webhookId}`, JSON.stringify(record), 86400 * 7);
  await lrem("webhook:queue:processing", 1, webhookId);
  await zadd("webhook:queue:retry", Date.now() + delay, webhookId);

  logger.warn("Webhook delivery failed, scheduling retry", {
    webhookId,
    attemptNumber,
    nextRetry: record.nextRetry,
    error: attempt.error,
  });

  await redis.hincrby("webhook:metrics:retried", record.payload.eventType, 1);
}

export async function processRetryQueue(): Promise<void> {
  const now = Date.now();
  const webhookIds = await zrangebyscore("webhook:queue:retry", "-inf", now.toString());

  for (const webhookId of webhookIds) {
    await zrem("webhook:queue:retry", webhookId);
    await redis.lpush("webhook:queue:pending", webhookId);
  }

  if (webhookIds.length > 0) {
    logger.debug("Moved webhooks from retry to pending queue", { count: webhookIds.length });
  }
}

export async function getWebhookStatus(webhookId: string): Promise<WebhookDeliveryRecord | null> {
  const recordJson = await redis.get(`webhook:${webhookId}`);
  if (!recordJson) return null;
  return JSON.parse(recordJson);
}

export async function retryFromDLQ(webhookId: string): Promise<void> {
  const recordJson = await redis.get(`webhook:${webhookId}`);
  if (!recordJson) {
    throw new Error(`Webhook not found: ${webhookId}`);
  }

  const record: WebhookDeliveryRecord = JSON.parse(recordJson);
  if (record.status !== "dlq") {
    throw new Error(`Webhook not in DLQ: ${webhookId}`);
  }

  record.status = "pending";
  record.attempts = []; // Reset attempts

  await redis.set(`webhook:${webhookId}`, JSON.stringify(record), 86400 * 7);
  await lrem("webhook:queue:dlq", 1, webhookId);
  await redis.lpush("webhook:queue:pending", webhookId);

  logger.info("Webhook moved from DLQ to pending", { webhookId });
}

export async function getQueueStats(): Promise<Record<string, unknown>> {
  const [pending, processing, retry, dlq] = await Promise.all([
    llen("webhook:queue:pending"),
    llen("webhook:queue:processing"),
    zcard("webhook:queue:retry"),
    llen("webhook:queue:dlq"),
  ]);

  const [delivered, failed, retried] = await Promise.all([
    redis.hgetall("webhook:metrics:delivered"),
    redis.hgetall("webhook:metrics:failed"),
    redis.hgetall("webhook:metrics:retried"),
  ]);

  return {
    queues: {
      pending,
      processing,
      retry,
      dlq,
    },
    metrics: {
      delivered: delivered || {},
      failed: failed || {},
      retried: retried || {},
    },
  };
}

export async function getDLQWebhooks(limit = 50): Promise<WebhookDeliveryRecord[]> {
  const webhookIds = await redis.lrange("webhook:queue:dlq", 0, limit - 1);
  const records: WebhookDeliveryRecord[] = [];

  for (const id of webhookIds) {
    const recordJson = await redis.get(`webhook:${id}`);
    if (recordJson) {
      records.push(JSON.parse(recordJson));
    }
  }

  return records;
}
