/**
 * Google Sheets Resource Provider
 * Adapter for Google Sheets spreadsheets
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

const SHEETS_API_BASE = "https://sheets.googleapis.com/v4";
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

/**
 * Infer field type from sample values
 */
function inferFieldType(values: unknown[]): ExternalField["type"] {
  const nonEmpty = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (nonEmpty.length === 0) return "string";

  // Check first few non-empty values
  const samples = nonEmpty.slice(0, 5);

  // Check if all are numbers
  if (samples.every((v) => !isNaN(Number(v)))) {
    return "number";
  }

  // Check if all are booleans
  if (samples.every((v) => ["true", "false", "yes", "no", "1", "0"].includes(String(v).toLowerCase()))) {
    return "boolean";
  }

  // Check if all look like dates
  const datePattern = /^\d{4}-\d{2}-\d{2}|^\d{1,2}\/\d{1,2}\/\d{2,4}/;
  if (samples.every((v) => datePattern.test(String(v)))) {
    return "date";
  }

  return "string";
}

/**
 * Make authenticated request to Google API
 */
async function googleRequest(
  ctx: ProviderContext,
  baseUrl: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<unknown> {
  const token = ctx.credentials.accessToken as string;

  if (!token) {
    throw new Error("Google access token not found in credentials");
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    logger.error("Google API error", {
      status: response.status,
      endpoint,
      error,
    });
    throw new Error(`Google API error: ${response.status} - ${JSON.stringify(error)}`);
  }

  return response.json();
}

/**
 * Google Sheets Resource Provider Implementation
 */
class GoogleSheetsResourceProvider implements ResourceProviderAdapter {
  readonly providerType = ResourceProviderType.google_sheets;
  readonly displayName = "Google Sheets";

  async validateConnection(ctx: ProviderContext): Promise<boolean> {
    try {
      // Try to list files to verify token is valid
      await googleRequest(ctx, DRIVE_API_BASE, "/files?pageSize=1");
      return true;
    } catch (error) {
      logger.error("Google Sheets connection validation failed", { error });
      return false;
    }
  }

  async detectSchema(ctx: ProviderContext, resourceId: string): Promise<ExternalResourceSchema> {
    // Parse resourceId - format: "spreadsheetId" or "spreadsheetId:sheetName"
    const [spreadsheetId, sheetName] = resourceId.split(":");

    // Get spreadsheet metadata
    const spreadsheet = (await googleRequest(
      ctx,
      SHEETS_API_BASE,
      `/spreadsheets/${spreadsheetId}?includeGridData=false`
    )) as {
      properties: { title: string };
      sheets: Array<{ properties: { title: string; sheetId: number } }>;
    };

    // Determine which sheet to use
    const targetSheet = sheetName
      ? spreadsheet.sheets.find((s) => s.properties.title === sheetName)
      : spreadsheet.sheets[0];

    if (!targetSheet) {
      throw new Error(`Sheet "${sheetName || "first sheet"}" not found`);
    }

    const targetSheetName = targetSheet.properties.title;

    // Get header row and sample data
    const range = `'${targetSheetName}'!A1:Z100`;
    const data = (await googleRequest(
      ctx,
      SHEETS_API_BASE,
      `/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`
    )) as { values?: string[][] };

    if (!data.values || data.values.length === 0) {
      return {
        resourceId,
        resourceName: `${spreadsheet.properties.title} - ${targetSheetName}`,
        fields: [],
        sampleData: [],
      };
    }

    const [headers, ...rows] = data.values;

    // Infer field types from data
    const fields: ExternalField[] = headers.map((header, index) => {
      const columnValues = rows.map((row) => row[index]);
      return {
        name: header || `Column ${index + 1}`,
        type: inferFieldType(columnValues),
        required: false,
      };
    });

    // Convert sample rows to objects
    const sampleData = rows.slice(0, 3).map((row) => {
      const record: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        record[header || `Column ${index + 1}`] = row[index] ?? null;
      });
      return record;
    });

    return {
      resourceId,
      resourceName: `${spreadsheet.properties.title} - ${targetSheetName}`,
      fields,
      sampleData,
      metadata: {
        spreadsheetId,
        sheetName: targetSheetName,
        sheetId: targetSheet.properties.sheetId,
      },
    };
  }

  async listResources(ctx: ProviderContext, options?: ListResourcesOptions): Promise<ResourceList> {
    const params = new URLSearchParams({
      q: "mimeType='application/vnd.google-apps.spreadsheet'",
      pageSize: String(options?.limit || 50),
      fields: "files(id,name,modifiedTime,webViewLink),nextPageToken",
    });
    if (options?.cursor) {
      params.set("pageToken", options.cursor);
    }

    const response = (await googleRequest(ctx, DRIVE_API_BASE, `/files?${params}`)) as {
      files: Array<{
        id: string;
        name: string;
        modifiedTime: string;
        webViewLink: string;
      }>;
      nextPageToken?: string;
    };

    return {
      resources: response.files.map((file) => ({
        id: file.id,
        name: file.name,
        type: "spreadsheet",
        url: file.webViewLink,
        lastModified: new Date(file.modifiedTime),
      })),
      hasMore: !!response.nextPageToken,
      cursor: response.nextPageToken,
    };
  }

  async fetchRecords(
    ctx: ProviderContext,
    resourceId: string,
    options?: FetchRecordsOptions
  ): Promise<RecordList> {
    const [spreadsheetId, sheetName] = resourceId.split(":");

    // Get sheet name if not provided
    let targetSheetName = sheetName;
    if (!targetSheetName) {
      const spreadsheet = (await googleRequest(
        ctx,
        SHEETS_API_BASE,
        `/spreadsheets/${spreadsheetId}?includeGridData=false`
      )) as { sheets: Array<{ properties: { title: string } }> };
      targetSheetName = spreadsheet.sheets[0]?.properties.title || "Sheet1";
    }

    // Calculate range based on options
    const startRow = (options?.cursor ? parseInt(options.cursor, 10) : 1) + 1; // +1 for header
    const endRow = startRow + (options?.limit || 100) - 1;
    const range = `'${targetSheetName}'!A1:Z1,'${targetSheetName}'!A${startRow}:Z${endRow}`;

    const response = (await googleRequest(
      ctx,
      SHEETS_API_BASE,
      `/spreadsheets/${spreadsheetId}/values:batchGet?ranges=${encodeURIComponent(range)}`
    )) as {
      valueRanges: Array<{ values?: string[][] }>;
    };

    const headers = response.valueRanges[0]?.values?.[0] || [];
    const rows = response.valueRanges[1]?.values || [];

    const records: ExternalRecord[] = rows.map((row, index) => {
      const data: Record<string, unknown> = {};
      headers.forEach((header, colIndex) => {
        data[header || `Column ${colIndex + 1}`] = row[colIndex] ?? null;
      });
      return {
        id: `row_${startRow + index}`,
        data,
      };
    });

    return {
      records,
      hasMore: rows.length === (options?.limit || 100),
      cursor: rows.length > 0 ? String(startRow + rows.length - 1) : undefined,
    };
  }

  async createRecord(
    ctx: ProviderContext,
    resourceId: string,
    data: Record<string, unknown>
  ): Promise<ExternalRecord> {
    const [spreadsheetId, sheetName] = resourceId.split(":");

    // Get headers first
    const schema = await this.detectSchema(ctx, resourceId);
    const headers = schema.fields.map((f) => f.name);
    const targetSheetName = (schema.metadata?.sheetName as string) || sheetName || "Sheet1";

    // Build row in header order
    const row = headers.map((header) => data[header] ?? "");

    await googleRequest(
      ctx,
      SHEETS_API_BASE,
      `/spreadsheets/${spreadsheetId}/values/'${targetSheetName}'!A:Z:append?valueInputOption=USER_ENTERED`,
      {
        method: "POST",
        body: JSON.stringify({ values: [row] }),
      }
    );

    // Return the created record (we don't get the row number back directly)
    return {
      id: `row_new_${Date.now()}`,
      data,
      createdAt: new Date(),
    };
  }

  async updateRecord(
    ctx: ProviderContext,
    resourceId: string,
    recordId: string,
    data: Record<string, unknown>
  ): Promise<ExternalRecord> {
    const [spreadsheetId, sheetName] = resourceId.split(":");

    // Extract row number from recordId (format: row_N)
    const rowMatch = recordId.match(/row_(\d+)/);
    if (!rowMatch) {
      throw new Error(`Invalid record ID format: ${recordId}`);
    }
    const rowNumber = parseInt(rowMatch[1], 10);

    // Get headers
    const schema = await this.detectSchema(ctx, resourceId);
    const headers = schema.fields.map((f) => f.name);
    const targetSheetName = (schema.metadata?.sheetName as string) || sheetName || "Sheet1";

    // Build row in header order
    const row = headers.map((header) => data[header] ?? "");
    const range = `'${targetSheetName}'!A${rowNumber}:${String.fromCharCode(64 + headers.length)}${rowNumber}`;

    await googleRequest(
      ctx,
      SHEETS_API_BASE,
      `/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        body: JSON.stringify({ values: [row] }),
      }
    );

    return {
      id: recordId,
      data,
      updatedAt: new Date(),
    };
  }

  parseResourceUrl(url: string): { resourceId: string; type?: string } | null {
    // Match Google Sheets URLs:
    // https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/...
    const pattern = /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/;
    const match = url.match(pattern);

    if (match) {
      // Check for sheet ID in URL fragment
      const gidMatch = url.match(/gid=(\d+)/);
      if (gidMatch) {
        // We'd need to look up sheet name from gid, for now just return spreadsheet ID
        return { resourceId: match[1], type: "spreadsheet" };
      }
      return { resourceId: match[1], type: "spreadsheet" };
    }

    return null;
  }
}

export const googleSheetsProvider = new GoogleSheetsResourceProvider();
