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
