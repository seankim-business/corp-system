import { logger } from "../../utils/logger";
import { MCPTool, CallContext, ToolCallResult } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SlackAPIResponse<T = unknown> {
  ok: boolean;
  error?: string;
  response_metadata?: {
    next_cursor?: string;
  };
  [key: string]: unknown;
  // Typed payloads are extracted via generic intersections at call sites
  _typed?: T;
}

interface SlackChannel {
  id: string;
  name: string;
  is_channel: boolean;
  is_private: boolean;
  is_archived: boolean;
  topic?: { value: string };
  purpose?: { value: string };
  num_members?: number;
  created: number;
}

interface SlackMessage {
  type: string;
  user?: string;
  bot_id?: string;
  text: string;
  ts: string;
  thread_ts?: string;
  reply_count?: number;
  reactions?: Array<{ name: string; count: number; users: string[] }>;
}

interface SlackSearchMatch {
  iid: string;
  channel: { id: string; name: string };
  username: string;
  text: string;
  ts: string;
  permalink: string;
}

interface SlackUser {
  id: string;
  name: string;
  real_name?: string;
  deleted: boolean;
  is_bot: boolean;
  is_admin: boolean;
  profile?: {
    display_name?: string;
    email?: string;
    image_72?: string;
    title?: string;
    status_text?: string;
    status_emoji?: string;
  };
  tz?: string;
  updated: number;
}

interface SlackFile {
  id: string;
  name: string;
  title: string;
  mimetype: string;
  filetype: string;
  size: number;
  url_private: string;
  permalink: string;
  created: number;
  channels: string[];
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface SlackMCPProvider {
  getTools(): MCPTool[];
  executeTool(
    toolName: string,
    args: Record<string, unknown>,
    context: CallContext,
  ): Promise<ToolCallResult>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLACK_API_BASE = "https://slack.com/api/";
const PROVIDER_NAME = "slack";

// ---------------------------------------------------------------------------
// Slack API helper
// ---------------------------------------------------------------------------

function getToken(): string {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN environment variable is not set");
  }
  return token;
}

async function slackAPI<T = unknown>(
  method: string,
  params?: Record<string, unknown>,
  options?: { formData?: FormData },
): Promise<T & SlackAPIResponse> {
  const token = getToken();
  const url = `${SLACK_API_BASE}${method}`;

  let response: Response;

  if (options?.formData) {
    const formData = options.formData;
    formData.append("token", token);
    response = await fetch(url, {
      method: "POST",
      body: formData,
    });
  } else if (params) {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    });
  } else {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Slack API HTTP ${response.status}: ${body}`);
  }

  const json = (await response.json()) as T & SlackAPIResponse;

  if (!json.ok) {
    throw new Error(`Slack API error: ${json.error ?? "unknown_error"}`);
  }

  return json;
}

/**
 * Collects pages from a cursor-based Slack API endpoint.
 * `extractPage` pulls the relevant array from each response.
 */
async function slackPaginate<TItem, TResponse = unknown>(
  method: string,
  params: Record<string, unknown>,
  extractPage: (response: TResponse & SlackAPIResponse) => TItem[],
  maxPages = 10,
): Promise<{ items: TItem[]; hasMore: boolean }> {
  const allItems: TItem[] = [];
  let cursor: string | undefined;
  let page = 0;

  do {
    const requestParams = { ...params, ...(cursor ? { cursor } : {}) };
    const response = await slackAPI<TResponse>(method, requestParams);
    const items = extractPage(response);
    allItems.push(...items);

    cursor = response.response_metadata?.next_cursor || undefined;
    page++;
  } while (cursor && page < maxPages);

  return { items: allItems, hasMore: Boolean(cursor) };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const DEFAULT_PERMISSIONS = {
  allowedAgents: ["all"],
};

function buildTools(): MCPTool[] {
  return [
    {
      name: "slack_send_message",
      provider: PROVIDER_NAME,
      description:
        "Send a message to a Slack channel. Supports plain text and Block Kit blocks.",
      inputSchema: {
        type: "object",
        properties: {
          channel: {
            type: "string",
            description: "Channel ID to send the message to",
          },
          text: {
            type: "string",
            description:
              "Message text. Acts as fallback when blocks are provided.",
          },
          blocks: {
            type: "array",
            description:
              "Block Kit blocks for rich message formatting (optional)",
            items: { type: "object" },
          },
          thread_ts: {
            type: "string",
            description:
              "Timestamp of a parent message to reply in a thread (optional)",
          },
          unfurl_links: {
            type: "string",
            description:
              "Whether to unfurl text-based links (true/false, default true)",
            enum: ["true", "false"],
          },
        },
        required: ["channel", "text"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          channel: { type: "string" },
          ts: { type: "string", description: "Timestamp of the sent message" },
          message: { type: "object" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "slack_list_channels",
      provider: PROVIDER_NAME,
      description:
        "List Slack channels in the workspace with cursor-based pagination.",
      inputSchema: {
        type: "object",
        properties: {
          types: {
            type: "string",
            description:
              "Comma-separated channel types: public_channel, private_channel, mpim, im (default: public_channel)",
            default: "public_channel",
          },
          exclude_archived: {
            type: "string",
            description: "Exclude archived channels (true/false, default true)",
            enum: ["true", "false"],
            default: "true",
          },
          limit: {
            type: "string",
            description:
              "Number of channels per page (default 100, max 1000)",
            default: "100",
          },
          cursor: {
            type: "string",
            description:
              "Pagination cursor from a previous response (optional)",
          },
        },
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          channels: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                is_private: { type: "boolean" },
                is_archived: { type: "boolean" },
                topic: { type: "string" },
                purpose: { type: "string" },
                num_members: { type: "number" },
              },
            },
          },
          next_cursor: { type: "string" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "slack_get_channel_history",
      provider: PROVIDER_NAME,
      description:
        "Get recent messages from a Slack channel with cursor-based pagination.",
      inputSchema: {
        type: "object",
        properties: {
          channel: {
            type: "string",
            description: "Channel ID",
          },
          limit: {
            type: "string",
            description:
              "Number of messages to return (default 25, max 1000)",
            default: "25",
          },
          oldest: {
            type: "string",
            description:
              "Start of time range (Unix timestamp, inclusive, optional)",
          },
          latest: {
            type: "string",
            description:
              "End of time range (Unix timestamp, inclusive, optional)",
          },
          cursor: {
            type: "string",
            description:
              "Pagination cursor from a previous response (optional)",
          },
        },
        required: ["channel"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          messages: {
            type: "array",
            items: {
              type: "object",
              properties: {
                user: { type: "string" },
                text: { type: "string" },
                ts: { type: "string" },
                thread_ts: { type: "string" },
                reply_count: { type: "number" },
              },
            },
          },
          has_more: { type: "boolean" },
          next_cursor: { type: "string" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "slack_search_messages",
      provider: PROVIDER_NAME,
      description:
        "Search for messages across the Slack workspace. Requires a user token with search:read scope.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query text",
          },
          sort: {
            type: "string",
            description: "Sort order: score or timestamp (default score)",
            enum: ["score", "timestamp"],
            default: "score",
          },
          sort_dir: {
            type: "string",
            description: "Sort direction: asc or desc (default desc)",
            enum: ["asc", "desc"],
            default: "desc",
          },
          count: {
            type: "string",
            description: "Number of results per page (default 20, max 100)",
            default: "20",
          },
          cursor: {
            type: "string",
            description:
              "Pagination cursor from a previous response (optional)",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          messages: {
            type: "object",
            properties: {
              total: { type: "number" },
              matches: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    channel: { type: "object" },
                    username: { type: "string" },
                    text: { type: "string" },
                    ts: { type: "string" },
                    permalink: { type: "string" },
                  },
                },
              },
            },
          },
          next_cursor: { type: "string" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "slack_list_users",
      provider: PROVIDER_NAME,
      description:
        "List users in the Slack workspace with cursor-based pagination.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "string",
            description: "Number of users per page (default 100, max 1000)",
            default: "100",
          },
          cursor: {
            type: "string",
            description:
              "Pagination cursor from a previous response (optional)",
          },
          include_locale: {
            type: "string",
            description:
              "Whether to include locale info (true/false, default false)",
            enum: ["true", "false"],
            default: "false",
          },
        },
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          members: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                real_name: { type: "string" },
                is_bot: { type: "boolean" },
                is_admin: { type: "boolean" },
                deleted: { type: "boolean" },
                profile: { type: "object" },
              },
            },
          },
          next_cursor: { type: "string" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "slack_get_user_info",
      provider: PROVIDER_NAME,
      description: "Get profile information for a specific Slack user.",
      inputSchema: {
        type: "object",
        properties: {
          user: {
            type: "string",
            description: "User ID to look up",
          },
          include_locale: {
            type: "string",
            description:
              "Whether to include locale info (true/false, default false)",
            enum: ["true", "false"],
            default: "false",
          },
        },
        required: ["user"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          real_name: { type: "string" },
          is_bot: { type: "boolean" },
          is_admin: { type: "boolean" },
          deleted: { type: "boolean" },
          profile: { type: "object" },
          tz: { type: "string" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "slack_upload_file",
      provider: PROVIDER_NAME,
      description:
        "Upload a file to a Slack channel using the files.uploadV2 API.",
      inputSchema: {
        type: "object",
        properties: {
          channel_id: {
            type: "string",
            description: "Channel ID to upload the file to",
          },
          content: {
            type: "string",
            description: "Text content of the file",
          },
          filename: {
            type: "string",
            description: "Name of the file",
          },
          filetype: {
            type: "string",
            description:
              "File type identifier (e.g. text, javascript, python, json, csv)",
          },
          title: {
            type: "string",
            description: "Title of the file (optional)",
          },
          initial_comment: {
            type: "string",
            description:
              "Initial message text to accompany the file (optional)",
          },
          thread_ts: {
            type: "string",
            description:
              "Thread timestamp to upload into a thread (optional)",
          },
        },
        required: ["channel_id", "content", "filename"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          file: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              title: { type: "string" },
              mimetype: { type: "string" },
              filetype: { type: "string" },
              size: { type: "number" },
              permalink: { type: "string" },
            },
          },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "slack_add_reaction",
      provider: PROVIDER_NAME,
      description: "Add a reaction (emoji) to a message.",
      inputSchema: {
        type: "object",
        properties: {
          channel: {
            type: "string",
            description: "Channel ID where the message is",
          },
          timestamp: {
            type: "string",
            description: "Timestamp of the message to react to",
          },
          name: {
            type: "string",
            description:
              "Reaction emoji name without colons (e.g. thumbsup, white_check_mark)",
          },
        },
        required: ["channel", "timestamp", "name"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
  ];
}

// ---------------------------------------------------------------------------
// Tool executors
// ---------------------------------------------------------------------------

function parseIntParam(value: unknown, defaultValue: number, max: number): number {
  if (value === undefined || value === null) return defaultValue;
  const parsed = typeof value === "string" ? parseInt(value, 10) : Number(value);
  return Number.isNaN(parsed) ? defaultValue : Math.min(Math.max(parsed, 1), max);
}

function parseBoolParam(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
}

async function executeSendMessage(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const params: Record<string, unknown> = {
      channel: args.channel,
      text: args.text,
    };

    if (args.blocks !== undefined) params.blocks = args.blocks;
    if (args.thread_ts !== undefined) params.thread_ts = args.thread_ts;
    if (args.unfurl_links !== undefined) {
      params.unfurl_links = parseBoolParam(args.unfurl_links, true);
    }

    const response = await slackAPI<{
      channel: string;
      ts: string;
      message: Record<string, unknown>;
    }>("chat.postMessage", params);

    logger.info("Slack: sent message", {
      channel: response.channel,
      ts: response.ts,
    });

    return {
      success: true,
      data: {
        channel: response.channel,
        ts: response.ts,
        message: response.message,
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Slack: failed to send message", { error: message });
    return {
      success: false,
      error: { code: "SLACK_SEND_MESSAGE_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeListChannels(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const limit = parseIntParam(args.limit, 100, 1000);
    const types = (args.types as string) || "public_channel";
    const excludeArchived = parseBoolParam(args.exclude_archived, true);

    // If a cursor is provided, make a single-page request
    if (args.cursor) {
      const response = await slackAPI<{ channels: SlackChannel[] }>(
        "conversations.list",
        {
          types,
          exclude_archived: excludeArchived,
          limit,
          cursor: args.cursor,
        },
      );

      const channels = (response.channels ?? []).map(formatChannel);
      const nextCursor = response.response_metadata?.next_cursor || undefined;

      logger.info("Slack: listed channels (paginated)", {
        count: channels.length,
        hasMore: Boolean(nextCursor),
      });

      return {
        success: true,
        data: { channels, next_cursor: nextCursor },
        metadata: { duration: Date.now() - startTime, cached: false },
      };
    }

    // No cursor: fetch first page
    const response = await slackAPI<{ channels: SlackChannel[] }>(
      "conversations.list",
      {
        types,
        exclude_archived: excludeArchived,
        limit,
      },
    );

    const channels = (response.channels ?? []).map(formatChannel);
    const nextCursor = response.response_metadata?.next_cursor || undefined;

    logger.info("Slack: listed channels", {
      count: channels.length,
      hasMore: Boolean(nextCursor),
    });

    return {
      success: true,
      data: { channels, next_cursor: nextCursor },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Slack: failed to list channels", { error: message });
    return {
      success: false,
      error: { code: "SLACK_LIST_CHANNELS_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

function formatChannel(channel: SlackChannel) {
  return {
    id: channel.id,
    name: channel.name,
    is_private: channel.is_private,
    is_archived: channel.is_archived,
    topic: channel.topic?.value ?? "",
    purpose: channel.purpose?.value ?? "",
    num_members: channel.num_members ?? 0,
    created: channel.created,
  };
}

async function executeGetChannelHistory(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const limit = parseIntParam(args.limit, 25, 1000);
    const params: Record<string, unknown> = {
      channel: args.channel,
      limit,
    };

    if (args.oldest !== undefined) params.oldest = args.oldest;
    if (args.latest !== undefined) params.latest = args.latest;
    if (args.cursor !== undefined) params.cursor = args.cursor;

    const response = await slackAPI<{
      messages: SlackMessage[];
      has_more: boolean;
    }>("conversations.history", params);

    const messages = (response.messages ?? []).map(formatMessage);
    const nextCursor = response.response_metadata?.next_cursor || undefined;

    logger.info("Slack: fetched channel history", {
      channel: args.channel,
      count: messages.length,
      hasMore: response.has_more ?? false,
    });

    return {
      success: true,
      data: {
        messages,
        has_more: response.has_more ?? false,
        next_cursor: nextCursor,
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Slack: failed to get channel history", { error: message });
    return {
      success: false,
      error: { code: "SLACK_GET_HISTORY_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

function formatMessage(msg: SlackMessage) {
  return {
    type: msg.type,
    user: msg.user,
    bot_id: msg.bot_id,
    text: msg.text,
    ts: msg.ts,
    thread_ts: msg.thread_ts,
    reply_count: msg.reply_count,
    reactions: msg.reactions,
  };
}

async function executeSearchMessages(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const count = parseIntParam(args.count, 20, 100);
    const params: Record<string, unknown> = {
      query: args.query,
      sort: (args.sort as string) || "score",
      sort_dir: (args.sort_dir as string) || "desc",
      count,
    };

    if (args.cursor !== undefined) params.cursor = args.cursor;

    const response = await slackAPI<{
      messages: {
        total: number;
        matches: SlackSearchMatch[];
      };
    }>("search.messages", params);

    const total = response.messages?.total ?? 0;
    const matches = (response.messages?.matches ?? []).map(formatSearchMatch);
    const nextCursor = response.response_metadata?.next_cursor || undefined;

    logger.info("Slack: searched messages", {
      query: args.query,
      total,
      returned: matches.length,
    });

    return {
      success: true,
      data: {
        messages: {
          total,
          matches,
        },
        next_cursor: nextCursor,
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Slack: failed to search messages", { error: message });
    return {
      success: false,
      error: { code: "SLACK_SEARCH_MESSAGES_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

function formatSearchMatch(match: SlackSearchMatch) {
  return {
    iid: match.iid,
    channel: match.channel,
    username: match.username,
    text: match.text,
    ts: match.ts,
    permalink: match.permalink,
  };
}

async function executeListUsers(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const limit = parseIntParam(args.limit, 100, 1000);
    const includeLocale = parseBoolParam(args.include_locale, false);

    // If a cursor is provided, make a single-page request
    if (args.cursor) {
      const response = await slackAPI<{ members: SlackUser[] }>(
        "users.list",
        {
          limit,
          include_locale: includeLocale,
          cursor: args.cursor,
        },
      );

      const members = (response.members ?? []).map(formatUser);
      const nextCursor = response.response_metadata?.next_cursor || undefined;

      logger.info("Slack: listed users (paginated)", {
        count: members.length,
        hasMore: Boolean(nextCursor),
      });

      return {
        success: true,
        data: { members, next_cursor: nextCursor },
        metadata: { duration: Date.now() - startTime, cached: false },
      };
    }

    // No cursor: auto-paginate to collect all users
    const { items, hasMore } = await slackPaginate<SlackUser, { members: SlackUser[] }>(
      "users.list",
      { limit, include_locale: includeLocale },
      (response) => (response.members as unknown as SlackUser[]) ?? [],
    );

    const members = items.map(formatUser);

    logger.info("Slack: listed users", {
      count: members.length,
      hasMore,
    });

    return {
      success: true,
      data: { members, has_more: hasMore },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Slack: failed to list users", { error: message });
    return {
      success: false,
      error: { code: "SLACK_LIST_USERS_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

function formatUser(user: SlackUser) {
  return {
    id: user.id,
    name: user.name,
    real_name: user.real_name,
    deleted: user.deleted,
    is_bot: user.is_bot,
    is_admin: user.is_admin,
    profile: user.profile
      ? {
          display_name: user.profile.display_name,
          email: user.profile.email,
          image_72: user.profile.image_72,
          title: user.profile.title,
          status_text: user.profile.status_text,
          status_emoji: user.profile.status_emoji,
        }
      : undefined,
    tz: user.tz,
  };
}

async function executeGetUserInfo(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const params: Record<string, unknown> = {
      user: args.user,
    };

    if (args.include_locale !== undefined) {
      params.include_locale = parseBoolParam(args.include_locale, false);
    }

    const response = await slackAPI<{ user: SlackUser }>(
      "users.info",
      params,
    );

    const user = response.user;
    if (!user) {
      throw new Error("Slack API returned no user data");
    }

    const formatted = formatUser(user);

    logger.info("Slack: fetched user info", {
      userId: user.id,
      name: user.name,
    });

    return {
      success: true,
      data: formatted,
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Slack: failed to get user info", { error: message });
    return {
      success: false,
      error: { code: "SLACK_GET_USER_INFO_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeUploadFile(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    // Use files.upload with application/x-www-form-urlencoded for text content
    const token = getToken();
    const url = `${SLACK_API_BASE}files.upload`;

    const formParams = new URLSearchParams();
    formParams.append("token", token);
    formParams.append("channels", args.channel_id as string);
    formParams.append("content", args.content as string);
    formParams.append("filename", args.filename as string);

    if (args.filetype !== undefined) {
      formParams.append("filetype", args.filetype as string);
    }
    if (args.title !== undefined) {
      formParams.append("title", args.title as string);
    }
    if (args.initial_comment !== undefined) {
      formParams.append("initial_comment", args.initial_comment as string);
    }
    if (args.thread_ts !== undefined) {
      formParams.append("thread_ts", args.thread_ts as string);
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formParams.toString(),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Slack API HTTP ${response.status}: ${body}`);
    }

    const json = (await response.json()) as SlackAPIResponse<{ file: SlackFile }>;

    if (!json.ok) {
      throw new Error(`Slack API error: ${json.error ?? "unknown_error"}`);
    }

    const file = json.file as unknown as SlackFile | undefined;

    logger.info("Slack: uploaded file", {
      fileId: file?.id,
      filename: file?.name,
      channel: args.channel_id,
    });

    return {
      success: true,
      data: {
        file: file
          ? {
              id: file.id,
              name: file.name,
              title: file.title,
              mimetype: file.mimetype,
              filetype: file.filetype,
              size: file.size,
              url_private: file.url_private,
              permalink: file.permalink,
              created: file.created,
              channels: file.channels,
            }
          : undefined,
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Slack: failed to upload file", { error: message });
    return {
      success: false,
      error: { code: "SLACK_UPLOAD_FILE_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeAddReaction(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    await slackAPI("reactions.add", {
      channel: args.channel,
      timestamp: args.timestamp,
      name: args.name,
    });

    logger.info("Slack: added reaction", {
      channel: args.channel,
      timestamp: args.timestamp,
      reaction: args.name,
    });

    return {
      success: true,
      data: { ok: true },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Slack: failed to add reaction", { error: message });
    return {
      success: false,
      error: { code: "SLACK_ADD_REACTION_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

// ---------------------------------------------------------------------------
// Executor dispatch
// ---------------------------------------------------------------------------

type ToolExecutor = (
  args: Record<string, unknown>,
  context: CallContext,
) => Promise<ToolCallResult>;

const EXECUTORS: Record<string, ToolExecutor> = {
  slack_send_message: executeSendMessage,
  slack_list_channels: executeListChannels,
  slack_get_channel_history: executeGetChannelHistory,
  slack_search_messages: executeSearchMessages,
  slack_list_users: executeListUsers,
  slack_get_user_info: executeGetUserInfo,
  slack_upload_file: executeUploadFile,
  slack_add_reaction: executeAddReaction,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSlackProvider(): SlackMCPProvider {
  const tools = buildTools();

  logger.info("Slack MCP provider created", {
    toolCount: tools.length,
    tools: tools.map((t) => t.name),
  });

  return {
    getTools(): MCPTool[] {
      return tools;
    },

    async executeTool(
      toolName: string,
      args: Record<string, unknown>,
      context: CallContext,
    ): Promise<ToolCallResult> {
      const executor = EXECUTORS[toolName];

      if (!executor) {
        logger.warn("Slack: unknown tool requested", { toolName });
        return {
          success: false,
          error: {
            code: "SLACK_UNKNOWN_TOOL",
            message: `Unknown Slack tool: ${toolName}`,
          },
          metadata: { duration: 0, cached: false },
        };
      }

      logger.debug("Slack: executing tool", {
        toolName,
        agentId: context.agentId,
        organizationId: context.organizationId,
      });

      return executor(args, context);
    },
  };
}
