/**
 * Filesystem Tools for Code Worker
 *
 * Provides secure file operations with:
 * - Path whitelisting/blacklisting
 * - Secret detection in content
 * - Size limits
 * - Rate limiting
 * - Audit logging
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface LineEdit {
  /** Text to find and replace */
  oldText: string;
  /** Replacement text */
  newText: string;
}

export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: Date;
}

export interface FilesystemTools {
  readFile(path: string, encoding?: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  editFile(path: string, edits: LineEdit[]): Promise<void>;
  listDirectory(path: string, recursive?: boolean): Promise<FileInfo[]>;
  searchFiles(pattern: string, directory: string): Promise<string[]>;
  deleteFile(path: string): Promise<void>;
}

export interface AuditLogEntry {
  operation: 'read' | 'write' | 'edit' | 'list' | 'search' | 'delete';
  path: string;
  size?: number;
  timestamp: Date;
  sessionId: string;
}

export interface FilesystemToolsConfig {
  sessionId: string;
  workspaceRoot?: string;
  maxReadSize?: number;
  maxWriteSize?: number;
  rateLimit?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_WORKSPACE_ROOT = '/workspace/repos/';
const DEFAULT_MAX_READ_SIZE = 1024 * 1024; // 1MB
const DEFAULT_MAX_WRITE_SIZE = 512 * 1024; // 500KB
const DEFAULT_RATE_LIMIT = 100; // ops per minute

/** File patterns that are always blocked */
const BLOCKED_PATTERNS = [
  /\.env$/,
  /\.env\..+$/,
  /\.key$/,
  /credentials\..+$/,
  /\.pem$/,
  /\.ssh\//,
  /\.aws\//,
  /id_rsa/,
  /id_ed25519/,
  /\.npmrc$/,
  /\.netrc$/,
];

/** Regex patterns for detecting secrets in content */
const SECRET_PATTERNS = [
  { name: 'OpenAI API Key', pattern: /sk-[a-zA-Z0-9]{20,}/ },
  { name: 'GitHub Token', pattern: /ghp_[a-zA-Z0-9]{36,}/ },
  { name: 'GitHub OAuth Token', pattern: /gho_[a-zA-Z0-9]{36,}/ },
  { name: 'GitHub App Token', pattern: /ghs_[a-zA-Z0-9]{36,}/ },
  { name: 'GitHub Refresh Token', pattern: /ghr_[a-zA-Z0-9]{36,}/ },
  { name: 'Slack Bot Token', pattern: /xoxb-[a-zA-Z0-9-]+/ },
  { name: 'Slack User Token', pattern: /xoxp-[a-zA-Z0-9-]+/ },
  { name: 'Slack App Token', pattern: /xapp-[a-zA-Z0-9-]+/ },
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'AWS Secret Key', pattern: /[a-zA-Z0-9/+=]{40}(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])/ },
  { name: 'Anthropic API Key', pattern: /sk-ant-[a-zA-Z0-9-]+/ },
  { name: 'Private Key Block', pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/ },
];

// ============================================================================
// Rate Limiter
// ============================================================================

class RateLimiter {
  private operations: number[] = [];
  private readonly limit: number;
  private readonly windowMs = 60000; // 1 minute

  constructor(limit: number) {
    this.limit = limit;
  }

  check(): void {
    const now = Date.now();
    // Remove operations outside the window
    this.operations = this.operations.filter(ts => now - ts < this.windowMs);

    if (this.operations.length >= this.limit) {
      const oldestOp = this.operations[0];
      const waitTime = Math.ceil((this.windowMs - (now - oldestOp)) / 1000);
      throw new FilesystemError(
        `Rate limit exceeded (${this.limit} ops/min). Try again in ${waitTime} seconds.`,
        'RATE_LIMIT_EXCEEDED'
      );
    }

    this.operations.push(now);
  }

  getCount(): number {
    const now = Date.now();
    this.operations = this.operations.filter(ts => now - ts < this.windowMs);
    return this.operations.length;
  }
}

// ============================================================================
// Errors
// ============================================================================

export class FilesystemError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly path?: string
  ) {
    super(message);
    this.name = 'FilesystemError';
  }
}

// ============================================================================
// Implementation
// ============================================================================

export function createFilesystemTools(config: FilesystemToolsConfig): FilesystemTools {
  const {
    sessionId,
    workspaceRoot = DEFAULT_WORKSPACE_ROOT,
    maxReadSize = DEFAULT_MAX_READ_SIZE,
    maxWriteSize = DEFAULT_MAX_WRITE_SIZE,
    rateLimit = DEFAULT_RATE_LIMIT,
  } = config;

  const rateLimiter = new RateLimiter(rateLimit);

  // --------------------------------------------------------------------------
  // Validation Helpers
  // --------------------------------------------------------------------------

  function validatePath(targetPath: string): string {
    // Resolve to absolute path
    const resolved = path.resolve(targetPath);

    // Normalize workspace root
    const normalizedRoot = path.resolve(workspaceRoot);

    // Check if path is within workspace
    if (!resolved.startsWith(normalizedRoot)) {
      throw new FilesystemError(
        `Path '${targetPath}' is outside allowed workspace '${workspaceRoot}'`,
        'PATH_NOT_ALLOWED',
        targetPath
      );
    }

    // Check against blocked patterns
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(resolved)) {
        throw new FilesystemError(
          `Path '${targetPath}' matches blocked pattern`,
          'PATH_BLOCKED',
          targetPath
        );
      }
    }

    return resolved;
  }

  function validateContentForSecrets(content: string, targetPath: string): void {
    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(content)) {
        throw new FilesystemError(
          `Content contains potential secret (${name}). Writing blocked for security.`,
          'SECRET_DETECTED',
          targetPath
        );
      }
    }
  }

  function validateSize(size: number, maxSize: number, operation: string, targetPath: string): void {
    if (size > maxSize) {
      const maxSizeKB = Math.round(maxSize / 1024);
      const actualSizeKB = Math.round(size / 1024);
      throw new FilesystemError(
        `${operation} size (${actualSizeKB}KB) exceeds limit (${maxSizeKB}KB)`,
        'SIZE_LIMIT_EXCEEDED',
        targetPath
      );
    }
  }

  // --------------------------------------------------------------------------
  // Audit Logging
  // --------------------------------------------------------------------------

  function logAudit(entry: Omit<AuditLogEntry, 'timestamp' | 'sessionId'>): void {
    const fullEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date(),
      sessionId,
    };
    console.log('[FILESYSTEM_AUDIT]', JSON.stringify(fullEntry));
  }

  // --------------------------------------------------------------------------
  // Tool Implementations
  // --------------------------------------------------------------------------

  async function readFile(targetPath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    rateLimiter.check();
    const resolvedPath = validatePath(targetPath);

    // Check file size before reading
    const stats = await fs.stat(resolvedPath).catch((err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        throw new FilesystemError(
          `File not found: '${targetPath}'`,
          'FILE_NOT_FOUND',
          targetPath
        );
      }
      throw err;
    });

    if (stats.isDirectory()) {
      throw new FilesystemError(
        `Cannot read directory as file: '${targetPath}'`,
        'IS_DIRECTORY',
        targetPath
      );
    }

    validateSize(stats.size, maxReadSize, 'Read', targetPath);

    const content = await fs.readFile(resolvedPath, encoding);

    logAudit({
      operation: 'read',
      path: resolvedPath,
      size: stats.size,
    });

    return content;
  }

  async function writeFile(targetPath: string, content: string): Promise<void> {
    rateLimiter.check();
    const resolvedPath = validatePath(targetPath);

    // Validate content size
    const contentSize = Buffer.byteLength(content, 'utf-8');
    validateSize(contentSize, maxWriteSize, 'Write', targetPath);

    // Scan for secrets
    validateContentForSecrets(content, targetPath);

    // Ensure parent directory exists
    const parentDir = path.dirname(resolvedPath);
    await fs.mkdir(parentDir, { recursive: true });

    await fs.writeFile(resolvedPath, content, 'utf-8');

    logAudit({
      operation: 'write',
      path: resolvedPath,
      size: contentSize,
    });
  }

  async function editFile(targetPath: string, edits: LineEdit[]): Promise<void> {
    rateLimiter.check();
    const resolvedPath = validatePath(targetPath);

    if (edits.length === 0) {
      throw new FilesystemError(
        'No edits provided',
        'INVALID_EDITS',
        targetPath
      );
    }

    // Read current content
    let content = await readFile(targetPath);

    // Apply each edit
    for (const edit of edits) {
      if (!edit.oldText) {
        throw new FilesystemError(
          'Edit oldText cannot be empty',
          'INVALID_EDIT',
          targetPath
        );
      }

      if (!content.includes(edit.oldText)) {
        throw new FilesystemError(
          `Text to replace not found in file: "${edit.oldText.substring(0, 50)}${edit.oldText.length > 50 ? '...' : ''}"`,
          'TEXT_NOT_FOUND',
          targetPath
        );
      }

      // Check for secrets in new text
      validateContentForSecrets(edit.newText, targetPath);

      content = content.replace(edit.oldText, edit.newText);
    }

    // Validate final size
    const contentSize = Buffer.byteLength(content, 'utf-8');
    validateSize(contentSize, maxWriteSize, 'Write', targetPath);

    await fs.writeFile(resolvedPath, content, 'utf-8');

    logAudit({
      operation: 'edit',
      path: resolvedPath,
      size: contentSize,
    });
  }

  async function listDirectory(targetPath: string, recursive = false): Promise<FileInfo[]> {
    rateLimiter.check();
    const resolvedPath = validatePath(targetPath);

    const stats = await fs.stat(resolvedPath).catch((err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        throw new FilesystemError(
          `Directory not found: '${targetPath}'`,
          'DIR_NOT_FOUND',
          targetPath
        );
      }
      throw err;
    });

    if (!stats.isDirectory()) {
      throw new FilesystemError(
        `Path is not a directory: '${targetPath}'`,
        'NOT_DIRECTORY',
        targetPath
      );
    }

    const results: FileInfo[] = [];

    async function scanDir(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);

        // Skip blocked paths silently
        try {
          validatePath(entryPath);
        } catch {
          continue;
        }

        const entryStats = await fs.stat(entryPath);

        results.push({
          name: entry.name,
          path: entryPath,
          isDirectory: entry.isDirectory(),
          size: entryStats.size,
          modifiedAt: entryStats.mtime,
        });

        if (recursive && entry.isDirectory()) {
          await scanDir(entryPath);
        }
      }
    }

    await scanDir(resolvedPath);

    logAudit({
      operation: 'list',
      path: resolvedPath,
    });

    return results;
  }

  async function searchFiles(pattern: string, directory: string): Promise<string[]> {
    rateLimiter.check();
    const resolvedDir = validatePath(directory);

    // Validate pattern
    let regex: RegExp;
    try {
      // Convert glob-like pattern to regex
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      regex = new RegExp(regexPattern, 'i');
    } catch {
      throw new FilesystemError(
        `Invalid search pattern: '${pattern}'`,
        'INVALID_PATTERN',
        directory
      );
    }

    const matches: string[] = [];

    async function searchDir(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);

        // Skip blocked paths silently
        try {
          validatePath(entryPath);
        } catch {
          continue;
        }

        if (entry.isDirectory()) {
          await searchDir(entryPath);
        } else if (regex.test(entry.name)) {
          matches.push(entryPath);
        }
      }
    }

    await searchDir(resolvedDir);

    logAudit({
      operation: 'search',
      path: resolvedDir,
    });

    return matches;
  }

  async function deleteFile(targetPath: string): Promise<void> {
    rateLimiter.check();
    const resolvedPath = validatePath(targetPath);

    const stats = await fs.stat(resolvedPath).catch((err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        throw new FilesystemError(
          `File not found: '${targetPath}'`,
          'FILE_NOT_FOUND',
          targetPath
        );
      }
      throw err;
    });

    if (stats.isDirectory()) {
      throw new FilesystemError(
        `Cannot delete directory with deleteFile: '${targetPath}'. Use deleteDirectory instead.`,
        'IS_DIRECTORY',
        targetPath
      );
    }

    await fs.unlink(resolvedPath);

    logAudit({
      operation: 'delete',
      path: resolvedPath,
      size: stats.size,
    });
  }

  return {
    readFile,
    writeFile,
    editFile,
    listDirectory,
    searchFiles,
    deleteFile,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a path would be allowed (for pre-validation)
 */
export function isPathAllowed(
  targetPath: string,
  workspaceRoot: string = DEFAULT_WORKSPACE_ROOT
): boolean {
  try {
    const resolved = path.resolve(targetPath);
    const normalizedRoot = path.resolve(workspaceRoot);

    if (!resolved.startsWith(normalizedRoot)) {
      return false;
    }

    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(resolved)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Scan content for secrets (for pre-validation)
 */
export function containsSecrets(content: string): { hasSecrets: boolean; types: string[] } {
  const detectedTypes: string[] = [];

  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      detectedTypes.push(name);
    }
  }

  return {
    hasSecrets: detectedTypes.length > 0,
    types: detectedTypes,
  };
}

// ============================================================================
// Export defaults for testing
// ============================================================================

export const DEFAULTS = {
  WORKSPACE_ROOT: DEFAULT_WORKSPACE_ROOT,
  MAX_READ_SIZE: DEFAULT_MAX_READ_SIZE,
  MAX_WRITE_SIZE: DEFAULT_MAX_WRITE_SIZE,
  RATE_LIMIT: DEFAULT_RATE_LIMIT,
  BLOCKED_PATTERNS,
  SECRET_PATTERNS,
} as const;
