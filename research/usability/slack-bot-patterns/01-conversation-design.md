# Slack Bot Conversation Design Patterns

> Research document for Nubabel Slack bot with orchestrator architecture.
> Compiled from official Slack documentation and real-world implementations.

---

## Table of Contents

1. [Core Design Principles](#1-core-design-principles)
2. [Threading Patterns](#2-threading-patterns)
3. [Progressive Disclosure](#3-progressive-disclosure)
4. [Block Kit UX Patterns](#4-block-kit-ux-patterns)
5. [Error States & Graceful Degradation](#5-error-states--graceful-degradation)
6. [Onboarding Flows](#6-onboarding-flows)
7. [App Mention Flows](#7-app-mention-flows)
8. [Interactive Components](#8-interactive-components)
9. [Modals](#9-modals)
10. [Ephemeral Messages](#10-ephemeral-messages)
11. [Accessibility](#11-accessibility)
12. [Rate Limits](#12-rate-limits)
13. [Message Templates](#13-message-templates)
14. [Do's and Don'ts](#14-dos-and-donts)
15. [Sources](#15-sources)

---

## 1. Core Design Principles

### Build with Empathy for the End User

> "Build with empathy for the end user. We all want to make our users' work lives more pleasant and productive."
> — [Slack App Design Guide](https://docs.slack.dev/surfaces/app-design)

**Key considerations:**

| Factor             | Consideration                                                |
| ------------------ | ------------------------------------------------------------ |
| **Timezones**      | Users span the globe; schedule notifications thoughtfully    |
| **Languages**      | Tailor language for localized experiences                    |
| **Workspace size** | Design for 5-person teams AND 50,000-person enterprises      |
| **User roles**     | Guest accounts, admins, bot users have different permissions |
| **Platform**       | Test on desktop, mobile, and web                             |
| **Familiarity**    | Not everyone knows Slack apps exist                          |

### Voice and Tone

- **Be brief, clear, and human**
- Your bot is an extension of your brand voice
- Avoid jargon, buzzwords, idioms, and slang
- Use short, clear sentences and paragraphs
- Explain abbreviations

---

## 2. Threading Patterns

### Why Thread?

Threading keeps channels clean and groups related messages together. It's essential for:

- Multi-step workflows
- Status updates on long-running tasks
- Conversations that spawn from a notification

### Implementation Pattern

```typescript
// Store the parent message timestamp for threading
app.event("app_mention", async ({ event, client }) => {
  // Post initial response
  const result = await client.chat.postMessage({
    channel: event.channel,
    text: "Processing your request...",
  });

  // Thread subsequent updates using thread_ts
  await client.chat.postMessage({
    channel: event.channel,
    thread_ts: result.ts, // Key: use parent message ts
    text: "Step 1 complete...",
  });
});
```

### Threading Best Practices

| Do                                            | Don't                                             |
| --------------------------------------------- | ------------------------------------------------- |
| Thread status updates for long-running tasks  | Spam the main channel with every update           |
| Use `thread_ts` to group related messages     | Create new threads for each minor update          |
| Reply in thread for user-specific responses   | Broadcast thread replies to channel unnecessarily |
| Store `ts` values for conversation continuity | Lose track of conversation context                |

**Real-world example** from [inferablehq/inferable](https://github.com/inferablehq/inferable):

```typescript
app.event("app_mention", async ({ event, client }) => {
  await client.chat.postMessage({
    thread_ts: event.ts, // Reply in thread to the mention
    channel: event.channel,
    text: "Processing...",
  });
});
```

---

## 3. Progressive Disclosure

### Principle

> "Use interactive components to break workflows into steps, and only show what's needed for the current step."
> — [Slack Block Kit Design Guide](https://docs.slack.dev/block-kit/designing-with-block-kit)

### Implementation Strategies

1. **Start simple, reveal complexity on demand**
   - Show primary action first
   - Hide advanced options behind overflow menus or buttons
   - Use modals for complex forms

2. **Context blocks for secondary info**

   ```json
   {
     "type": "context",
     "elements": [{ "type": "mrkdwn", "text": "Last updated: 2 hours ago" }]
   }
   ```

3. **Overflow menus for less-used actions**
   ```json
   {
     "type": "overflow",
     "action_id": "more_options",
     "options": [
       { "text": { "type": "plain_text", "text": "Edit" }, "value": "edit" },
       { "text": { "type": "plain_text", "text": "Delete" }, "value": "delete" }
     ]
   }
   ```

### Before/After Example

**Before (cluttered):**

```
[Calendar Event]
Title: Team Standup
Time: 10:00 AM
Location: Zoom
Attendees: @alice, @bob, @charlie
[Join] [Edit] [Delete] [Reschedule] [Add Attendee] [Copy Link] [Export]
```

**After (progressive disclosure):**

```
[Calendar Event]
Title: Team Standup | 10:00 AM
[Join Meeting] [...more options]
```

---

## 4. Block Kit UX Patterns

### Block Limits

| Surface  | Max Blocks |
| -------- | ---------- |
| Messages | 50 blocks  |
| Modals   | 100 blocks |
| App Home | 100 blocks |

### Essential Block Types

| Block     | Use Case                                |
| --------- | --------------------------------------- |
| `section` | Primary content with optional accessory |
| `actions` | Group of interactive elements           |
| `context` | Secondary/metadata information          |
| `divider` | Visual separation                       |
| `header`  | Section titles                          |
| `input`   | Form fields (modals only)               |
| `image`   | Visual content                          |

### Section with Accessory Pattern

```json
{
  "type": "section",
  "text": {
    "type": "mrkdwn",
    "text": "*Task:* Review PR #123\n*Status:* Pending"
  },
  "accessory": {
    "type": "button",
    "text": { "type": "plain_text", "text": "Review" },
    "action_id": "review_pr",
    "value": "pr_123"
  }
}
```

### Simplify with Pictures

> "Sometimes faces can be better than names, or maps better than addresses."
> — [Slack Block Kit Design Guide](https://docs.slack.dev/block-kit/designing-with-block-kit)

Use image elements in context blocks to replace text lists:

```json
{
  "type": "context",
  "elements": [
    { "type": "image", "image_url": "https://example.com/alice.png", "alt_text": "Alice" },
    { "type": "image", "image_url": "https://example.com/bob.png", "alt_text": "Bob" },
    { "type": "mrkdwn", "text": "2 reviewers assigned" }
  ]
}
```

---

## 5. Error States & Graceful Degradation

### Error Handling Architecture

```typescript
// Global error handler
app.error(async (error) => {
  console.error("Unhandled error:", error);
});

// Specific error handlers on HTTPReceiver
const receiver = new HTTPReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  dispatchErrorHandler: async ({ error, logger, response }) => {
    logger.error(`Dispatch error: ${error.message}`);
    response.writeHead(404);
    response.end();
  },
  processEventErrorHandler: async ({ error, logger, response, ack }) => {
    logger.error(`Process error: ${error.message}`);
    ack(); // Always acknowledge to prevent retries
  },
  unhandledRequestHandler: async ({ logger, response }) => {
    logger.warn("Unhandled request");
    response.writeHead(404);
    response.end();
  },
  unhandledRequestTimeoutMillis: 3001,
});
```

### User-Facing Error Messages

**Template: Friendly Error**

```json
{
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": ":warning: *Something went wrong*\nI couldn't complete that action. Here's what you can try:"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "1. Wait a moment and try again\n2. Check your permissions\n3. Contact support if the issue persists"
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "Try Again" },
          "action_id": "retry_action",
          "style": "primary"
        },
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "Get Help" },
          "action_id": "get_help"
        }
      ]
    }
  ]
}
```

### Retry with Exponential Backoff

```typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 1000): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      if (error.code === "slack_webapi_platform_error" && error.data?.error === "ratelimited") {
        const retryAfter =
          error.headers?.["retry-after"] || (Math.pow(2, attempt) * baseDelay) / 1000;
        await sleep(retryAfter * 1000);
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}
```

---

## 6. Onboarding Flows

### When to Start Onboarding

| Event               | Action                        |
| ------------------- | ----------------------------- |
| `app_home_opened`   | Show welcome in App Home      |
| First slash command | Provide contextual help       |
| `app_mention`       | Respond with capabilities     |
| Installation        | DM installer with setup guide |

### Welcome Message Template

```json
{
  "blocks": [
    {
      "type": "header",
      "text": { "type": "plain_text", "text": "Welcome to Nubabel!" }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "I'm your AI-powered assistant. Here's what I can help you with:"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Quick Actions:*\n:speech_balloon: Mention me with a question\n:gear: Use `/nubabel settings` to configure\n:question: Type `/nubabel help` anytime"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "Get Started" },
          "action_id": "onboarding_start",
          "style": "primary"
        },
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "Skip Tutorial" },
          "action_id": "onboarding_skip"
        }
      ]
    }
  ]
}
```

### Onboarding Best Practices

| Do                                      | Don't                                 |
| --------------------------------------- | ------------------------------------- |
| DM only the installer                   | DM the entire workspace               |
| Make extended walkthroughs opt-in       | Force users through lengthy tutorials |
| Provide clear call-to-action            | Leave users wondering what to do next |
| Say hello when added to a channel       | Stay silent and confuse users         |
| Let users skip non-essential onboarding | Trap users in mandatory flows         |

---

## 7. App Mention Flows

### Basic Pattern

```typescript
app.event("app_mention", async ({ event, client, say }) => {
  // Extract the actual message (remove the mention)
  const text = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();

  if (!text) {
    // Empty mention - show help
    await say({
      thread_ts: event.ts,
      text: "Hi! How can I help? Try asking me a question or type `help` for options.",
    });
    return;
  }

  // Process the request
  await say({
    thread_ts: event.ts,
    text: `Processing: "${text}"...`,
  });
});
```

### Handling Different Mention Contexts

```typescript
app.event("app_mention", async ({ event, client, body }) => {
  // Check if this is an invite mention (bot being added to channel)
  if (event.text.includes("has joined the channel")) {
    await client.chat.postMessage({
      channel: event.channel,
      text: "Thanks for adding me! Type `@Nubabel help` to see what I can do.",
    });
    return;
  }

  // Regular mention handling
  // ...
});
```

---

## 8. Interactive Components

### Button Patterns

**Primary Action:**

```json
{
  "type": "button",
  "text": { "type": "plain_text", "text": "Approve" },
  "style": "primary",
  "action_id": "approve_request",
  "value": "request_123"
}
```

**Danger Action:**

```json
{
  "type": "button",
  "text": { "type": "plain_text", "text": "Delete" },
  "style": "danger",
  "action_id": "delete_item",
  "confirm": {
    "title": { "type": "plain_text", "text": "Are you sure?" },
    "text": { "type": "mrkdwn", "text": "This action cannot be undone." },
    "confirm": { "type": "plain_text", "text": "Delete" },
    "deny": { "type": "plain_text", "text": "Cancel" }
  }
}
```

### Select Menu Patterns

**Static Options:**

```json
{
  "type": "static_select",
  "placeholder": { "type": "plain_text", "text": "Select priority" },
  "action_id": "select_priority",
  "options": [
    { "text": { "type": "plain_text", "text": "High" }, "value": "high" },
    { "text": { "type": "plain_text", "text": "Medium" }, "value": "medium" },
    { "text": { "type": "plain_text", "text": "Low" }, "value": "low" }
  ]
}
```

**External Data Source:**

```json
{
  "type": "external_select",
  "placeholder": { "type": "plain_text", "text": "Search projects..." },
  "action_id": "select_project",
  "min_query_length": 2
}
```

### Handling Interactions

```typescript
app.action("approve_request", async ({ ack, body, client }) => {
  await ack(); // Always acknowledge within 3 seconds

  const requestId = body.actions[0].value;

  // Update the original message
  await client.chat.update({
    channel: body.channel.id,
    ts: body.message.ts,
    text: "Request approved!",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:white_check_mark: *Approved* by <@${body.user.id}>`,
        },
      },
    ],
  });
});
```

---

## 9. Modals

### Opening a Modal

```typescript
app.shortcut("open_settings", async ({ ack, body, client }) => {
  await ack();

  await client.views.open({
    trigger_id: body.trigger_id, // Must use within 3 seconds
    view: {
      type: "modal",
      callback_id: "settings_modal",
      title: { type: "plain_text", text: "Settings" },
      submit: { type: "plain_text", text: "Save" },
      close: { type: "plain_text", text: "Cancel" },
      blocks: [
        {
          type: "input",
          block_id: "notification_channel",
          label: { type: "plain_text", text: "Notification Channel" },
          element: {
            type: "channels_select",
            action_id: "channel_select",
            placeholder: { type: "plain_text", text: "Select a channel" },
          },
        },
      ],
    },
  });
});
```

### Modal Submission

```typescript
app.view("settings_modal", async ({ ack, body, view, client }) => {
  await ack();

  const values = view.state.values;
  const channel = values.notification_channel.channel_select.selected_channel;

  // Save settings...

  // Optionally send confirmation
  await client.chat.postMessage({
    channel: body.user.id,
    text: `Settings saved! Notifications will go to <#${channel}>`,
  });
});
```

### Modal Best Practices

| Do                                                    | Don't                               |
| ----------------------------------------------------- | ----------------------------------- |
| Use modals for complex forms                          | Use modals for simple confirmations |
| Validate input before submission                      | Let invalid data through            |
| Provide clear submit/cancel labels                    | Use generic "OK" buttons            |
| Update modal with `views.update` for multi-step flows | Open new modals for each step       |
| Keep modals focused on one task                       | Cram too many inputs into one modal |

---

## 10. Ephemeral Messages

### What Are Ephemeral Messages?

Messages visible only to a specific user. Perfect for:

- Confirmations
- Error messages
- Help text
- Sensitive information

### Sending Ephemeral Messages

```typescript
await client.chat.postEphemeral({
  channel: channelId,
  user: userId,
  text: "Only you can see this message.",
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: ":eyes: *Private response*\nThis message is only visible to you.",
      },
    },
  ],
});
```

### When to Use Ephemeral vs. Regular Messages

| Use Ephemeral        | Use Regular                        |
| -------------------- | ---------------------------------- |
| Error messages       | Success notifications for the team |
| Help/usage info      | Status updates others should see   |
| Confirmations        | Shared information                 |
| Sensitive data       | Conversation contributions         |
| "Only you" responses | Threaded discussions               |

### Ephemeral in Threads

```typescript
await client.chat.postEphemeral({
  channel: channelId,
  user: userId,
  thread_ts: parentTs, // Post ephemeral in a thread
  text: "This ephemeral message appears in the thread.",
});
```

---

## 11. Accessibility

### Content Guidelines

| Do                                 | Don't                             |
| ---------------------------------- | --------------------------------- |
| Use short, clear sentences         | Use jargon, buzzwords, idioms     |
| Explain abbreviations              | Assume everyone knows acronyms    |
| Provide alt_text for all images    | Leave images without descriptions |
| Use color + text to convey meaning | Rely on color alone               |
| Test in light and dark mode        | Assume one theme fits all         |

### Emoji Guidelines

> "Emojis are tied to text aliases, which display on hover and when emojis are turned off."
> — [Slack Block Kit Design Guide](https://docs.slack.dev/block-kit/designing-with-block-kit)

| Do                                 | Don't                           |
| ---------------------------------- | ------------------------------- |
| Place emojis at end of sentences   | Use emojis as bullet points     |
| Pair emojis with relevant text     | Use emojis as word replacements |
| Use sparingly in headers           | Use emojis as controls/buttons  |
| Use in header OR subtext, not both | Overload messages with emojis   |

### Screen Reader Considerations

```json
{
  "type": "image",
  "image_url": "https://example.com/chart.png",
  "alt_text": "Bar chart showing Q4 sales: Product A 45%, Product B 30%, Product C 25%"
}
```

### Interactive Element Accessibility

| Do                               | Don't                                |
| -------------------------------- | ------------------------------------ |
| Wrap inputs in input blocks      | Wrap inputs in section/action blocks |
| Provide labels for all inputs    | Use emojis in input labels           |
| Use descriptive placeholder text | Use vague placeholders               |
| Keep button labels brief         | Truncate important button text       |

---

## 12. Rate Limits

### Overview

| Feature           | Limit                         |
| ----------------- | ----------------------------- |
| Posting messages  | 1 per second per channel      |
| Incoming webhooks | 1 per second                  |
| Web API Tier 1    | 1+ per minute                 |
| Web API Tier 2    | 20+ per minute                |
| Web API Tier 3    | 50+ per minute                |
| Web API Tier 4    | 100+ per minute               |
| Events API        | 30,000 per workspace per hour |

### Handling Rate Limits

```typescript
// Check for rate limit response
if (response.status === 429) {
  const retryAfter = response.headers.get("Retry-After");
  console.log(`Rate limited. Retry after ${retryAfter} seconds`);
  await sleep(parseInt(retryAfter) * 1000);
  // Retry the request
}
```

### Rate Limit Best Practices

| Do                                | Don't                                |
| --------------------------------- | ------------------------------------ |
| Implement exponential backoff     | Hammer the API after 429             |
| Respect `Retry-After` header      | Use fixed retry delays               |
| Queue messages for batch sending  | Send messages synchronously in loops |
| Use pagination for large datasets | Fetch all data without pagination    |
| Cache frequently accessed data    | Make redundant API calls             |

### Avoiding Rate Limits

1. **Batch operations** where possible
2. **Use webhooks** for real-time updates instead of polling
3. **Implement request queuing** with rate limiting
4. **Cache user/channel data** to reduce API calls

---

## 13. Message Templates

### Status Update Template

```json
{
  "blocks": [
    {
      "type": "header",
      "text": { "type": "plain_text", "text": "Task Update" }
    },
    {
      "type": "section",
      "fields": [
        { "type": "mrkdwn", "text": "*Task:*\nDeploy v2.0" },
        { "type": "mrkdwn", "text": "*Status:*\n:white_check_mark: Complete" }
      ]
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "Completed by <@U123> | <!date^1234567890^{date_short} at {time}|Jan 1, 2024>"
        }
      ]
    }
  ]
}
```

### Approval Request Template

```json
{
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Approval Required*\n<@U123> is requesting access to the production database."
      }
    },
    {
      "type": "section",
      "fields": [
        { "type": "mrkdwn", "text": "*Requested by:*\n<@U123>" },
        { "type": "mrkdwn", "text": "*Resource:*\nProduction DB" },
        { "type": "mrkdwn", "text": "*Duration:*\n2 hours" },
        { "type": "mrkdwn", "text": "*Reason:*\nDebugging issue #456" }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "Approve" },
          "style": "primary",
          "action_id": "approve_access",
          "value": "request_789"
        },
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "Deny" },
          "style": "danger",
          "action_id": "deny_access",
          "value": "request_789"
        }
      ]
    }
  ]
}
```

### Error Notification Template

````json
{
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": ":x: *Error Processing Request*"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "I encountered an issue while processing your request. Here's what happened:\n\n```Connection timeout after 30 seconds```"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "Error ID: `err_abc123` | <https://status.example.com|Check Status>"
        }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "Retry" },
          "action_id": "retry_request"
        },
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "Report Issue" },
          "action_id": "report_issue"
        }
      ]
    }
  ]
}
````

### Help/Command List Template

```json
{
  "blocks": [
    {
      "type": "header",
      "text": { "type": "plain_text", "text": "Available Commands" }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Getting Started*\n`/nubabel help` - Show this message\n`/nubabel settings` - Configure your preferences"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Tasks*\n`/nubabel ask [question]` - Ask a question\n`/nubabel summarize` - Summarize the current thread"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "Need more help? Visit our <https://docs.example.com|documentation>"
        }
      ]
    }
  ]
}
```

---

## 14. Do's and Don'ts

### Message Design

| Do                                     | Don't                                |
| -------------------------------------- | ------------------------------------ |
| Keep messages concise and scannable    | Write walls of text                  |
| Use Block Kit for rich formatting      | Rely on plain text for complex info  |
| Update messages after actions complete | Leave stale interactive elements     |
| Thread related messages                | Spam channels with updates           |
| Use context blocks for metadata        | Clutter primary content with details |

### Notifications

| Do                                          | Don't                              |
| ------------------------------------------- | ---------------------------------- |
| Let users configure notification frequency  | Send notifications without consent |
| Offer digest options for high-volume alerts | Notify for every minor event       |
| Match message types to appropriate channels | Post to #general by default        |
| Make notifications actionable               | Send notification-only messages    |
| Respect quiet hours/DND                     | Ignore user preferences            |

### Interactions

| Do                                               | Don't                              |
| ------------------------------------------------ | ---------------------------------- |
| Acknowledge actions within 3 seconds             | Let interactions timeout           |
| Provide feedback for every action                | Leave users wondering if it worked |
| Use confirmation dialogs for destructive actions | Delete without warning             |
| Choose sensible defaults                         | Force users to fill every field    |
| Clean up messages after workflows complete       | Leave interactive elements forever |

### Bot Behavior

| Do                               | Don't                          |
| -------------------------------- | ------------------------------ |
| Respond when @mentioned          | Ignore mentions                |
| Provide help when asked          | Assume users know all commands |
| Handle errors gracefully         | Show raw error messages        |
| Respect rate limits              | Hammer the API                 |
| Say hello when added to channels | Stay silent                    |

### Accessibility

| Do                                 | Don't                    |
| ---------------------------------- | ------------------------ |
| Provide alt_text for images        | Leave images undescribed |
| Use color + text for meaning       | Rely on color alone      |
| Test in light and dark mode        | Assume one theme         |
| Keep button labels brief and clear | Truncate important text  |
| Explain abbreviations              | Use unexplained jargon   |

---

## 15. Sources

### Official Slack Documentation

1. **App Design Guide**
   - URL: https://docs.slack.dev/surfaces/app-design
   - Topics: Design principles, voice/tone, messaging considerations

2. **Block Kit Design Guide**
   - URL: https://docs.slack.dev/block-kit/designing-with-block-kit
   - Topics: Accessibility, content guidelines, screen readers

3. **Onboarding Users**
   - URL: https://docs.slack.dev/app-management/onboarding-users-to-your-app
   - Topics: Welcome messages, help actions, visibility

4. **Rate Limits**
   - URL: https://docs.slack.dev/apis/web-api/rate-limits
   - Topics: API tiers, burst limits, handling 429 errors

5. **Block Kit Reference**
   - URL: https://api.slack.com/block-kit
   - Topics: Blocks, elements, composition objects

6. **AI Apps Best Practices**
   - URL: https://docs.slack.dev/ai/ai-apps-best-practices
   - Topics: AI-specific patterns, App Home usage

### Real-World Implementations (GitHub)

7. **slackapi/bolt-js** (Official Bolt Framework)
   - URL: https://github.com/slackapi/bolt-js
   - License: MIT
   - Topics: Error handling, event patterns, middleware

8. **inferablehq/inferable**
   - URL: https://github.com/inferablehq/inferable
   - License: MIT
   - Topics: app_mention handling, threading

9. **seratch/bolt-starter**
   - URL: https://github.com/seratch/bolt-starter
   - License: MIT
   - Topics: Basic patterns, OAuth, event handling

10. **slack-edge/slack-edge**
    - URL: https://github.com/slack-edge/slack-edge
    - License: MIT
    - Topics: Modals, views.open, assistant patterns

11. **howdyai/botkit**
    - URL: https://github.com/howdyai/botkit
    - License: MIT
    - Topics: Ephemeral messages, reply patterns

12. **raycharius/slack-block-builder**
    - URL: https://github.com/raycharius/slack-block-builder
    - License: MIT
    - Topics: Block Kit builder patterns, pagination

### Additional Resources

13. **Vercel Academy - Slack Agents**
    - URL: https://vercel.com/academy/slack-agents/error-handling-and-resilience
    - Topics: Error handling, retry logic, graceful degradation

14. **Knock Blog - Block Kit Deep Dive**
    - URL: https://knock.app/blog/taking-a-deep-dive-into-slack-block-kit
    - Topics: Block Kit patterns, notification design

---

_Document compiled for Nubabel Slack bot development. Last updated: January 2026._
