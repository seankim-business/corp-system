import { logger } from "../../utils/logger";
import { MCPTool, CallContext, ToolCallResult } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
  parents?: string[];
  webViewLink?: string;
  webContentLink?: string;
  owners?: Array<{ displayName: string; emailAddress: string }>;
  shared?: boolean;
  trashed?: boolean;
}

interface GoogleDriveFileList {
  files: GoogleDriveFile[];
  nextPageToken?: string;
  incompleteSearch?: boolean;
}

interface GoogleDriveSharedDrive {
  id: string;
  name: string;
  createdTime?: string;
}

interface GoogleDriveSharedDriveList {
  drives: GoogleDriveSharedDrive[];
  nextPageToken?: string;
}

interface GoogleDriveApiError {
  error?: {
    code: number;
    message: string;
    errors?: Array<{ message: string; domain: string; reason: string }>;
  };
}

// ---------------------------------------------------------------------------
// MIME type mappings for Google Docs export
// ---------------------------------------------------------------------------

const GOOGLE_DOCS_EXPORT_MIME_TYPES: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
  "application/vnd.google-apps.drawing": "image/png",
};

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface GoogleDriveMCPProvider {
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

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const PROVIDER_NAME = "google-drive";

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

function getAccessToken(): string {
  const token = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "GOOGLE_DRIVE_ACCESS_TOKEN environment variable is not set",
    );
  }
  return token;
}

async function driveApiFetch<T>(
  endpoint: string,
  options: {
    method?: string;
    params?: Record<string, string>;
    body?: unknown;
    rawResponse?: boolean;
  } = {},
): Promise<T> {
  const token = getAccessToken();
  const { method = "GET", params, body } = options;

  const url = new URL(`${DRIVE_API_BASE}${endpoint}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let errorMessage = `Google Drive API HTTP ${response.status}: ${errorBody}`;
    try {
      const parsed = JSON.parse(errorBody) as GoogleDriveApiError;
      if (parsed.error?.message) {
        errorMessage = `Google Drive API HTTP ${response.status}: ${parsed.error.message}`;
      }
    } catch {
      // Use the raw error body already assigned
    }
    throw new Error(errorMessage);
  }

  if (options.rawResponse) {
    const text = await response.text();
    return text as unknown as T;
  }

  return (await response.json()) as T;
}

async function driveApiUpload(
  endpoint: string,
  metadata: Record<string, unknown>,
  content: string,
  mimeType: string,
): Promise<GoogleDriveFile> {
  const token = getAccessToken();

  const boundary = "nubabel_boundary_" + Date.now();
  const multipartBody =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;

  const url = `https://www.googleapis.com/upload/drive/v3${endpoint}?uploadType=multipart`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let errorMessage = `Google Drive upload API HTTP ${response.status}: ${errorBody}`;
    try {
      const parsed = JSON.parse(errorBody) as GoogleDriveApiError;
      if (parsed.error?.message) {
        errorMessage = `Google Drive upload API HTTP ${response.status}: ${parsed.error.message}`;
      }
    } catch {
      // Use the raw error body already assigned
    }
    throw new Error(errorMessage);
  }

  return (await response.json()) as GoogleDriveFile;
}

async function driveApiUpdateContent(
  fileId: string,
  content: string,
  mimeType: string,
): Promise<GoogleDriveFile> {
  const token = getAccessToken();

  const url = `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`;

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": mimeType,
    },
    body: content,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let errorMessage = `Google Drive update API HTTP ${response.status}: ${errorBody}`;
    try {
      const parsed = JSON.parse(errorBody) as GoogleDriveApiError;
      if (parsed.error?.message) {
        errorMessage = `Google Drive update API HTTP ${response.status}: ${parsed.error.message}`;
      }
    } catch {
      // Use the raw error body already assigned
    }
    throw new Error(errorMessage);
  }

  return (await response.json()) as GoogleDriveFile;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const FILE_FIELDS =
  "id,name,mimeType,createdTime,modifiedTime,size,parents,webViewLink,webContentLink,owners,shared,trashed";

const DEFAULT_PERMISSIONS = {
  allowedAgents: ["all"],
};

function buildTools(): MCPTool[] {
  return [
    {
      name: "gdrive_list_files",
      provider: PROVIDER_NAME,
      description:
        "List files in Google Drive with optional query filter and pagination support.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Google Drive query string (e.g. \"mimeType='application/pdf'\" or \"'folderId' in parents\"). See Google Drive API search query documentation.",
          },
          pageSize: {
            type: "string",
            description:
              "Maximum number of files to return per page (default 100, max 1000)",
            default: "100",
          },
          pageToken: {
            type: "string",
            description:
              "Token for fetching the next page of results from a previous list call",
          },
          orderBy: {
            type: "string",
            description:
              "Sort order (e.g. \"modifiedTime desc\", \"name\", \"createdTime desc\")",
          },
          driveId: {
            type: "string",
            description:
              "ID of the shared drive to search. When set, includeItemsFromAllDrives is automatically enabled.",
          },
        },
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          files: {
            type: "array",
            items: { type: "object" },
          },
          nextPageToken: { type: "string" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "gdrive_get_file",
      provider: PROVIDER_NAME,
      description:
        "Get metadata for a specific Google Drive file by its file ID.",
      inputSchema: {
        type: "object",
        properties: {
          fileId: {
            type: "string",
            description: "The ID of the file to retrieve metadata for",
          },
        },
        required: ["fileId"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          mimeType: { type: "string" },
          createdTime: { type: "string" },
          modifiedTime: { type: "string" },
          size: { type: "string" },
          webViewLink: { type: "string" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "gdrive_search_files",
      provider: PROVIDER_NAME,
      description:
        "Search Google Drive files by name or full-text content. Supports pagination.",
      inputSchema: {
        type: "object",
        properties: {
          searchTerm: {
            type: "string",
            description: "The text to search for in file names and content",
          },
          searchIn: {
            type: "string",
            description:
              "Where to search: \"name\" for file name only, \"fullText\" for name and content (default \"fullText\")",
            enum: ["name", "fullText"],
            default: "fullText",
          },
          mimeType: {
            type: "string",
            description:
              "Filter results by MIME type (e.g. \"application/pdf\", \"application/vnd.google-apps.document\")",
          },
          pageSize: {
            type: "string",
            description:
              "Maximum number of results per page (default 100, max 1000)",
            default: "100",
          },
          pageToken: {
            type: "string",
            description:
              "Token for fetching the next page of results",
          },
        },
        required: ["searchTerm"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          files: {
            type: "array",
            items: { type: "object" },
          },
          nextPageToken: { type: "string" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "gdrive_create_file",
      provider: PROVIDER_NAME,
      description:
        "Create a new file in Google Drive. Supports plain text and Google Docs content.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The name of the file to create",
          },
          content: {
            type: "string",
            description: "The text content of the file",
          },
          mimeType: {
            type: "string",
            description:
              "MIME type of the file content (default \"text/plain\"). Use \"application/vnd.google-apps.document\" to create a Google Doc.",
            default: "text/plain",
          },
          parentFolderId: {
            type: "string",
            description:
              "ID of the parent folder. If omitted, the file is created in the root of My Drive.",
          },
          description: {
            type: "string",
            description: "A short description of the file",
          },
        },
        required: ["name", "content"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          mimeType: { type: "string" },
          webViewLink: { type: "string" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "gdrive_update_file",
      provider: PROVIDER_NAME,
      description:
        "Update the content of an existing Google Drive file. Only supports text-based content.",
      inputSchema: {
        type: "object",
        properties: {
          fileId: {
            type: "string",
            description: "The ID of the file to update",
          },
          content: {
            type: "string",
            description: "The new text content of the file",
          },
          mimeType: {
            type: "string",
            description:
              "MIME type of the content being uploaded (default \"text/plain\")",
            default: "text/plain",
          },
        },
        required: ["fileId", "content"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          mimeType: { type: "string" },
          modifiedTime: { type: "string" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "gdrive_download_file",
      provider: PROVIDER_NAME,
      description:
        "Download the text content of a Google Drive file. For Google Docs/Sheets/Slides, the file is exported to a text format automatically.",
      inputSchema: {
        type: "object",
        properties: {
          fileId: {
            type: "string",
            description: "The ID of the file to download",
          },
          exportMimeType: {
            type: "string",
            description:
              "MIME type to export Google Workspace files as (e.g. \"text/plain\", \"text/csv\", \"text/html\"). If omitted, a sensible default is chosen based on the file type.",
          },
        },
        required: ["fileId"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          content: { type: "string" },
          mimeType: { type: "string" },
          fileName: { type: "string" },
        },
      },
      requiresAuth: true,
      permissions: DEFAULT_PERMISSIONS,
    },
    {
      name: "gdrive_list_shared_drives",
      provider: PROVIDER_NAME,
      description:
        "List shared drives accessible to the authenticated user. Supports pagination.",
      inputSchema: {
        type: "object",
        properties: {
          pageSize: {
            type: "string",
            description:
              "Maximum number of shared drives to return per page (default 100, max 100)",
            default: "100",
          },
          pageToken: {
            type: "string",
            description:
              "Token for fetching the next page of results",
          },
        },
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          drives: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                createdTime: { type: "string" },
              },
            },
          },
          nextPageToken: { type: "string" },
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

function clampPageSize(value: unknown, defaultSize: number, max: number): number {
  if (value === undefined || value === null) return defaultSize;
  const parsed = typeof value === "string" ? parseInt(value, 10) : Number(value);
  return Number.isNaN(parsed) ? defaultSize : Math.min(Math.max(parsed, 1), max);
}

async function executeListFiles(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const pageSize = clampPageSize(args.pageSize, 100, 1000);
    const params: Record<string, string> = {
      pageSize: String(pageSize),
      fields: `nextPageToken,incompleteSearch,files(${FILE_FIELDS})`,
    };

    if (args.query) {
      params.q = String(args.query);
    }
    if (args.pageToken) {
      params.pageToken = String(args.pageToken);
    }
    if (args.orderBy) {
      params.orderBy = String(args.orderBy);
    }
    if (args.driveId) {
      params.driveId = String(args.driveId);
      params.corpora = "drive";
      params.includeItemsFromAllDrives = "true";
      params.supportsAllDrives = "true";
    }

    const data = await driveApiFetch<GoogleDriveFileList>("/files", { params });

    logger.info("Google Drive: listed files", {
      count: data.files.length,
      hasMore: !!data.nextPageToken,
    });

    return {
      success: true,
      data: {
        files: data.files,
        nextPageToken: data.nextPageToken ?? null,
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Google Drive: failed to list files", { error: message });
    return {
      success: false,
      error: { code: "GDRIVE_LIST_FILES_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeGetFile(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const fileId = String(args.fileId);
    const data = await driveApiFetch<GoogleDriveFile>(
      `/files/${encodeURIComponent(fileId)}`,
      {
        params: {
          fields: FILE_FIELDS,
          supportsAllDrives: "true",
        },
      },
    );

    logger.info("Google Drive: fetched file metadata", {
      fileId: data.id,
      name: data.name,
    });

    return {
      success: true,
      data,
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Google Drive: failed to get file", { error: message });
    return {
      success: false,
      error: { code: "GDRIVE_GET_FILE_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeSearchFiles(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const searchTerm = String(args.searchTerm);
    const searchIn = args.searchIn === "name" ? "name" : "fullText";
    const pageSize = clampPageSize(args.pageSize, 100, 1000);

    // Escape single quotes in the search term for the Drive API query syntax
    const escapedTerm = searchTerm.replace(/'/g, "\\'");

    let query: string;
    if (searchIn === "name") {
      query = `name contains '${escapedTerm}'`;
    } else {
      query = `fullText contains '${escapedTerm}'`;
    }

    // Optionally filter by MIME type
    if (args.mimeType) {
      const escapedMime = String(args.mimeType).replace(/'/g, "\\'");
      query += ` and mimeType = '${escapedMime}'`;
    }

    // Exclude trashed files
    query += " and trashed = false";

    const params: Record<string, string> = {
      q: query,
      pageSize: String(pageSize),
      fields: `nextPageToken,files(${FILE_FIELDS})`,
    };

    if (args.pageToken) {
      params.pageToken = String(args.pageToken);
    }

    const data = await driveApiFetch<GoogleDriveFileList>("/files", { params });

    logger.info("Google Drive: searched files", {
      searchTerm,
      searchIn,
      count: data.files.length,
      hasMore: !!data.nextPageToken,
    });

    return {
      success: true,
      data: {
        files: data.files,
        nextPageToken: data.nextPageToken ?? null,
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Google Drive: failed to search files", { error: message });
    return {
      success: false,
      error: { code: "GDRIVE_SEARCH_FILES_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeCreateFile(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const fileName = String(args.name);
    const content = String(args.content);
    const mimeType = args.mimeType ? String(args.mimeType) : "text/plain";

    const metadata: Record<string, unknown> = {
      name: fileName,
    };

    // If the target mimeType is a Google Workspace type, set it so Drive
    // converts the uploaded content into the native format.
    if (mimeType.startsWith("application/vnd.google-apps.")) {
      metadata.mimeType = mimeType;
    }

    if (args.parentFolderId) {
      metadata.parents = [String(args.parentFolderId)];
    }
    if (args.description) {
      metadata.description = String(args.description);
    }

    // Determine the upload content MIME type. When creating a Google Doc,
    // the uploaded content is plain text that Drive converts.
    const uploadMimeType = mimeType.startsWith("application/vnd.google-apps.")
      ? "text/plain"
      : mimeType;

    const file = await driveApiUpload("/files", metadata, content, uploadMimeType);

    logger.info("Google Drive: created file", {
      fileId: file.id,
      name: file.name,
      mimeType: file.mimeType,
    });

    return {
      success: true,
      data: file,
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Google Drive: failed to create file", { error: message });
    return {
      success: false,
      error: { code: "GDRIVE_CREATE_FILE_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeUpdateFile(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const fileId = String(args.fileId);
    const content = String(args.content);
    const mimeType = args.mimeType ? String(args.mimeType) : "text/plain";

    const file = await driveApiUpdateContent(fileId, content, mimeType);

    logger.info("Google Drive: updated file content", {
      fileId: file.id,
      name: file.name,
    });

    return {
      success: true,
      data: file,
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Google Drive: failed to update file", { error: message });
    return {
      success: false,
      error: { code: "GDRIVE_UPDATE_FILE_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeDownloadFile(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const fileId = String(args.fileId);

    // First, fetch file metadata to determine the MIME type
    const fileMeta = await driveApiFetch<GoogleDriveFile>(
      `/files/${encodeURIComponent(fileId)}`,
      {
        params: {
          fields: "id,name,mimeType",
          supportsAllDrives: "true",
        },
      },
    );

    const isGoogleWorkspaceFile = fileMeta.mimeType.startsWith(
      "application/vnd.google-apps.",
    );

    let content: string;
    let downloadMimeType: string;

    if (isGoogleWorkspaceFile) {
      // Export Google Workspace files
      const exportMime =
        args.exportMimeType
          ? String(args.exportMimeType)
          : GOOGLE_DOCS_EXPORT_MIME_TYPES[fileMeta.mimeType] ?? "text/plain";

      const token = getAccessToken();
      const exportUrl = new URL(
        `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}/export`,
      );
      exportUrl.searchParams.set("mimeType", exportMime);

      const response = await fetch(exportUrl.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Google Drive export API HTTP ${response.status}: ${errorBody}`,
        );
      }

      content = await response.text();
      downloadMimeType = exportMime;
    } else {
      // Download binary/text files directly via alt=media
      content = await driveApiFetch<string>(
        `/files/${encodeURIComponent(fileId)}`,
        {
          params: {
            alt: "media",
            supportsAllDrives: "true",
          },
          rawResponse: true,
        },
      );
      downloadMimeType = fileMeta.mimeType;
    }

    logger.info("Google Drive: downloaded file content", {
      fileId: fileMeta.id,
      name: fileMeta.name,
      mimeType: downloadMimeType,
      isExport: isGoogleWorkspaceFile,
      contentLength: content.length,
    });

    return {
      success: true,
      data: {
        content,
        mimeType: downloadMimeType,
        fileName: fileMeta.name,
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Google Drive: failed to download file", { error: message });
    return {
      success: false,
      error: { code: "GDRIVE_DOWNLOAD_FILE_ERROR", message },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  }
}

async function executeListSharedDrives(
  args: Record<string, unknown>,
  _context: CallContext,
): Promise<ToolCallResult> {
  const startTime = Date.now();
  try {
    const pageSize = clampPageSize(args.pageSize, 100, 100);
    const params: Record<string, string> = {
      pageSize: String(pageSize),
      fields: "nextPageToken,drives(id,name,createdTime)",
    };

    if (args.pageToken) {
      params.pageToken = String(args.pageToken);
    }

    const data = await driveApiFetch<GoogleDriveSharedDriveList>("/drives", {
      params,
    });

    logger.info("Google Drive: listed shared drives", {
      count: data.drives.length,
      hasMore: !!data.nextPageToken,
    });

    return {
      success: true,
      data: {
        drives: data.drives,
        nextPageToken: data.nextPageToken ?? null,
      },
      metadata: { duration: Date.now() - startTime, cached: false },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Google Drive: failed to list shared drives", {
      error: message,
    });
    return {
      success: false,
      error: { code: "GDRIVE_LIST_SHARED_DRIVES_ERROR", message },
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
  gdrive_list_files: executeListFiles,
  gdrive_get_file: executeGetFile,
  gdrive_search_files: executeSearchFiles,
  gdrive_create_file: executeCreateFile,
  gdrive_update_file: executeUpdateFile,
  gdrive_download_file: executeDownloadFile,
  gdrive_list_shared_drives: executeListSharedDrives,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createGoogleDriveProvider(): GoogleDriveMCPProvider {
  const tools = buildTools();

  logger.info("Google Drive MCP provider created", {
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
        logger.warn("Google Drive: unknown tool requested", { toolName });
        return {
          success: false,
          error: {
            code: "GDRIVE_UNKNOWN_TOOL",
            message: `Unknown Google Drive tool: ${toolName}`,
          },
          metadata: { duration: 0, cached: false },
        };
      }

      logger.debug("Google Drive: executing tool", {
        toolName,
        agentId: context.agentId,
        organizationId: context.organizationId,
      });

      return executor(args, context);
    },
  };
}
