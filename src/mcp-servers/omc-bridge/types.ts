/**
 * OMC Bridge MCP Server Types
 *
 * TypeScript interfaces and Zod schemas for the OMC Bridge integration.
 * Defines communication protocols, tool configurations, and response types.
 */

import { z } from "zod";

// ============================================
// PROTOCOL DEFINITIONS
// ============================================

/**
 * Supported OMC runtime communication protocols
 */
export const OmcProtocolSchema = z.enum(["sse", "stdio", "websocket"]);
export type OmcProtocol = z.infer<typeof OmcProtocolSchema>;

// ============================================
// TOOL CONFIGURATION
// ============================================

/**
 * Schema for individual OMC tool configuration
 */
export const ToolConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  category: z.enum(["lsp", "ast", "repl", "file", "search"]),
  inputSchema: z.record(z.unknown()),
  defaultTimeoutMs: z.number().positive().default(30000),
  requiresApproval: z.boolean().default(false),
  estimatedTokens: z.number().nonnegative().default(100),
});
export type ToolConfig = z.infer<typeof ToolConfigSchema>;

/**
 * OMC Bridge server configuration schema
 */
export const OmcBridgeConfigSchema = z.object({
  // Connection settings
  omcRuntimeUrl: z.string().url().default("http://localhost:3100"),
  protocol: OmcProtocolSchema.default("sse"),

  // Authentication
  apiKey: z.string().optional(),

  // Timeouts
  connectionTimeoutMs: z.number().positive().default(5000),
  requestTimeoutMs: z.number().positive().default(30000),
  healthCheckIntervalMs: z.number().positive().default(30000),

  // Retry settings
  maxRetries: z.number().nonnegative().default(3),
  retryDelayMs: z.number().positive().default(1000),

  // Tool filtering
  enabledTools: z.array(z.string()).optional(),
  disabledTools: z.array(z.string()).optional(),

  // Rate limiting
  maxConcurrentCalls: z.number().positive().default(10),
  rateLimitPerMinute: z.number().positive().default(60),

  // Logging
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  logToolCalls: z.boolean().default(true),
});
export type OmcBridgeConfig = z.infer<typeof OmcBridgeConfigSchema>;

// ============================================
// TOOL CALL REQUEST/RESPONSE
// ============================================

/**
 * Request payload for OMC tool execution
 */
export interface OmcToolCallRequest {
  /** Unique request identifier for tracking */
  requestId: string;

  /** Tool name (e.g., 'lsp_hover', 'ast_grep_search') */
  toolName: string;

  /** Tool input arguments */
  arguments: Record<string, unknown>;

  /** Organization ID for multi-tenancy */
  organizationId: string;

  /** Optional user ID for audit */
  userId?: string;

  /** Optional timeout override in milliseconds */
  timeoutMs?: number;

  /** Request metadata */
  metadata?: {
    sessionId?: string;
    workflowId?: string;
    correlationId?: string;
  };
}

/**
 * Response payload from OMC tool execution
 */
export interface OmcToolCallResponse {
  /** Request identifier matching the request */
  requestId: string;

  /** Execution status */
  status: "success" | "error" | "timeout" | "cancelled";

  /** Tool result data (when successful) */
  result?: unknown;

  /** Error information (when failed) */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };

  /** Execution metadata */
  metadata: {
    /** Execution duration in milliseconds */
    durationMs: number;

    /** Estimated token usage */
    estimatedTokens?: number;

    /** Whether result was cached */
    cached?: boolean;

    /** OMC runtime version */
    runtimeVersion?: string;
  };
}

// ============================================
// HEALTH STATUS
// ============================================

/**
 * Connection state for health monitoring
 */
export type OmcConnectionState = "connected" | "disconnected" | "connecting" | "error";

/**
 * Health status for the OMC bridge
 */
export interface OmcHealthStatus {
  /** Current connection state */
  state: OmcConnectionState;

  /** Whether the bridge is healthy */
  healthy: boolean;

  /** Last successful health check timestamp */
  lastHealthCheck?: Date;

  /** Last error encountered */
  lastError?: {
    message: string;
    timestamp: Date;
    code?: string;
  };

  /** Connection statistics */
  stats: {
    /** Total tool calls since startup */
    totalCalls: number;

    /** Successful calls */
    successfulCalls: number;

    /** Failed calls */
    failedCalls: number;

    /** Timed out calls */
    timedOutCalls: number;

    /** Average response time in ms */
    avgResponseTimeMs: number;

    /** Current active connections */
    activeConnections: number;

    /** Uptime in seconds */
    uptimeSeconds: number;
  };

  /** Available tools */
  availableTools: string[];

  /** OMC runtime version if available */
  runtimeVersion?: string;
}

// ============================================
// TOOL CATEGORY TYPES
// ============================================

/**
 * LSP tool category types
 */
export type LspToolName =
  | "lsp_hover"
  | "lsp_goto_definition"
  | "lsp_find_references"
  | "lsp_document_symbols"
  | "lsp_workspace_symbols"
  | "lsp_diagnostics"
  | "lsp_diagnostics_directory"
  | "lsp_prepare_rename"
  | "lsp_rename"
  | "lsp_code_actions"
  | "lsp_code_action_resolve"
  | "lsp_servers";

/**
 * AST tool category types
 */
export type AstToolName = "ast_grep_search" | "ast_grep_replace";

/**
 * REPL tool category types
 */
export type ReplToolName = "python_repl";

/**
 * All OMC tool names
 */
export type OmcToolName = LspToolName | AstToolName | ReplToolName;

// ============================================
// INPUT SCHEMAS FOR TOOLS
// ============================================

/**
 * Common file position input
 */
export const FilePositionSchema = z.object({
  filePath: z.string().min(1).describe("Absolute path to the file"),
  line: z.number().int().nonnegative().describe("Line number (0-indexed)"),
  character: z.number().int().nonnegative().describe("Character position (0-indexed)"),
});
export type FilePosition = z.infer<typeof FilePositionSchema>;

/**
 * LSP Hover input schema
 */
export const LspHoverInputSchema = z.object({
  filePath: z.string().min(1),
  line: z.number().int().nonnegative(),
  character: z.number().int().nonnegative(),
});
export type LspHoverInput = z.infer<typeof LspHoverInputSchema>;

/**
 * LSP Goto Definition input schema
 */
export const LspGotoDefinitionInputSchema = z.object({
  filePath: z.string().min(1),
  line: z.number().int().nonnegative(),
  character: z.number().int().nonnegative(),
});
export type LspGotoDefinitionInput = z.infer<typeof LspGotoDefinitionInputSchema>;

/**
 * LSP Find References input schema
 */
export const LspFindReferencesInputSchema = z.object({
  filePath: z.string().min(1),
  line: z.number().int().nonnegative(),
  character: z.number().int().nonnegative(),
  includeDeclaration: z.boolean().optional().default(true),
});
export type LspFindReferencesInput = z.infer<typeof LspFindReferencesInputSchema>;

/**
 * LSP Document Symbols input schema
 */
export const LspDocumentSymbolsInputSchema = z.object({
  filePath: z.string().min(1),
});
export type LspDocumentSymbolsInput = z.infer<typeof LspDocumentSymbolsInputSchema>;

/**
 * LSP Workspace Symbols input schema
 */
export const LspWorkspaceSymbolsInputSchema = z.object({
  query: z.string().describe("Symbol search query"),
  limit: z.number().int().positive().optional().default(50),
});
export type LspWorkspaceSymbolsInput = z.infer<typeof LspWorkspaceSymbolsInputSchema>;

/**
 * LSP Diagnostics input schema
 */
export const LspDiagnosticsInputSchema = z.object({
  filePath: z.string().min(1),
});
export type LspDiagnosticsInput = z.infer<typeof LspDiagnosticsInputSchema>;

/**
 * LSP Diagnostics Directory input schema
 */
export const LspDiagnosticsDirectoryInputSchema = z.object({
  directoryPath: z.string().min(1),
  strategy: z.enum(["auto", "tsc", "lsp"]).optional().default("auto"),
  includeWarnings: z.boolean().optional().default(true),
});
export type LspDiagnosticsDirectoryInput = z.infer<typeof LspDiagnosticsDirectoryInputSchema>;

/**
 * LSP Prepare Rename input schema
 */
export const LspPrepareRenameInputSchema = z.object({
  filePath: z.string().min(1),
  line: z.number().int().nonnegative(),
  character: z.number().int().nonnegative(),
});
export type LspPrepareRenameInput = z.infer<typeof LspPrepareRenameInputSchema>;

/**
 * LSP Rename input schema
 */
export const LspRenameInputSchema = z.object({
  filePath: z.string().min(1),
  line: z.number().int().nonnegative(),
  character: z.number().int().nonnegative(),
  newName: z.string().min(1).describe("New name for the symbol"),
});
export type LspRenameInput = z.infer<typeof LspRenameInputSchema>;

/**
 * LSP Code Actions input schema
 */
export const LspCodeActionsInputSchema = z.object({
  filePath: z.string().min(1),
  startLine: z.number().int().nonnegative(),
  startCharacter: z.number().int().nonnegative(),
  endLine: z.number().int().nonnegative(),
  endCharacter: z.number().int().nonnegative(),
  diagnostics: z.array(z.unknown()).optional(),
});
export type LspCodeActionsInput = z.infer<typeof LspCodeActionsInputSchema>;

/**
 * LSP Code Action Resolve input schema
 */
export const LspCodeActionResolveInputSchema = z.object({
  codeAction: z.unknown().describe("Code action object to resolve"),
});
export type LspCodeActionResolveInput = z.infer<typeof LspCodeActionResolveInputSchema>;

/**
 * LSP Servers input schema (no params, lists available servers)
 */
export const LspServersInputSchema = z.object({}).optional();
export type LspServersInput = z.infer<typeof LspServersInputSchema>;

/**
 * AST Grep Search input schema
 */
export const AstGrepSearchInputSchema = z.object({
  pattern: z.string().min(1).describe("AST pattern to search for"),
  path: z.string().optional().describe("Path to search in (defaults to cwd)"),
  language: z.string().optional().describe("Language to parse (auto-detected if not specified)"),
  limit: z.number().int().positive().optional().default(100),
});
export type AstGrepSearchInput = z.infer<typeof AstGrepSearchInputSchema>;

/**
 * AST Grep Replace input schema
 */
export const AstGrepReplaceInputSchema = z.object({
  pattern: z.string().min(1).describe("AST pattern to match"),
  replacement: z.string().describe("Replacement pattern"),
  path: z.string().optional().describe("Path to apply replacement in"),
  language: z.string().optional().describe("Language to parse"),
  dryRun: z.boolean().optional().default(false).describe("Preview changes without applying"),
});
export type AstGrepReplaceInput = z.infer<typeof AstGrepReplaceInputSchema>;

/**
 * Python REPL input schema
 */
export const PythonReplInputSchema = z.object({
  code: z.string().min(1).describe("Python code to execute"),
  timeout: z.number().int().positive().optional().default(30000),
});
export type PythonReplInput = z.infer<typeof PythonReplInputSchema>;

// ============================================
// INTERNAL TYPES
// ============================================

/**
 * Pending request tracking
 */
export interface PendingRequest {
  requestId: string;
  toolName: string;
  startTime: number;
  timeoutMs: number;
  resolve: (response: OmcToolCallResponse) => void;
  reject: (error: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

/**
 * SSE event types from OMC runtime
 */
export type OmcSseEventType = "tool_result" | "error" | "heartbeat" | "connected";

/**
 * SSE event payload
 */
export interface OmcSseEvent {
  type: OmcSseEventType;
  requestId?: string;
  data: unknown;
  timestamp: number;
}
