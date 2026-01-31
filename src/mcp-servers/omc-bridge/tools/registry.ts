/**
 * OMC Tool Registry
 *
 * Complete definitions for all 15 OMC tools:
 * - LSP tools (12): hover, goto_definition, find_references, document_symbols,
 *   workspace_symbols, diagnostics, diagnostics_directory, prepare_rename,
 *   rename, code_actions, code_action_resolve, servers
 * - AST tools (2): ast_grep_search, ast_grep_replace
 * - Python (1): python_repl
 */

import { z } from "zod";
import {
  ToolConfig,
  LspHoverInputSchema,
  LspGotoDefinitionInputSchema,
  LspFindReferencesInputSchema,
  LspDocumentSymbolsInputSchema,
  LspWorkspaceSymbolsInputSchema,
  LspDiagnosticsInputSchema,
  LspDiagnosticsDirectoryInputSchema,
  LspPrepareRenameInputSchema,
  LspRenameInputSchema,
  LspCodeActionsInputSchema,
  LspCodeActionResolveInputSchema,
  LspServersInputSchema,
  AstGrepSearchInputSchema,
  AstGrepReplaceInputSchema,
  PythonReplInputSchema,
  OmcToolName,
} from "../types";

/**
 * Tool definition with full metadata
 */
export interface ToolDefinition {
  name: OmcToolName;
  description: string;
  category: "lsp" | "ast" | "repl";
  inputSchema: z.ZodSchema;
  defaultTimeoutMs: number;
  requiresApproval: boolean;
  estimatedTokens: number;
  jsonSchema: Record<string, unknown>;
}

/**
 * Convert Zod schema to JSON Schema for MCP tool definitions
 */
function zodToJsonSchema(schema: z.ZodSchema): Record<string, unknown> {
  // This is a simplified conversion - in production you might use zod-to-json-schema
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const zodField = value as z.ZodTypeAny;
      properties[key] = zodFieldToJsonSchema(zodField);

      // Check if field is required (not optional)
      if (!(zodField instanceof z.ZodOptional) && !(zodField instanceof z.ZodDefault)) {
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  return { type: "object" };
}

/**
 * Convert individual Zod field to JSON Schema
 */
function zodFieldToJsonSchema(field: z.ZodTypeAny): Record<string, unknown> {
  // Handle wrapped types
  if (field instanceof z.ZodOptional) {
    return zodFieldToJsonSchema(field.unwrap());
  }

  if (field instanceof z.ZodDefault) {
    const inner = zodFieldToJsonSchema(field._def.innerType);
    return { ...inner, default: field._def.defaultValue() };
  }

  // Handle base types
  if (field instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: "string" };
    if (field.description) result.description = field.description;
    return result;
  }

  if (field instanceof z.ZodNumber) {
    const result: Record<string, unknown> = { type: "number" };
    if (field.description) result.description = field.description;
    return result;
  }

  if (field instanceof z.ZodBoolean) {
    const result: Record<string, unknown> = { type: "boolean" };
    if (field.description) result.description = field.description;
    return result;
  }

  if (field instanceof z.ZodEnum) {
    return {
      type: "string",
      enum: field._def.values,
    };
  }

  if (field instanceof z.ZodArray) {
    return {
      type: "array",
      items: zodFieldToJsonSchema(field._def.type),
    };
  }

  if (field instanceof z.ZodUnknown) {
    return {};
  }

  return { type: "string" };
}

// ============================================
// LSP TOOL DEFINITIONS
// ============================================

const lspHover: ToolDefinition = {
  name: "lsp_hover",
  description:
    "Get hover information (type, documentation) for a symbol at a specific position in a file. Useful for understanding what a variable, function, or type represents.",
  category: "lsp",
  inputSchema: LspHoverInputSchema,
  defaultTimeoutMs: 5000,
  requiresApproval: false,
  estimatedTokens: 150,
  jsonSchema: zodToJsonSchema(LspHoverInputSchema),
};

const lspGotoDefinition: ToolDefinition = {
  name: "lsp_goto_definition",
  description:
    "Navigate to the definition of a symbol at a specific position. Returns the file path and location where the symbol is defined.",
  category: "lsp",
  inputSchema: LspGotoDefinitionInputSchema,
  defaultTimeoutMs: 5000,
  requiresApproval: false,
  estimatedTokens: 100,
  jsonSchema: zodToJsonSchema(LspGotoDefinitionInputSchema),
};

const lspFindReferences: ToolDefinition = {
  name: "lsp_find_references",
  description:
    "Find all references to a symbol across the codebase. Includes the declaration if includeDeclaration is true.",
  category: "lsp",
  inputSchema: LspFindReferencesInputSchema,
  defaultTimeoutMs: 15000,
  requiresApproval: false,
  estimatedTokens: 500,
  jsonSchema: zodToJsonSchema(LspFindReferencesInputSchema),
};

const lspDocumentSymbols: ToolDefinition = {
  name: "lsp_document_symbols",
  description:
    "Get all symbols (functions, classes, variables, etc.) defined in a file. Provides an outline/structure of the file.",
  category: "lsp",
  inputSchema: LspDocumentSymbolsInputSchema,
  defaultTimeoutMs: 5000,
  requiresApproval: false,
  estimatedTokens: 300,
  jsonSchema: zodToJsonSchema(LspDocumentSymbolsInputSchema),
};

const lspWorkspaceSymbols: ToolDefinition = {
  name: "lsp_workspace_symbols",
  description:
    "Search for symbols across the entire workspace by name. Useful for finding definitions without knowing the file location.",
  category: "lsp",
  inputSchema: LspWorkspaceSymbolsInputSchema,
  defaultTimeoutMs: 10000,
  requiresApproval: false,
  estimatedTokens: 400,
  jsonSchema: zodToJsonSchema(LspWorkspaceSymbolsInputSchema),
};

const lspDiagnostics: ToolDefinition = {
  name: "lsp_diagnostics",
  description:
    "Get diagnostic messages (errors, warnings) for a specific file. Useful for identifying issues that need to be fixed.",
  category: "lsp",
  inputSchema: LspDiagnosticsInputSchema,
  defaultTimeoutMs: 5000,
  requiresApproval: false,
  estimatedTokens: 200,
  jsonSchema: zodToJsonSchema(LspDiagnosticsInputSchema),
};

const lspDiagnosticsDirectory: ToolDefinition = {
  name: "lsp_diagnostics_directory",
  description:
    "Get diagnostics for all files in a directory. Supports 'tsc' strategy for TypeScript projects (faster) or 'lsp' for other languages. Use 'auto' to let the system choose.",
  category: "lsp",
  inputSchema: LspDiagnosticsDirectoryInputSchema,
  defaultTimeoutMs: 60000,
  requiresApproval: false,
  estimatedTokens: 1000,
  jsonSchema: zodToJsonSchema(LspDiagnosticsDirectoryInputSchema),
};

const lspPrepareRename: ToolDefinition = {
  name: "lsp_prepare_rename",
  description:
    "Check if a symbol at a position can be renamed and get the current name/range. Call this before lsp_rename to validate the rename operation.",
  category: "lsp",
  inputSchema: LspPrepareRenameInputSchema,
  defaultTimeoutMs: 5000,
  requiresApproval: false,
  estimatedTokens: 50,
  jsonSchema: zodToJsonSchema(LspPrepareRenameInputSchema),
};

const lspRename: ToolDefinition = {
  name: "lsp_rename",
  description:
    "Rename a symbol across the entire codebase. This is a write operation that modifies files. Returns the list of changes made.",
  category: "lsp",
  inputSchema: LspRenameInputSchema,
  defaultTimeoutMs: 30000,
  requiresApproval: true,
  estimatedTokens: 300,
  jsonSchema: zodToJsonSchema(LspRenameInputSchema),
};

const lspCodeActions: ToolDefinition = {
  name: "lsp_code_actions",
  description:
    "Get available code actions (quick fixes, refactorings) for a range in a file. Returns a list of actions that can be applied.",
  category: "lsp",
  inputSchema: LspCodeActionsInputSchema,
  defaultTimeoutMs: 5000,
  requiresApproval: false,
  estimatedTokens: 200,
  jsonSchema: zodToJsonSchema(LspCodeActionsInputSchema),
};

const lspCodeActionResolve: ToolDefinition = {
  name: "lsp_code_action_resolve",
  description:
    "Resolve a code action to get the full edit details. Some code actions need to be resolved before they can be applied.",
  category: "lsp",
  inputSchema: LspCodeActionResolveInputSchema,
  defaultTimeoutMs: 5000,
  requiresApproval: false,
  estimatedTokens: 150,
  jsonSchema: zodToJsonSchema(LspCodeActionResolveInputSchema),
};

const lspServers: ToolDefinition = {
  name: "lsp_servers",
  description:
    "List all available Language Server Protocol servers and their status. Shows which languages are supported.",
  category: "lsp",
  inputSchema: LspServersInputSchema ?? z.object({}),
  defaultTimeoutMs: 2000,
  requiresApproval: false,
  estimatedTokens: 100,
  jsonSchema: { type: "object", properties: {} },
};

// ============================================
// AST TOOL DEFINITIONS
// ============================================

const astGrepSearch: ToolDefinition = {
  name: "ast_grep_search",
  description:
    "Search for code patterns using AST (Abstract Syntax Tree) matching. More precise than text search as it understands code structure. Pattern syntax varies by language.",
  category: "ast",
  inputSchema: AstGrepSearchInputSchema,
  defaultTimeoutMs: 30000,
  requiresApproval: false,
  estimatedTokens: 500,
  jsonSchema: zodToJsonSchema(AstGrepSearchInputSchema),
};

const astGrepReplace: ToolDefinition = {
  name: "ast_grep_replace",
  description:
    "Replace code patterns using AST matching. Performs structural code transformations. Use dryRun=true to preview changes before applying.",
  category: "ast",
  inputSchema: AstGrepReplaceInputSchema,
  defaultTimeoutMs: 60000,
  requiresApproval: true,
  estimatedTokens: 400,
  jsonSchema: zodToJsonSchema(AstGrepReplaceInputSchema),
};

// ============================================
// REPL TOOL DEFINITIONS
// ============================================

const pythonRepl: ToolDefinition = {
  name: "python_repl",
  description:
    "Execute Python code in an interactive REPL environment. Useful for data analysis, calculations, and testing Python snippets. State persists between calls in the same session.",
  category: "repl",
  inputSchema: PythonReplInputSchema,
  defaultTimeoutMs: 30000,
  requiresApproval: true,
  estimatedTokens: 200,
  jsonSchema: zodToJsonSchema(PythonReplInputSchema),
};

// ============================================
// TOOL REGISTRY
// ============================================

/**
 * Complete registry of all OMC tools
 */
export const OMC_TOOL_REGISTRY: Record<OmcToolName, ToolDefinition> = {
  // LSP tools
  lsp_hover: lspHover,
  lsp_goto_definition: lspGotoDefinition,
  lsp_find_references: lspFindReferences,
  lsp_document_symbols: lspDocumentSymbols,
  lsp_workspace_symbols: lspWorkspaceSymbols,
  lsp_diagnostics: lspDiagnostics,
  lsp_diagnostics_directory: lspDiagnosticsDirectory,
  lsp_prepare_rename: lspPrepareRename,
  lsp_rename: lspRename,
  lsp_code_actions: lspCodeActions,
  lsp_code_action_resolve: lspCodeActionResolve,
  lsp_servers: lspServers,

  // AST tools
  ast_grep_search: astGrepSearch,
  ast_grep_replace: astGrepReplace,

  // REPL tools
  python_repl: pythonRepl,
};

/**
 * Get a tool definition by name
 */
export function getToolDefinition(toolName: string): ToolDefinition | undefined {
  return OMC_TOOL_REGISTRY[toolName as OmcToolName];
}

/**
 * Get all tool names
 */
export function getAllToolNames(): OmcToolName[] {
  return Object.keys(OMC_TOOL_REGISTRY) as OmcToolName[];
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: "lsp" | "ast" | "repl"): ToolDefinition[] {
  return Object.values(OMC_TOOL_REGISTRY).filter((tool) => tool.category === category);
}

/**
 * Get tools that require approval
 */
export function getToolsRequiringApproval(): ToolDefinition[] {
  return Object.values(OMC_TOOL_REGISTRY).filter((tool) => tool.requiresApproval);
}

/**
 * Convert tool definition to ToolConfig format
 */
export function toToolConfig(def: ToolDefinition): ToolConfig {
  return {
    name: def.name,
    description: def.description,
    category: def.category,
    inputSchema: def.jsonSchema,
    defaultTimeoutMs: def.defaultTimeoutMs,
    requiresApproval: def.requiresApproval,
    estimatedTokens: def.estimatedTokens,
  };
}

/**
 * Validate tool input against its schema
 */
export function validateToolInput(
  toolName: string,
  input: unknown,
): { valid: true; data: unknown } | { valid: false; error: string } {
  const definition = getToolDefinition(toolName);

  if (!definition) {
    return { valid: false, error: `Unknown tool: ${toolName}` };
  }

  const result = definition.inputSchema.safeParse(input);

  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
    return { valid: false, error: errors };
  }

  return { valid: true, data: result.data };
}
