/**
 * Agent Executor Service
 * Executes Claude CLI with per-agent configuration injection
 */

import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { PrismaClient, Agent, Prisma } from "@prisma/client";
import { logger } from "../../utils/logger";
import { configGenerator, AgentEnvironment } from "./config-generator";
import { agentCredentialVault } from "../agent-credential-vault";
import { getClaudeMaxPoolService } from "../claude-max-pool";

const prisma = new PrismaClient();

// ============================================================================
// Types
// ============================================================================

export interface AgentExecutionOptions {
  workingDirectory?: string;
  timeoutMs?: number;
  sessionId?: string;
  parentExecutionId?: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionResult {
  success: boolean;
  content: string;
  executionId: string;
  agentId: string;
  accountNickname: string;
  toolCalls: ToolCall[];
  estimatedTokens: number;
  durationMs: number;
  error?: string;
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  output?: unknown;
  durationMs?: number;
}

export interface StreamChunk {
  type: string;
  content?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  error?: string;
  message?: string;
}

// ============================================================================
// Agent Executor
// ============================================================================

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export class AgentExecutor extends EventEmitter {
  private activeProcesses: Map<string, ChildProcess> = new Map();

  constructor() {
    super();
  }

  /**
   * Execute a prompt with per-agent configuration
   */
  async executeForAgent(
    agent: Agent,
    prompt: string,
    options: AgentExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const sessionId =
      options.sessionId ||
      `agent_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const timeout = options.timeoutMs || DEFAULT_TIMEOUT_MS;

    // 1. Create execution record
    const execution = await this.createExecution(
      agent,
      prompt,
      sessionId,
      options
    );

    logger.info("Starting agent execution", {
      executionId: execution.id,
      agentId: agent.id,
      agentName: agent.name,
    });

    let env: AgentEnvironment | null = null;

    try {
      // 2. Get Claude Max account
      const poolService = getClaudeMaxPoolService();
      const { account, reason } = await poolService.selectAccount(
        agent.organizationId
      );

      if (!account) {
        throw new Error(`No available Claude Max accounts: ${reason}`);
      }

      // Update execution with account info
      await prisma.agentExecution.update({
        where: { id: execution.id },
        data: { claudeMaxAccountId: account.id },
      });

      // 3. Resolve agent credentials
      const credentials = await agentCredentialVault.getAgentCredentials(
        agent.id
      );

      // 4. Create isolated environment
      env = await configGenerator.createAgentEnvironment(
        agent,
        execution.id,
        credentials
      );

      // 5. Update execution status to running
      await this.updateExecutionStatus(execution.id, "running");

      // 6. Spawn Claude CLI
      const result = await this.spawnAndStream(
        execution.id,
        agent,
        prompt,
        env,
        account.nickname,
        timeout,
        options.workingDirectory
      );

      // 7. Update execution as completed
      const durationMs = Date.now() - startTime;
      await this.completeExecution(execution.id, result, durationMs);

      // 8. Record success with pool
      await poolService.recordSuccess(account.id, result.estimatedTokens);

      return {
        ...result,
        executionId: execution.id,
        agentId: agent.id,
        accountNickname: account.nickname,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update execution as failed
      await this.failExecution(execution.id, errorMessage, durationMs);

      logger.error("Agent execution failed", {
        executionId: execution.id,
        agentId: agent.id,
        error: errorMessage,
      });

      return {
        success: false,
        content: "",
        executionId: execution.id,
        agentId: agent.id,
        accountNickname: "unknown",
        toolCalls: [],
        estimatedTokens: 0,
        durationMs,
        error: errorMessage,
      };
    } finally {
      // 9. Cleanup temp files
      if (env) {
        await configGenerator.cleanup(env.tempDir);
      }
    }
  }

  /**
   * Create execution record in database
   */
  private async createExecution(
    agent: Agent,
    prompt: string,
    sessionId: string,
    options: AgentExecutionOptions
  ) {
    // Capture config snapshot
    const configSnapshot = {
      claudeMdContent: agent.claudeMdContent,
      mcpConfigJson: agent.mcpConfigJson,
      toolAllowlist: agent.toolAllowlist,
      toolDenylist: agent.toolDenylist,
      permissionLevel: agent.permissionLevel,
    };

    return prisma.agentExecution.create({
      data: {
        organizationId: agent.organizationId,
        agentId: agent.id,
        sessionId,
        parentExecutionId: options.parentExecutionId,
        taskDescription: prompt.slice(0, 1000), // Truncate for storage
        status: "pending",
        configSnapshot: configSnapshot as Prisma.InputJsonValue,
        inputData: { prompt } as Prisma.InputJsonValue,
        metadata: (options.metadata || {}) as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Spawn Claude CLI and stream output
   */
  private async spawnAndStream(
    executionId: string,
    agent: Agent,
    prompt: string,
    env: AgentEnvironment,
    accountNickname: string,
    timeoutMs: number,
    workingDirectory?: string
  ): Promise<
    Omit<ExecutionResult, "executionId" | "agentId" | "accountNickname" | "durationMs">
  > {
    return new Promise((resolve, reject) => {
      const toolCalls: ToolCall[] = [];
      const streamChunks: StreamChunk[] = [];
      let lastContent = "";
      let estimatedTokens = 0;

      // Spawn Claude CLI
      const cliProcess = spawn(
        "claude",
        ["--print", "--output-format", "stream-json"],
        {
          cwd: workingDirectory || process.cwd(),
          env: {
            ...process.env,
            ...env.envVars,
            CLAUDE_PROFILE: accountNickname,
          },
          stdio: ["pipe", "pipe", "pipe"],
        }
      );

      this.activeProcesses.set(executionId, cliProcess);

      // Set up timeout
      const timeoutId = setTimeout(() => {
        logger.warn("Agent execution timeout", { executionId, timeoutMs });
        this.killProcess(executionId);
        reject(new Error(`Execution timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // Buffer for incomplete JSON lines
      let buffer = "";

      // Handle stdout
      cliProcess.stdout?.on("data", (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const chunk = this.parseStreamChunk(line);
            if (!chunk) continue;

            streamChunks.push(chunk);

            if (chunk.type === "content_block_delta" && chunk.content) {
              lastContent += chunk.content;
              estimatedTokens += Math.ceil(chunk.content.length / 4);

              // Emit progress event
              this.emit("chunk", {
                executionId,
                agentId: agent.id,
                chunk,
              });
            }

            if (chunk.type === "tool_use" && chunk.tool_name) {
              toolCalls.push({
                name: chunk.tool_name,
                input: chunk.tool_input || {},
              });

              this.emit("tool_use", {
                executionId,
                agentId: agent.id,
                toolName: chunk.tool_name,
                toolInput: chunk.tool_input,
              });
            }

            if (chunk.type === "result" && chunk.content) {
              lastContent = chunk.content;
            }

            if (chunk.type === "error" && chunk.error) {
              logger.warn("Claude CLI error chunk", {
                executionId,
                error: chunk.error,
              });
            }
          } catch (parseError) {
            logger.debug("Failed to parse stream line", {
              line: line.slice(0, 100),
            });
          }
        }
      });

      // Handle stderr
      cliProcess.stderr?.on("data", (data: Buffer) => {
        const errorOutput = data.toString();
        logger.warn("Claude CLI stderr", {
          executionId,
          output: errorOutput.slice(0, 500),
        });
      });

      // Handle process completion
      cliProcess.on("close", async (code) => {
        clearTimeout(timeoutId);
        this.activeProcesses.delete(executionId);

        // Store stream chunks
        await prisma.agentExecution.update({
          where: { id: executionId },
          data: {
            streamChunks: streamChunks as unknown as Prisma.InputJsonValue[],
            toolCalls: toolCalls as unknown as Prisma.InputJsonValue[],
          },
        });

        if (code === 0) {
          resolve({
            success: true,
            content: lastContent,
            toolCalls,
            estimatedTokens,
          });
        } else {
          resolve({
            success: false,
            content: lastContent,
            toolCalls,
            estimatedTokens,
            error: `Process exited with code ${code}`,
          });
        }
      });

      // Handle process error
      cliProcess.on("error", (error) => {
        clearTimeout(timeoutId);
        this.activeProcesses.delete(executionId);
        reject(error);
      });

      // Write prompt to stdin
      cliProcess.stdin?.write(prompt);
      cliProcess.stdin?.end();
    });
  }

  /**
   * Parse a stream chunk
   */
  private parseStreamChunk(line: string): StreamChunk | null {
    if (!line.trim()) return null;

    try {
      const parsed = JSON.parse(line);

      if (parsed.type) {
        return parsed as StreamChunk;
      }

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
        const textContent = parsed.message.content.find(
          (c: { type: string }) => c.type === "text"
        );
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
      return null;
    }
  }

  /**
   * Update execution status
   */
  private async updateExecutionStatus(
    executionId: string,
    status: string
  ): Promise<void> {
    const data: Record<string, unknown> = { status };
    if (status === "running") {
      data.startedAt = new Date();
    }

    await prisma.agentExecution.update({
      where: { id: executionId },
      data,
    });
  }

  /**
   * Complete execution successfully
   */
  private async completeExecution(
    executionId: string,
    result: Omit<
      ExecutionResult,
      "executionId" | "agentId" | "accountNickname" | "durationMs"
    >,
    durationMs: number
  ): Promise<void> {
    await prisma.agentExecution.update({
      where: { id: executionId },
      data: {
        status: result.success ? "completed" : "failed",
        completedAt: new Date(),
        durationMs,
        outputData: { content: result.content } as Prisma.InputJsonValue,
        errorMessage: result.error,
      },
    });
  }

  /**
   * Fail execution
   */
  private async failExecution(
    executionId: string,
    error: string,
    durationMs: number
  ): Promise<void> {
    await prisma.agentExecution.update({
      where: { id: executionId },
      data: {
        status: "failed",
        completedAt: new Date(),
        durationMs,
        errorMessage: error,
        errorType: "execution_error",
      },
    });
  }

  /**
   * Kill a running process
   */
  killProcess(executionId: string): boolean {
    const proc = this.activeProcesses.get(executionId);
    if (proc) {
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill("SIGKILL");
        }
      }, 5000);
      this.activeProcesses.delete(executionId);
      return true;
    }
    return false;
  }

  /**
   * Get count of active processes
   */
  getActiveProcessCount(): number {
    return this.activeProcesses.size;
  }

  /**
   * Kill all processes (for shutdown)
   */
  killAllProcesses(): void {
    for (const [executionId] of this.activeProcesses) {
      this.killProcess(executionId);
    }
  }

  /**
   * Graceful shutdown
   */
  shutdown(): void {
    logger.info("Shutting down Agent Executor Service");
    this.killAllProcesses();
    this.removeAllListeners();
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let _instance: AgentExecutor | null = null;

export function getAgentExecutor(): AgentExecutor {
  if (!_instance) {
    _instance = new AgentExecutor();
  }
  return _instance;
}

export const agentExecutor = getAgentExecutor();
export default AgentExecutor;
