import { Client } from "@notionhq/client";
import { NotionTask, NotionDatabase } from "./types";
import { getCircuitBreaker } from "../../utils/circuit-breaker";

export class NotionClient {
  private client: Client;
  private circuitBreaker = getCircuitBreaker("notion-api", {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 60000,
  });

  constructor(apiKey: string) {
    this.client = new Client({ auth: apiKey });
  }

  async getDatabases(): Promise<NotionDatabase[]> {
    return this.circuitBreaker.execute(async () => {
      const response: any = await this.client.search({
        filter: {
          property: "object",
          value: "database",
        } as any,
      });

      return response.results.map((db: any) => ({
        id: db.id,
        title: this.extractTitle(db),
        url: db.url,
        properties: db.properties,
      }));
    });
  }

  async getTasks(
    databaseId: string,
    filter?: { status?: string; assignee?: string },
    limit = 50,
  ): Promise<{ tasks: NotionTask[]; hasMore: boolean; nextCursor?: string }> {
    return this.circuitBreaker.execute(async () => {
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
    });
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
    return this.circuitBreaker.execute(async () => {
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
    });
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
    return this.circuitBreaker.execute(async () => {
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
    });
  }

  async deleteTask(taskId: string): Promise<boolean> {
    return this.circuitBreaker.execute(async () => {
      await this.client.pages.update({
        page_id: taskId,
        archived: true,
      });

      return true;
    });
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
