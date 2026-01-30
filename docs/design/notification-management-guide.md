# Notification Management & Alert Fatigue Prevention Guide

## Executive Summary

This guide provides comprehensive strategies for managing notifications in multi-tenant SaaS applications with Slack integration. It addresses the critical balance between keeping users informed and preventing alert fatigue through intelligent notification prioritization, batching, and user preference management.

---

## Table of Contents

1. [Notification Prioritization](#notification-prioritization)
2. [Frequency Capping & Batching](#frequency-capping--batching)
3. [Notification Channels](#notification-channels)
4. [User Preference Management](#user-preference-management)
5. [Do Not Disturb & Timezone Handling](#do-not-disturb--timezone-handling)
6. [Smart Notification Timing](#smart-notification-timing)
7. [Spam Prevention Strategies](#spam-prevention-strategies)
8. [Metrics & Monitoring](#metrics--monitoring)
9. [GDPR & Consent Management](#gdpr--consent-management)
10. [Implementation Examples](#implementation-examples)

---

## Notification Prioritization

### Severity Levels

Categorize notifications into distinct priority tiers to ensure critical alerts receive immediate attention while reducing noise from informational messages.

#### Critical Alerts

- **Characteristics**: Require immediate action, system-impacting
- **Delivery**: Instant, multi-channel (Slack + Email + SMS)
- **Examples**:
  - System outages
  - Security breaches
  - Payment failures
  - Critical workflow failures
- **Best Practice**: Use sparingly—only 5-10% of notifications should be critical

#### High-Urgency Alerts

- **Characteristics**: Time-sensitive, actionable within hours
- **Delivery**: Instant via primary channel (Slack or Email)
- **Examples**:
  - Approval requests
  - Deployment notifications
  - High-value customer actions
- **Best Practice**: Should constitute 15-20% of total notifications

#### Low-Urgency Alerts

- **Characteristics**: Informational, can wait for digest
- **Delivery**: Batched (hourly/daily digest)
- **Examples**:
  - Comment notifications
  - Activity summaries
  - Non-critical updates
- **Best Practice**: 70-80% of notifications should be low-urgency

#### Records/Logs

- **Characteristics**: Audit trail, no user notification needed
- **Delivery**: Database only, accessible via UI
- **Examples**:
  - User login events
  - Configuration changes
  - Background job completions

### PagerDuty's Alert Classification Framework

```typescript
enum AlertSeverity {
  CRITICAL = "critical", // Immediate action required
  HIGH = "high", // Action required within hours
  MEDIUM = "medium", // Action required within day
  LOW = "low", // Informational only
  INFO = "info", // Record only, no notification
}

interface NotificationConfig {
  severity: AlertSeverity;
  channels: NotificationChannel[];
  batchable: boolean;
  suppressionRules?: SuppressionRule[];
}
```

### Datadog's Threshold-Based Alerting

Datadog recommends adjusting alert thresholds to reduce "flappy alerts" (alerts that frequently toggle between OK and ALERT states):

- **Increase evaluation windows**: Alert only if behavior persists for 5+ minutes
- **Use composite conditions**: Require multiple metrics to breach thresholds
- **Implement recovery periods**: Prevent re-alerting for recently resolved issues

### Sentry's State-Change Alerts

Sentry warns against alerting on every state change:

```typescript
// ❌ BAD: Alerts on every state change
const badConfig = {
  triggers: ["new", "regression", "escalating", "resolved"],
};

// ✅ GOOD: Alert only on actionable states
const goodConfig = {
  triggers: ["new", "regression"],
  filters: {
    minimumOccurrences: 5,
    timeWindow: "1h",
  },
};
```

---

## Frequency Capping & Batching

### Digest Notification Patterns

Digest notifications consolidate multiple events into a single message, dramatically reducing notification volume while maintaining visibility.

#### Hourly Digests

**Use Cases**:

- Social activity (likes, mentions, follows)
- Comment threads
- Non-urgent workflow updates

**Implementation Pattern**:

```typescript
enum NotificationFrequency {
  IMMEDIATE = "immediate",
  HOURLY = "hourly",
  DAILY = "daily",
  WEEKLY = "weekly",
  NEVER = "never",
}

interface DigestConfig {
  frequency: NotificationFrequency;
  timezone: string;
  deliveryTime?: string; // e.g., "09:00" for daily digests
  minimumItems?: number; // Don't send if fewer than X items
}
```

**Cron Schedule**:

```typescript
// Using BullMQ for hourly digest
await queue.upsertJobScheduler(
  "hourly-digest",
  { pattern: "0 * * * *" }, // Every hour at :00
  {
    name: "send-digest",
    data: { frequency: "hourly" },
    opts: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    },
  },
);
```

#### Daily Digests

**Use Cases**:

- Activity summaries
- Task updates
- Analytics reports
- Team activity rollups

**Best Practices**:

- Send at consistent time (e.g., 9:00 AM user's local time)
- Include summary statistics (e.g., "15 new comments across 3 projects")
- Provide deep links to individual items
- Skip sending if no activity

**Example Schedule**:

```typescript
// Daily digest at 9:00 AM
await queue.upsertJobScheduler(
  "daily-digest",
  { pattern: "0 9 * * *" }, // 9:00 AM daily
  {
    name: "send-digest",
    data: { frequency: "daily" },
  },
);
```

#### Weekly Digests

**Use Cases**:

- Weekly reports
- Low-priority updates
- Subscription newsletters
- Team performance summaries

**Example Schedule**:

```typescript
// Weekly digest every Monday at 9:00 AM
await queue.upsertJobScheduler(
  "weekly-digest",
  { pattern: "0 9 * * 1" }, // Monday at 9:00 AM
  {
    name: "send-digest",
    data: { frequency: "weekly" },
  },
);
```

### Frequency Capping

Implement hard limits on notification volume per user per time period.

```typescript
interface FrequencyCap {
  maxPerHour: number;
  maxPerDay: number;
  overflowStrategy: "queue" | "drop" | "digest";
}

const defaultCaps: FrequencyCap = {
  maxPerHour: 10,
  maxPerDay: 50,
  overflowStrategy: "digest", // Queue excess for next digest
};

async function shouldSendNotification(
  userId: string,
  notification: Notification,
): Promise<boolean> {
  const hourlyCount = await getNotificationCount(userId, "1h");
  const dailyCount = await getNotificationCount(userId, "24h");

  if (hourlyCount >= defaultCaps.maxPerHour) {
    await queueForDigest(userId, notification);
    return false;
  }

  if (dailyCount >= defaultCaps.maxPerDay) {
    await queueForDigest(userId, notification);
    return false;
  }

  return true;
}
```

### Batching Similar Notifications

Group related notifications to reduce noise:

```typescript
interface NotificationBatch {
  type: string;
  groupKey: string; // e.g., "project-123-comments"
  notifications: Notification[];
  batchWindow: number; // milliseconds
}

// Example: Batch comments on same document
async function batchNotifications(notifications: Notification[]): Promise<NotificationBatch[]> {
  const batches = new Map<string, Notification[]>();

  for (const notif of notifications) {
    const key = `${notif.type}-${notif.resourceId}`;
    if (!batches.has(key)) {
      batches.set(key, []);
    }
    batches.get(key)!.push(notif);
  }

  return Array.from(batches.entries()).map(([key, items]) => ({
    type: items[0].type,
    groupKey: key,
    notifications: items,
    batchWindow: 300000, // 5 minutes
  }));
}
```

**Real-World Example** (from GitHub search results):

```typescript
// From lane711/sonicjs
async sendDigestNotifications(
  frequency: 'hourly' | 'daily' | 'weekly'
): Promise<number> {
  const timeFilter = {
    hourly: "datetime('now', '-1 hour')",
    daily: "datetime('now', '-1 day')",
    weekly: "datetime('now', '-7 days')"
  }[frequency];

  // Get users with this digest preference
  const users = await db.query(`
    SELECT id FROM users
    WHERE notification_frequency = ?
  `, [frequency]);

  let sentCount = 0;
  for (const user of users) {
    const notifications = await getUnsentNotifications(user.id, timeFilter);
    if (notifications.length > 0) {
      await sendDigestEmail(user, notifications);
      sentCount++;
    }
  }

  return sentCount;
}
```

---

## Notification Channels

### Channel Selection Strategy

Different channels serve different purposes and have varying levels of urgency and user attention.

| Channel    | Urgency  | Attention | Best For                                 | Avoid For                       |
| ---------- | -------- | --------- | ---------------------------------------- | ------------------------------- |
| **Slack**  | High     | Immediate | Critical alerts, approvals, team updates | Low-priority info, bulk updates |
| **Email**  | Medium   | Delayed   | Digests, reports, documentation          | Time-sensitive alerts           |
| **In-App** | Low      | On-demand | Activity feed, non-urgent updates        | Critical system alerts          |
| **SMS**    | Critical | Immediate | Security alerts, critical failures       | Anything non-critical           |
| **Push**   | Medium   | Immediate | Mobile-first actions, reminders          | Desktop-only workflows          |

### Slack Integration Best Practices

#### Message Design

```typescript
// ✅ GOOD: Rich, actionable Slack message
const slackMessage = {
  channel: "C1234567890",
  text: "Approval Required: Deploy to Production", // Fallback
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Approval Required*\nDeploy `v2.3.0` to Production",
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: "*Requester:*\nJohn Doe" },
        { type: "mrkdwn", text: "*Environment:*\nProduction" },
        { type: "mrkdwn", text: "*Priority:*\nHigh" },
        { type: "mrkdwn", text: "*Deadline:*\n2 hours" },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Approve" },
          style: "primary",
          action_id: "approve_deploy",
          value: "deploy_123",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Reject" },
          style: "danger",
          action_id: "reject_deploy",
          value: "deploy_123",
        },
      ],
    },
  ],
};
```

#### Batching for Slack

```typescript
// Batch multiple events into single Slack message
async function sendBatchedSlackNotification(events: Event[]): Promise<void> {
  if (events.length === 1) {
    await sendSingleNotification(events[0]);
    return;
  }

  // Create summary message
  const message = {
    text: `${events.length} server restarts detected`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${events.length} Server Restarts*\n${events
            .map((e) => `• ${e.serverName} at ${e.timestamp}`)
            .join("\n")}`,
        },
      },
    ],
  };

  await slackClient.chat.postMessage(message);
}
```

#### Rate Limiting Handling

```typescript
import { WebClient, WebClientEvent } from "@slack/web-api";

const slackClient = new WebClient(process.env.SLACK_TOKEN, {
  logLevel: "info",
  maxRequestConcurrency: 5, // Limit concurrent requests
  retryConfig: { retries: 3 },
});

// Listen for rate limiting events
slackClient.on(WebClientEvent.RATE_LIMITED, (numSeconds, { url }) => {
  console.warn(`Rate limited on ${url}. Retrying in ${numSeconds}s`);
  // Optionally notify admins or adjust sending strategy
});

// Or reject rate-limited calls for time-sensitive operations
const urgentClient = new WebClient(process.env.SLACK_TOKEN, {
  rejectRateLimitedCalls: true,
});

try {
  await urgentClient.chat.postMessage(criticalAlert);
} catch (error) {
  if (error.code === "slack_webapi_rate_limited") {
    // Fall back to email or other channel
    await sendEmailAlert(criticalAlert);
  }
}
```

### Email Best Practices

#### Digest Email Template

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Daily Activity Digest</title>
  </head>
  <body>
    <h1>Your Daily Activity Summary</h1>
    <p>Here's what happened in the last 24 hours:</p>

    <h2>📊 Summary</h2>
    <ul>
      <li><strong>15</strong> new comments across 3 projects</li>
      <li><strong>5</strong> tasks assigned to you</li>
      <li><strong>2</strong> approvals pending</li>
    </ul>

    <h2>💬 Recent Comments</h2>
    <!-- Group by project -->
    <div class="project-section">
      <h3>Project Alpha</h3>
      <ul>
        <li><strong>Jane Doe</strong> commented on <a href="...">Task #123</a></li>
        <li><strong>Bob Smith</strong> mentioned you in <a href="...">Discussion</a></li>
      </ul>
    </div>

    <hr />
    <p>
      <a href="https://app.example.com/notifications">View all notifications</a> |
      <a href="https://app.example.com/settings/notifications">Manage preferences</a>
    </p>
  </body>
</html>
```

#### Email Frequency Management

```typescript
interface EmailPreferences {
  digestFrequency: "hourly" | "daily" | "weekly" | "never";
  deliveryTime: string; // "09:00" in user's timezone
  minimumItems: number; // Don't send if fewer items
  categories: {
    comments: boolean;
    mentions: boolean;
    assignments: boolean;
    approvals: boolean; // Always immediate, ignore digest
  };
}
```

### In-App Notifications

In-app notifications serve as a persistent activity feed and should complement, not replace, other channels.

```typescript
interface InAppNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  actionUrl?: string;
  createdAt: Date;
  expiresAt?: Date;
}

// Always create in-app notification as record
async function createNotification(notification: Notification): Promise<void> {
  // Store in database
  await db.notifications.create({
    ...notification,
    read: false,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  });

  // Optionally send to other channels based on preferences
  const prefs = await getUserPreferences(notification.userId);

  if (shouldSendToSlack(notification, prefs)) {
    await sendSlackNotification(notification);
  }

  if (shouldSendToEmail(notification, prefs)) {
    await queueEmailNotification(notification);
  }
}
```

---

## User Preference Management

### Preference Schema

```typescript
interface NotificationPreferences {
  // Global settings
  globalFrequency: NotificationFrequency;
  timezone: string; // IANA timezone (e.g., "America/New_York")

  // Channel preferences
  channels: {
    slack: {
      enabled: boolean;
      workspaceId?: string;
      channelId?: string;
    };
    email: {
      enabled: boolean;
      address: string;
      digestFrequency: "hourly" | "daily" | "weekly";
      deliveryTime: string; // "09:00"
    };
    inApp: {
      enabled: boolean;
    };
    sms: {
      enabled: boolean;
      phoneNumber?: string;
    };
  };

  // Per-category preferences
  categories: {
    [category: string]: {
      enabled: boolean;
      frequency: NotificationFrequency;
      channels: ("slack" | "email" | "inApp" | "sms")[];
    };
  };

  // Do Not Disturb
  doNotDisturb: {
    enabled: boolean;
    schedule: {
      start: string; // "22:00"
      end: string; // "08:00"
      days: number[]; // [0,1,2,3,4,5,6] (Sunday = 0)
    };
    overrides: {
      allowCritical: boolean; // Allow critical alerts during DND
    };
  };

  // Frequency caps
  frequencyCaps: {
    maxPerHour: number;
    maxPerDay: number;
  };
}
```

### Preference UI Example

```typescript
// React component for notification preferences
function NotificationPreferencesUI() {
  const [prefs, setPrefs] = useState<NotificationPreferences>();

  return (
    <div className="preferences-panel">
      <h2>Notification Preferences</h2>

      {/* Global Settings */}
      <section>
        <h3>Global Settings</h3>
        <label>
          Default Frequency:
          <select value={prefs.globalFrequency}>
            <option value="immediate">Immediate</option>
            <option value="hourly">Hourly Digest</option>
            <option value="daily">Daily Digest</option>
            <option value="weekly">Weekly Digest</option>
          </select>
        </label>

        <label>
          Timezone:
          <TimezoneSelect value={prefs.timezone} />
        </label>
      </section>

      {/* Channel Settings */}
      <section>
        <h3>Channels</h3>

        <div className="channel-config">
          <h4>📧 Email</h4>
          <label>
            <input
              type="checkbox"
              checked={prefs.channels.email.enabled}
            />
            Enable email notifications
          </label>

          {prefs.channels.email.enabled && (
            <>
              <label>
                Digest Frequency:
                <select value={prefs.channels.email.digestFrequency}>
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </label>

              <label>
                Delivery Time:
                <input
                  type="time"
                  value={prefs.channels.email.deliveryTime}
                />
              </label>
            </>
          )}
        </div>

        <div className="channel-config">
          <h4>💬 Slack</h4>
          <label>
            <input
              type="checkbox"
              checked={prefs.channels.slack.enabled}
            />
            Enable Slack notifications
          </label>

          {prefs.channels.slack.enabled && (
            <button onClick={connectSlack}>
              Connect Slack Workspace
            </button>
          )}
        </div>
      </section>

      {/* Category Settings */}
      <section>
        <h3>Notification Types</h3>

        {Object.entries(NOTIFICATION_CATEGORIES).map(([key, category]) => (
          <div key={key} className="category-config">
            <h4>{category.icon} {category.label}</h4>

            <label>
              <input
                type="checkbox"
                checked={prefs.categories[key]?.enabled}
              />
              Enable
            </label>

            {prefs.categories[key]?.enabled && (
              <>
                <label>
                  Frequency:
                  <select value={prefs.categories[key].frequency}>
                    <option value="immediate">Immediate</option>
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                  </select>
                </label>

                <label>
                  Channels:
                  <MultiSelect
                    options={['slack', 'email', 'inApp']}
                    value={prefs.categories[key].channels}
                  />
                </label>
              </>
            )}
          </div>
        ))}
      </section>

      {/* Do Not Disturb */}
      <section>
        <h3>🌙 Do Not Disturb</h3>
        <label>
          <input
            type="checkbox"
            checked={prefs.doNotDisturb.enabled}
          />
          Enable Do Not Disturb
        </label>

        {prefs.doNotDisturb.enabled && (
          <>
            <label>
              Start Time:
              <input
                type="time"
                value={prefs.doNotDisturb.schedule.start}
              />
            </label>

            <label>
              End Time:
              <input
                type="time"
                value={prefs.doNotDisturb.schedule.end}
              />
            </label>

            <label>
              Days:
              <DaySelector value={prefs.doNotDisturb.schedule.days} />
            </label>

            <label>
              <input
                type="checkbox"
                checked={prefs.doNotDisturb.overrides.allowCritical}
              />
              Allow critical alerts during Do Not Disturb
            </label>
          </>
        )}
      </section>
    </div>
  );
}
```

### Database Schema

```sql
CREATE TABLE notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id),

  -- Global settings
  global_frequency VARCHAR(20) DEFAULT 'immediate',
  timezone VARCHAR(50) DEFAULT 'UTC',

  -- Channel settings (JSONB for flexibility)
  channels JSONB DEFAULT '{
    "slack": {"enabled": false},
    "email": {
      "enabled": true,
      "digestFrequency": "daily",
      "deliveryTime": "09:00"
    },
    "inApp": {"enabled": true},
    "sms": {"enabled": false}
  }',

  -- Category preferences
  categories JSONB DEFAULT '{}',

  -- Do Not Disturb
  do_not_disturb JSONB DEFAULT '{
    "enabled": false,
    "schedule": {
      "start": "22:00",
      "end": "08:00",
      "days": [0,1,2,3,4,5,6]
    },
    "overrides": {
      "allowCritical": true
    }
  }',

  -- Frequency caps
  max_per_hour INTEGER DEFAULT 10,
  max_per_day INTEGER DEFAULT 50,

  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for efficient lookups
CREATE INDEX idx_notification_prefs_user ON notification_preferences(user_id);
```

---

## Do Not Disturb & Timezone Handling

### Timezone-Aware Scheduling

Always respect user timezones when scheduling digest notifications and enforcing Do Not Disturb periods.

```typescript
import { DateTime } from "luxon";

function isInDoNotDisturbPeriod(userId: string, prefs: NotificationPreferences): boolean {
  if (!prefs.doNotDisturb.enabled) {
    return false;
  }

  const userTime = DateTime.now().setZone(prefs.timezone);
  const currentDay = userTime.weekday % 7; // Convert to Sunday = 0

  // Check if today is a DND day
  if (!prefs.doNotDisturb.schedule.days.includes(currentDay)) {
    return false;
  }

  const [startHour, startMin] = prefs.doNotDisturb.schedule.start.split(":");
  const [endHour, endMin] = prefs.doNotDisturb.schedule.end.split(":");

  const dndStart = userTime.set({
    hour: parseInt(startHour),
    minute: parseInt(startMin),
  });
  const dndEnd = userTime.set({
    hour: parseInt(endHour),
    minute: parseInt(endMin),
  });

  // Handle overnight DND periods (e.g., 22:00 - 08:00)
  if (dndEnd < dndStart) {
    return userTime >= dndStart || userTime <= dndEnd;
  }

  return userTime >= dndStart && userTime <= dndEnd;
}

async function shouldSendNotification(
  userId: string,
  notification: Notification,
): Promise<{ send: boolean; reason?: string }> {
  const prefs = await getUserPreferences(userId);

  // Check Do Not Disturb
  if (isInDoNotDisturbPeriod(userId, prefs)) {
    // Allow critical alerts if configured
    if (notification.severity === "critical" && prefs.doNotDisturb.overrides.allowCritical) {
      return { send: true };
    }

    return {
      send: false,
      reason: "User in Do Not Disturb period",
    };
  }

  // Check frequency caps
  const hourlyCount = await getNotificationCount(userId, "1h");
  if (hourlyCount >= prefs.frequencyCaps.maxPerHour) {
    return {
      send: false,
      reason: "Hourly frequency cap exceeded",
    };
  }

  return { send: true };
}
```

### Timezone-Aware Digest Delivery

```typescript
// Schedule digest jobs per timezone to ensure consistent delivery times
async function scheduleDigestJobs() {
  // Get all unique timezones from user preferences
  const timezones = await db.query(`
    SELECT DISTINCT timezone 
    FROM notification_preferences
    WHERE channels->>'email'->>'enabled' = 'true'
  `);

  for (const tz of timezones) {
    // Calculate when 9:00 AM in this timezone occurs in UTC
    const deliveryTime = DateTime.now()
      .setZone(tz.timezone)
      .set({ hour: 9, minute: 0, second: 0 })
      .toUTC();

    const cronPattern = `${deliveryTime.minute} ${deliveryTime.hour} * * *`;

    await queue.upsertJobScheduler(
      `daily-digest-${tz.timezone}`,
      { pattern: cronPattern },
      {
        name: "send-digest",
        data: {
          frequency: "daily",
          timezone: tz.timezone,
        },
      },
    );
  }
}

// Process digest for specific timezone
async function sendDigestForTimezone(timezone: string, frequency: "hourly" | "daily" | "weekly") {
  const users = await db.query(
    `
    SELECT user_id, channels
    FROM notification_preferences
    WHERE timezone = $1
      AND channels->'email'->>'digestFrequency' = $2
      AND channels->'email'->>'enabled' = 'true'
  `,
    [timezone, frequency],
  );

  for (const user of users) {
    const notifications = await getPendingNotifications(user.user_id);

    if (notifications.length > 0) {
      await sendDigestEmail(user, notifications);
      await markNotificationsAsSent(notifications);
    }
  }
}
```

---

## Smart Notification Timing

### Intelligent Delivery Windows

Send notifications when users are most likely to engage, based on historical activity patterns.

```typescript
interface UserActivityPattern {
  userId: string;
  activeHours: number[]; // Hours of day (0-23) when user is typically active
  activeDays: number[]; // Days of week (0-6) when user is active
  averageResponseTime: number; // Minutes
  preferredChannel: "slack" | "email" | "inApp";
}

async function getOptimalDeliveryTime(
  userId: string,
  notification: Notification,
): Promise<DateTime> {
  const pattern = await getUserActivityPattern(userId);
  const prefs = await getUserPreferences(userId);
  const now = DateTime.now().setZone(prefs.timezone);

  // If user is currently active, send immediately
  if (pattern.activeHours.includes(now.hour)) {
    return now;
  }

  // Find next active hour
  const nextActiveHour = pattern.activeHours.find((h) => h > now.hour) || pattern.activeHours[0];

  let deliveryTime = now.set({ hour: nextActiveHour, minute: 0 });

  // If next active hour is tomorrow, adjust date
  if (nextActiveHour <= now.hour) {
    deliveryTime = deliveryTime.plus({ days: 1 });
  }

  // Respect Do Not Disturb
  while (isInDoNotDisturbPeriod(userId, prefs)) {
    deliveryTime = deliveryTime.plus({ hours: 1 });
  }

  return deliveryTime;
}

// Learn from user behavior
async function trackNotificationEngagement(
  notificationId: string,
  action: "opened" | "clicked" | "dismissed" | "ignored",
) {
  const notification = await db.notifications.findById(notificationId);
  const sentAt = DateTime.fromJSDate(notification.sentAt);
  const actionAt = DateTime.now();
  const responseTime = actionAt.diff(sentAt, "minutes").minutes;

  await db.notificationMetrics.create({
    userId: notification.userId,
    notificationId,
    action,
    responseTime,
    sentHour: sentAt.hour,
    sentDay: sentAt.weekday,
    channel: notification.channel,
  });

  // Update user activity pattern
  await updateActivityPattern(notification.userId);
}
```

### Predictive Batching

Use machine learning or heuristics to predict when to batch vs. send immediately.

```typescript
interface BatchingDecision {
  shouldBatch: boolean;
  reason: string;
  suggestedDelay?: number; // milliseconds
}

async function decideBatching(
  userId: string,
  notification: Notification,
): Promise<BatchingDecision> {
  // Never batch critical alerts
  if (notification.severity === "critical") {
    return { shouldBatch: false, reason: "Critical severity" };
  }

  // Check if similar notifications are pending
  const pendingCount = await getPendingSimilarNotifications(
    userId,
    notification.type,
    notification.resourceId,
  );

  if (pendingCount >= 3) {
    return {
      shouldBatch: true,
      reason: "Multiple similar notifications pending",
      suggestedDelay: 300000, // 5 minutes
    };
  }

  // Check user's recent activity
  const recentActivity = await getUserRecentActivity(userId, "15m");

  if (recentActivity.notificationCount > 5) {
    return {
      shouldBatch: true,
      reason: "High recent notification volume",
      suggestedDelay: 600000, // 10 minutes
    };
  }

  // Check if user is currently active
  const isActive = await isUserActive(userId);

  if (!isActive) {
    return {
      shouldBatch: true,
      reason: "User not currently active",
      suggestedDelay: await getTimeUntilNextActiveHour(userId),
    };
  }

  return { shouldBatch: false, reason: "Send immediately" };
}
```

---

## Spam Prevention Strategies

### Deduplication

Prevent duplicate notifications for the same event.

```typescript
interface NotificationDeduplication {
  dedupKey: string; // Unique identifier for this notification type
  window: number; // Time window in milliseconds
}

async function deduplicateNotification(notification: Notification): Promise<boolean> {
  const dedupKey = generateDedupKey(notification);
  const window = 3600000; // 1 hour

  // Check if similar notification was sent recently
  const existing = await redis.get(`notif:dedup:${dedupKey}`);

  if (existing) {
    console.log(`Duplicate notification suppressed: ${dedupKey}`);
    return false; // Suppress duplicate
  }

  // Set dedup key with expiration
  await redis.setex(`notif:dedup:${dedupKey}`, window / 1000, notification.id);

  return true; // Allow notification
}

function generateDedupKey(notification: Notification): string {
  // Create unique key based on notification characteristics
  return `${notification.userId}:${notification.type}:${notification.resourceId}`;
}
```

### Suppression Rules

Define rules to suppress notifications based on conditions.

```typescript
interface SuppressionRule {
  id: string;
  name: string;
  condition: (notification: Notification) => boolean;
  action: "suppress" | "delay" | "downgrade";
  duration?: number; // For delay action
}

const suppressionRules: SuppressionRule[] = [
  {
    id: "suppress-auto-resolved",
    name: "Suppress auto-resolved alerts",
    condition: (n) => n.type === "alert" && n.autoResolved === true,
    action: "suppress",
  },
  {
    id: "delay-low-priority-off-hours",
    name: "Delay low-priority notifications during off-hours",
    condition: (n) => {
      const hour = new Date().getHours();
      return n.severity === "low" && (hour < 8 || hour > 18);
    },
    action: "delay",
    duration: 43200000, // 12 hours
  },
  {
    id: "downgrade-flappy-alerts",
    name: "Downgrade frequently toggling alerts",
    condition: async (n) => {
      const toggleCount = await getAlertToggleCount(n.resourceId, "1h");
      return toggleCount > 5;
    },
    action: "downgrade",
  },
];

async function applySuppressionRules(notification: Notification): Promise<Notification | null> {
  for (const rule of suppressionRules) {
    if (await rule.condition(notification)) {
      console.log(`Suppression rule applied: ${rule.name}`);

      switch (rule.action) {
        case "suppress":
          return null; // Don't send

        case "delay":
          await scheduleDelayedNotification(notification, rule.duration);
          return null;

        case "downgrade":
          notification.severity = "low";
          notification.batchable = true;
          break;
      }
    }
  }

  return notification;
}
```

### Alert Grouping (PagerDuty Pattern)

Group related alerts into a single incident.

```typescript
interface AlertGroup {
  groupId: string;
  alerts: Notification[];
  firstAlertAt: Date;
  lastAlertAt: Date;
  status: "open" | "acknowledged" | "resolved";
}

async function groupAlerts(notification: Notification): Promise<string> {
  const groupKey = `${notification.service}:${notification.type}`;

  // Check for existing open group
  let group = await db.alertGroups.findOne({
    groupKey,
    status: "open",
    lastAlertAt: { $gte: new Date(Date.now() - 3600000) }, // 1 hour window
  });

  if (!group) {
    // Create new group
    group = await db.alertGroups.create({
      groupId: generateId(),
      groupKey,
      alerts: [],
      firstAlertAt: new Date(),
      lastAlertAt: new Date(),
      status: "open",
    });

    // Send notification for new group
    await sendGroupNotification(group);
  }

  // Add alert to group
  await db.alertGroups.updateOne(
    { groupId: group.groupId },
    {
      $push: { alerts: notification },
      $set: { lastAlertAt: new Date() },
    },
  );

  // Update existing notification instead of sending new one
  await updateGroupNotification(group);

  return group.groupId;
}
```

### Auto-Pause Transient Alerts (PagerDuty Pattern)

Automatically suppress notifications for alerts that typically resolve themselves.

```typescript
interface TransientAlertConfig {
  alertType: string;
  autoResolveThreshold: number; // milliseconds
  pauseDuration: number; // milliseconds
}

const transientAlerts: TransientAlertConfig[] = [
  {
    alertType: "high_cpu",
    autoResolveThreshold: 300000, // 5 minutes
    pauseDuration: 600000, // 10 minutes
  },
  {
    alertType: "network_blip",
    autoResolveThreshold: 60000, // 1 minute
    pauseDuration: 300000, // 5 minutes
  },
];

async function handleTransientAlert(notification: Notification): Promise<boolean> {
  const config = transientAlerts.find((c) => c.alertType === notification.type);

  if (!config) {
    return true; // Not a transient alert, send normally
  }

  // Check alert history
  const history = await getAlertHistory(notification.resourceId, notification.type);
  const autoResolveRate = calculateAutoResolveRate(history);

  if (autoResolveRate > 0.8) {
    // 80% auto-resolve rate
    console.log(`Auto-pausing transient alert: ${notification.type}`);

    // Schedule check after pause duration
    await scheduleAlertCheck(notification, config.pauseDuration);

    return false; // Don't send notification yet
  }

  return true; // Send notification
}

async function scheduleAlertCheck(notification: Notification, delay: number) {
  await queue.add("check-alert-status", { notificationId: notification.id }, { delay });
}

// Worker to check if alert still exists after pause
async function checkAlertStatus(job: Job) {
  const notification = await db.notifications.findById(job.data.notificationId);
  const currentStatus = await getResourceStatus(notification.resourceId);

  if (currentStatus.alertActive) {
    // Alert still active after pause, send notification
    await sendNotification(notification);
  } else {
    console.log(`Transient alert auto-resolved: ${notification.id}`);
  }
}
```

---

## Metrics & Monitoring

### Key Metrics to Track

```typescript
interface NotificationMetrics {
  // Volume metrics
  totalSent: number;
  sentByChannel: Record<string, number>;
  sentBySeverity: Record<string, number>;

  // Engagement metrics
  openRate: number; // % of notifications opened
  clickThroughRate: number; // % of notifications clicked
  dismissRate: number; // % of notifications dismissed
  ignoreRate: number; // % of notifications never interacted with

  // Timing metrics
  averageResponseTime: number; // Minutes until user interaction
  deliveryLatency: number; // Milliseconds from trigger to delivery

  // Fatigue indicators
  suppressionRate: number; // % of notifications suppressed
  batchingRate: number; // % of notifications batched
  unsubscribeRate: number; // % of users disabling categories

  // Quality metrics
  falsePositiveRate: number; // % of alerts marked as not useful
  escalationRate: number; // % of alerts requiring escalation
}

async function calculateNotificationMetrics(
  timeWindow: string = "24h",
): Promise<NotificationMetrics> {
  const startTime = DateTime.now().minus({ hours: 24 });

  const sent = await db.notifications.count({
    sentAt: { $gte: startTime.toJSDate() },
  });

  const opened = await db.notificationMetrics.count({
    action: "opened",
    createdAt: { $gte: startTime.toJSDate() },
  });

  const clicked = await db.notificationMetrics.count({
    action: "clicked",
    createdAt: { $gte: startTime.toJSDate() },
  });

  const dismissed = await db.notificationMetrics.count({
    action: "dismissed",
    createdAt: { $gte: startTime.toJSDate() },
  });

  return {
    totalSent: sent,
    openRate: (opened / sent) * 100,
    clickThroughRate: (clicked / sent) * 100,
    dismissRate: (dismissed / sent) * 100,
    ignoreRate: ((sent - opened - dismissed) / sent) * 100,
    // ... calculate other metrics
  };
}
```

### Monitoring Dashboard

```typescript
// Real-time notification health monitoring
interface NotificationHealth {
  status: "healthy" | "warning" | "critical";
  issues: string[];
  recommendations: string[];
}

async function assessNotificationHealth(): Promise<NotificationHealth> {
  const metrics = await calculateNotificationMetrics("24h");
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Check open rate
  if (metrics.openRate < 20) {
    issues.push("Low open rate (<20%)");
    recommendations.push("Review notification relevance and timing");
  }

  // Check ignore rate
  if (metrics.ignoreRate > 50) {
    issues.push("High ignore rate (>50%)");
    recommendations.push("Increase batching and reduce notification volume");
  }

  // Check unsubscribe rate
  if (metrics.unsubscribeRate > 5) {
    issues.push("High unsubscribe rate (>5%)");
    recommendations.push("Review notification value and frequency");
  }

  // Check delivery latency
  if (metrics.deliveryLatency > 5000) {
    issues.push("High delivery latency (>5s)");
    recommendations.push("Investigate queue processing and API performance");
  }

  const status = issues.length === 0 ? "healthy" : issues.length <= 2 ? "warning" : "critical";

  return { status, issues, recommendations };
}
```

### Alerting on Notification System Health

```typescript
// Monitor notification system itself
async function monitorNotificationSystem() {
  const health = await assessNotificationHealth();

  if (health.status === "critical") {
    // Alert engineering team
    await sendSlackAlert({
      channel: "#engineering-alerts",
      severity: "critical",
      title: "Notification System Health Critical",
      message: `Issues detected:\n${health.issues.join("\n")}`,
      recommendations: health.recommendations,
    });
  }

  // Track queue depth
  const queueDepth = await queue.getWaitingCount();
  if (queueDepth > 10000) {
    await sendSlackAlert({
      channel: "#engineering-alerts",
      severity: "warning",
      title: "Notification Queue Depth High",
      message: `${queueDepth} notifications pending`,
    });
  }

  // Track failed deliveries
  const failedCount = await queue.getFailedCount();
  if (failedCount > 100) {
    await sendSlackAlert({
      channel: "#engineering-alerts",
      severity: "warning",
      title: "High Notification Failure Rate",
      message: `${failedCount} failed deliveries in last hour`,
    });
  }
}

// Run health check every 5 minutes
await queue.upsertJobScheduler(
  "notification-health-check",
  { pattern: "*/5 * * * *" },
  { name: "monitor-notification-system" },
);
```

---

## GDPR & Consent Management

### Consent Requirements

Under GDPR, users must explicitly consent to receive marketing communications, but transactional notifications are generally exempt.

```typescript
enum NotificationPurpose {
  TRANSACTIONAL = "transactional", // Service-related, GDPR exempt
  MARKETING = "marketing", // Requires explicit consent
  PRODUCT_UPDATES = "product", // Requires consent
  RESEARCH = "research", // Requires consent
}

interface ConsentRecord {
  userId: string;
  purpose: NotificationPurpose;
  consented: boolean;
  consentedAt?: Date;
  withdrawnAt?: Date;
  ipAddress: string;
  userAgent: string;
  method: "opt-in" | "opt-out" | "explicit";
}

async function checkConsent(userId: string, notification: Notification): Promise<boolean> {
  // Transactional notifications don't require consent
  if (notification.purpose === NotificationPurpose.TRANSACTIONAL) {
    return true;
  }

  // Check for explicit consent
  const consent = await db.consents.findOne({
    userId,
    purpose: notification.purpose,
    consented: true,
    withdrawnAt: null,
  });

  return consent !== null;
}
```

### Consent UI

```typescript
function ConsentManagementUI() {
  return (
    <div className="consent-panel">
      <h2>Communication Preferences</h2>

      <div className="consent-section">
        <h3>Transactional Notifications</h3>
        <p className="description">
          Essential service notifications (account security, billing,
          service updates). These cannot be disabled.
        </p>
        <label>
          <input type="checkbox" checked disabled />
          Account & Security Notifications
        </label>
        <label>
          <input type="checkbox" checked disabled />
          Billing & Payment Notifications
        </label>
      </div>

      <div className="consent-section">
        <h3>Marketing Communications</h3>
        <p className="description">
          Product updates, feature announcements, and promotional content.
        </p>
        <label>
          <input
            type="checkbox"
            checked={consents.marketing}
            onChange={(e) => updateConsent('marketing', e.target.checked)}
          />
          I agree to receive marketing emails
        </label>
        <label>
          <input
            type="checkbox"
            checked={consents.productUpdates}
            onChange={(e) => updateConsent('product', e.target.checked)}
          />
          I agree to receive product update notifications
        </label>
      </div>

      <div className="consent-section">
        <h3>Research & Feedback</h3>
        <label>
          <input
            type="checkbox"
            checked={consents.research}
            onChange={(e) => updateConsent('research', e.target.checked)}
          />
          I agree to participate in user research and surveys
        </label>
      </div>

      <p className="gdpr-notice">
        You can withdraw your consent at any time.
        See our <a href="/privacy">Privacy Policy</a> for more information.
      </p>
    </div>
  );
}

async function updateConsent(
  userId: string,
  purpose: NotificationPurpose,
  consented: boolean,
  metadata: { ipAddress: string; userAgent: string }
) {
  await db.consents.create({
    userId,
    purpose,
    consented,
    consentedAt: consented ? new Date() : null,
    withdrawnAt: consented ? null : new Date(),
    ipAddress: metadata.ipAddress,
    userAgent: metadata.userAgent,
    method: 'explicit'
  });

  // If consent withdrawn, stop all pending notifications
  if (!consented) {
    await cancelPendingNotifications(userId, purpose);
  }
}
```

### Data Retention

```typescript
// GDPR requires ability to delete user data
async function deleteUserNotificationData(userId: string) {
  // Delete notification preferences
  await db.notificationPreferences.deleteMany({ userId });

  // Delete notification history (or anonymize)
  await db.notifications.updateMany(
    { userId },
    {
      $set: {
        userId: "deleted-user",
        email: "deleted@example.com",
        deletedAt: new Date(),
      },
    },
  );

  // Delete consent records
  await db.consents.deleteMany({ userId });

  // Delete metrics
  await db.notificationMetrics.deleteMany({ userId });

  console.log(`Deleted notification data for user ${userId}`);
}

// Auto-delete old notifications
async function cleanupOldNotifications() {
  const retentionPeriod = 90; // days
  const cutoffDate = DateTime.now().minus({ days: retentionPeriod });

  const result = await db.notifications.deleteMany({
    createdAt: { $lt: cutoffDate.toJSDate() },
    read: true,
  });

  console.log(`Deleted ${result.deletedCount} old notifications`);
}

// Run cleanup daily
await queue.upsertJobScheduler(
  "cleanup-old-notifications",
  { pattern: "0 2 * * *" }, // 2 AM daily
  { name: "cleanup-notifications" },
);
```

---

## Implementation Examples

### Complete Notification Service

```typescript
import { Queue, Worker } from "bullmq";
import { WebClient } from "@slack/web-api";
import { DateTime } from "luxon";

class NotificationService {
  private queue: Queue;
  private slackClient: WebClient;

  constructor() {
    this.queue = new Queue("notifications", {
      connection: { host: "localhost", port: 6379 },
    });

    this.slackClient = new WebClient(process.env.SLACK_TOKEN, {
      maxRequestConcurrency: 5,
      retryConfig: { retries: 3 },
    });

    this.initializeWorkers();
    this.initializeSchedulers();
  }

  async send(notification: Notification): Promise<void> {
    // 1. Check consent
    const hasConsent = await this.checkConsent(notification.userId, notification);
    if (!hasConsent) {
      console.log("Notification blocked: no consent");
      return;
    }

    // 2. Apply suppression rules
    const processed = await this.applySuppressionRules(notification);
    if (!processed) {
      console.log("Notification suppressed by rules");
      return;
    }

    // 3. Check deduplication
    const isDuplicate = await this.checkDuplication(processed);
    if (isDuplicate) {
      console.log("Duplicate notification suppressed");
      return;
    }

    // 4. Get user preferences
    const prefs = await this.getUserPreferences(notification.userId);

    // 5. Check Do Not Disturb
    const dndCheck = await this.checkDoNotDisturb(notification, prefs);
    if (!dndCheck.send) {
      await this.queueForLater(notification, dndCheck.delayUntil);
      return;
    }

    // 6. Check frequency caps
    const freqCheck = await this.checkFrequencyCaps(notification.userId, prefs);
    if (!freqCheck.send) {
      await this.queueForDigest(notification);
      return;
    }

    // 7. Decide batching
    const batchDecision = await this.decideBatching(notification, prefs);
    if (batchDecision.shouldBatch) {
      await this.addToBatch(notification, batchDecision.suggestedDelay);
      return;
    }

    // 8. Send to appropriate channels
    await this.deliverNotification(notification, prefs);
  }

  private async deliverNotification(
    notification: Notification,
    prefs: NotificationPreferences,
  ): Promise<void> {
    // Always create in-app notification
    await this.createInAppNotification(notification);

    // Determine channels based on preferences and severity
    const channels = this.selectChannels(notification, prefs);

    for (const channel of channels) {
      try {
        switch (channel) {
          case "slack":
            await this.sendSlackNotification(notification);
            break;
          case "email":
            await this.sendEmailNotification(notification);
            break;
          case "sms":
            await this.sendSMSNotification(notification);
            break;
        }

        await this.trackDelivery(notification, channel, "success");
      } catch (error) {
        console.error(`Failed to send ${channel} notification:`, error);
        await this.trackDelivery(notification, channel, "failed");
      }
    }
  }

  private async sendSlackNotification(notification: Notification): Promise<void> {
    const prefs = await this.getUserPreferences(notification.userId);

    if (!prefs.channels.slack.enabled || !prefs.channels.slack.channelId) {
      return;
    }

    const message = this.formatSlackMessage(notification);

    try {
      await this.slackClient.chat.postMessage({
        channel: prefs.channels.slack.channelId,
        ...message,
      });
    } catch (error) {
      if (error.code === "slack_webapi_rate_limited") {
        // Queue for retry after rate limit
        await this.queue.add(
          "slack-notification",
          { notification },
          { delay: error.retryAfter * 1000 },
        );
      } else {
        throw error;
      }
    }
  }

  private formatSlackMessage(notification: Notification) {
    const severityColors = {
      critical: "#FF0000",
      high: "#FF9900",
      medium: "#FFCC00",
      low: "#36A64F",
    };

    return {
      text: notification.title,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${notification.title}*\n${notification.message}`,
          },
        },
        ...(notification.actions
          ? [
              {
                type: "actions",
                elements: notification.actions.map((action) => ({
                  type: "button",
                  text: { type: "plain_text", text: action.label },
                  action_id: action.id,
                  value: action.value,
                  style: action.style,
                })),
              },
            ]
          : []),
      ],
      attachments: [
        {
          color: severityColors[notification.severity],
          fields: [
            { title: "Priority", value: notification.severity, short: true },
            { title: "Time", value: DateTime.now().toLocaleString(), short: true },
          ],
        },
      ],
    };
  }

  private initializeWorkers(): void {
    // Worker for immediate notifications
    new Worker("notifications", async (job) => {
      await this.deliverNotification(job.data.notification, job.data.preferences);
    });

    // Worker for digest notifications
    new Worker("digest-notifications", async (job) => {
      await this.sendDigestNotifications(job.data.frequency, job.data.timezone);
    });
  }

  private initializeSchedulers(): void {
    // Hourly digest
    this.queue.upsertJobScheduler(
      "hourly-digest",
      { pattern: "0 * * * *" },
      { name: "send-digest", data: { frequency: "hourly" } },
    );

    // Daily digest (per timezone)
    this.scheduleDigestsByTimezone("daily");

    // Weekly digest (Mondays at 9 AM)
    this.queue.upsertJobScheduler(
      "weekly-digest",
      { pattern: "0 9 * * 1" },
      { name: "send-digest", data: { frequency: "weekly" } },
    );

    // Cleanup old notifications
    this.queue.upsertJobScheduler(
      "cleanup-notifications",
      { pattern: "0 2 * * *" },
      { name: "cleanup-old-notifications" },
    );

    // Health monitoring
    this.queue.upsertJobScheduler(
      "health-check",
      { pattern: "*/5 * * * *" },
      { name: "monitor-notification-system" },
    );
  }

  private async sendDigestNotifications(
    frequency: "hourly" | "daily" | "weekly",
    timezone?: string,
  ): Promise<void> {
    const users = await this.getUsersForDigest(frequency, timezone);

    for (const user of users) {
      const notifications = await this.getPendingDigestNotifications(user.id, frequency);

      if (notifications.length === 0) {
        continue; // Skip if no notifications
      }

      const prefs = await this.getUserPreferences(user.id);
      const minItems = prefs.channels.email.minimumItems || 1;

      if (notifications.length < minItems) {
        continue; // Skip if below minimum threshold
      }

      await this.sendDigestEmail(user, notifications, frequency);
      await this.markNotificationsAsSent(notifications);
    }
  }
}

export default NotificationService;
```

### Example Usage

```typescript
// Initialize service
const notificationService = new NotificationService();

// Send critical alert (immediate, multi-channel)
await notificationService.send({
  userId: "user-123",
  type: "system_alert",
  severity: "critical",
  title: "Database Connection Lost",
  message: "Primary database connection failed. Failover initiated.",
  purpose: NotificationPurpose.TRANSACTIONAL,
  actions: [
    { id: "view_status", label: "View Status", value: "status_page" },
    { id: "acknowledge", label: "Acknowledge", value: "ack", style: "primary" },
  ],
});

// Send low-priority notification (will be batched)
await notificationService.send({
  userId: "user-123",
  type: "comment",
  severity: "low",
  title: "New Comment",
  message: "Jane Doe commented on your task",
  purpose: NotificationPurpose.TRANSACTIONAL,
  resourceId: "task-456",
  batchable: true,
});

// Send marketing email (requires consent)
await notificationService.send({
  userId: "user-123",
  type: "product_update",
  severity: "low",
  title: "New Feature: Dark Mode",
  message: "Check out our new dark mode feature!",
  purpose: NotificationPurpose.MARKETING,
});
```

---

## Summary & Best Practices

### Key Takeaways

1. **Prioritize Ruthlessly**: Only 5-10% of notifications should be critical. Most should be batchable.

2. **Respect User Time**: Implement Do Not Disturb, timezone-aware delivery, and smart timing.

3. **Batch Aggressively**: Use hourly/daily digests for low-priority notifications. Aim for 70-80% batching rate.

4. **Provide Control**: Give users granular control over notification preferences per category and channel.

5. **Monitor Health**: Track open rates, ignore rates, and unsubscribe rates. Aim for >20% open rate and <50% ignore rate.

6. **Prevent Spam**: Use deduplication, suppression rules, frequency caps, and alert grouping.

7. **Comply with GDPR**: Distinguish transactional vs. marketing notifications. Require explicit consent for marketing.

8. **Learn & Adapt**: Track user engagement and adjust delivery timing based on activity patterns.

### Recommended Thresholds

| Metric           | Target | Warning   | Critical |
| ---------------- | ------ | --------- | -------- |
| Open Rate        | >30%   | 20-30%    | <20%     |
| Ignore Rate      | <40%   | 40-50%    | >50%     |
| Unsubscribe Rate | <2%    | 2-5%      | >5%      |
| Batching Rate    | >70%   | 50-70%    | <50%     |
| Delivery Latency | <2s    | 2-5s      | >5s      |
| Queue Depth      | <1000  | 1000-5000 | >5000    |

### Implementation Checklist

- [ ] Define notification severity levels
- [ ] Implement frequency capping (per hour/day)
- [ ] Set up digest notifications (hourly/daily/weekly)
- [ ] Create user preference UI with per-category controls
- [ ] Implement Do Not Disturb with timezone support
- [ ] Add deduplication logic
- [ ] Configure suppression rules
- [ ] Set up alert grouping for related events
- [ ] Implement consent management for GDPR
- [ ] Add metrics tracking and monitoring dashboard
- [ ] Configure health checks and alerting
- [ ] Set up data retention and cleanup jobs
- [ ] Test notification delivery across all channels
- [ ] Document notification types and expected behavior

---

## Additional Resources

### Industry Examples

- **PagerDuty**: [Alert Fatigue Guide](https://www.pagerduty.com/resources/digital-operations/learn/alert-fatigue/)
- **Datadog**: [Best Practices to Prevent Alert Fatigue](https://datadoghq.com/blog/best-practices-to-prevent-alert-fatigue)
- **Sentry**: [Alerts Best Practices](https://docs.sentry.io/product/alerts/best-practices/)

### Libraries & Tools

- **BullMQ**: Job scheduling and queue management - [Documentation](https://docs.bullmq.io/)
- **Slack SDK**: Node.js Slack integration - [Documentation](https://slack.dev/node-slack-sdk/)
- **Luxon**: Timezone-aware date handling - [Documentation](https://moment.github.io/luxon/)
- **NotificationAPI**: Managed notification service - [Documentation](https://notificationapi.com/docs)

### Further Reading

- [Knock.app Slack Notification Best Practices](https://knock.app/manuals/slack-notifications/best-practices-for-slack-notifications)
- [PagerDuty Event Management](https://support.pagerduty.com/main/docs/event-management)
- [GDPR Notification Requirements](https://gdpr.eu/email-encryption/)

---

**Document Version**: 1.0  
**Last Updated**: January 2026  
**Maintained By**: Engineering Team
