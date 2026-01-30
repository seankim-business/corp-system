import { logger } from "../../utils/logger";
import { MCPTool, CallContext, ToolCallResult } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime: string;
}

interface AirtableListResponse {
  records: AirtableRecord[];
  offset?: string;
}

interface AirtableRecordResponse {
  id: string;
  fields: Record<string, unknown>;
  createdTime: string;
}

interface AirtableDeleteResponse {
  id: string;
  deleted: boolean;
}

interface AirtableBase {
  id: string;
  name: string;
  permissionLevel: string;
}

interface AirtableBasesResponse {
  bases: AirtableBase[];
  offset?: string;
}

interface AirtableErrorResponse {
  error?: {
    type: string;
    message: string;
  };
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface AirtableMCPProvider {
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

const AIRTABLE_API_BASE = "https://api.airtable.com/v0/";
const AIRTABLE_META_API_BASE = "https://api.airtable.com/v0/meta/";
const PROVIDER_NAME = "airtable";

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

function getApiToken(): string {
  const token =
    process.env.AIRTABLE_ACCESS_TOKEN || process.env.AIRTABLE_API_KEY;
  if (!token) {
    throw new Error(
      "AIRTABLE_ACCESS_TOKEN or AIRTABLE_API_KEY environment variable is not set",
    );
  }
  return token;
}

async function airtableRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    baseUrl?: string;
  } = {},
): Promise<T> {
  const token = getApiToken();
  const { method = "GET", body, baseUrl = AIRTABLE_API_BASE } = options;

  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  if (body !== undefined) {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    const text = await response.text();
    let errorMessage = `Airtable API HTTP ${response.status}: ${text}`;

    try {
      const errorJson = JSON.parse(text) as AirtableErrorResponse;
      if (errorJson.error) {
        errorMessage = `Airtable API error (${errorJson.error.type}): ${errorJson.error.message}`;
      }
    } catch {
      // Keep the raw text error message
    }

    throw new Error(errorMessage);
  }

  // DELETE responses may return empty body on success
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  return {} as T;
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
      name: "airtable_list_records",
      provider: PROVIDER_NAME,
      description:
        "List records in an Airtable table with optional filtering, sorting, and pagination.",
      inputSchema: {
        type: "object",
        properties: {
          baseId: {
            type: "string",
            description: "The ID of the Airtable base (e.g. appXXXXXXXXXXXXXX)",
          },
          tableIdOrName: {
            type: "string",
            description:
              "The table name or ID to list records from (e.g. tblXXXXXXXXXXXXXX or 'Tasks')",
          },
          fields: {
            type: "array",
            items: { type: "string" },
            description: "Only return data for the specified field names",
          },
          filterByFormula: {
            type: "string",
            description:
              "An Airtable formula to filter records (e.g. \"{Status} = 'Done'\")",
          },
          maxRecords: {
            type: "string",
            description:
              "Maximum total number of records to return (default 100)",
            default: "100",
          },
          pageSize: {
            type: "string",
            description:
              "Number of records per page (default 100, max 100)",
            default: "100",
          },
          sort: {
            type: "array",
            items: {
              type: "object",
              properties: {
                field: { type: "string", description: "Field name to sort by" },
                direction: {
                  type: "string",
                  description: "Sort direction",
                  enum: ["asc", "desc"],
                },
              },
            },
            description:
              "Array of sort objects specifying field and direction",
          },
          view: {
            type: "string",
            description: "The name or ID of a view to use for filtering/sorting",
          },
          offset: {
            type: "string",
            description:
              "Pagination offset returned from a previous list request",
          },
        },
        required: ["baseId", "tableIdOrName"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          records: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                fields: { type: "object" },
                createdTime: { type: "string" },
              },
            },
          },
          offset: {
            type: "string",
            description:
              "Pass this value to the next request to fetch the next page",
          },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "airtable_create_record",
      provider: PROVIDER_NAME,
      description: "Create a new record in an Airtable table.",
      inputSchema: {
        type: "object",
        properties: {
          baseId: {
            type: "string",
            description: "The ID of the Airtable base",
          },
          tableIdOrName: {
            type: "string",
            description: "The table name or ID to create the record in",
          },
          fields: {
            type: "object",
            description:
              "An object mapping field names to their values for the new record",
            additionalProperties: true,
          },
          typecast: {
            type: "boolean",
            description:
              "If true, Airtable will try to convert string values to the appropriate cell type",
            default: false,
          },
        },
        required: ["baseId", "tableIdOrName", "fields"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          fields: { type: "object" },
          createdTime: { type: "string" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "airtable_update_record",
      provider: PROVIDER_NAME,
      description:
        "Update an existing record in an Airtable table. Only the specified fields are updated; unspecified fields remain unchanged.",
      inputSchema: {
        type: "object",
        properties: {
          baseId: {
            type: "string",
            description: "The ID of the Airtable base",
          },
          tableIdOrName: {
            type: "string",
            description: "The table name or ID containing the record",
          },
          recordId: {
            type: "string",
            description: "The ID of the record to update (e.g. recXXXXXXXXXXXXXX)",
          },
          fields: {
            type: "object",
            description:
              "An object mapping field names to their new values",
            additionalProperties: true,
          },
          typecast: {
            type: "boolean",
            description:
              "If true, Airtable will try to convert string values to the appropriate cell type",
            default: false,
          },
        },
        required: ["baseId", "tableIdOrName", "recordId", "fields"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          fields: { type: "object" },
          createdTime: { type: "string" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "airtable_get_record",
      provider: PROVIDER_NAME,
      description: "Get a single record by ID from an Airtable table.",
      inputSchema: {
        type: "object",
        properties: {
          baseId: {
            type: "string",
            description: "The ID of the Airtable base",
          },
          tableIdOrName: {
            type: "string",
            description: "The table name or ID containing the record",
          },
          recordId: {
            type: "string",
            description: "The ID of the record to retrieve (e.g. recXXXXXXXXXXXXXX)",
          },
        },
        required: ["baseId", "tableIdOrName", "recordId"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          fields: { type: "object" },
          createdTime: { type: "string" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "airtable_delete_record",
      provider: PROVIDER_NAME,
      description: "Delete a record from an Airtable table.",
      inputSchema: {
        type: "object",
        properties: {
          baseId: {
            type: "string",
            description: "The ID of the Airtable base",
          },
          tableIdOrName: {
            type: "string",
            description: "The table name or ID containing the record",
          },
          recordId: {
            type: "string",
            description: "The ID of the record to delete (e.g. recXXXXXXXXXXXXXX)",
          },
        },
        required: ["baseId", "tableIdOrName", "recordId"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          deleted: { type: "boolean" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "airtable_list_bases",
      provider: PROVIDER_NAME,
      description:
        "List all Airtable bases available to the authenticated user/token.",
      inputSchema: {
        type: "object",
        properties: {
          offset: {
            type: "string",
            description:
              "Pagination offset returned from a previous list request",
          },
        },
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          bases: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                permissionLevel: { type: "string" },
              },
            },
          },
          offset: {
            type: "string",
            description:
              "Pass this value to the next request to fetch the next page",
          },
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

function parseIntParam(value: unknown, defaultValue: number): number {
  if (value === undefined || value === null) return defaultValue;
  const parsed =
    typeof value === "string" ? parseInt(value, 10) : Number(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

async function executeListRecords(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const baseId = args.baseId as string;
    const tableIdOrName = encodeURIComponent(args.tableIdOrName as string);

    const params = new URLSearchParams();

    if (args.filterByFormula) {
      params.set("filterByFormula", args.filterByFormula as string);
    }

    const maxRecords = parseIntParam(args.maxRecords, 100);
    params.set("maxRecords", String(maxRecords));

    const pageSize = Math.min(parseIntParam(args.pageSize, 100), 100);
    params.set("pageSize", String(pageSize));

    if (args.view) {
      params.set("view", args.view as string);
    }

    if (args.offset) {
      params.set("offset", args.offset as string);
    }

    if (Array.isArray(args.fields)) {
      for (const field of args.fields as string[]) {
        params.append("fields[]", field);
      }
    }

    if (Array.isArray(args.sort)) {
      const sortArray = args.sort as Array<{
        field: string;
        direction?: string;
      }>;
      for (let i = 0; i < sortArray.length; i++) {
        params.append(`sort[${i}][field]`, sortArray[i].field);
        if (sortArray[i].direction) {
          params.append(`sort[${i}][direction]`, sortArray[i].direction!);
        }
      }
    }

    const queryString = params.toString();
    const path = `${baseId}/${tableIdOrName}${queryString ? `?${queryString}` : ""}`;

    const data = await airtableRequest<AirtableListResponse>(path);

    logger.info("Airtable: listed records", {
      baseId,
      table: args.tableIdOrName,
      count: data.records.length,
      hasMore: !!data.offset,
    });

    return {
      success: true,
      data: {
        records: data.records,
        offset: data.offset,
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Airtable: failed to list records", { error: message });
    return {
      success: false,
      error: { code: "AIRTABLE_LIST_RECORDS_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeCreateRecord(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const baseId = args.baseId as string;
    const tableIdOrName = encodeURIComponent(args.tableIdOrName as string);
    const path = `${baseId}/${tableIdOrName}`;

    const body: Record<string, unknown> = {
      fields: args.fields,
    };

    if (args.typecast === true) {
      body.typecast = true;
    }

    const data = await airtableRequest<AirtableRecordResponse>(path, {
      method: "POST",
      body,
    });

    logger.info("Airtable: created record", {
      baseId,
      table: args.tableIdOrName,
      recordId: data.id,
    });

    return {
      success: true,
      data: {
        id: data.id,
        fields: data.fields,
        createdTime: data.createdTime,
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Airtable: failed to create record", { error: message });
    return {
      success: false,
      error: { code: "AIRTABLE_CREATE_RECORD_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeUpdateRecord(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const baseId = args.baseId as string;
    const tableIdOrName = encodeURIComponent(args.tableIdOrName as string);
    const recordId = args.recordId as string;
    const path = `${baseId}/${tableIdOrName}/${recordId}`;

    const body: Record<string, unknown> = {
      fields: args.fields,
    };

    if (args.typecast === true) {
      body.typecast = true;
    }

    const data = await airtableRequest<AirtableRecordResponse>(path, {
      method: "PATCH",
      body,
    });

    logger.info("Airtable: updated record", {
      baseId,
      table: args.tableIdOrName,
      recordId: data.id,
    });

    return {
      success: true,
      data: {
        id: data.id,
        fields: data.fields,
        createdTime: data.createdTime,
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Airtable: failed to update record", { error: message });
    return {
      success: false,
      error: { code: "AIRTABLE_UPDATE_RECORD_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeGetRecord(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const baseId = args.baseId as string;
    const tableIdOrName = encodeURIComponent(args.tableIdOrName as string);
    const recordId = args.recordId as string;
    const path = `${baseId}/${tableIdOrName}/${recordId}`;

    const data = await airtableRequest<AirtableRecordResponse>(path);

    logger.info("Airtable: fetched record", {
      baseId,
      table: args.tableIdOrName,
      recordId: data.id,
    });

    return {
      success: true,
      data: {
        id: data.id,
        fields: data.fields,
        createdTime: data.createdTime,
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Airtable: failed to get record", { error: message });
    return {
      success: false,
      error: { code: "AIRTABLE_GET_RECORD_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeDeleteRecord(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const baseId = args.baseId as string;
    const tableIdOrName = encodeURIComponent(args.tableIdOrName as string);
    const recordId = args.recordId as string;
    const path = `${baseId}/${tableIdOrName}/${recordId}`;

    const data = await airtableRequest<AirtableDeleteResponse>(path, {
      method: "DELETE",
    });

    logger.info("Airtable: deleted record", {
      baseId,
      table: args.tableIdOrName,
      recordId,
      deleted: data.deleted,
    });

    return {
      success: true,
      data: {
        id: data.id ?? recordId,
        deleted: data.deleted ?? true,
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Airtable: failed to delete record", { error: message });
    return {
      success: false,
      error: { code: "AIRTABLE_DELETE_RECORD_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeListBases(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const params = new URLSearchParams();
    if (args.offset) {
      params.set("offset", args.offset as string);
    }

    const queryString = params.toString();
    const path = `bases${queryString ? `?${queryString}` : ""}`;

    const data = await airtableRequest<AirtableBasesResponse>(path, {
      baseUrl: AIRTABLE_META_API_BASE,
    });

    logger.info("Airtable: listed bases", {
      count: data.bases.length,
      hasMore: !!data.offset,
    });

    return {
      success: true,
      data: {
        bases: data.bases,
        offset: data.offset,
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Airtable: failed to list bases", { error: message });
    return {
      success: false,
      error: { code: "AIRTABLE_LIST_BASES_ERROR", message },
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
  airtable_list_records: executeListRecords,
  airtable_create_record: executeCreateRecord,
  airtable_update_record: executeUpdateRecord,
  airtable_get_record: executeGetRecord,
  airtable_delete_record: executeDeleteRecord,
  airtable_list_bases: executeListBases,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAirtableProvider(): AirtableMCPProvider {
  const tools = buildTools();

  logger.info("Airtable MCP provider created", {
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
        logger.warn("Airtable: unknown tool requested", { toolName });
        return {
          success: false,
          error: {
            code: "AIRTABLE_UNKNOWN_TOOL",
            message: `Unknown Airtable tool: ${toolName}`,
          },
          metadata: { duration: 0, cached: false },
        };
      }

      logger.debug("Airtable: executing tool", {
        toolName,
        agentId: context.agentId,
        organizationId: context.organizationId,
      });

      return executor(args, context);
    },
  };
}
