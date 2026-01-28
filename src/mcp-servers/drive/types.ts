/**
 * Google Drive MCP Types
 *
 * Type definitions for Google Drive API integration.
 * - DriveFile: File/folder representation
 * - DriveSheet: Google Sheets data
 * - MCP Tool input/output types
 */

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  parents?: string[];
  description?: string;
}

export interface DriveSheetData {
  sheetId: number;
  sheetName: string;
  headers: string[];
  rows: (string | number | boolean | null)[][];
  totalRows: number;
}

export interface ListFilesInput {
  folderId?: string;
  query?: string;
  mimeType?: string;
  pageSize?: number;
  pageToken?: string;
}

export interface ListFilesOutput {
  files: DriveFile[];
  nextPageToken?: string;
}

export interface ReadFileInput {
  fileId: string;
  mimeType?: string;
}

export interface ReadFileOutput {
  file: DriveFile;
  content: string;
  mimeType: string;
}

export interface ReadSheetInput {
  spreadsheetId: string;
  sheetName?: string;
  range?: string;
}

export interface ReadSheetOutput {
  spreadsheetId: string;
  spreadsheetTitle: string;
  sheets: DriveSheetData[];
}

export interface DriveConnection {
  id: string;
  organizationId: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  defaultFolderId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
