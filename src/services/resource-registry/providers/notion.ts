/**
 * Notion Resource Provider
 * Adapter for Notion databases and pages
 */

import { ResourceProviderType } from "@prisma/client";
import {
  ResourceProviderAdapter,
  ProviderContext,
  ExternalResourceSchema,
  ExternalField,
  ResourceList,
  RecordList,
  ExternalRecord,
  ListResourcesOptions,
  FetchRecordsOptions,
} from "./types";
import { logger } from "../../../utils/logger";

// Notion API base URL
const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

/**
 * Map Notion property types to our standard types
 */
function mapNotionType(notionType: string): ExternalField["type"] {
  const typeMap: Record<string, ExternalField["type"]> = {
    title: "string",
    rich_text: "string",
    number: "number",
    select: "select",
    multi_select: "multi_select",
    date: "date",
    checkbox: "boolean",
    url: "string",
    email: "string",
    phone_number: "string",
    formula: "formula",
    relation: "relation",
    rollup: "unknown",
    created_time: "datetime",
    created_by: "string",
    last_edited_time: "datetime",
    last_edited_by: "string",
    people: "relation",
    files: "unknown",
    status: "select",
  };
  return typeMap[notionType] || "unknown";
}

/**
 * Extract value from Notion property
 */
function extractNotionValue(property: Record<string, unknown>): unknown {
  const type = property.type as string;

  switch (type) {
    case "title":
    case "rich_text": {
      const textArray = property[type] as Array<{ plain_text: string }>;
      return textArray?.map((t) => t.plain_text).join("") || "";
    }
    case "number":
      return property.number;
    case "select":
      return (property.select as { name: string } | null)?.name || null;
    case "multi_select": {
      const selections = property.multi_select as Array<{ name: string }>;
      return selections?.map((s) => s.name) || [];
    }
    case "date": {
      const dateValue = property.date as { start: string; end?: string } | null;
      return dateValue?.start || null;
    }
    case "checkbox":
      return property.checkbox;
    case "url":
      return property.url;
    case "email":
      return property.email;
    case "phone_number":
      return property.phone_number;
    case "created_time":
      return property.created_time;
    case "last_edited_time":
      return property.last_edited_time;
    case "status":
      return (property.status as { name: string } | null)?.name || null;
    case "formula": {
      const formula = property.formula as Record<string, unknown>;
      return formula?.[formula?.type as string] ?? null;
    }
    case "relation": {
      const relations = property.relation as Array<{ id: string }>;
      return relations?.map((r) => r.id) || [];
    }
    default:
      return null;
  }
}

/**
 * Make authenticated request to Notion API
 */
async function notionRequest(
  ctx: ProviderContext,
  endpoint: string,
  options: RequestInit = {}
): Promise<unknown> {
  const token = ctx.credentials.accessToken as string;

  if (!token) {
    throw new Error("Notion access token not found in credentials");
  }

  const response = await fetch(`${NOTION_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    logger.error("Notion API error", {
      status: response.status,
      endpoint,
      error,
    });
    throw new Error(`Notion API error: ${response.status} - ${JSON.stringify(error)}`);
  }

  return response.json();
}

/**
 * Notion Resource Provider Implementation
 */
class NotionResourceProvider implements ResourceProviderAdapter {
  readonly providerType = ResourceProviderType.notion_database;
  readonly displayName = "Notion Database";

  async validateConnection(ctx: ProviderContext): Promise<boolean> {
    try {
      await notionRequest(ctx, "/users/me");
      return true;
    } catch (error) {
      logger.error("Notion connection validation failed", { error });
      return false;
    }
  }

  async detectSchema(ctx: ProviderContext, resourceId: string): Promise<ExternalResourceSchema> {
    const database = (await notionRequest(ctx, `/databases/${resourceId}`)) as {
      id: string;
      title: Array<{ plain_text: string }>;
      properties: Record<string, { type: string; [key: string]: unknown }>;
    };

    const fields: ExternalField[] = Object.entries(database.properties).map(
      ([name, prop]) => {
        const field: ExternalField = {
          name,
          type: mapNotionType(prop.type),
          required: prop.type === "title", // Title is always required in Notion
        };

        // Extract options for select/multi_select
        if (prop.type === "select" || prop.type === "multi_select") {
          const options = prop[prop.type] as { options: Array<{ name: string }> };
          field.options = options?.options?.map((o) => o.name) || [];
        }

        return field;
      }
    );

    // Fetch sample data
    const queryResult = (await notionRequest(ctx, `/databases/${resourceId}/query`, {
      method: "POST",
      body: JSON.stringify({ page_size: 3 }),
    })) as { results: Array<{ properties: Record<string, unknown> }> };

    const sampleData = queryResult.results.map((page) => {
      const record: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(page.properties)) {
        record[key] = extractNotionValue(value as Record<string, unknown>);
      }
      return record;
    });

    return {
      resourceId: database.id,
      resourceName: database.title.map((t) => t.plain_text).join("") || "Untitled",
      fields,
      sampleData,
    };
  }

  async listResources(ctx: ProviderContext, options?: ListResourcesOptions): Promise<ResourceList> {
    const body: Record<string, unknown> = {
      filter: { property: "object", value: "database" },
      page_size: options?.limit || 100,
    };
    if (options?.cursor) {
      body.start_cursor = options.cursor;
    }

    const response = (await notionRequest(ctx, "/search", {
      method: "POST",
      body: JSON.stringify(body),
    })) as {
      results: Array<{
        id: string;
        title: Array<{ plain_text: string }>;
        url: string;
        last_edited_time: string;
      }>;
      has_more: boolean;
      next_cursor: string | null;
    };

    return {
      resources: response.results.map((db) => ({
        id: db.id,
        name: db.title?.map((t) => t.plain_text).join("") || "Untitled",
        type: "database",
        url: db.url,
        lastModified: new Date(db.last_edited_time),
      })),
      hasMore: response.has_more,
      cursor: response.next_cursor || undefined,
    };
  }

  async fetchRecords(
    ctx: ProviderContext,
    resourceId: string,
    options?: FetchRecordsOptions
  ): Promise<RecordList> {
    const body: Record<string, unknown> = {
      page_size: options?.limit || 100,
    };
    if (options?.cursor) {
      body.start_cursor = options.cursor;
    }
    if (options?.sorts && options.sorts.length > 0) {
      body.sorts = options.sorts.map((s) => ({
        property: s.field,
        direction: s.direction === "asc" ? "ascending" : "descending",
      }));
    }
    if (options?.modifiedSince) {
      body.filter = {
        property: "last_edited_time",
        last_edited_time: {
          on_or_after: options.modifiedSince.toISOString(),
        },
      };
    }

    const response = (await notionRequest(ctx, `/databases/${resourceId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    })) as {
      results: Array<{
        id: string;
        properties: Record<string, unknown>;
        created_time: string;
        last_edited_time: string;
        url: string;
      }>;
      has_more: boolean;
      next_cursor: string | null;
    };

    return {
      records: response.results.map((page) => {
        const data: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(page.properties)) {
          data[key] = extractNotionValue(value as Record<string, unknown>);
        }
        return {
          id: page.id,
          data,
          createdAt: new Date(page.created_time),
          updatedAt: new Date(page.last_edited_time),
          url: page.url,
        };
      }),
      hasMore: response.has_more,
      cursor: response.next_cursor || undefined,
    };
  }

  async createRecord(
    ctx: ProviderContext,
    resourceId: string,
    data: Record<string, unknown>
  ): Promise<ExternalRecord> {
    // First get the database schema to properly format properties
    const schema = await this.detectSchema(ctx, resourceId);
    const properties = this.formatPropertiesForNotion(data, schema.fields);

    const response = (await notionRequest(ctx, "/pages", {
      method: "POST",
      body: JSON.stringify({
        parent: { database_id: resourceId },
        properties,
      }),
    })) as {
      id: string;
      properties: Record<string, unknown>;
      created_time: string;
      last_edited_time: string;
      url: string;
    };

    const recordData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(response.properties)) {
      recordData[key] = extractNotionValue(value as Record<string, unknown>);
    }

    return {
      id: response.id,
      data: recordData,
      createdAt: new Date(response.created_time),
      updatedAt: new Date(response.last_edited_time),
      url: response.url,
    };
  }

  async updateRecord(
    ctx: ProviderContext,
    resourceId: string,
    recordId: string,
    data: Record<string, unknown>
  ): Promise<ExternalRecord> {
    const schema = await this.detectSchema(ctx, resourceId);
    const properties = this.formatPropertiesForNotion(data, schema.fields);

    const response = (await notionRequest(ctx, `/pages/${recordId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties }),
    })) as {
      id: string;
      properties: Record<string, unknown>;
      created_time: string;
      last_edited_time: string;
      url: string;
    };

    const recordData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(response.properties)) {
      recordData[key] = extractNotionValue(value as Record<string, unknown>);
    }

    return {
      id: response.id,
      data: recordData,
      createdAt: new Date(response.created_time),
      updatedAt: new Date(response.last_edited_time),
      url: response.url,
    };
  }

  async deleteRecord(ctx: ProviderContext, _resourceId: string, recordId: string): Promise<void> {
    await notionRequest(ctx, `/pages/${recordId}`, {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
    });
  }

  parseResourceUrl(url: string): { resourceId: string; type?: string } | null {
    // Match Notion database URLs:
    // https://www.notion.so/workspace/abc123def456...
    // https://notion.so/abc123def456...
    // https://www.notion.so/workspace/Database-Name-abc123def456...
    const patterns = [
      /notion\.so\/(?:[^/]+\/)?([a-f0-9]{32})/i,
      /notion\.so\/(?:[^/]+\/)?[^?]*-([a-f0-9]{32})/i,
      /notion\.so\/(?:[^/]+\/)?([a-f0-9-]{36})/i,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        // Notion IDs are 32 hex chars without dashes
        const id = match[1].replace(/-/g, "");
        return { resourceId: id, type: "database" };
      }
    }

    return null;
  }

  /**
   * Format data for Notion API property format
   */
  private formatPropertiesForNotion(
    data: Record<string, unknown>,
    fields: ExternalField[]
  ): Record<string, unknown> {
    const properties: Record<string, unknown> = {};
    const fieldMap = new Map(fields.map((f) => [f.name, f]));

    for (const [key, value] of Object.entries(data)) {
      const field = fieldMap.get(key);
      if (!field || value === undefined) continue;

      switch (field.type) {
        case "string":
          // Could be title or rich_text
          if (fields.find((f) => f.name === key && f.required)) {
            properties[key] = { title: [{ text: { content: String(value) } }] };
          } else {
            properties[key] = { rich_text: [{ text: { content: String(value) } }] };
          }
          break;
        case "number":
          properties[key] = { number: Number(value) };
          break;
        case "boolean":
          properties[key] = { checkbox: Boolean(value) };
          break;
        case "select":
          properties[key] = { select: { name: String(value) } };
          break;
        case "multi_select":
          properties[key] = {
            multi_select: (Array.isArray(value) ? value : [value]).map((v) => ({
              name: String(v),
            })),
          };
          break;
        case "date":
          properties[key] = { date: { start: String(value) } };
          break;
      }
    }

    return properties;
  }
}

export const notionProvider = new NotionResourceProvider();
