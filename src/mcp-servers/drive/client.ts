import { google, drive_v3, sheets_v4 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { getCircuitBreaker } from "../../utils/circuit-breaker";
import { acquireMcpClient, isTokenExpired } from "../../services/mcp-registry";
import { recordMcpToolCall } from "../../services/metrics";
import { trace, SpanStatusCode, Span } from "@opentelemetry/api";
import { MCPConnection } from "../../orchestrator/types";
import { decrypt } from "../../utils/encryption";
import { DriveFile, DriveSheetData } from "./types";
import { db as prisma } from "../../db/client";

const tracer = trace.getTracer("mcp-drive");

const formatToolSpanName = (toolName: string): string =>
  toolName.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();

export class DriveClient {
  private drive: drive_v3.Drive;
  private sheets: sheets_v4.Sheets;
  private oauth2Client: OAuth2Client;
  private connectionId?: string;
  private expiresAt?: Date | null;
  private organizationId?: string;
  private userId?: string;
  private circuitBreaker = getCircuitBreaker("drive-api", {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 60000,
  });

  constructor(
    accessToken: string,
    options?: {
      connectionId?: string;
      expiresAt?: Date | null;
      organizationId?: string;
      userId?: string;
      refreshToken?: string | null;
    },
  ) {
    this.oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    );

    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: options?.refreshToken ?? undefined,
    });

    this.drive = google.drive({ version: "v3", auth: this.oauth2Client });
    this.sheets = google.sheets({ version: "v4", auth: this.oauth2Client });
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

    const refreshed = await this.refreshDriveToken(this.connectionId);
    this.oauth2Client.setCredentials({
      access_token: refreshed.accessToken,
      refresh_token: refreshed.refreshToken ?? undefined,
    });
    this.expiresAt = refreshed.expiresAt ?? null;
  }

  private async refreshDriveToken(connectionId: string): Promise<{
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: Date | null;
  }> {
    const connection = await (prisma as any).driveConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new Error(`Drive connection not found: ${connectionId}`);
    }

    if (!connection.refreshToken) {
      throw new Error(`Missing refresh token for Drive connection ${connectionId}`);
    }

    const refreshToken = decrypt(connection.refreshToken);
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });

    const { credentials } = await this.oauth2Client.refreshAccessToken();
    const expiresAt = credentials.expiry_date ? new Date(credentials.expiry_date) : null;

    await (prisma as any).driveConnection.update({
      where: { id: connectionId },
      data: {
        accessToken: credentials.access_token!,
        expiresAt,
      },
    });

    return {
      accessToken: credentials.access_token!,
      refreshToken: connection.refreshToken,
      expiresAt,
    };
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
    const spanName = `mcp.drive.${formatToolSpanName(toolName)}`;
    const environment = process.env.NODE_ENV || "development";

    return tracer.startActiveSpan(spanName, async (span) => {
      try {
        span.setAttribute("mcp.provider", "drive");
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
          provider: "drive",
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
          provider: "drive",
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

  async listFiles(
    folderId?: string,
    query?: string,
    mimeType?: string,
    pageSize = 50,
    pageToken?: string,
  ): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
    return this.executeWithMetrics(
      "listFiles",
      {
        ...(folderId ? { "drive.folder_id": folderId } : {}),
        "drive.page_size": pageSize,
      },
      async () => {
        const qParts: string[] = [];

        if (folderId) {
          qParts.push(`'${folderId}' in parents`);
        }

        if (mimeType) {
          qParts.push(`mimeType='${mimeType}'`);
        }

        if (query) {
          qParts.push(`name contains '${query}'`);
        }

        qParts.push("trashed=false");

        const response = await this.drive.files.list({
          q: qParts.join(" and "),
          pageSize,
          pageToken,
          fields:
            "nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, parents, description)",
        });

        const files: DriveFile[] = (response.data.files || []).map((file) => ({
          id: file.id!,
          name: file.name!,
          mimeType: file.mimeType!,
          size: file.size ?? undefined,
          createdTime: file.createdTime ?? undefined,
          modifiedTime: file.modifiedTime ?? undefined,
          webViewLink: file.webViewLink ?? undefined,
          webContentLink: file.webContentLink ?? undefined,
          parents: file.parents ?? undefined,
          description: file.description ?? undefined,
        }));

        return {
          files,
          nextPageToken: response.data.nextPageToken ?? undefined,
        };
      },
      (result, span) => {
        span.setAttribute("result.count", result.files.length);
      },
    );
  }

  async readFile(fileId: string): Promise<{ file: DriveFile; content: string; mimeType: string }> {
    return this.executeWithMetrics(
      "readFile",
      {
        "drive.file_id": fileId,
      },
      async () => {
        const metadataResponse = await this.drive.files.get({
          fileId,
          fields:
            "id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, parents, description",
        });

        const file: DriveFile = {
          id: metadataResponse.data.id!,
          name: metadataResponse.data.name!,
          mimeType: metadataResponse.data.mimeType!,
          size: metadataResponse.data.size ?? undefined,
          createdTime: metadataResponse.data.createdTime ?? undefined,
          modifiedTime: metadataResponse.data.modifiedTime ?? undefined,
          webViewLink: metadataResponse.data.webViewLink ?? undefined,
          webContentLink: metadataResponse.data.webContentLink ?? undefined,
          parents: metadataResponse.data.parents ?? undefined,
          description: metadataResponse.data.description ?? undefined,
        };

        let content = "";
        let exportMimeType = file.mimeType;

        if (file.mimeType === "application/vnd.google-apps.document") {
          const exportResponse = await this.drive.files.export({
            fileId,
            mimeType: "text/plain",
          });
          content = exportResponse.data as string;
          exportMimeType = "text/plain";
        } else if (file.mimeType === "application/vnd.google-apps.spreadsheet") {
          const exportResponse = await this.drive.files.export({
            fileId,
            mimeType: "text/csv",
          });
          content = exportResponse.data as string;
          exportMimeType = "text/csv";
        } else if (file.mimeType === "application/vnd.google-apps.presentation") {
          const exportResponse = await this.drive.files.export({
            fileId,
            mimeType: "text/plain",
          });
          content = exportResponse.data as string;
          exportMimeType = "text/plain";
        } else if (file.mimeType.startsWith("text/") || file.mimeType === "application/json") {
          const contentResponse = await this.drive.files.get({
            fileId,
            alt: "media",
          });
          content = contentResponse.data as string;
        } else {
          content = `[Binary file: ${file.name}]`;
        }

        return { file, content, mimeType: exportMimeType };
      },
      (_result, span) => {
        span.setAttribute("result.file_id", fileId);
      },
    );
  }

  async readSheet(
    spreadsheetId: string,
    sheetName?: string,
    range?: string,
  ): Promise<{ spreadsheetId: string; spreadsheetTitle: string; sheets: DriveSheetData[] }> {
    return this.executeWithMetrics(
      "readSheet",
      {
        "drive.spreadsheet_id": spreadsheetId,
        ...(sheetName ? { "drive.sheet_name": sheetName } : {}),
      },
      async () => {
        const spreadsheetResponse = await this.sheets.spreadsheets.get({
          spreadsheetId,
          includeGridData: false,
        });

        const spreadsheetTitle = spreadsheetResponse.data.properties?.title || "Untitled";
        const sheetsList = spreadsheetResponse.data.sheets || [];

        const sheetsToRead = sheetName
          ? sheetsList.filter((s) => s.properties?.title === sheetName)
          : sheetsList;

        const sheetDataPromises = sheetsToRead.map(async (sheet) => {
          const title = sheet.properties?.title || "Sheet";
          const sheetId = sheet.properties?.sheetId || 0;
          const readRange = range ? `${title}!${range}` : title;

          const valuesResponse = await this.sheets.spreadsheets.values.get({
            spreadsheetId,
            range: readRange,
          });

          const values = valuesResponse.data.values || [];
          const headers = values.length > 0 ? (values[0] as string[]) : [];
          const rows = values.slice(1);

          return {
            sheetId,
            sheetName: title,
            headers,
            rows,
            totalRows: rows.length,
          };
        });

        const sheets = await Promise.all(sheetDataPromises);

        return {
          spreadsheetId,
          spreadsheetTitle,
          sheets,
        };
      },
      (result, span) => {
        span.setAttribute("result.sheet_count", result.sheets.length);
      },
    );
  }

  async testConnection(): Promise<{ success: boolean; email?: string }> {
    return this.executeWithMetrics(
      "testConnection",
      {},
      async () => {
        const response = await this.drive.about.get({
          fields: "user(emailAddress)",
        });

        return {
          success: true,
          email: response.data.user?.emailAddress ?? undefined,
        };
      },
      (_result, span) => {
        span.setAttribute("result.success", true);
      },
    );
  }
}

type DriveClientFactoryOptions = {
  accessToken: string;
  refreshToken?: string | null;
  connection?: MCPConnection;
  organizationId?: string;
  userId?: string;
  expiresAt?: Date | null;
  connectionId?: string;
};

const resolveDriveToken = (accessToken: string, connection?: MCPConnection): string => {
  if (connection?.config?.accessToken) {
    return decrypt(connection.config.accessToken as string);
  }
  return decrypt(accessToken);
};

export async function getDriveClient(
  options: DriveClientFactoryOptions,
): Promise<{ client: DriveClient; release: () => void }> {
  const organizationId = options.connection?.organizationId ?? options.organizationId;
  const token = resolveDriveToken(options.accessToken, options.connection);

  if (!organizationId) {
    return {
      client: new DriveClient(token, {
        connectionId: options.connectionId ?? options.connection?.id,
        expiresAt: options.expiresAt ?? options.connection?.expiresAt ?? null,
        organizationId: options.organizationId,
        userId: options.userId,
        refreshToken: options.refreshToken,
      }),
      release: () => undefined,
    };
  }

  const credentials = {
    accessToken: token,
    refreshToken: options.refreshToken ?? options.connection?.refreshToken ?? null,
  };

  const { client, release } = await acquireMcpClient({
    provider: "drive",
    organizationId,
    credentials,
    createClient: () =>
      new DriveClient(token, {
        connectionId: options.connectionId ?? options.connection?.id,
        expiresAt: options.expiresAt ?? options.connection?.expiresAt ?? null,
        organizationId,
        userId: options.userId,
        refreshToken: options.refreshToken,
      }),
  });

  client.setContext({
    connectionId: options.connectionId ?? options.connection?.id,
    expiresAt: options.expiresAt ?? options.connection?.expiresAt ?? null,
    organizationId,
    userId: options.userId,
  });

  return { client, release };
}
