import { WebClient } from "@slack/web-api";
import { SlackUser, SlackChannel } from "./types";
import { getCircuitBreaker } from "../../utils/circuit-breaker";
import {
  acquireMcpClient,
  getAccessTokenFromConfig,
  isTokenExpired,
  refreshOAuthToken,
} from "../../services/mcp-registry";
import { recordMcpToolCall } from "../../services/metrics";
import { trace, SpanStatusCode, Span } from "@opentelemetry/api";
import { MCPConnection } from "../../orchestrator/types";
import { decrypt } from "../../utils/encryption";

const tracer = trace.getTracer("mcp-slack");

const formatToolSpanName = (toolName: string): string =>
  toolName.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();

export class SlackClient {
  private client: WebClient;
  private connectionId?: string;
  private expiresAt?: Date | null;
  private organizationId?: string;
  private userId?: string;
  private circuitBreaker = getCircuitBreaker("slack-api", {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 60000,
  });

  constructor(
    token: string,
    options?: {
      connectionId?: string;
      expiresAt?: Date | null;
      organizationId?: string;
      userId?: string;
    },
  ) {
    this.client = new WebClient(token);
    this.connectionId = options?.connectionId;
    this.expiresAt = options?.expiresAt ?? null;
    this.organizationId = options?.organizationId;
    this.userId = options?.userId;
  }

  setContext(options: {
    connectionId?: string;
    expiresAt?: Date | null;
    organizationId?: string;
    userId?: string;
  }): void {
    this.connectionId = options.connectionId;
    this.expiresAt = options.expiresAt ?? null;
    this.organizationId = options.organizationId;
    this.userId = options.userId;
  }

  private async ensureFreshToken(): Promise<void> {
    if (!this.connectionId || !isTokenExpired(this.expiresAt ?? null)) {
      return;
    }

    const refreshed = await refreshOAuthToken(this.connectionId);
    const nextToken = getAccessTokenFromConfig(refreshed.config);

    if (!nextToken) {
      throw new Error("Refreshed Slack token missing access token");
    }

    this.client = new WebClient(nextToken);
    this.expiresAt = refreshed.expiresAt ?? null;
  }

  private async executeWithAuth<T>(operation: () => Promise<T>): Promise<T> {
    return this.circuitBreaker.execute(async () => {
      await this.ensureFreshToken();
      return operation();
    });
  }

  private async executeWithMetrics<T>(
    toolName: string,
    spanAttributes: Record<string, string | number | boolean> = {},
    operation: () => Promise<T>,
    onSuccess?: (result: T, span: Span) => void,
  ): Promise<T> {
    const start = Date.now();
    const spanName = `mcp.slack.${formatToolSpanName(toolName)}`;
    const environment = process.env.NODE_ENV || "development";

    return tracer.startActiveSpan(spanName, async (span) => {
      try {
        span.setAttribute("mcp.provider", "slack");
        span.setAttribute("mcp.tool", toolName);
        span.setAttribute("environment", environment);

        if (this.connectionId) {
          span.setAttribute("mcp.connection_id", this.connectionId);
        }

        if (this.organizationId) {
          span.setAttribute("organization.id", this.organizationId);
        }

        if (this.userId) {
          span.setAttribute("user.id", this.userId);
        }

        Object.entries(spanAttributes).forEach(([key, value]) => {
          span.setAttribute(key, value);
        });

        const result = await this.executeWithAuth(operation);
        recordMcpToolCall({
          provider: "slack",
          toolName,
          success: true,
          duration: Date.now() - start,
        });
        if (onSuccess) {
          onSuccess(result, span);
        }
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        recordMcpToolCall({
          provider: "slack",
          toolName,
          success: false,
          duration: Date.now() - start,
        });
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async sendMessage(
    channel: string,
    text: string,
    options?: {
      threadTs?: string;
      blocks?: any[];
      attachments?: any[];
    },
  ): Promise<{ ok: boolean; channel: string; ts: string; message: any }> {
    return this.executeWithMetrics(
      "sendMessage",
      {
        "slack.channel": channel,
        "slack.thread_ts": options?.threadTs ?? "none",
      },
      async () => {
        const response = await this.client.chat.postMessage({
          channel,
          text,
          thread_ts: options?.threadTs,
          blocks: options?.blocks,
          attachments: options?.attachments,
        });

        if (!response.ok) {
          throw new Error(`Slack API error: ${response.error}`);
        }

        return {
          ok: response.ok,
          channel: response.channel as string,
          ts: response.ts as string,
          message: response.message,
        };
      },
      (result, span) => {
        span.setAttribute("slack.message_ts", result.ts);
      },
    );
  }

  async getUser(userId: string): Promise<SlackUser> {
    return this.executeWithMetrics(
      "getUser",
      { "slack.user_id": userId },
      async () => {
        const response = await this.client.users.info({
          user: userId,
        });

        if (!response.ok || !response.user) {
          throw new Error(`Slack API error: ${response.error}`);
        }

        const user = response.user as any;

        return {
          id: user.id,
          name: user.name,
          realName: user.real_name,
          displayName: user.profile?.display_name,
          email: user.profile?.email,
          isBot: user.is_bot || false,
          isAdmin: user.is_admin,
          isOwner: user.is_owner,
          teamId: user.team_id,
          timezone: user.tz,
          profileImage: user.profile?.image_192,
        };
      },
      (user, span) => {
        span.setAttribute("slack.user_name", user.name);
      },
    );
  }

  async listChannels(options?: {
    excludeArchived?: boolean;
    limit?: number;
    types?: string;
    cursor?: string;
  }): Promise<{ channels: SlackChannel[]; nextCursor?: string }> {
    return this.executeWithMetrics(
      "listChannels",
      {
        "slack.exclude_archived": options?.excludeArchived ?? true,
        "slack.limit": options?.limit ?? 100,
      },
      async () => {
        const response = await this.client.conversations.list({
          exclude_archived: options?.excludeArchived ?? true,
          limit: options?.limit ?? 100,
          types: options?.types ?? "public_channel,private_channel",
          cursor: options?.cursor,
        });

        if (!response.ok || !response.channels) {
          throw new Error(`Slack API error: ${response.error}`);
        }

        const channels = response.channels.map((ch: any) => ({
          id: ch.id,
          name: ch.name,
          isChannel: ch.is_channel || false,
          isGroup: ch.is_group || false,
          isIm: ch.is_im || false,
          isMpim: ch.is_mpim || false,
          isPrivate: ch.is_private || false,
          isArchived: ch.is_archived || false,
          isMember: ch.is_member || false,
          topic: ch.topic?.value,
          purpose: ch.purpose?.value,
          numMembers: ch.num_members,
          created: ch.created,
        }));

        return {
          channels,
          nextCursor: response.response_metadata?.next_cursor,
        };
      },
      (result, span) => {
        span.setAttribute("result.count", result.channels.length);
      },
    );
  }

  async searchMessages(
    query: string,
    options?: {
      count?: number;
      page?: number;
      sort?: "score" | "timestamp";
      sortDir?: "asc" | "desc";
    },
  ): Promise<{
    messages: Array<{
      type: string;
      text: string;
      user?: string;
      username?: string;
      ts: string;
      channel: { id: string; name: string };
      permalink: string;
    }>;
    total: number;
    matches: number;
    hasMore: boolean;
  }> {
    return this.executeWithMetrics(
      "searchMessages",
      {
        "slack.query": query,
        "slack.count": options?.count ?? 20,
      },
      async () => {
        const response = await this.client.search.messages({
          query,
          count: options?.count ?? 20,
          page: options?.page ?? 1,
          sort: options?.sort ?? "score",
          sort_dir: options?.sortDir ?? "desc",
        });

        if (!response.ok || !response.messages) {
          throw new Error(`Slack API error: ${response.error}`);
        }

        const messages = (response.messages.matches as any[])?.map((match: any) => ({
          type: match.type,
          text: match.text,
          user: match.user,
          username: match.username,
          ts: match.ts,
          channel: {
            id: match.channel?.id,
            name: match.channel?.name,
          },
          permalink: match.permalink,
        })) ?? [];

        return {
          messages,
          total: response.messages.total || 0,
          matches: response.messages.matches?.length || 0,
          hasMore: (response.messages.pagination?.page_count ?? 0) > (options?.page ?? 1),
        };
      },
      (result, span) => {
        span.setAttribute("result.count", result.matches);
      },
    );
  }

  // === New OpenClaw-style methods ===

  async updateMessage(
    channel: string,
    ts: string,
    text?: string,
    blocks?: any[],
  ): Promise<{ ok: boolean; channel: string; ts: string }> {
    return this.executeWithMetrics(
      "updateMessage",
      { "slack.channel": channel, "slack.ts": ts },
      async () => {
        const response = await this.client.chat.update({
          channel,
          ts,
          text,
          blocks: blocks as any,
        });
        if (!response.ok) {
          throw new Error(`Slack API error: ${response.error}`);
        }
        return {
          ok: response.ok,
          channel: response.channel as string,
          ts: response.ts as string,
        };
      },
    );
  }

  async deleteMessage(
    channel: string,
    ts: string,
  ): Promise<{ ok: boolean; channel: string; ts: string }> {
    return this.executeWithMetrics(
      "deleteMessage",
      { "slack.channel": channel, "slack.ts": ts },
      async () => {
        const response = await this.client.chat.delete({
          channel,
          ts,
        });
        if (!response.ok) {
          throw new Error(`Slack API error: ${response.error}`);
        }
        return { ok: response.ok, channel, ts };
      },
    );
  }

  async uploadFile(options: {
    channel_id: string;
    content?: string;
    filename?: string;
    filetype?: string;
    initial_comment?: string;
    title?: string;
    thread_ts?: string;
  }): Promise<{ ok: boolean; fileId?: string; permalink?: string }> {
    return this.executeWithMetrics(
      "uploadFile",
      { "slack.channel": options.channel_id },
      async () => {
        const uploadArgs: any = {
          channel_id: options.channel_id,
          content: options.content || "",
          filename: options.filename || "file.txt",
        };
        if (options.filetype) uploadArgs.filetype = options.filetype;
        if (options.initial_comment) uploadArgs.initial_comment = options.initial_comment;
        if (options.title) uploadArgs.title = options.title;
        if (options.thread_ts) uploadArgs.thread_ts = options.thread_ts;
        const response = await this.client.files.uploadV2(uploadArgs);
        const file = (response as any).file;
        return {
          ok: true,
          fileId: file?.id,
          permalink: file?.permalink,
        };
      },
    );
  }

  async addReaction(
    channel: string,
    timestamp: string,
    name: string,
  ): Promise<{ ok: boolean }> {
    return this.executeWithMetrics(
      "addReaction",
      { "slack.channel": channel, "slack.emoji": name },
      async () => {
        try {
          await this.client.reactions.add({ channel, timestamp, name });
          return { ok: true };
        } catch (error: any) {
          if (error.data?.error === "already_reacted") {
            return { ok: true };
          }
          throw error;
        }
      },
    );
  }

  async removeReaction(
    channel: string,
    timestamp: string,
    name: string,
  ): Promise<{ ok: boolean }> {
    return this.executeWithMetrics(
      "removeReaction",
      { "slack.channel": channel, "slack.emoji": name },
      async () => {
        try {
          await this.client.reactions.remove({ channel, timestamp, name });
          return { ok: true };
        } catch (error: any) {
          if (error.data?.error === "no_reaction") {
            return { ok: true };
          }
          throw error;
        }
      },
    );
  }

  async pinMessage(channel: string, timestamp: string): Promise<{ ok: boolean }> {
    return this.executeWithMetrics(
      "pinMessage",
      { "slack.channel": channel },
      async () => {
        try {
          await this.client.pins.add({ channel, timestamp });
          return { ok: true };
        } catch (error: any) {
          if (error.data?.error === "already_pinned") {
            return { ok: true };
          }
          throw error;
        }
      },
    );
  }

  async unpinMessage(channel: string, timestamp: string): Promise<{ ok: boolean }> {
    return this.executeWithMetrics(
      "unpinMessage",
      { "slack.channel": channel },
      async () => {
        try {
          await this.client.pins.remove({ channel, timestamp });
          return { ok: true };
        } catch (error: any) {
          if (error.data?.error === "no_pin") {
            return { ok: true };
          }
          throw error;
        }
      },
    );
  }

  async getPermalink(
    channel: string,
    message_ts: string,
  ): Promise<{ ok: boolean; permalink?: string }> {
    return this.executeWithMetrics(
      "getPermalink",
      { "slack.channel": channel },
      async () => {
        const response = await this.client.chat.getPermalink({
          channel,
          message_ts,
        });
        return { ok: true, permalink: response.permalink };
      },
    );
  }

  async listUsers(options?: {
    limit?: number;
    cursor?: string;
  }): Promise<{ users: SlackUser[]; nextCursor?: string }> {
    return this.executeWithMetrics(
      "listUsers",
      { "slack.limit": options?.limit ?? 100 },
      async () => {
        const response = await this.client.users.list({
          limit: options?.limit || 100,
          cursor: options?.cursor,
        });
        if (!response.ok) {
          throw new Error(`Slack API error: ${response.error}`);
        }
        const users: SlackUser[] = (response.members || [])
          .filter((m: any) => !m.deleted)
          .map((m: any) => ({
            id: m.id,
            name: m.name,
            realName: m.real_name || m.profile?.real_name,
            displayName: m.profile?.display_name,
            email: m.profile?.email,
            isBot: m.is_bot || false,
            isAdmin: m.is_admin,
            isOwner: m.is_owner,
            teamId: m.team_id,
            timezone: m.tz,
            profileImage: m.profile?.image_192,
          }));
        return { users, nextCursor: response.response_metadata?.next_cursor };
      },
      (result, span) => {
        span.setAttribute("result.count", result.users.length);
      },
    );
  }

  async getUserPresence(userId: string): Promise<{
    presence: "active" | "away";
    online?: boolean;
  }> {
    return this.executeWithMetrics(
      "getUserPresence",
      { "slack.user_id": userId },
      async () => {
        const response = await this.client.users.getPresence({ user: userId });
        return {
          presence: response.presence as "active" | "away",
          online: response.online,
        };
      },
    );
  }

  async scheduleMessage(
    channel: string,
    text: string,
    post_at: number,
    options?: { thread_ts?: string; blocks?: any[] },
  ): Promise<{ scheduled_message_id?: string; post_at?: number; channel?: string }> {
    return this.executeWithMetrics(
      "scheduleMessage",
      { "slack.channel": channel, "slack.post_at": post_at },
      async () => {
        const response = await this.client.chat.scheduleMessage({
          channel,
          text,
          post_at,
          thread_ts: options?.thread_ts,
          blocks: options?.blocks,
        });
        return {
          scheduled_message_id: response.scheduled_message_id,
          post_at: response.post_at,
          channel: response.channel,
        };
      },
    );
  }

  async createChannel(
    name: string,
    isPrivate?: boolean,
  ): Promise<{ ok: boolean; channel?: { id: string; name: string } }> {
    return this.executeWithMetrics(
      "createChannel",
      { "slack.channel_name": name },
      async () => {
        const response = await this.client.conversations.create({
          name,
          is_private: isPrivate,
        });
        return {
          ok: response.ok,
          channel: {
            id: (response.channel as any)?.id,
            name: (response.channel as any)?.name,
          },
        };
      },
    );
  }

  async inviteToChannel(channel: string, users: string): Promise<{ ok: boolean }> {
    return this.executeWithMetrics(
      "inviteToChannel",
      { "slack.channel": channel },
      async () => {
        try {
          await this.client.conversations.invite({ channel, users });
          return { ok: true };
        } catch (error: any) {
          if (error.data?.error === "already_in_channel") {
            return { ok: true };
          }
          throw error;
        }
      },
    );
  }

  async kickFromChannel(channel: string, user: string): Promise<{ ok: boolean }> {
    return this.executeWithMetrics(
      "kickFromChannel",
      { "slack.channel": channel },
      async () => {
        await this.client.conversations.kick({ channel, user });
        return { ok: true };
      },
    );
  }

  async setChannelTopic(channel: string, topic: string): Promise<{ ok: boolean; topic?: string }> {
    return this.executeWithMetrics(
      "setChannelTopic",
      { "slack.channel": channel },
      async () => {
        const response = await this.client.conversations.setTopic({ channel, topic });
        return { ok: true, topic: (response.channel as any)?.topic?.value };
      },
    );
  }

  async archiveChannel(channel: string): Promise<{ ok: boolean }> {
    return this.executeWithMetrics(
      "archiveChannel",
      { "slack.channel": channel },
      async () => {
        try {
          await this.client.conversations.archive({ channel });
          return { ok: true };
        } catch (error: any) {
          if (error.data?.error === "already_archived") {
            return { ok: true };
          }
          throw error;
        }
      },
    );
  }

  async getThreadReplies(
    channel: string,
    ts: string,
    options?: { limit?: number; cursor?: string },
  ): Promise<{ messages: any[]; hasMore: boolean; nextCursor?: string }> {
    return this.executeWithMetrics(
      "getThreadReplies",
      { "slack.channel": channel, "slack.thread_ts": ts },
      async () => {
        const response = await this.client.conversations.replies({
          channel,
          ts,
          limit: options?.limit ?? 100,
          cursor: options?.cursor,
        });
        return {
          messages: response.messages || [],
          hasMore: response.has_more || false,
          nextCursor: response.response_metadata?.next_cursor,
        };
      },
      (result, span) => {
        span.setAttribute("result.count", result.messages.length);
      },
    );
  }

  async getChannelHistory(
    channel: string,
    options?: { limit?: number; cursor?: string; oldest?: string; latest?: string },
  ): Promise<{ messages: any[]; hasMore: boolean; nextCursor?: string }> {
    return this.executeWithMetrics(
      "getChannelHistory",
      { "slack.channel": channel },
      async () => {
        const response = await this.client.conversations.history({
          channel,
          limit: options?.limit ?? 100,
          cursor: options?.cursor,
          oldest: options?.oldest,
          latest: options?.latest,
        });
        return {
          messages: response.messages || [],
          hasMore: response.has_more || false,
          nextCursor: response.response_metadata?.next_cursor,
        };
      },
      (result, span) => {
        span.setAttribute("result.count", result.messages.length);
      },
    );
  }

  // === Canvas API ===

  async createCanvas(
    title: string,
    documentContent?: { type: "markdown"; markdown: string },
  ): Promise<{ ok: boolean; canvas_id?: string }> {
    return this.executeWithMetrics(
      "createCanvas",
      { "slack.canvas_title": title },
      async () => {
        const response = await (this.client as any).canvases.create({
          title,
          document_content: documentContent,
        });
        return { ok: response.ok, canvas_id: response.canvas_id };
      },
    );
  }

  async editCanvas(
    canvasId: string,
    changes: Array<{
      operation: "insert_at_start" | "insert_at_end" | "replace" | "delete";
      document_content?: { type: "markdown"; markdown: string };
      section_id?: string;
    }>,
  ): Promise<{ ok: boolean }> {
    return this.executeWithMetrics(
      "editCanvas",
      { "slack.canvas_id": canvasId },
      async () => {
        const response = await (this.client as any).canvases.edit({
          canvas_id: canvasId,
          changes,
        });
        return { ok: response.ok };
      },
    );
  }

  async deleteCanvas(canvasId: string): Promise<{ ok: boolean }> {
    return this.executeWithMetrics(
      "deleteCanvas",
      { "slack.canvas_id": canvasId },
      async () => {
        const response = await (this.client as any).canvases.delete({
          canvas_id: canvasId,
        });
        return { ok: response.ok };
      },
    );
  }

  async createChannelCanvas(
    channelId: string,
    documentContent?: { type: "markdown"; markdown: string },
  ): Promise<{ ok: boolean; canvas_id?: string }> {
    return this.executeWithMetrics(
      "createChannelCanvas",
      { "slack.channel": channelId },
      async () => {
        const response = await (this.client as any).conversations.canvases.create({
          channel_id: channelId,
          document_content: documentContent,
        });
        return { ok: response.ok, canvas_id: response.canvas_id };
      },
    );
  }

  // === Bookmarks API ===

  async addBookmark(
    channelId: string,
    title: string,
    type: "link" | "folder",
    link?: string,
    emoji?: string,
  ): Promise<{ ok: boolean; bookmark?: any }> {
    return this.executeWithMetrics(
      "addBookmark",
      { "slack.channel": channelId },
      async () => {
        const args: any = {
          channel_id: channelId,
          title,
          type,
        };
        if (link) args.link = link;
        if (emoji) args.emoji = emoji;
        const response = await this.client.bookmarks.add(args);
        return { ok: response.ok, bookmark: (response as any).bookmark };
      },
    );
  }

  async listBookmarks(channelId: string): Promise<{ ok: boolean; bookmarks: any[] }> {
    return this.executeWithMetrics(
      "listBookmarks",
      { "slack.channel": channelId },
      async () => {
        const response = await this.client.bookmarks.list({ channel_id: channelId });
        return { ok: response.ok, bookmarks: (response as any).bookmarks || [] };
      },
    );
  }

  async removeBookmark(channelId: string, bookmarkId: string): Promise<{ ok: boolean }> {
    return this.executeWithMetrics(
      "removeBookmark",
      { "slack.channel": channelId },
      async () => {
        const response = await this.client.bookmarks.remove({
          channel_id: channelId,
          bookmark_id: bookmarkId,
        });
        return { ok: response.ok };
      },
    );
  }

  async editBookmark(
    channelId: string,
    bookmarkId: string,
    options?: { title?: string; link?: string; emoji?: string },
  ): Promise<{ ok: boolean; bookmark?: any }> {
    return this.executeWithMetrics(
      "editBookmark",
      { "slack.channel": channelId },
      async () => {
        const response = await this.client.bookmarks.edit({
          channel_id: channelId,
          bookmark_id: bookmarkId,
          ...options,
        });
        return { ok: response.ok, bookmark: (response as any).bookmark };
      },
    );
  }

  // === Views/Modals API ===

  async openView(
    triggerId: string,
    view: any,
  ): Promise<{ ok: boolean; view?: any }> {
    return this.executeWithMetrics(
      "openView",
      {},
      async () => {
        const response = await this.client.views.open({
          trigger_id: triggerId,
          view,
        });
        return { ok: response.ok, view: response.view };
      },
    );
  }

  async updateView(
    viewId: string,
    view: any,
    hash?: string,
  ): Promise<{ ok: boolean; view?: any }> {
    return this.executeWithMetrics(
      "updateView",
      { "slack.view_id": viewId },
      async () => {
        const response = await this.client.views.update({
          view_id: viewId,
          view,
          hash,
        });
        return { ok: response.ok, view: response.view };
      },
    );
  }

  async pushView(
    triggerId: string,
    view: any,
  ): Promise<{ ok: boolean; view?: any }> {
    return this.executeWithMetrics(
      "pushView",
      {},
      async () => {
        const response = await this.client.views.push({
          trigger_id: triggerId,
          view,
        });
        return { ok: response.ok, view: response.view };
      },
    );
  }

  async publishHomeView(
    userId: string,
    view: any,
  ): Promise<{ ok: boolean; view?: any }> {
    return this.executeWithMetrics(
      "publishHomeView",
      { "slack.user_id": userId },
      async () => {
        const response = await this.client.views.publish({
          user_id: userId,
          view,
        });
        return { ok: response.ok, view: response.view };
      },
    );
  }

  // === Usergroups API ===

  async listUsergroups(): Promise<{ ok: boolean; usergroups: any[] }> {
    return this.executeWithMetrics("listUsergroups", {}, async () => {
      const response = await this.client.usergroups.list({
        include_users: true,
        include_count: true,
      });
      return { ok: response.ok, usergroups: response.usergroups || [] };
    });
  }

  async createUsergroup(
    name: string,
    options?: { handle?: string; description?: string; channels?: string[] },
  ): Promise<{ ok: boolean; usergroup?: any }> {
    return this.executeWithMetrics(
      "createUsergroup",
      { "slack.usergroup_name": name },
      async () => {
        const response = await this.client.usergroups.create({
          name,
          handle: options?.handle,
          description: options?.description,
          channels: options?.channels?.join(","),
        });
        return { ok: response.ok, usergroup: response.usergroup };
      },
    );
  }

  async updateUsergroupMembers(
    usergroupId: string,
    users: string[],
  ): Promise<{ ok: boolean; usergroup?: any }> {
    return this.executeWithMetrics(
      "updateUsergroupMembers",
      { "slack.usergroup_id": usergroupId },
      async () => {
        const response = await this.client.usergroups.users.update({
          usergroup: usergroupId,
          users: users.join(","),
        });
        return { ok: response.ok, usergroup: response.usergroup };
      },
    );
  }

  // === Calls API ===

  async addCall(
    externalUniqueId: string,
    joinUrl: string,
    options?: { title?: string; desktopAppJoinUrl?: string },
  ): Promise<{ ok: boolean; call?: any }> {
    return this.executeWithMetrics("addCall", {}, async () => {
      const response = await this.client.calls.add({
        external_unique_id: externalUniqueId,
        join_url: joinUrl,
        title: options?.title,
        desktop_app_join_url: options?.desktopAppJoinUrl,
      });
      return { ok: response.ok, call: response.call };
    });
  }

  async endCall(callId: string): Promise<{ ok: boolean }> {
    return this.executeWithMetrics(
      "endCall",
      { "slack.call_id": callId },
      async () => {
        const response = await this.client.calls.end({ id: callId });
        return { ok: response.ok };
      },
    );
  }

  // === DND (Do Not Disturb) API ===

  async getDndInfo(userId?: string): Promise<{
    ok: boolean;
    dnd_enabled?: boolean;
    next_dnd_start_ts?: number;
    next_dnd_end_ts?: number;
    snooze_enabled?: boolean;
    snooze_endtime?: number;
  }> {
    return this.executeWithMetrics("getDndInfo", {}, async () => {
      const response = await this.client.dnd.info({ user: userId }) as any;
      return {
        ok: response.ok,
        dnd_enabled: response.dnd_enabled,
        next_dnd_start_ts: response.next_dnd_start_ts,
        next_dnd_end_ts: response.next_dnd_end_ts,
        snooze_enabled: response.snooze_enabled,
        snooze_endtime: response.snooze_endtime,
      };
    });
  }

  async setSnooze(numMinutes: number): Promise<{ ok: boolean; snooze_endtime?: number }> {
    return this.executeWithMetrics(
      "setSnooze",
      { "slack.snooze_minutes": numMinutes },
      async () => {
        const response = await this.client.dnd.setSnooze({ num_minutes: numMinutes });
        return { ok: response.ok, snooze_endtime: response.snooze_endtime };
      },
    );
  }

  async endSnooze(): Promise<{ ok: boolean }> {
    return this.executeWithMetrics("endSnooze", {}, async () => {
      const response = await this.client.dnd.endSnooze();
      return { ok: response.ok };
    });
  }

  // === Search API (enhanced) ===

  async searchAll(
    query: string,
    options?: { sort?: "score" | "timestamp"; sortDir?: "asc" | "desc"; count?: number },
  ): Promise<{ ok: boolean; messages: any; files: any }> {
    return this.executeWithMetrics(
      "searchAll",
      { "slack.query": query },
      async () => {
        const response = await this.client.search.all({
          query,
          sort: options?.sort || "score",
          sort_dir: options?.sortDir || "desc",
          count: options?.count || 20,
        });
        return {
          ok: response.ok,
          messages: response.messages,
          files: response.files,
        };
      },
    );
  }

  // === Emoji API ===

  async listEmoji(): Promise<{ ok: boolean; emoji: Record<string, string> }> {
    return this.executeWithMetrics("listEmoji", {}, async () => {
      const response = await this.client.emoji.list();
      return { ok: response.ok, emoji: response.emoji || {} };
    });
  }

  // === Conversations (additional methods) ===

  async getConversationMembers(
    channel: string,
    options?: { limit?: number; cursor?: string },
  ): Promise<{ ok: boolean; members: string[]; nextCursor?: string }> {
    return this.executeWithMetrics(
      "getConversationMembers",
      { "slack.channel": channel },
      async () => {
        const response = await this.client.conversations.members({
          channel,
          limit: options?.limit ?? 100,
          cursor: options?.cursor,
        });
        return {
          ok: response.ok,
          members: response.members || [],
          nextCursor: response.response_metadata?.next_cursor,
        };
      },
    );
  }

  async setConversationPurpose(channel: string, purpose: string): Promise<{ ok: boolean }> {
    return this.executeWithMetrics(
      "setConversationPurpose",
      { "slack.channel": channel },
      async () => {
        const response = await this.client.conversations.setPurpose({ channel, purpose });
        return { ok: response.ok };
      },
    );
  }

  // === Post Ephemeral (private message in channel) ===

  async postEphemeral(
    channel: string,
    user: string,
    text: string,
    options?: { blocks?: any[]; threadTs?: string },
  ): Promise<{ ok: boolean; message_ts?: string }> {
    return this.executeWithMetrics(
      "postEphemeral",
      { "slack.channel": channel, "slack.user": user },
      async () => {
        const response = await this.client.chat.postEphemeral({
          channel,
          user,
          text,
          blocks: options?.blocks as any,
          thread_ts: options?.threadTs,
        });
        return { ok: response.ok, message_ts: response.message_ts };
      },
    );
  }

  // === Files (additional methods) ===

  async deleteFile(fileId: string): Promise<{ ok: boolean }> {
    return this.executeWithMetrics(
      "deleteFile",
      { "slack.file_id": fileId },
      async () => {
        const response = await this.client.files.delete({ file: fileId });
        return { ok: response.ok };
      },
    );
  }

  async getFileInfo(fileId: string): Promise<{ ok: boolean; file?: any }> {
    return this.executeWithMetrics(
      "getFileInfo",
      { "slack.file_id": fileId },
      async () => {
        const response = await this.client.files.info({ file: fileId });
        return { ok: response.ok, file: response.file };
      },
    );
  }

  async listFiles(options?: {
    channel?: string;
    user?: string;
    types?: string;
    count?: number;
    page?: number;
  }): Promise<{ ok: boolean; files: any[]; paging?: any }> {
    return this.executeWithMetrics("listFiles", {}, async () => {
      const response = await this.client.files.list({
        channel: options?.channel,
        user: options?.user,
        types: options?.types,
        count: options?.count || 100,
        page: options?.page || 1,
      });
      return { ok: response.ok, files: response.files || [], paging: response.paging };
    });
  }
}

type SlackClientFactoryOptions = {
  token: string;
  connection?: MCPConnection;
  organizationId?: string;
  userId?: string;
};

const resolveSlackToken = (token: string, connection?: MCPConnection): string => {
  const fromConfig = connection ? getAccessTokenFromConfig(connection.config) : null;
  return fromConfig || decrypt(token);
};

export async function getSlackClient(
  options: SlackClientFactoryOptions,
): Promise<{ client: SlackClient; release: () => void }> {
  const organizationId = options.connection?.organizationId ?? options.organizationId;
  const token = resolveSlackToken(options.token, options.connection);

  if (!organizationId) {
    return {
      client: new SlackClient(token, {
        connectionId: options.connection?.id,
        expiresAt: options.connection?.expiresAt ?? null,
        organizationId: options.organizationId,
        userId: options.userId,
      }),
      release: () => undefined,
    };
  }

  const credentials = {
    accessToken: token,
    refreshToken: options.connection?.refreshToken ?? null,
  };

  const { client, release } = await acquireMcpClient({
    provider: "slack",
    organizationId,
    credentials,
    createClient: () =>
      new SlackClient(token, {
        connectionId: options.connection?.id,
        expiresAt: options.connection?.expiresAt ?? null,
        organizationId,
        userId: options.userId,
      }),
  });

  client.setContext({
    connectionId: options.connection?.id,
    expiresAt: options.connection?.expiresAt ?? null,
    organizationId,
    userId: options.userId,
  });

  return { client, release };
}
