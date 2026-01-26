# Slack Bot Conversation Design Patterns Guide

**For Multi-Tenant B2B SaaS AI Workflow Automation Platforms**

_Target Stack: Slack Bolt.js, TypeScript, Node.js_

---

## Table of Contents

1. [Introduction](#introduction)
2. [Threading Strategies](#threading-strategies)
3. [Block Kit Interactive Components](#block-kit-interactive-components)
4. [Modal Dialog Patterns](#modal-dialog-patterns)
5. [Error Handling & Rate Limiting](#error-handling--rate-limiting)
6. [Accessibility Considerations](#accessibility-considerations)
7. [Mobile vs Desktop UX](#mobile-vs-desktop-ux)
8. [Localization Concerns](#localization-concerns)
9. [Production Examples](#production-examples)

---

## Introduction

This guide provides comprehensive patterns for building production-ready Slack bots using Bolt.js and TypeScript. It focuses on conversation design patterns essential for enterprise B2B SaaS applications, particularly AI workflow automation platforms like Nubabel.

### Key Principles

- **Context Preservation**: Use threading to maintain conversation context
- **Progressive Disclosure**: Use modals for complex inputs, buttons for simple actions
- **Accessibility First**: Design for screen readers and keyboard navigation
- **Mobile Responsive**: Ensure experiences work across desktop and mobile
- **Error Resilience**: Handle rate limits and API failures gracefully

---

## Threading Strategies

### When to Use Threads vs Channels

**Use Threads When:**

- Responding to user-initiated conversations
- Maintaining context for multi-turn interactions
- Keeping channel noise minimal
- Building AI assistant conversations
- Handling workflow-specific discussions

**Use Channels When:**

- Broadcasting notifications to teams
- Sharing status updates
- Posting summaries or reports
- Announcing system-wide events

### Thread Implementation Patterns

#### Pattern 1: Reply in Thread

Always reply in the same thread to maintain conversation context:

```typescript
import { App } from "@slack/bolt";

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// Respond in thread to maintain context
app.message("hello", async ({ message, say }) => {
  await say({
    text: `Hi <@${message.user}>! How can I help you today?`,
    thread_ts: message.thread_ts || message.ts, // Use existing thread or create new one
  });
});
```

**Production Example from Vespper:**

```typescript
// From vespperhq/vespper - services/slackbot/src/messages.ts
const response = await say({
  text: output,
  thread_ts: message.thread_ts || message.ts, // Use the thread timestamp if available
  metadata: message_metadata,
});

const { ok, channel, ts } = response;
if (ok && channel && ts) {
  await addFeedbackReactions(client, channel, ts);
}
```

#### Pattern 2: Ephemeral Messages in Threads

Use ephemeral messages for private responses within threads:

```typescript
// From vespperhq/vespper - services/slackbot/src/messages.ts
client.chat
  .postEphemeral({
    channel: message.channel,
    user: message.user,
    text: messageText,
    thread_ts: message.thread_ts, // Keep it in the thread
  })
  .catch((error) => {
    console.error(error);
  });
```

#### Pattern 3: Thread History for AI Context

Retrieve thread history to provide context to AI models:

```typescript
// From Slack Bolt.js AI Assistant Tutorial
const thread = await client.conversations.replies({
  channel,
  ts: thread_ts,
  oldest: thread_ts,
});

// Prepare and tag each message for LLM processing
const userMessage = { role: "user", content: message.text };
const threadHistory = thread.messages.map((m) => {
  const role = m.bot_id ? "assistant" : "user";
  return { role, content: m.text };
});

const messages = [
  { role: "system", content: DEFAULT_SYSTEM_CONTENT },
  ...threadHistory,
  userMessage,
];

// Send message history and newest question to LLM
const llmResponse = await aiClient.chatCompletion({
  model: "your-model",
  messages,
  max_tokens: 2000,
});

await say({ text: llmResponse.choices[0].message.content });
```

#### Pattern 4: Thread Metadata

Store workflow state in message metadata:

```typescript
interface WorkflowMetadata {
  workflow_id: string;
  step: number;
  user_id: string;
  tenant_id: string;
}

await say({
  text: "Workflow started!",
  thread_ts: message.ts,
  metadata: {
    event_type: "workflow_started",
    event_payload: {
      workflow_id: "wf_123",
      step: 1,
      user_id: message.user,
      tenant_id: "tenant_abc",
    } as WorkflowMetadata,
  },
});
```

### Threading Best Practices

1. **Always preserve thread context**: Use `thread_ts: message.thread_ts || message.ts`
2. **Set thread titles for Assistant threads**: Use `setTitle()` to make threads discoverable
3. **Use ephemeral messages for errors**: Keep error messages private with `postEphemeral`
4. **Limit thread depth**: For complex workflows, consider moving to modals after 3-4 exchanges
5. **Clean up old threads**: Archive or summarize long-running threads periodically

---

## Block Kit Interactive Components

### Button Patterns

#### Pattern 1: Basic Action Button

```typescript
app.message("hello", async ({ message, say }) => {
  await say({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Hey there <@${message.user}>!`,
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Click Me",
          },
          action_id: "button_click",
          accessibility_label: "Click this button to continue", // Screen reader support
        },
      },
    ],
    text: `Hey there <@${message.user}>!`, // Fallback for notifications
  });
});

// Handle button click
app.action("button_click", async ({ ack, body, client, logger }) => {
  await ack();

  try {
    // Perform action
    await client.chat.postMessage({
      channel: body.channel.id,
      text: "Button clicked!",
    });
  } catch (error) {
    logger.error(error);
  }
});
```

#### Pattern 2: Styled Buttons with Confirmation

```typescript
// From crbnos/carbon - apps/erp/app/routes/api+/integrations.slack.interactive.ts
{
  type: 'actions',
  elements: [
    {
      type: 'button',
      text: {
        type: 'plain_text',
        text: 'Approve',
      },
      style: 'primary', // Green button
      action_id: 'approve_action',
      value: 'approve',
      confirm: {
        title: {
          type: 'plain_text',
          text: 'Are you sure?',
        },
        text: {
          type: 'mrkdwn',
          text: 'This will approve the workflow and notify the team.',
        },
        confirm: {
          type: 'plain_text',
          text: 'Yes, approve',
        },
        deny: {
          type: 'plain_text',
          text: 'Cancel',
        },
      },
    },
    {
      type: 'button',
      text: {
        type: 'plain_text',
        text: 'Reject',
      },
      style: 'danger', // Red button
      action_id: 'reject_action',
      value: 'reject',
    },
  ],
}
```

#### Pattern 3: Button with Dynamic Updates

```typescript
// From Slack Bolt.js Custom Steps Tutorial
app.action("sample_button", async ({ ack, body, client, complete, fail, logger }) => {
  try {
    await ack();

    const { channel, message, user } = body;

    // Complete the workflow function
    await complete({ outputs: { user_id: user.id } });

    // Update the original message
    await client.chat.update({
      channel: channel.id,
      ts: message.ts,
      text: "Function completed successfully!",
    });
  } catch (error) {
    logger.error(error);
    await fail({ error: `Failed to handle a function request: ${error}` });
  }
});
```

### Select Menu Patterns

#### Pattern 1: Static Select Menu

```typescript
// From hackclub/slacker - lib/blocks.ts
{
  type: 'section',
  block_id: 'assign_user',
  text: {
    type: 'mrkdwn',
    text: 'Assign this task to:',
  },
  accessory: {
    type: 'static_select',
    placeholder: {
      type: 'plain_text',
      text: 'Select a user',
      emoji: true,
    },
    action_id: 'user_select',
    options: [
      {
        text: { type: 'plain_text', text: 'Alice', emoji: true },
        value: 'user_alice',
      },
      {
        text: { type: 'plain_text', text: 'Bob', emoji: true },
        value: 'user_bob',
      },
      {
        text: { type: 'plain_text', text: 'Charlie', emoji: true },
        value: 'user_charlie',
      },
    ],
  },
}

// Handle selection
app.action('user_select', async ({ ack, body, client, logger }) => {
  await ack();

  if (body.type !== 'block_actions') return;

  const selectedUser = body.actions[0].selected_option.value;
  logger.info(`User selected: ${selectedUser}`);

  // Update workflow state or perform action
});
```

#### Pattern 2: Dynamic Select with External Data

```typescript
// From catchpoint/WebPageTest.slack - utils/slackHelpers.js
{
  type: 'input',
  block_id: 'location',
  label: {
    type: 'plain_text',
    text: 'Test Location',
  },
  element: {
    type: 'static_select',
    placeholder: {
      type: 'plain_text',
      text: 'Select a location',
      emoji: true,
    },
    action_id: 'location_select',
    options: locations.map(loc => ({
      text: {
        type: 'plain_text',
        text: loc.name,
      },
      value: loc.id,
    })),
  },
}
```

#### Pattern 3: Multi-Select for Batch Operations

```typescript
{
  type: 'input',
  block_id: 'workflow_steps',
  label: {
    type: 'plain_text',
    text: 'Select workflow steps to execute',
  },
  element: {
    type: 'multi_static_select',
    placeholder: {
      type: 'plain_text',
      text: 'Choose steps',
    },
    action_id: 'steps_select',
    options: [
      {
        text: { type: 'plain_text', text: 'Data Validation' },
        value: 'step_validation',
      },
      {
        text: { type: 'plain_text', text: 'AI Processing' },
        value: 'step_ai',
      },
      {
        text: { type: 'plain_text', text: 'Notification' },
        value: 'step_notify',
      },
    ],
  },
}
```

### Checkbox Patterns

```typescript
{
  type: 'input',
  block_id: 'preferences',
  label: {
    type: 'plain_text',
    text: 'Notification Preferences',
  },
  element: {
    type: 'checkboxes',
    action_id: 'notification_prefs',
    options: [
      {
        text: {
          type: 'mrkdwn',
          text: '*Email notifications*',
        },
        description: {
          type: 'mrkdwn',
          text: 'Receive updates via email',
        },
        value: 'email',
      },
      {
        text: {
          type: 'mrkdwn',
          text: '*Slack notifications*',
        },
        description: {
          type: 'mrkdwn',
          text: 'Receive updates in Slack',
        },
        value: 'slack',
      },
    ],
  },
}

// Acknowledge checkbox interactions
app.action('notification_prefs', async ({ ack }) => await ack());
```

### Date Picker Pattern

```typescript
{
  type: 'input',
  block_id: 'deadline',
  label: {
    type: 'plain_text',
    text: 'Workflow Deadline',
  },
  element: {
    type: 'datepicker',
    action_id: 'deadline_select',
    initial_date: '2026-02-01',
    placeholder: {
      type: 'plain_text',
      text: 'Select a date',
    },
  },
}
```

### Interactive Component Best Practices

1. **Always acknowledge interactions**: Call `ack()` within 3 seconds
2. **Use `accessibility_label`**: Provide descriptive labels for screen readers
3. **Provide fallback text**: Include top-level `text` for notifications
4. **Validate input**: Check user selections before processing
5. **Handle errors gracefully**: Use try-catch and log errors
6. **Update messages**: Use `chat.update` to show action results
7. **Use confirmation dialogs**: For destructive actions (delete, reject, etc.)

---

## Modal Dialog Patterns

### When to Use Modals

**Use Modals For:**

- Complex multi-field forms
- Workflow configuration
- Settings and preferences
- Data entry requiring validation
- Multi-step processes (up to 3 views)

**Avoid Modals For:**

- Simple yes/no questions (use buttons)
- Single field input (use message input)
- Time-sensitive actions (modals can be dismissed)

### Pattern 1: Basic Modal

```typescript
// From Slack Bolt.js Modal Tutorial
app.command("/ticket", async ({ ack, body, client, logger }) => {
  await ack();

  try {
    const result = await client.views.open({
      trigger_id: body.trigger_id, // Must use within 3 seconds
      view: {
        type: "modal",
        callback_id: "ticket_modal",
        title: {
          type: "plain_text",
          text: "Create Support Ticket",
        },
        blocks: [
          {
            type: "input",
            block_id: "title_block",
            label: {
              type: "plain_text",
              text: "Ticket Title",
            },
            element: {
              type: "plain_text_input",
              action_id: "title_input",
              placeholder: {
                type: "plain_text",
                text: "Brief description of the issue",
              },
            },
          },
          {
            type: "input",
            block_id: "description_block",
            label: {
              type: "plain_text",
              text: "Description",
            },
            element: {
              type: "plain_text_input",
              action_id: "description_input",
              multiline: true,
              placeholder: {
                type: "plain_text",
                text: "Provide detailed information",
              },
            },
          },
        ],
        submit: {
          type: "plain_text",
          text: "Submit",
        },
        close: {
          type: "plain_text",
          text: "Cancel",
        },
      },
    });
    logger.info(result);
  } catch (error) {
    logger.error(error);
  }
});

// Handle modal submission
app.view("ticket_modal", async ({ ack, body, view, client, logger }) => {
  await ack();

  const values = view.state.values;
  const title = values.title_block.title_input.value;
  const description = values.description_block.description_input.value;

  try {
    // Process the ticket
    await createTicket({ title, description, user: body.user.id });

    // Send confirmation
    await client.chat.postMessage({
      channel: body.user.id,
      text: `Ticket created: ${title}`,
    });
  } catch (error) {
    logger.error(error);
  }
});
```

### Pattern 2: Modal with Validation

```typescript
app.view("workflow_config_modal", async ({ ack, body, view, logger }) => {
  const values = view.state.values;
  const workflowName = values.name_block.name_input.value;
  const triggerType = values.trigger_block.trigger_select.selected_option?.value;

  // Validate inputs
  const errors: Record<string, string> = {};

  if (!workflowName || workflowName.length < 3) {
    errors.name_block = "Workflow name must be at least 3 characters";
  }

  if (!triggerType) {
    errors.trigger_block = "Please select a trigger type";
  }

  // If validation fails, return errors
  if (Object.keys(errors).length > 0) {
    await ack({
      response_action: "errors",
      errors,
    });
    return;
  }

  // Validation passed
  await ack();

  try {
    // Process workflow configuration
    await createWorkflow({ name: workflowName, trigger: triggerType });
  } catch (error) {
    logger.error(error);
  }
});
```

### Pattern 3: Updating Modals

```typescript
// From Slack Bolt.js Tutorial
app.action("button_abc", async ({ ack, body, client, logger }) => {
  await ack();

  try {
    if (body.type !== "block_actions" || !body.view) {
      return;
    }

    const result = await client.views.update({
      view_id: body.view.id,
      hash: body.view.hash, // Prevent race conditions
      view: {
        type: "modal",
        callback_id: "view_1",
        title: {
          type: "plain_text",
          text: "Updated Modal",
        },
        blocks: [
          {
            type: "section",
            text: {
              type: "plain_text",
              text: "You updated the modal!",
            },
          },
          {
            type: "image",
            image_url: "https://media.giphy.com/media/SVZGEcYt7brkFUyU90/giphy.gif",
            alt_text: "Yay! The modal was updated",
          },
        ],
      },
    });
    logger.info(result);
  } catch (error) {
    logger.error(error);
  }
});
```

### Pattern 4: Multi-Step Modals (View Stack)

```typescript
// Step 1: Open initial modal
app.command("/workflow", async ({ ack, body, client }) => {
  await ack();

  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: "modal",
      callback_id: "workflow_step1",
      title: { type: "plain_text", text: "Workflow Setup" },
      blocks: [
        {
          type: "input",
          block_id: "workflow_name",
          label: { type: "plain_text", text: "Workflow Name" },
          element: {
            type: "plain_text_input",
            action_id: "name_input",
          },
        },
      ],
      submit: { type: "plain_text", text: "Next" },
    },
  });
});

// Step 2: Push second view onto stack
app.view("workflow_step1", async ({ ack, body, view, client }) => {
  await ack();

  const workflowName = view.state.values.workflow_name.name_input.value;

  await client.views.push({
    trigger_id: body.trigger_id,
    view: {
      type: "modal",
      callback_id: "workflow_step2",
      title: { type: "plain_text", text: "Configure Trigger" },
      private_metadata: JSON.stringify({ workflowName }), // Pass data between views
      blocks: [
        {
          type: "input",
          block_id: "trigger_type",
          label: { type: "plain_text", text: "Trigger Type" },
          element: {
            type: "static_select",
            action_id: "trigger_select",
            options: [
              { text: { type: "plain_text", text: "Schedule" }, value: "schedule" },
              { text: { type: "plain_text", text: "Webhook" }, value: "webhook" },
              { text: { type: "plain_text", text: "Manual" }, value: "manual" },
            ],
          },
        },
      ],
      submit: { type: "plain_text", text: "Create" },
    },
  });
});

// Step 3: Handle final submission
app.view("workflow_step2", async ({ ack, body, view }) => {
  await ack();

  const metadata = JSON.parse(view.private_metadata || "{}");
  const workflowName = metadata.workflowName;
  const triggerType = view.state.values.trigger_type.trigger_select.selected_option.value;

  // Create workflow with collected data
  await createWorkflow({ name: workflowName, trigger: triggerType });
});
```

### Pattern 5: Error Handling in Modals

```typescript
// From hackclub/hack-hour - src/extensions/slack/functions/goals.ts
app.action("invalid_action", async ({ ack, body, client, logger }) => {
  await ack();

  try {
    if (!body.channel || !body.channel.id) {
      throw new Error("Channel not found");
    }

    // Show error in modal
    await client.views.update({
      view_id: body.view?.id,
      view: {
        type: "modal",
        callback_id: "error_view",
        title: { type: "plain_text", text: "Error" },
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: ":warning: *An error occurred*\n\nThis action is not available for this workflow.",
            },
          },
        ],
        close: { type: "plain_text", text: "Close" },
      },
    });
  } catch (error) {
    logger.error(error);
  }
});
```

### Modal Best Practices

1. **Use `trigger_id` within 3 seconds**: Trigger IDs expire quickly
2. **Validate before submission**: Use `response_action: 'errors'` for inline validation
3. **Use `hash` for updates**: Prevents race conditions when updating views
4. **Limit view stack to 3**: Slack allows maximum 3 views in the stack
5. **Pass data via `private_metadata`**: Share state between modal views
6. **Provide clear titles**: Help users understand the modal's purpose
7. **Use `close` button**: Always provide a way to dismiss the modal
8. **Handle dismissal**: Listen for `view_closed` events if needed

---

## Error Handling & Rate Limiting

### Rate Limiting Patterns

Slack API uses tiered rate limits (Tier 1-4) on a per-method, per-workspace basis. Most methods allow 20-100 requests per minute.

#### Pattern 1: Automatic Retry with Bolt.js

Bolt.js `WebClient` automatically retries failed requests up to 10 times over ~30 minutes:

```typescript
import { App, ErrorCode, WebAPIRateLimitedError } from "@slack/bolt";

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// Default behavior: automatic retries enabled
// To opt out:
const customApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  clientOptions: {
    rejectRateLimitedCalls: true, // Disable automatic retries
  },
});
```

#### Pattern 2: Manual Rate Limit Handling

```typescript
// From slackapi/node-slack-sdk - packages/web-api/src/errors.ts
import { ErrorCode, WebAPIRateLimitedError } from "@slack/web-api";

async function sendMessageWithRetry(
  client: WebClient,
  channel: string,
  text: string,
  maxRetries = 3,
): Promise<void> {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      await client.chat.postMessage({ channel, text });
      return; // Success
    } catch (error) {
      if (isRateLimitError(error)) {
        const retryAfter = error.retryAfter; // Seconds to wait
        console.warn(`Rate limited. Retrying after ${retryAfter} seconds...`);

        await sleep(retryAfter * 1000);
        attempt++;
      } else {
        throw error; // Re-throw non-rate-limit errors
      }
    }
  }

  throw new Error("Max retries exceeded");
}

function isRateLimitError(error: any): error is WebAPIRateLimitedError {
  return error.code === ErrorCode.RateLimitedError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

#### Pattern 3: Production Rate Limit Handler

```typescript
// From Unleash/unleash - src/lib/addons/slack-app.ts
import {
  ErrorCode,
  WebAPIRateLimitedError,
  WebAPIRequestError,
  WebAPIHTTPError,
} from "@slack/web-api";

async function handleSlackError(error: any): Promise<string> {
  if (error.code === ErrorCode.PlatformError) {
    return `Slack platform error: ${error.data.error}`;
  }

  if (error.code === ErrorCode.RequestError) {
    const { original } = error as WebAPIRequestError;
    return `Request error: ${JSON.stringify(original)}`;
  }

  if (error.code === ErrorCode.RateLimitedError) {
    const { retryAfter } = error as WebAPIRateLimitedError;
    return `Rate limited: retry after ${retryAfter} seconds`;
  }

  if (error.code === ErrorCode.HTTPError) {
    const { statusCode } = error as WebAPIHTTPError;
    return `HTTP error: ${statusCode}`;
  }

  return `Unknown error: ${error.message}`;
}

// Usage
try {
  await client.chat.postMessage({ channel, text });
} catch (error) {
  const errorMessage = await handleSlackError(error);
  logger.error(errorMessage);

  // Notify user or retry
  await client.chat.postEphemeral({
    channel,
    user: userId,
    text: `⚠️ ${errorMessage}`,
  });
}
```

#### Pattern 4: Exponential Backoff

```typescript
async function exponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 5,
  baseDelay = 1000,
): Promise<T> {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      if (isRateLimitError(error)) {
        const delay = Math.min(
          baseDelay * Math.pow(2, attempt), // Exponential backoff
          error.retryAfter * 1000, // Use Slack's retry-after if available
        );

        console.warn(`Attempt ${attempt + 1} failed. Retrying in ${delay}ms...`);
        await sleep(delay);
        attempt++;
      } else {
        throw error;
      }
    }
  }

  throw new Error("Max retries exceeded");
}

// Usage
await exponentialBackoff(async () => {
  await client.chat.postMessage({ channel, text });
});
```

### General Error Handling Patterns

#### Pattern 1: Try-Catch in Listeners

```typescript
// From Slack Bolt.js Migration Guide
app.action("some-action-id", async ({ action, ack, say, logger }) => {
  try {
    await ack();
    await say("Action processed successfully!");
  } catch (error) {
    logger.error(error);
    // Handle error gracefully
    await say("⚠️ Something went wrong. Please try again.");
  }
});
```

#### Pattern 2: Global Error Handler

```typescript
app.error(async (error) => {
  console.error("Global error handler:", error);

  // Log to monitoring service (e.g., Sentry, DataDog)
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error);
  }
});
```

#### Pattern 3: User-Friendly Error Messages

```typescript
app.command("/workflow", async ({ ack, body, client, logger }) => {
  await ack();

  try {
    const result = await client.views.open({
      trigger_id: body.trigger_id,
      view: workflowModal,
    });
  } catch (error) {
    logger.error("Failed to open modal:", error);

    // Send user-friendly error
    await client.chat.postEphemeral({
      channel: body.channel_id,
      user: body.user_id,
      text: "⚠️ Unable to open workflow configuration. Please try again in a moment.",
    });
  }
});
```

### Rate Limiting Best Practices

1. **Respect `retry-after` header**: Always use the value from Slack's response
2. **Cache frequently accessed data**: Reduce API calls for user/channel info
3. **Use bulk operations**: Batch requests when possible
4. **Implement exponential backoff**: Gradually increase retry delays
5. **Monitor rate limit errors**: Track and alert on frequent rate limiting
6. **Use different methods**: Spread load across different API methods
7. **Queue requests**: Implement request queuing for high-volume operations

---

## Accessibility Considerations

### Screen Reader Support

#### Pattern 1: Accessibility Labels for Buttons

```typescript
// From slackapi/node-slack-sdk - packages/types/src/block-kit/block-elements.ts
{
  type: 'button',
  text: {
    type: 'plain_text',
    text: '✓', // Visual icon
  },
  action_id: 'approve_button',
  accessibility_label: 'Approve workflow request', // Read by screen readers
  style: 'primary',
}
```

**Why This Matters:**

- Screen readers read `accessibility_label` instead of `text`
- Provides context beyond visual icons
- Maximum 75 characters

#### Pattern 2: Alt Text for Images

```typescript
// From lightdash/lightdash - packages/backend/src/clients/Slack/SlackMessageBlocks.ts
const SLACK_LIMITS = {
  ALT_TEXT: 2000,
} as const;

const truncateText = (text: string, maxLength: number): string => {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
};

{
  type: 'image',
  image_url: chartImageUrl,
  alt_text: truncateText(
    `Chart showing ${metricName} over time`,
    SLACK_LIMITS.ALT_TEXT
  ),
}
```

#### Pattern 3: Descriptive Labels for Inputs

```typescript
{
  type: 'input',
  block_id: 'workflow_name',
  label: {
    type: 'plain_text',
    text: 'Workflow Name', // Clear, descriptive label
  },
  hint: {
    type: 'plain_text',
    text: 'Choose a unique name for your workflow (3-50 characters)', // Additional context
  },
  element: {
    type: 'plain_text_input',
    action_id: 'name_input',
    placeholder: {
      type: 'plain_text',
      text: 'e.g., Customer Onboarding Flow',
    },
  },
}
```

### Top-Level Text for Screen Readers

```typescript
// From Slack Block Kit Documentation
await client.chat.postMessage({
  channel,
  // Option 1: Include all content in top-level text
  text: "Workflow approved by Alice. Status: Complete. Next steps: Review results.",
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Workflow Approved* ✓\nApproved by: Alice\nStatus: Complete",
      },
    },
  ],
});

// Option 2: Omit text to let Slack build it from blocks
await client.chat.postMessage({
  channel,
  // No text field - Slack will extract from blocks
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Workflow Approved* ✓\nApproved by: Alice\nStatus: Complete",
      },
    },
  ],
});
```

### Emoji Accessibility

**Problem:** Emojis cannot have ARIA labels in Slack

**Solutions:**

1. Use emojis sparingly
2. Provide text alternatives
3. Don't rely solely on emojis for critical information

```typescript
// ❌ Bad: Emoji-only status
{
  type: 'section',
  text: {
    type: 'mrkdwn',
    text: '✅', // Screen reader says "white heavy check mark"
  },
}

// ✅ Good: Emoji + text
{
  type: 'section',
  text: {
    type: 'mrkdwn',
    text: '✅ *Approved*', // Screen reader says "white heavy check mark Approved"
  },
}

// ✅ Better: Text-first
{
  type: 'section',
  text: {
    type: 'mrkdwn',
    text: '*Status:* Approved ✅',
  },
}
```

### Accessibility Best Practices

1. **Always provide `accessibility_label` for buttons**: Especially icon-only buttons
2. **Use descriptive `alt_text` for images**: Describe the content, not just the filename
3. **Provide labels for all inputs**: Use `label` field in input blocks
4. **Include top-level `text`**: Ensure screen readers can access message content
5. **Test with screen readers**: Use VoiceOver (macOS/iOS) or NVDA (Windows)
6. **Avoid emoji-only messages**: Always include text alternatives
7. **Use semantic formatting**: Use `*bold*` and `_italic_` for emphasis
8. **Provide hints**: Use `hint` field for additional context in forms

---

## Mobile vs Desktop UX

### Key Differences

| Feature               | Desktop       | Mobile                    |
| --------------------- | ------------- | ------------------------- |
| **Modal Width**       | ~600px        | Full screen               |
| **Button Layout**     | Horizontal    | Vertical stack            |
| **Text Input**        | Full keyboard | Touch keyboard            |
| **Image Display**     | Inline        | May require tap to expand |
| **Thread Navigation** | Sidebar       | Full screen overlay       |

### Mobile-Optimized Patterns

#### Pattern 1: Concise Button Text

```typescript
// ❌ Desktop-optimized (too long for mobile)
{
  type: 'button',
  text: {
    type: 'plain_text',
    text: 'Click here to approve this workflow request',
  },
  action_id: 'approve',
}

// ✅ Mobile-friendly
{
  type: 'button',
  text: {
    type: 'plain_text',
    text: 'Approve', // Short and clear
  },
  action_id: 'approve',
  accessibility_label: 'Approve this workflow request', // Full context for screen readers
}
```

#### Pattern 2: Vertical Button Layouts

```typescript
// Mobile-friendly: Buttons stack vertically automatically
{
  type: 'actions',
  elements: [
    {
      type: 'button',
      text: { type: 'plain_text', text: 'Approve' },
      action_id: 'approve',
      style: 'primary',
    },
    {
      type: 'button',
      text: { type: 'plain_text', text: 'Reject' },
      action_id: 'reject',
      style: 'danger',
    },
    {
      type: 'button',
      text: { type: 'plain_text', text: 'View Details' },
      action_id: 'details',
    },
  ],
}
```

#### Pattern 3: Responsive Text Length

```typescript
const MAX_MOBILE_TEXT = 150; // Characters

function formatMessageForMobile(fullText: string): string {
  if (fullText.length <= MAX_MOBILE_TEXT) {
    return fullText;
  }

  return fullText.slice(0, MAX_MOBILE_TEXT - 3) + '...';
}

// Usage
{
  type: 'section',
  text: {
    type: 'mrkdwn',
    text: formatMessageForMobile(workflowDescription),
  },
  accessory: {
    type: 'button',
    text: { type: 'plain_text', text: 'View Full' },
    action_id: 'view_full_description',
  },
}
```

#### Pattern 4: Mobile-Friendly Modals

```typescript
// Keep modals simple on mobile
{
  type: 'modal',
  title: {
    type: 'plain_text',
    text: 'Quick Action', // Short title
  },
  blocks: [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Approve this workflow?', // Concise question
      },
    },
    {
      type: 'input',
      block_id: 'comment',
      label: {
        type: 'plain_text',
        text: 'Comment', // Short label
      },
      element: {
        type: 'plain_text_input',
        action_id: 'comment_input',
        multiline: false, // Single line for mobile
        placeholder: {
          type: 'plain_text',
          text: 'Optional',
        },
      },
      optional: true,
    },
  ],
  submit: {
    type: 'plain_text',
    text: 'Approve', // Short submit text
  },
}
```

### Mobile UX Best Practices

1. **Keep button text under 25 characters**: Prevents wrapping on small screens
2. **Limit modal fields**: 3-5 fields maximum for mobile usability
3. **Use single-line inputs when possible**: Reduces keyboard switching
4. **Provide clear CTAs**: Make primary actions obvious
5. **Test on actual devices**: Emulators don't capture touch interactions
6. **Avoid horizontal scrolling**: All content should fit viewport width
7. **Use section blocks for grouping**: Improves readability on small screens
8. **Minimize text in notifications**: Mobile notifications truncate quickly

---

## Localization Concerns

### Multi-Language Support Patterns

#### Pattern 1: Externalized Strings

```typescript
// locales/en.json
{
  "workflow.created": "Workflow created successfully!",
  "workflow.approve": "Approve",
  "workflow.reject": "Reject",
  "workflow.error": "Failed to create workflow. Please try again."
}

// locales/es.json
{
  "workflow.created": "¡Flujo de trabajo creado con éxito!",
  "workflow.approve": "Aprobar",
  "workflow.reject": "Rechazar",
  "workflow.error": "Error al crear el flujo de trabajo. Inténtalo de nuevo."
}

// i18n.ts
import en from './locales/en.json';
import es from './locales/es.json';

const translations: Record<string, Record<string, string>> = {
  en,
  es,
};

export function t(key: string, locale = 'en'): string {
  return translations[locale]?.[key] || translations.en[key] || key;
}

// Usage
app.command('/workflow', async ({ ack, body, client }) => {
  await ack();

  const userLocale = await getUserLocale(body.user_id); // Fetch from user preferences

  await client.chat.postMessage({
    channel: body.channel_id,
    text: t('workflow.created', userLocale),
  });
});
```

#### Pattern 2: Dynamic Content Translation

```typescript
interface LocalizedBlock {
  en: any;
  es: any;
  fr: any;
}

function getLocalizedBlocks(locale: string): any[] {
  const blocks: LocalizedBlock = {
    en: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Workflow Approval Required*",
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Approve" },
            action_id: "approve",
            style: "primary",
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Reject" },
            action_id: "reject",
            style: "danger",
          },
        ],
      },
    ],
    es: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Se requiere aprobación del flujo de trabajo*",
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Aprobar" },
            action_id: "approve",
            style: "primary",
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Rechazar" },
            action_id: "reject",
            style: "danger",
          },
        ],
      },
    ],
    fr: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Approbation du flux de travail requise*",
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Approuver" },
            action_id: "approve",
            style: "primary",
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Rejeter" },
            action_id: "reject",
            style: "danger",
          },
        ],
      },
    ],
  };

  return blocks[locale as keyof LocalizedBlock] || blocks.en;
}
```

#### Pattern 3: Tenant-Specific Localization

```typescript
interface TenantConfig {
  tenantId: string;
  defaultLocale: string;
  supportedLocales: string[];
}

async function getTenantLocale(tenantId: string, userId: string): Promise<string> {
  // 1. Check user preference
  const userPreference = await db.getUserLocale(userId);
  if (userPreference) return userPreference;

  // 2. Check tenant default
  const tenantConfig = await db.getTenantConfig(tenantId);
  if (tenantConfig?.defaultLocale) return tenantConfig.defaultLocale;

  // 3. Fallback to English
  return "en";
}

// Usage in multi-tenant context
app.command("/workflow", async ({ ack, body, client }) => {
  await ack();

  const tenantId = await getTenantIdFromUser(body.user_id);
  const locale = await getTenantLocale(tenantId, body.user_id);

  await client.chat.postMessage({
    channel: body.channel_id,
    blocks: getLocalizedBlocks(locale),
  });
});
```

### Localization Best Practices

1. **Store user locale preferences**: Allow users to set their preferred language
2. **Use ISO 639-1 codes**: Standard language codes (en, es, fr, de, etc.)
3. **Provide fallbacks**: Always fall back to English if translation missing
4. **Externalize all strings**: Never hardcode user-facing text
5. **Consider text expansion**: Some languages require 30-50% more space
6. **Test with RTL languages**: Arabic, Hebrew require right-to-left layout
7. **Localize dates and times**: Use user's timezone and date format
8. **Translate error messages**: Don't leave errors in English only

---

## Production Examples

### Example 1: Vespper - AI Assistant with Threading

**Source:** [vespperhq/vespper](https://github.com/vespperhq/vespper)

```typescript
// services/slackbot/src/messages.ts
const response = await say({
  text: output,
  thread_ts: message.thread_ts || message.ts,
  metadata: message_metadata,
});

const { ok, channel, ts } = response;
if (ok && channel && ts) {
  await addFeedbackReactions(client, channel, ts);
}

// Handle errors with ephemeral messages
client.chat
  .postEphemeral({
    channel: message.channel,
    user: message.user,
    text: messageText,
    thread_ts: message.thread_ts,
  })
  .catch((error) => {
    console.error(error);
  });
```

**Key Patterns:**

- Always reply in thread
- Add feedback reactions
- Use ephemeral for errors

### Example 2: Cohere Toolkit - Feedback Buttons

**Source:** [cohere-ai/cohere-toolkit](https://github.com/cohere-ai/cohere-toolkit)

```typescript
// src/interfaces/slack_bot/src/index.ts
app.action("feedback", async ({ ack, body, client, logger }) => {
  try {
    await ack();

    if (body.type !== "block_actions") {
      return;
    }

    const message_ts = body.message.ts;
    const channel_id = body.channel.id;
    const user_id = body.user.id;

    const feedback_type = body.actions[0];
    if (!("value" in feedback_type)) {
      return;
    }

    const is_positive = feedback_type.value === "good-feedback";
    if (is_positive) {
      await client.chat.postEphemeral({
        channel: channel_id,
        user: user_id,
        thread_ts: message_ts,
        text: "We're glad you found this useful.",
      });
    } else {
      await client.chat.postEphemeral({
        channel: channel_id,
        user: user_id,
        thread_ts: message_ts,
        text: "Sorry to hear that response wasn't up to par :slightly_frowning_face:",
      });
    }
  } catch (error) {
    logger.error(`:warning: Something went wrong! ${error}`);
  }
});
```

**Key Patterns:**

- Feedback collection
- Ephemeral responses
- Error logging

### Example 3: Hack Hour - Modal Updates

**Source:** [hackclub/hack-hour](https://github.com/hackclub/hack-hour)

```typescript
// src/extensions/slack/functions/goals.ts
await client.views.update({
  view_id: view?.view?.id,
  view: await Goals.main(session.id),
});

// Error handling
if (!user) {
  await Slack.views.update({
    view_id: view?.view?.id,
    view: Loading.error(t("error.not_a_user")),
  });
  return;
}
```

**Key Patterns:**

- Dynamic modal updates
- Error states in modals
- Internationalization

### Example 4: Lightdash - Accessibility & Truncation

**Source:** [lightdash/lightdash](https://github.com/lightdash/lightdash)

```typescript
// packages/backend/src/clients/Slack/SlackMessageBlocks.ts
const SLACK_LIMITS = {
  HEADER_TEXT: 150,
  SECTION_TEXT: 3000,
  SECTION_FIELD_TEXT: 2000,
  BUTTON_TEXT: 75,
  ALT_TEXT: 2000,
} as const;

const truncateText = (text: string, maxLength: number): string => {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
};

// Usage
{
  type: 'image',
  image_url: imageUrl,
  alt_text: truncateText(
    sanitizeText(title),
    SLACK_LIMITS.ALT_TEXT,
  ),
}
```

**Key Patterns:**

- Respect Slack limits
- Truncate gracefully
- Accessibility with alt text

### Example 5: Slacker - Dynamic Select Menus

**Source:** [hackclub/slacker](https://github.com/hackclub/slacker)

```typescript
// lib/blocks.ts
{
  type: 'static_select',
  placeholder: { type: 'plain_text', text: 'Assign to', emoji: true },
  options: maintainers
    .filter((m) => !!m)
    .map((maintainer) => ({
      text: { type: 'plain_text', text: maintainer!.id, emoji: true },
      value: maintainer!.id,
    })),
  action_id: 'assign_user',
}
```

**Key Patterns:**

- Dynamic options from data
- Filter invalid entries
- Clear placeholders

### Example 6: Carbon - Multi-Step Modal

**Source:** [crbnos/carbon](https://github.com/crbnos/carbon)

```typescript
// apps/erp/app/routes/api+/integrations.slack.interactive.ts
{
  type: 'input',
  block_id: 'type',
  label: {
    type: 'plain_text',
    text: 'Type'
  },
  element: {
    type: 'static_select',
    action_id: 'type',
    placeholder: {
      type: 'plain_text',
      text: 'Select issue type'
    },
    options: issueTypes.map(type => ({
      text: { type: 'plain_text', text: type.name },
      value: type.id,
    })),
  },
}
```

**Key Patterns:**

- Form validation
- Dynamic options
- Clear labels

### Example 7: Unleash - Error Handling

**Source:** [Unleash/unleash](https://github.com/Unleash/unleash)

```typescript
// src/lib/addons/slack-app.ts
if (error.code === ErrorCode.RateLimitedError) {
  const { retryAfter } = error as WebAPIRateLimitedError;
  return `A rate limit error occurred: retry after ${retryAfter} seconds`;
}

if (error.code === ErrorCode.HTTPError) {
  const { statusCode } = error as WebAPIHTTPError;
  return `HTTP error: ${statusCode}`;
}
```

**Key Patterns:**

- Type-safe error handling
- User-friendly messages
- Retry guidance

### Example 8: Tailscale Accessbot - Complex Modal

**Source:** [tailscale/accessbot](https://github.com/tailscale/accessbot)

```typescript
// functions/access_request_prompt.ts
{
  type: 'input',
  block_id: 'profile',
  label: {
    type: 'plain_text',
    emoji: true,
    text: ':closed_lock_with_key: What do you want to access?',
  },
  element: {
    action_id: ACTION_PROFILE,
    type: 'static_select',
    placeholder: {
      type: 'plain_text',
      text: 'Choose access...',
    },
    options: profileOpts,
  },
},
{
  type: 'input',
  block_id: 'duration',
  label: {
    type: 'plain_text',
    emoji: true,
    text: ':stopwatch: For how long?',
  },
  element: {
    action_id: ACTION_DURATION,
    type: 'static_select',
    placeholder: {
      type: 'plain_text',
      text: 'Choose duration...',
    },
    options: durationOpts,
  },
}
```

**Key Patterns:**

- Emoji in labels
- Clear placeholders
- Structured forms

### Example 9: Metorial - Thread Metadata

**Source:** [metorial/metorial](https://github.com/metorial/metorial)

```typescript
// servers/slack/server.ts
{
  channel_id,
  timestamp: message.ts,
  user: message.user,
  text: message.text,
  type: message.type,
  thread_ts: message.thread_ts,
  reply_count: message.reply_count,
  reply_users_count: message.reply_users_count,
  reactions: message.reactions,
  attachments: message.attachments,
  blocks: message.blocks,
}
```

**Key Patterns:**

- Comprehensive message data
- Thread tracking
- Reaction handling

### Example 10: DeepL for Slack - Thread Utilities

**Source:** [seratch/deepl-for-slack](https://github.com/seratch/deepl-for-slack)

```typescript
// src/reacjilator.ts
export async function sayInThread(
  client: WebClient,
  channel: string,
  text: string,
  message: Message,
) {
  return await client.chat.postMessage({
    channel,
    text,
    parse: "none",
    thread_ts: message.thread_ts ? message.thread_ts : message.ts,
  });
}
```

**Key Patterns:**

- Reusable thread utilities
- Fallback to message.ts
- Clean abstractions

---

## Conclusion

Building production-ready Slack bots for enterprise B2B SaaS requires careful attention to:

1. **Threading**: Maintain context and reduce noise
2. **Interactive Components**: Provide intuitive, accessible interactions
3. **Modals**: Collect complex input efficiently
4. **Error Handling**: Gracefully handle rate limits and failures
5. **Accessibility**: Support screen readers and keyboard navigation
6. **Mobile UX**: Optimize for small screens and touch interactions
7. **Localization**: Support multiple languages and timezones

### Key Takeaways

- **Always acknowledge interactions within 3 seconds**
- **Use threads to maintain conversation context**
- **Provide accessibility labels for all interactive elements**
- **Handle rate limits with exponential backoff**
- **Test on mobile devices, not just desktop**
- **Externalize strings for localization**
- **Log errors and monitor API usage**

### Additional Resources

- [Slack Block Kit Builder](https://app.slack.com/block-kit-builder)
- [Slack API Documentation](https://api.slack.com/)
- [Bolt.js Documentation](https://slack.dev/bolt-js)
- [Slack Community](https://slackcommunity.com/)

---

**Document Version:** 1.0  
**Last Updated:** January 26, 2026  
**Target Platform:** Nubabel - Multi-Tenant B2B SaaS AI Workflow Automation
