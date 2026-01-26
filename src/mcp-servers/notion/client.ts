import { Client } from "@notionhq/client";
import { NotionTask, NotionDatabase } from "./types";
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

const tracer = trace.getTracer("mcp-notion");

const formatToolSpanName = (toolName: string): string =>
  toolName.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();

export class NotionClient {
  private client: Client;
  private connectionId?: string;
  private expiresAt?: Date | null;
  private organizationId?: string;
  private userId?: string;
  private circuitBreaker = getCircuitBreaker("notion-api", {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 60000,
  });

  constructor(
    apiKey: string,
    options?: {
      connectionId?: string;
      expiresAt?: Date | null;
      organizationId?: string;
      userId?: string;
    },
  ) {
    this.client = new Client({ auth: apiKey });
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
      throw new Error("Refreshed Notion token missing access token");
    }

    this.client = new Client({ auth: nextToken });
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
    const spanName = `mcp.notion.${formatToolSpanName(toolName)}`;
    const environment = process.env.NODE_ENV || "development";

    return tracer.startActiveSpan(spanName, async (span) => {
      try {
        span.setAttribute("mcp.provider", "notion");
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
          provider: "notion",
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
          provider: "notion",
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

  async getDatabases(): Promise<NotionDatabase[]> {
    return this.executeWithMetrics(
      "getDatabases",
      {},
      async () => {
        const response: any = await this.client.search({
          filter: {
            property: "object",
            value: "database",
          } as any,
        });

        const databases = response.results.map((db: any) => ({
          id: db.id,
          title: this.extractTitle(db),
          url: db.url,
          properties: db.properties,
        }));

        return databases;
      },
      (result, span) => {
        span.setAttribute("result.count", result.length);
      },
    );
  }

  async getTasks(
    databaseId: string,
    filter?: { status?: string; assignee?: string },
    limit = 50,
  ): Promise<{ tasks: NotionTask[]; hasMore: boolean; nextCursor?: string }> {
    return this.executeWithMetrics(
      "getTasks",
      {
        "notion.database_id": databaseId,
        ...(filter?.status ? { "notion.filter.status": filter.status } : {}),
        ...(filter?.assignee ? { "notion.filter.assignee": filter.assignee } : {}),
        "notion.limit": limit,
      },
      async () => {
        const notionFilter: any = { and: [] };

        if (filter?.status) {
          notionFilter.and.push({
            property: "Status",
            status: { equals: filter.status },
          });
        }

        if (filter?.assignee) {
          notionFilter.and.push({
            property: "Assignee",
            people: { contains: filter.assignee },
          });
        }

        const response: any = await (this.client.databases as any).query({
          database_id: databaseId,
          filter: notionFilter.and.length > 0 ? notionFilter : undefined,
          page_size: limit,
        });

        const tasks = response.results.map((page: any) => this.pageToTask(page));

        return {
          tasks,
          hasMore: response.has_more,
          nextCursor: response.next_cursor || undefined,
        };
      },
      (result, span) => {
        span.setAttribute("result.count", result.tasks.length);
      },
    );
  }

  async createTask(
    databaseId: string,
    title: string,
    properties?: {
      status?: string;
      assignee?: string;
      dueDate?: string;
      [key: string]: any;
    },
  ): Promise<NotionTask> {
    return this.executeWithMetrics(
      "createTask",
      {
        "notion.database_id": databaseId,
      },
      async () => {
        const pageProperties: any = {
          Name: {
            title: [{ text: { content: title } }],
          },
        };

        if (properties?.status) {
          pageProperties.Status = {
            status: { name: properties.status },
          };
        }

        if (properties?.assignee) {
          pageProperties.Assignee = {
            people: [{ id: properties.assignee }],
          };
        }

        if (properties?.dueDate) {
          pageProperties["Due Date"] = {
            date: { start: properties.dueDate },
          };
        }

        const response = await this.client.pages.create({
          parent: { database_id: databaseId },
          properties: pageProperties,
        });

        return this.pageToTask(response);
      },
      (task, span) => {
        span.setAttribute("notion.task_id", task.id);
      },
    );
  }

  async updateTask(
    taskId: string,
    updates: {
      title?: string;
      status?: string;
      assignee?: string;
      dueDate?: string;
      [key: string]: any;
    },
  ): Promise<NotionTask> {
    return this.executeWithMetrics(
      "updateTask",
      {
        "notion.task_id": taskId,
      },
      async () => {
        const properties: any = {};

        if (updates.title) {
          properties.Name = {
            title: [{ text: { content: updates.title } }],
          };
        }

        if (updates.status) {
          properties.Status = {
            status: { name: updates.status },
          };
        }

        if (updates.assignee) {
          properties.Assignee = {
            people: [{ id: updates.assignee }],
          };
        }

        if (updates.dueDate) {
          properties["Due Date"] = {
            date: { start: updates.dueDate },
          };
        }

        const response = await this.client.pages.update({
          page_id: taskId,
          properties,
        });

        return this.pageToTask(response);
      },
      (task, span) => {
        span.setAttribute("notion.updated_task_id", task.id);
      },
    );
  }

  async deleteTask(taskId: string): Promise<boolean> {
    return this.executeWithMetrics(
      "deleteTask",
      {
        "notion.task_id": taskId,
      },
      async () => {
        await this.client.pages.update({
          page_id: taskId,
          archived: true,
        });

        return true;
      },
      (result, span) => {
        span.setAttribute("result.success", result);
      },
    );
  }

  private pageToTask(page: any): NotionTask {
    const properties = page.properties || {};

    const title = this.extractTitle(properties.Name || properties.Title);
    const status = properties.Status?.status?.name || undefined;
    const assignee = properties.Assignee?.people?.[0]?.name || undefined;
    const dueDate = properties["Due Date"]?.date?.start || undefined;

    return {
      id: page.id,
      title,
      status,
      assignee,
      dueDate,
      createdAt: page.created_time,
      updatedAt: page.last_edited_time,
      url: page.url,
      properties: page.properties,
    };
  }

  private extractTitle(titleProperty: any): string {
    if (!titleProperty) return "Untitled";

    if (titleProperty.title) {
      return titleProperty.title.map((t: any) => t.plain_text).join("");
    }

    if (Array.isArray(titleProperty)) {
      return titleProperty.map((t: any) => t.plain_text).join("");
    }

    return "Untitled";
  }
}

type NotionClientFactoryOptions = {
  apiKey: string;
  connection?: MCPConnection;
  organizationId?: string;
  userId?: string;
};

const resolveNotionToken = (apiKey: string, connection?: MCPConnection): string => {
  const fromConfig = connection ? getAccessTokenFromConfig(connection.config) : null;
  return fromConfig || decrypt(apiKey);
};

export async function getNotionClient(
  options: NotionClientFactoryOptions,
): Promise<{ client: NotionClient; release: () => void }> {
  const organizationId = options.connection?.organizationId ?? options.organizationId;
  const token = resolveNotionToken(options.apiKey, options.connection);
  if (!organizationId) {
    return {
      client: new NotionClient(token, {
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
    provider: "notion",
    organizationId,
    credentials,
    createClient: () =>
      new NotionClient(token, {
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
