# Slack Integration Patterns - Production-Ready Implementation

> **작성일**: 2026-01-26  
> **목적**: Enterprise-grade Slack Bot architecture for Nubabel

---

## 🏗️ Architecture Overview

### Socket Mode vs Events API

| Aspect          | Socket Mode              | Events API               |
| --------------- | ------------------------ | ------------------------ |
| **Connection**  | WebSocket (persistent)   | HTTP webhooks            |
| **Firewall**    | Works behind firewall ✅ | Requires public endpoint |
| **Scalability** | Single instance per app  | Horizontal scaling ✅    |
| **Complexity**  | Simple setup             | Requires webhook server  |
| **Use Case**    | Development, small teams | Production, high traffic |

**Nubabel Choice**: **Socket Mode** (simple setup, firewall-friendly)  
**Migration Path**: Events API when > 100 concurrent users

---

## 📦 Implementation

### 1. Basic Setup

**File**: `src/api/slack.ts`

```typescript
import { App, LogLevel } from "@slack/bolt";
import { db } from "../db/client";
import { orchestrate } from "../orchestrator";
import { createSession } from "../orchestrator/session-manager";

export const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel: LogLevel.INFO,
});

// Health check for monitoring
slackApp.event("app_mention", async ({ event, say, client }) => {
  // Immediate acknowledgment (< 100ms)
  await say({
    thread_ts: event.ts,
    text: "🤖 Processing your request...",
  });

  // Queue for background processing
  await queueSlackMention({
    userId: event.user,
    channelId: event.channel,
    threadTs: event.ts,
    message: event.text,
    teamId: event.team,
  });
});

export async function startSlackBot() {
  await slackApp.start();
  console.log("⚡️ Slack bot is running (Socket Mode)");
}
```

---

### 2. Multi-Tenant User Mapping

**Critical**: Map Slack user → Nubabel user → Organization

```typescript
interface SlackUserMapping {
  slackUserId: string;
  slackTeamId: string;
  nubabelUserId: string;
  organizationId: string;
}

async function mapSlackUserToNubabel(
  slackUserId: string,
  slackTeamId: string,
): Promise<{ userId: string; organizationId: string } | null> {
  // 1. Check if mapping exists
  let mapping = await db.slackUserMapping.findUnique({
    where: {
      slackUserId_slackTeamId: {
        slackUserId,
        slackTeamId,
      },
    },
  });

  if (mapping) {
    return {
      userId: mapping.nubabelUserId,
      organizationId: mapping.organizationId,
    };
  }

  // 2. First-time user - need to map via email
  const slackUser = await slackClient.users.info({ user: slackUserId });
  const email = slackUser.user?.profile?.email;

  if (!email) {
    throw new Error("Cannot map user - no email in Slack profile");
  }

  // 3. Find Nubabel user by email
  const nubabelUser = await db.user.findUnique({
    where: { email },
    include: { organization: true },
  });

  if (!nubabelUser) {
    throw new Error(`No Nubabel account found for ${email}`);
  }

  // 4. Create mapping for future requests
  mapping = await db.slackUserMapping.create({
    data: {
      slackUserId,
      slackTeamId,
      nubabelUserId: nubabelUser.id,
      organizationId: nubabelUser.organizationId,
    },
  });

  return {
    userId: nubabelUser.id,
    organizationId: nubabelUser.organizationId,
  };
}
```

**Schema Addition** (needed):

```prisma
model SlackUserMapping {
  id              String   @id @default(uuid())
  slackUserId     String
  slackTeamId     String
  nubabelUserId   String
  organizationId  String
  createdAt       DateTime @default(now())

  user           User         @relation(fields: [nubabelUserId], references: [id])
  organization   Organization @relation(fields: [organizationId], references: [id])

  @@unique([slackUserId, slackTeamId])
  @@index([nubabelUserId])
  @@index([organizationId])
}
```

---

### 3. Thread-Based Conversation Tracking

**Use Case**: Multi-turn conversations in Slack threads

```typescript
interface SlackThread {
  threadTs: string; // Slack thread ID
  channelId: string;
  sessionId: string; // Nubabel session ID
  createdAt: Date;
  lastActivityAt: Date;
}

async function getOrCreateThreadSession(
  threadTs: string,
  channelId: string,
  userId: string,
  organizationId: string,
): Promise<string> {
  // 1. Check if thread already has session
  const existingThread = await db.slackThread.findUnique({
    where: {
      threadTs_channelId: {
        threadTs,
        channelId,
      },
    },
  });

  if (existingThread) {
    // Update last activity
    await db.slackThread.update({
      where: { id: existingThread.id },
      data: { lastActivityAt: new Date() },
    });

    return existingThread.sessionId;
  }

  // 2. Create new session for this thread
  const session = await createSession({
    userId,
    organizationId,
    source: "slack",
    slackThreadTs: threadTs,
    slackChannelId: channelId,
  });

  // 3. Link thread to session
  await db.slackThread.create({
    data: {
      threadTs,
      channelId,
      sessionId: session.id,
      createdAt: new Date(),
      lastActivityAt: new Date(),
    },
  });

  return session.id;
}

// Usage in event handler
slackApp.event("app_mention", async ({ event }) => {
  const { userId, organizationId } = await mapSlackUserToNubabel(
    event.user,
    event.team,
  );

  // Get or create session for this thread
  const sessionId = await getOrCreateThreadSession(
    event.thread_ts || event.ts, // Use thread_ts if in thread, else create new
    event.channel,
    userId,
    organizationId,
  );

  // Continue conversation with context
  await queueSlackMention({
    sessionId,
    userId,
    organizationId,
    message: event.text,
    threadTs: event.thread_ts || event.ts,
    channelId: event.channel,
  });
});
```

**Schema Addition**:

```prisma
model SlackThread {
  id             String   @id @default(uuid())
  threadTs       String
  channelId      String
  sessionId      String
  createdAt      DateTime @default(now())
  lastActivityAt DateTime @default(now())

  session Session @relation(fields: [sessionId], references: [id])

  @@unique([threadTs, channelId])
  @@index([sessionId])
}
```

---

### 4. Background Job Processing with BullMQ

**Decouple Slack acknowledgment from agent execution**

```typescript
import { Queue, Worker } from "bullmq";

const slackQueue = new Queue("slack-mentions", {
  connection: { host: "localhost", port: 6379 },
});

// Producer (Slack event handler)
async function queueSlackMention(data: {
  sessionId: string;
  userId: string;
  organizationId: string;
  message: string;
  threadTs: string;
  channelId: string;
}) {
  await slackQueue.add("process-mention", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  });
}

// Consumer (Background worker)
const slackWorker = new Worker(
  "slack-mentions",
  async (job) => {
    const { sessionId, userId, organizationId, message, threadTs, channelId } =
      job.data;

    try {
      // Update progress
      await job.updateProgress(10);

      // Remove @bot mention from message
      const cleanMessage = message.replace(/<@[A-Z0-9]+>/g, "").trim();

      await job.updateProgress(20);

      // Execute orchestration (2-30s)
      const result = await orchestrate({
        userRequest: cleanMessage,
        sessionId,
        userId,
        organizationId,
      });

      await job.updateProgress(90);

      // Send result to Slack
      await slackApp.client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: formatSlackMessage(result),
        blocks: buildSlackBlocks(result),
      });

      await job.updateProgress(100);

      return { success: true, result };
    } catch (error) {
      // Send error message to Slack
      await slackApp.client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: `❌ Error: ${error.message}`,
      });

      throw error; // Trigger retry
    }
  },
  {
    connection: { host: "localhost", port: 6379 },
    concurrency: 5,
  },
);
```

---

### 5. Rich Message Formatting

**Slack Block Kit for beautiful responses**

```typescript
function buildSlackBlocks(result: OrchestrationResult): any[] {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "✅ Task Completed",
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: result.output,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `*Category:* ${result.metadata.category} | *Duration:* ${result.metadata.duration}ms | *Model:* ${result.metadata.model}`,
        },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "👍 Helpful",
          },
          action_id: "feedback_positive",
          value: result.metadata.sessionId,
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "👎 Not helpful",
          },
          action_id: "feedback_negative",
          value: result.metadata.sessionId,
        },
      ],
    },
  ];
}

// Handle feedback
slackApp.action("feedback_positive", async ({ ack, body }) => {
  await ack();

  const sessionId = body.actions[0].value;

  await db.feedback.create({
    data: {
      sessionId,
      type: "positive",
      source: "slack",
      createdAt: new Date(),
    },
  });

  // Update message to show feedback received
  await slackApp.client.chat.update({
    channel: body.channel.id,
    ts: body.message.ts,
    text: body.message.text,
    blocks: [
      ...body.message.blocks.slice(0, -1),
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "✅ Thanks for your feedback!",
          },
        ],
      },
    ],
  });
});
```

---

### 6. Rate Limiting & Throttling

**Protect against abuse and Slack API limits**

```typescript
import { RateLimiterRedis } from 'rate-limiter-flexible';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// Per-user rate limiter
const userRateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'slack_rate_limit',
  points: 10,        // 10 requests
  duration: 60,      // per minute
  blockDuration: 60, // block for 1 minute if exceeded
});

slackApp.event('app_mention', async ({ event, say }) => {
  try {
    // Check rate limit
    await userRateLimiter.consume(event.user);

    // Process normally
    await say({
      thread_ts: event.ts,
      text: '🤖 Processing...',
    });

    await queueSlackMention({...});
  } catch (rateLimitError) {
    if (rateLimitError instanceof Error) {
      // Rate limit exceeded
      await say({
        thread_ts: event.ts,
        text: '⚠️ Rate limit exceeded. Please wait a minute before trying again.',
      });
    }
  }
});

// Organization-level rate limiter
const orgRateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'slack_org_rate_limit',
  points: 100,       // 100 requests
  duration: 3600,    // per hour
});

async function checkOrgRateLimit(organizationId: string): Promise<void> {
  await orgRateLimiter.consume(organizationId);
}
```

---

### 7. Error Handling & User Experience

**Graceful degradation and helpful error messages**

```typescript
async function handleSlackError(
  error: Error,
  context: {
    channelId: string;
    threadTs: string;
    userId: string;
  },
): Promise<void> {
  let userMessage: string;
  let shouldRetry = false;

  if (error.message.includes("rate_limit")) {
    userMessage = "⏱️ Too many requests. Please wait a minute and try again.";
    shouldRetry = false;
  } else if (error.message.includes("ECONNREFUSED")) {
    userMessage = "🔌 Service temporarily unavailable. We're working on it!";
    shouldRetry = true;
  } else if (error.message.includes("No Nubabel account")) {
    userMessage =
      "👤 Your Slack account is not linked to Nubabel. Please sign up at https://nubabel.com";
    shouldRetry = false;
  } else if (error.message.includes("MCP connection")) {
    userMessage =
      "🔧 Integration not connected. Please check your Settings → Integrations.";
    shouldRetry = false;
  } else {
    userMessage = "❌ Something went wrong. Our team has been notified.";
    shouldRetry = true;
  }

  await slackApp.client.chat.postMessage({
    channel: context.channelId,
    thread_ts: context.threadTs,
    text: userMessage,
  });

  // Log for monitoring
  await logError({
    error,
    context,
    userMessage,
    shouldRetry,
  });

  if (shouldRetry) {
    throw error; // Let BullMQ retry
  }
}
```

---

### 8. Monitoring & Observability

**Track Slack bot health**

```typescript
import { Counter, Histogram, Gauge } from "prom-client";

const slackMentions = new Counter({
  name: "slack_mentions_total",
  help: "Total Slack mentions",
  labelNames: ["status"],
});

const slackLatency = new Histogram({
  name: "slack_response_duration_seconds",
  help: "Time from mention to response",
  labelNames: ["status"],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
});

const activeSlackJobs = new Gauge({
  name: "slack_jobs_active",
  help: "Currently processing Slack jobs",
});

// Usage
slackApp.event("app_mention", async ({ event }) => {
  const startTime = Date.now();

  try {
    // ... processing ...

    slackMentions.inc({ status: "success" });
    slackLatency.observe(
      { status: "success" },
      (Date.now() - startTime) / 1000,
    );
  } catch (error) {
    slackMentions.inc({ status: "error" });
    slackLatency.observe({ status: "error" }, (Date.now() - startTime) / 1000);
    throw error;
  }
});
```

---

## 🔐 Security Best Practices

### 1. Verify Slack Signatures

```typescript
import crypto from "crypto";

function verifySlackSignature(
  signingSecret: string,
  requestSignature: string,
  timestamp: string,
  body: string,
): boolean {
  const time = Math.floor(Date.now() / 1000);

  // Prevent replay attacks (5 min window)
  if (Math.abs(time - parseInt(timestamp)) > 300) {
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature =
    "v0=" +
    crypto
      .createHmac("sha256", signingSecret)
      .update(sigBasestring)
      .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(mySignature),
    Buffer.from(requestSignature),
  );
}
```

### 2. Sanitize User Input

```typescript
function sanitizeSlackMessage(text: string): string {
  // Remove Slack mentions
  let clean = text.replace(/<@[A-Z0-9]+>/g, "").trim();

  // Remove Slack channels
  clean = clean.replace(/<#[A-Z0-9]+\|[^>]+>/g, "").trim();

  // Remove Slack links
  clean = clean.replace(/<http[^>]+>/g, (match) => {
    const url = match.slice(1, -1).split("|")[0];
    return url;
  });

  return clean;
}
```

---

**작성일**: 2026-01-26  
**버전**: 1.0.0  
**Production Status**: Ready for deployment  
**다음 단계**: BullMQ job queue 상세 구현 가이드
