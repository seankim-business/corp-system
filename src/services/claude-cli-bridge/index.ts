/**
 * Claude CLI Bridge Service
 * Bridges Nubabel orchestrator to actual Claude CLI execution
 * Manages account rotation via Claude Max Pool and streams responses
 */
import { EventEmitter } from "events";
import { spawn, ChildProcess } from "child_process";
import { logger } from "../../utils/logger";
import { getClaudeMaxPoolService, ClaudeMaxAccountRecord } from "../claude-max-pool";
import { agentActivityService } from "../monitoring/agent-activity.service";

export type ClaudeCliEventType =
  | "cli:start"
  | "cli:chunk"
  | "cli:complete"
  | "cli:error"
  | "cli:tool_use"
  | "cli:rate_limit";

export interface ClaudeCliEvent {
  type: ClaudeCliEventType;
  sessionId: string;
  accountId?: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

export interface StreamChunk {
  type: string;
  content?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  error?: string;
  message?: string;
}

export interface ExecutionOptions {
  timeoutMs?: number;
  sessionId?: string;
  agentType?: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionResult {
  success: boolean;
  content: string;
  accountId: string;
  accountNickname: string;
  toolCalls: ToolCall[];
  estimatedTokens: number;
  durationMs: number;
  error?: string;
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

const RATE_LIMIT_PATTERNS = [
  /rate.?limit/i,
  /429/i,
  /quota.?exceeded/i,
  /too.?many.?requests/i,
  /capacity/i,
  /overloaded/i,
];

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export class ClaudeCliBridgeService extends EventEmitter {
  private activeProcesses: Map<string, ChildProcess> = new Map();

  constructor() {
    super();
  }

  /**
   * Execute prompt with automatic account rotation
   * Selects best available account and handles rate limit fallback
   */
  async executeWithAccountRotation(
    organizationId: string,
    prompt: string,
    options: ExecutionOptions = {},
  ): Promise<ExecutionResult> {
    const poolService = getClaudeMaxPoolService();
    const { account, reason } = await poolService.selectAccount(organizationId);

    if (!account) {
      throw new Error(`No available Claude Max accounts: ${reason}`);
    }

    logger.info("Selected Claude Max account for execution", {
      accountId: account.id,
      nickname: account.nickname,
      usage: account.estimatedUsagePercent,
      reason,
    });

    if (options.sessionId) {
      await agentActivityService.trackAccountSelection(organizationId, options.sessionId, {
        accountId: account.id,
        nickname: account.nickname,
        usage: account.estimatedUsagePercent,
        drainRate: 0,
      });
    }

    try {
      const result = await this.executeOnAccount(account, prompt, options);

      await poolService.recordSuccess(account.id, result.estimatedTokens);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (this.isRateLimitError(errorMessage)) {
        logger.warn("Rate limit detected, recording and attempting retry", {
          accountId: account.id,
          nickname: account.nickname,
          error: errorMessage,
        });

        await poolService.recordRateLimit(account.id);

        // Emit rate limit event
        this.emitEvent({
          type: "cli:rate_limit",
          sessionId: options.sessionId || "unknown",
          accountId: account.id,
          data: {
            nickname: account.nickname,
            error: errorMessage,
          },
          timestamp: new Date(),
        });

        // Try to select another account and retry once
        const { account: fallbackAccount } = await poolService.selectAccount(organizationId);

        if (fallbackAccount && fallbackAccount.id !== account.id) {
          logger.info("Retrying with fallback account", {
            originalAccountId: account.id,
            fallbackAccountId: fallbackAccount.id,
            fallbackNickname: fallbackAccount.nickname,
          });

          return this.executeOnAccount(fallbackAccount, prompt, options);
        }
      }

      throw error;
    }
  }

  /**
   * Execute prompt on a specific account
   */
  async executeOnAccount(
    account: ClaudeMaxAccountRecord,
    prompt: string,
    options: ExecutionOptions = {},
  ): Promise<ExecutionResult> {
    const sessionId = options.sessionId || this.generateSessionId();
    const timeout = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    const startTime = Date.now();

    // Emit start event
    this.emitEvent({
      type: "cli:start",
      sessionId,
      accountId: account.id,
      data: {
        nickname: account.nickname,
        timeout,
        agentType: options.agentType,
      },
      timestamp: new Date(),
    });

    return new Promise((resolve, reject) => {
      const chunks: string[] = [];
      const toolCalls: ToolCall[] = [];
      let lastContent = "";
      let estimatedTokens = 0;

      // Spawn Claude CLI with proper profile
      const cliProcess = spawn("claude", ["--print", "--output-format", "stream-json"], {
        env: {
          ...process.env,
          CLAUDE_PROFILE: account.nickname,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.activeProcesses.set(sessionId, cliProcess);

      // Set up timeout
      const timeoutId = setTimeout(() => {
        logger.warn("Claude CLI execution timeout", {
          sessionId,
          accountId: account.id,
          timeout,
        });

        this.killProcess(sessionId);

        reject(new Error(`Execution timeout after ${timeout}ms`));
      }, timeout);

      // Buffer for incomplete JSON lines
      let buffer = "";

      // Handle stdout (streaming JSON)
      cliProcess.stdout?.on("data", (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split("\n");

        // Keep last potentially incomplete line in buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const chunk = this.parseStreamChunk(line);

            if (!chunk) continue;

            // Handle different chunk types
            if (chunk.type === "content_block_delta" && chunk.content) {
              lastContent += chunk.content;
              estimatedTokens += this.estimateTokens(chunk.content);

              this.emitEvent({
                type: "cli:chunk",
                sessionId,
                accountId: account.id,
                data: {
                  content: chunk.content,
                  estimatedTokens,
                },
                timestamp: new Date(),
              });
            }

            if (chunk.type === "tool_use" && chunk.tool_name) {
              const toolCall: ToolCall = {
                name: chunk.tool_name,
                input: chunk.tool_input || {},
              };
              toolCalls.push(toolCall);

              this.emitEvent({
                type: "cli:tool_use",
                sessionId,
                accountId: account.id,
                data: {
                  toolName: chunk.tool_name,
                  toolInput: chunk.tool_input,
                },
                timestamp: new Date(),
              });
            }

            if (chunk.type === "result" || chunk.type === "message_stop") {
              if (chunk.content) {
                lastContent = chunk.content;
              }
            }

            if (chunk.type === "error") {
              const errorMsg = chunk.error || chunk.message || "Unknown error";

              if (this.isRateLimitError(errorMsg)) {
                clearTimeout(timeoutId);
                this.cleanupProcess(sessionId);
                reject(new Error(`Rate limit: ${errorMsg}`));
                return;
              }
            }

            chunks.push(line);
          } catch (parseError) {
            // Log but continue - some lines may not be JSON
            logger.debug("Failed to parse stream line", {
              line: line.substring(0, 100),
              error: String(parseError),
            });
          }
        }
      });

      // Handle stderr
      cliProcess.stderr?.on("data", (data: Buffer) => {
        const errorOutput = data.toString();
        logger.warn("Claude CLI stderr output", {
          sessionId,
          accountId: account.id,
          output: errorOutput.substring(0, 500),
        });

        // Check for rate limit in stderr
        if (this.isRateLimitError(errorOutput)) {
          clearTimeout(timeoutId);
          this.cleanupProcess(sessionId);
          reject(new Error(`Rate limit detected: ${errorOutput}`));
        }
      });

      // Handle process completion
      cliProcess.on("close", (code) => {
        clearTimeout(timeoutId);
        this.cleanupProcess(sessionId);

        const durationMs = Date.now() - startTime;

        if (code === 0) {
          const result: ExecutionResult = {
            success: true,
            content: lastContent,
            accountId: account.id,
            accountNickname: account.nickname,
            toolCalls,
            estimatedTokens,
            durationMs,
          };

          this.emitEvent({
            type: "cli:complete",
            sessionId,
            accountId: account.id,
            data: {
              success: true,
              contentLength: lastContent.length,
              toolCallCount: toolCalls.length,
              estimatedTokens,
              durationMs,
            },
            timestamp: new Date(),
          });

          resolve(result);
        } else {
          const errorResult: ExecutionResult = {
            success: false,
            content: lastContent,
            accountId: account.id,
            accountNickname: account.nickname,
            toolCalls,
            estimatedTokens,
            durationMs,
            error: `Process exited with code ${code}`,
          };

          this.emitEvent({
            type: "cli:error",
            sessionId,
            accountId: account.id,
            data: {
              exitCode: code,
              error: `Process exited with code ${code}`,
              durationMs,
            },
            timestamp: new Date(),
          });

          // Still resolve but with error flag - let caller decide
          resolve(errorResult);
        }
      });

      // Handle process errors
      cliProcess.on("error", (error) => {
        clearTimeout(timeoutId);
        this.cleanupProcess(sessionId);

        logger.error("Claude CLI process error", {
          sessionId,
          accountId: account.id,
          error: error.message,
        });

        this.emitEvent({
          type: "cli:error",
          sessionId,
          accountId: account.id,
          data: {
            error: error.message,
            errorType: "process_error",
          },
          timestamp: new Date(),
        });

        reject(error);
      });

      // Write prompt to stdin and close
      cliProcess.stdin?.write(prompt);
      cliProcess.stdin?.end();
    });
  }

  /**
   * Parse a single line of streaming JSON output
   */
  private parseStreamChunk(line: string): StreamChunk | null {
    if (!line.trim()) return null;

    try {
      const parsed = JSON.parse(line);

      // Handle different Claude CLI output formats
      if (parsed.type) {
        return parsed as StreamChunk;
      }

      // Handle nested content
      if (parsed.delta?.text) {
        return {
          type: "content_block_delta",
          content: parsed.delta.text,
        };
      }

      if (parsed.content_block?.type === "tool_use") {
        return {
          type: "tool_use",
          tool_name: parsed.content_block.name,
          tool_input: parsed.content_block.input,
        };
      }

      if (parsed.message?.content) {
        // Final message with full content
        const textContent = parsed.message.content.find((c: { type: string }) => c.type === "text");
        if (textContent) {
          return {
            type: "result",
            content: textContent.text,
          };
        }
      }

      if (parsed.error) {
        return {
          type: "error",
          error: parsed.error.message || parsed.error,
        };
      }

      return parsed as StreamChunk;
    } catch {
      // Not JSON or invalid format
      return null;
    }
  }

  /**
   * Check if error message indicates rate limiting
   */
  private isRateLimitError(message: string): boolean {
    return RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(message));
  }

  /**
   * Estimate token count from content (rough approximation)
   * ~4 characters per token on average
   */
  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `cli_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Emit typed event
   */
  private emitEvent(event: ClaudeCliEvent): void {
    this.emit(event.type, event);
    this.emit("*", event); // Wildcard for all events

    logger.debug("Claude CLI event emitted", {
      type: event.type,
      sessionId: event.sessionId,
      accountId: event.accountId,
    });
  }

  /**
   * Kill a running process
   */
  killProcess(sessionId: string): boolean {
    const process = this.activeProcesses.get(sessionId);
    if (process) {
      process.kill("SIGTERM");

      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (!process.killed) {
          process.kill("SIGKILL");
        }
      }, 5000);

      this.cleanupProcess(sessionId);
      return true;
    }
    return false;
  }

  /**
   * Clean up process reference
   */
  private cleanupProcess(sessionId: string): void {
    this.activeProcesses.delete(sessionId);
  }

  /**
   * Get count of active processes
   */
  getActiveProcessCount(): number {
    return this.activeProcesses.size;
  }

  /**
   * Kill all active processes (for shutdown)
   */
  killAllProcesses(): void {
    logger.info("Killing all Claude CLI processes", {
      count: this.activeProcesses.size,
    });

    for (const [sessionId, process] of this.activeProcesses) {
      try {
        process.kill("SIGTERM");
      } catch (error) {
        logger.error("Error killing process", {
          sessionId,
          error: String(error),
        });
      }
    }

    this.activeProcesses.clear();
  }

  /**
   * Graceful shutdown
   */
  shutdown(): void {
    logger.info("Shutting down Claude CLI Bridge Service");
    this.killAllProcesses();
    this.removeAllListeners();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _instance: ClaudeCliBridgeService | null = null;

export function getClaudeCliBridge(): ClaudeCliBridgeService {
  if (!_instance) {
    _instance = new ClaudeCliBridgeService();
  }
  return _instance;
}

export default ClaudeCliBridgeService;
