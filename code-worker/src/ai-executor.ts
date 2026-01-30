/**
 * AI Executor for Code Worker
 *
 * The heart of the Code Worker - runs Claude with direct access to
 * filesystem, git, and test runner tools for autonomous code modifications.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  createFilesystemTools,
  FilesystemTools,
  LineEdit,
} from "./tools/filesystem";
import { GitTools, createGitTools } from "./tools/git";
import { TestRunnerTools, createTestRunner } from "./tools/test-runner";

// ============================================================================
// Types
// ============================================================================

export interface CodeExecutorConfig {
  /** Working directory - e.g., /workspace/repos/org/repo */
  workingDirectory: string;
  /** Unique session identifier */
  sessionId: string;
  /** Operation/task identifier */
  operationId: string;
  /** Agent identifier for attribution */
  agentId: string;
  /** Maximum agentic loop iterations */
  maxIterations: number;
  /** GitHub token for PR operations */
  githubToken?: string;
  /** Model to use (defaults to claude-sonnet-4-20250514) */
  model?: string;
  /** Maximum tokens for response */
  maxTokens?: number;
}

export interface ExecutionResult {
  success: boolean;
  summary: string;
  filesModified: string[];
  commits: Array<{ sha: string; message: string }>;
  testsPassed: boolean;
  iterations: number;
  error?: string;
  toolCalls: ToolCallRecord[];
}

export interface ExecutionContext {
  /** Error message from failed build/test */
  errorMessage?: string;
  /** Requirements/specifications */
  requirements?: string;
  /** Additional context */
  additionalContext?: string;
}

interface ToolCallRecord {
  name: string;
  input: Record<string, unknown>;
  output: string;
  timestamp: Date;
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const CODE_TOOLS: Anthropic.Tool[] = [
  {
    name: "read_file",
    description: "Read the contents of a file",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Relative path from repo root",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file (creates or overwrites)",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Relative path from repo root",
        },
        content: {
          type: "string",
          description: "File content",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description: "Edit a file by replacing old text with new text",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Relative path from repo root",
        },
        old_text: {
          type: "string",
          description: "Text to find",
        },
        new_text: {
          type: "string",
          description: "Replacement text",
        },
      },
      required: ["path", "old_text", "new_text"],
    },
  },
  {
    name: "list_directory",
    description: "List files and directories",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Directory path (relative to repo root)",
        },
        recursive: {
          type: "boolean",
          description: "Include subdirectories",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "search_files",
    description: "Search for files matching a pattern",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: {
          type: "string",
          description: 'Glob pattern (e.g., "**/*.ts")',
        },
        directory: {
          type: "string",
          description: "Directory to search in (relative to repo root)",
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "git_status",
    description: "Get git status (changed, staged, untracked files)",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "git_diff",
    description: "Get diff of changes",
    input_schema: {
      type: "object" as const,
      properties: {
        staged: {
          type: "boolean",
          description: "Show staged changes only",
        },
      },
    },
  },
  {
    name: "git_add",
    description: "Stage files for commit",
    input_schema: {
      type: "object" as const,
      properties: {
        files: {
          type: "array",
          items: { type: "string" },
          description: "Files to stage",
        },
      },
      required: ["files"],
    },
  },
  {
    name: "git_commit",
    description: "Create a commit",
    input_schema: {
      type: "object" as const,
      properties: {
        message: {
          type: "string",
          description: "Commit message",
        },
      },
      required: ["message"],
    },
  },
  {
    name: "run_typecheck",
    description: "Run TypeScript type checking",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "run_tests",
    description: "Run test suite",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: {
          type: "string",
          description: "Test file pattern",
        },
      },
    },
  },
  {
    name: "run_lint",
    description: "Run ESLint",
    input_schema: {
      type: "object" as const,
      properties: {
        files: {
          type: "array",
          items: { type: "string" },
          description: "Files to lint",
        },
      },
    },
  },
  {
    name: "task_complete",
    description: "Signal that the task is complete",
    input_schema: {
      type: "object" as const,
      properties: {
        summary: {
          type: "string",
          description: "Summary of what was done",
        },
        success: {
          type: "boolean",
          description: "Whether task completed successfully",
        },
      },
      required: ["summary", "success"],
    },
  },
];

// ============================================================================
// System Prompt
// ============================================================================

function buildSystemPrompt(
  workingDirectory: string,
  task: string,
  context?: ExecutionContext
): string {
  let contextSection = "";
  if (context) {
    if (context.errorMessage) {
      contextSection += `\n## Error to Fix\n\`\`\`\n${context.errorMessage}\n\`\`\`\n`;
    }
    if (context.requirements) {
      contextSection += `\n## Requirements\n${context.requirements}\n`;
    }
    if (context.additionalContext) {
      contextSection += `\n## Additional Context\n${context.additionalContext}\n`;
    }
  }

  return `You are Nubabel Code Agent, an AI that modifies code to fix bugs and implement features.

You have access to tools for reading/writing files, git operations, and running tests.

## Rules
1. Read files before modifying them
2. Make minimal, focused changes
3. Always run typecheck after changes
4. Run relevant tests to verify fixes
5. Commit with clear, descriptive messages
6. Use task_complete when done

## Working Directory
All paths are relative to: ${workingDirectory}

## Current Task
${task}
${contextSection}
## Workflow
1. First, understand the codebase structure (list_directory, read relevant files)
2. Identify the files that need changes
3. Make the necessary modifications
4. Run typecheck to ensure no type errors
5. Run tests to verify the fix
6. If tests pass, commit the changes
7. Call task_complete with a summary

## Important
- Be precise and minimal in your changes
- Don't modify unrelated code
- If you encounter an error, try to fix it before giving up
- Always verify your changes with typecheck and tests`;
}

// ============================================================================
// Code Executor Class
// ============================================================================

export class CodeExecutor {
  private client: Anthropic;
  private config: CodeExecutorConfig;
  private filesystem: FilesystemTools;
  private git: GitTools;
  private testRunner: TestRunnerTools;
  private filesModified: Set<string> = new Set();
  private commits: Array<{ sha: string; message: string }> = [];
  private toolCalls: ToolCallRecord[] = [];

  constructor(config: CodeExecutorConfig) {
    this.client = new Anthropic();
    this.config = config;

    // Initialize filesystem tools
    this.filesystem = createFilesystemTools({
      sessionId: config.sessionId,
      workspaceRoot: config.workingDirectory,
    });

    // Initialize git tools
    this.git = createGitTools({
      workDir: config.workingDirectory,
      githubToken: config.githubToken,
      agentId: config.agentId,
    });

    // Initialize test runner
    this.testRunner = createTestRunner(config.workingDirectory);
  }

  /**
   * Execute a task using the AI agent loop
   */
  async execute(
    task: string,
    context?: ExecutionContext
  ): Promise<ExecutionResult> {
    const systemPrompt = buildSystemPrompt(
      this.config.workingDirectory,
      task,
      context
    );

    let messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: task,
      },
    ];

    let iterations = 0;
    let isComplete = false;
    let finalSummary = "";
    let finalSuccess = false;
    let testsPassed = false;
    let lastError: string | undefined;

    console.log(
      `[CodeExecutor] Starting execution for operation ${this.config.operationId}`
    );
    console.log(`[CodeExecutor] Task: ${task.substring(0, 100)}...`);

    while (!isComplete && iterations < this.config.maxIterations) {
      iterations++;
      console.log(
        `[CodeExecutor] Iteration ${iterations}/${this.config.maxIterations}`
      );

      try {
        const response = await this.client.messages.create({
          model: this.config.model || "claude-sonnet-4-20250514",
          max_tokens: this.config.maxTokens || 4096,
          system: systemPrompt,
          tools: CODE_TOOLS,
          messages,
        });

        // Process the response
        const assistantContent: Anthropic.ContentBlock[] = [];
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          assistantContent.push(block);

          if (block.type === "tool_use") {
            const toolName = block.name;
            const toolInput = block.input as Record<string, unknown>;

            console.log(`[CodeExecutor] Tool call: ${toolName}`);

            // Check for task_complete
            if (toolName === "task_complete") {
              isComplete = true;
              finalSummary = (toolInput.summary as string) || "";
              finalSuccess = (toolInput.success as boolean) || false;
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: "Task completion acknowledged.",
              });
              break;
            }

            // Execute the tool
            const result = await this.handleToolCall(toolName, toolInput);

            // Record the tool call
            this.toolCalls.push({
              name: toolName,
              input: toolInput,
              output: result,
              timestamp: new Date(),
            });

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
            });

            // Track test results
            if (toolName === "run_tests" && result.includes('"success": true')) {
              testsPassed = true;
            }
          }
        }

        // Add assistant message with all content
        messages.push({
          role: "assistant",
          content: assistantContent,
        });

        // If there were tool calls, add the results
        if (toolResults.length > 0 && !isComplete) {
          messages.push({
            role: "user",
            content: toolResults,
          });
        }

        // Check if the model stopped without tool use (natural end)
        if (
          response.stop_reason === "end_turn" &&
          !response.content.some((b) => b.type === "tool_use")
        ) {
          console.log(
            "[CodeExecutor] Model ended turn without tool use or task_complete"
          );
          // Prompt the model to complete the task
          messages.push({
            role: "user",
            content:
              "Please either continue working on the task or call task_complete to signal you are done.",
          });
        }
      } catch (error) {
        lastError =
          error instanceof Error ? error.message : "Unknown error occurred";
        console.error(`[CodeExecutor] Error in iteration ${iterations}:`, error);

        // Add error to messages so the model can try to recover
        messages.push({
          role: "user",
          content: `An error occurred: ${lastError}\n\nPlease try a different approach or call task_complete if you cannot proceed.`,
        });
      }
    }

    // If we hit max iterations without completing
    if (!isComplete) {
      console.log(
        `[CodeExecutor] Max iterations (${this.config.maxIterations}) reached without completion`
      );
      finalSummary = `Task incomplete after ${iterations} iterations.`;
      finalSuccess = false;
      lastError = lastError || "Max iterations reached without task_complete";
    }

    const result: ExecutionResult = {
      success: finalSuccess,
      summary: finalSummary,
      filesModified: Array.from(this.filesModified),
      commits: this.commits,
      testsPassed,
      iterations,
      toolCalls: this.toolCalls,
    };

    if (lastError && !finalSuccess) {
      result.error = lastError;
    }

    console.log(`[CodeExecutor] Execution complete:`, {
      success: result.success,
      iterations: result.iterations,
      filesModified: result.filesModified.length,
      commits: result.commits.length,
    });

    return result;
  }

  /**
   * Handle individual tool calls
   */
  private async handleToolCall(
    name: string,
    input: Record<string, unknown>
  ): Promise<string> {
    try {
      switch (name) {
        // Filesystem tools
        case "read_file":
          return await this.handleReadFile(input.path as string);

        case "write_file":
          return await this.handleWriteFile(
            input.path as string,
            input.content as string
          );

        case "edit_file":
          return await this.handleEditFile(
            input.path as string,
            input.old_text as string,
            input.new_text as string
          );

        case "list_directory":
          return await this.handleListDirectory(
            input.path as string,
            input.recursive as boolean | undefined
          );

        case "search_files":
          return await this.handleSearchFiles(
            input.pattern as string,
            input.directory as string | undefined
          );

        // Git tools
        case "git_status":
          return await this.handleGitStatus();

        case "git_diff":
          return await this.handleGitDiff(input.staged as boolean | undefined);

        case "git_add":
          return await this.handleGitAdd(input.files as string[]);

        case "git_commit":
          return await this.handleGitCommit(input.message as string);

        // Test runner tools
        case "run_typecheck":
          return await this.handleRunTypecheck();

        case "run_tests":
          return await this.handleRunTests(input.pattern as string | undefined);

        case "run_lint":
          return await this.handleRunLint(input.files as string[] | undefined);

        default:
          return `Unknown tool: ${name}`;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[CodeExecutor] Tool error (${name}):`, errorMessage);
      return `Error: ${errorMessage}`;
    }
  }

  // --------------------------------------------------------------------------
  // Filesystem Tool Handlers
  // --------------------------------------------------------------------------

  private async handleReadFile(path: string): Promise<string> {
    const fullPath = this.resolvePath(path);
    const content = await this.filesystem.readFile(fullPath);
    return content;
  }

  private async handleWriteFile(path: string, content: string): Promise<string> {
    const fullPath = this.resolvePath(path);
    await this.filesystem.writeFile(fullPath, content);
    this.filesModified.add(path);
    return `Successfully wrote ${content.length} characters to ${path}`;
  }

  private async handleEditFile(
    path: string,
    oldText: string,
    newText: string
  ): Promise<string> {
    const fullPath = this.resolvePath(path);
    const edits: LineEdit[] = [{ oldText, newText }];
    await this.filesystem.editFile(fullPath, edits);
    this.filesModified.add(path);
    return `Successfully edited ${path}`;
  }

  private async handleListDirectory(
    path: string,
    recursive?: boolean
  ): Promise<string> {
    const fullPath = this.resolvePath(path);
    const entries = await this.filesystem.listDirectory(fullPath, recursive);
    const formatted = entries.map((e) => {
      const type = e.isDirectory ? "[DIR]" : "[FILE]";
      const relativePath = e.path.replace(this.config.workingDirectory, "");
      return `${type} ${relativePath}`;
    });
    return formatted.join("\n");
  }

  private async handleSearchFiles(
    pattern: string,
    directory?: string
  ): Promise<string> {
    const searchDir = directory
      ? this.resolvePath(directory)
      : this.config.workingDirectory;
    const files = await this.filesystem.searchFiles(pattern, searchDir);
    const relativePaths = files.map((f) =>
      f.replace(this.config.workingDirectory, "")
    );
    return relativePaths.length > 0
      ? relativePaths.join("\n")
      : "No files found matching pattern";
  }

  // --------------------------------------------------------------------------
  // Git Tool Handlers
  // --------------------------------------------------------------------------

  private async handleGitStatus(): Promise<string> {
    const status = await this.git.status();
    return JSON.stringify(status, null, 2);
  }

  private async handleGitDiff(staged?: boolean): Promise<string> {
    const diff = await this.git.diff(staged);
    return diff || "No changes";
  }

  private async handleGitAdd(files: string[]): Promise<string> {
    await this.git.add(files);
    return `Staged ${files.length} file(s): ${files.join(", ")}`;
  }

  private async handleGitCommit(message: string): Promise<string> {
    const sha = await this.git.commit(message);
    this.commits.push({ sha, message });
    return `Created commit ${sha}: ${message}`;
  }

  // --------------------------------------------------------------------------
  // Test Runner Tool Handlers
  // --------------------------------------------------------------------------

  private async handleRunTypecheck(): Promise<string> {
    const result = await this.testRunner.typecheck();
    if (result.success) {
      return JSON.stringify({ success: true, message: "No type errors found" });
    }
    return JSON.stringify({
      success: false,
      errorCount: result.errorCount,
      errors: result.errors.slice(0, 10), // Limit to 10 errors
    });
  }

  private async handleRunTests(pattern?: string): Promise<string> {
    const result = await this.testRunner.test(pattern);
    return JSON.stringify({
      success: result.success,
      total: result.total,
      passed: result.passed,
      failed: result.failed,
      skipped: result.skipped,
      failures: result.failures.slice(0, 5), // Limit to 5 failures
      duration: result.duration,
    });
  }

  private async handleRunLint(files?: string[]): Promise<string> {
    const result = await this.testRunner.lint(files);
    return JSON.stringify({
      success: result.success,
      errorCount: result.errorCount,
      warningCount: result.warningCount,
      errors: result.errors.slice(0, 10), // Limit to 10 errors
    });
  }

  // --------------------------------------------------------------------------
  // Utility Methods
  // --------------------------------------------------------------------------

  private resolvePath(relativePath: string): string {
    // Remove leading slash if present
    const cleanPath = relativePath.startsWith("/")
      ? relativePath.slice(1)
      : relativePath;
    return `${this.config.workingDirectory}/${cleanPath}`;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a CodeExecutor instance
 */
export function createCodeExecutor(config: CodeExecutorConfig): CodeExecutor {
  return new CodeExecutor(config);
}

// ============================================================================
// Exports
// ============================================================================

export default CodeExecutor;
