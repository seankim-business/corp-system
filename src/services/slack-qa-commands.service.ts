/**
 * Slack QA Commands Service
 * Provides QA/QC testing commands via #it-test channel with @Nubabel mention
 */
import { WebClient } from "@slack/web-api";
import type { KnownBlock, SectionBlock, ContextBlock, DividerBlock } from "@slack/web-api";
import { db } from "../db/client";
import { redis, getPoolStats } from "../db/redis";
import { getClaudeMaxPoolService, ClaudeMaxAccountRecord } from "./claude-max-pool";
import { logger } from "../utils/logger";

// ============================================================================
// COMMAND REGISTRY
// ============================================================================

export const QA_COMMANDS: Record<string, string> = {
  "/qa:status": "Show current agent pool status",
  "/qa:accounts": "List Claude Max accounts with usage",
  "/qa:test <prompt>": "Run test prompt through orchestrator",
  "/qa:health": "Health check all services",
  "/qa:logs <session>": "Get recent logs for session",
  "/qa:help": "Show available QA commands",
};

// ============================================================================
// TYPES
// ============================================================================

export interface ParsedQACommand {
  command: string;
  args: string[];
}

export interface HealthCheckResult {
  service: string;
  status: "healthy" | "degraded" | "down";
  latencyMs?: number;
  details?: string;
  error?: string;
}

export interface QACommandContext {
  organizationId: string;
  userId: string;
  channelId: string;
  threadTs?: string;
}

// ============================================================================
// COMMAND PARSER
// ============================================================================

/**
 * Parse QA command from @Nubabel mention text
 * @example "@Nubabel /qa:status" => { command: "/qa:status", args: [] }
 * @example "@Nubabel /qa:test Hello world" => { command: "/qa:test", args: ["Hello", "world"] }
 */
export function parseQACommand(text: string): ParsedQACommand | null {
  // Remove bot mention and trim
  const cleanedText = text.replace(/<@[A-Z0-9]+>/gi, "").trim();

  // Check if it starts with /qa:
  if (!cleanedText.startsWith("/qa:")) {
    return null;
  }

  // Split into parts
  const parts = cleanedText.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  // Validate command exists (strip args from command names for validation)
  const baseCommands = Object.keys(QA_COMMANDS).map((cmd) => cmd.split(" ")[0]);
  if (!baseCommands.includes(command)) {
    return null;
  }

  return { command, args };
}

// ============================================================================
// BLOCK KIT FORMATTERS
// ============================================================================

/**
 * Get status emoji based on health state
 */
function getStatusEmoji(status: "healthy" | "degraded" | "down" | string): string {
  switch (status) {
    case "healthy":
    case "active":
      return "🟢";
    case "degraded":
    case "rate_limited":
      return "🟡";
    case "down":
    case "exhausted":
    case "cooldown":
      return "🔴";
    default:
      return "⚪";
  }
}

/**
 * Format accounts table as Block Kit blocks
 */
export function formatAccountsTable(accounts: ClaudeMaxAccountRecord[]): KnownBlock[] {
  if (accounts.length === 0) {
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "📭 *No Claude Max accounts configured*\nAdd accounts to enable AI orchestration.",
        },
      } as SectionBlock,
    ];
  }

  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `📊 *Claude Max Accounts* (${accounts.length} total)`,
      },
    } as SectionBlock,
    { type: "divider" } as DividerBlock,
  ];

  for (const account of accounts) {
    const statusEmoji = getStatusEmoji(account.status);
    const usageBar = createUsageBar(account.estimatedUsagePercent);
    const cooldownInfo = account.cooldownUntil
      ? `\n⏳ Cooldown until: ${new Date(account.cooldownUntil).toLocaleTimeString()}`
      : "";
    const resetInfo = account.estimatedResetAt
      ? `\n🔄 Resets: ${new Date(account.estimatedResetAt).toLocaleTimeString()}`
      : "";

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          `${statusEmoji} *${account.nickname}* (\`${account.email}\`)`,
          `Status: \`${account.status}\` | Priority: ${account.priority}`,
          `Usage: ${usageBar} ${account.estimatedUsagePercent.toFixed(1)}%`,
          `Rate Limits: ${account.consecutiveRateLimits}x consecutive${cooldownInfo}${resetInfo}`,
        ].join("\n"),
      },
    } as SectionBlock);
  }

  return blocks;
}

/**
 * Create ASCII usage bar
 */
function createUsageBar(percent: number): string {
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;
  return "▓".repeat(filled) + "░".repeat(empty);
}

/**
 * Format health check results as Block Kit blocks
 */
export function formatHealthCheck(results: HealthCheckResult[]): KnownBlock[] {
  const overallStatus = results.every((r) => r.status === "healthy")
    ? "healthy"
    : results.some((r) => r.status === "down")
      ? "down"
      : "degraded";

  const overallEmoji = getStatusEmoji(overallStatus);

  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${overallEmoji} *System Health Check*\nOverall: \`${overallStatus.toUpperCase()}\``,
      },
    } as SectionBlock,
    { type: "divider" } as DividerBlock,
  ];

  for (const result of results) {
    const emoji = getStatusEmoji(result.status);
    const latency = result.latencyMs ? ` (${result.latencyMs}ms)` : "";
    const details = result.details ? `\n_${result.details}_` : "";
    const error = result.error ? `\n❌ Error: ${result.error}` : "";

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${emoji} *${result.service}*${latency}${details}${error}`,
      },
    } as SectionBlock);
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `🕐 Checked at: ${new Date().toISOString()}`,
      },
    ],
  } as ContextBlock);

  return blocks;
}

/**
 * Format agent activity logs as Block Kit blocks
 */
function formatActivityLogs(
  activities: Array<{
    id: string;
    agentType: string;
    agentName: string | null;
    status: string;
    category: string | null;
    taskDescription: string | null;
    createdAt: Date;
    durationMs: number | null;
    errorMessage: string | null;
  }>,
): KnownBlock[] {
  if (activities.length === 0) {
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "📭 *No activity logs found for this session*",
        },
      } as SectionBlock,
    ];
  }

  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `📋 *Recent Activity Logs* (${activities.length} entries)`,
      },
    } as SectionBlock,
    { type: "divider" } as DividerBlock,
  ];

  for (const activity of activities.slice(0, 10)) {
    const emoji = getStatusEmoji(activity.status);
    const duration = activity.durationMs ? `${(activity.durationMs / 1000).toFixed(2)}s` : "N/A";
    const error = activity.errorMessage ? `\n❌ ${activity.errorMessage}` : "";

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          `${emoji} *${activity.agentName || activity.agentType}*`,
          `Status: \`${activity.status}\` | Duration: ${duration}`,
          activity.taskDescription ? `Task: ${activity.taskDescription.slice(0, 100)}...` : "",
          error,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    } as SectionBlock);
  }

  return blocks;
}

/**
 * Format help message as Block Kit blocks
 */
function formatHelpMessage(): KnownBlock[] {
  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "📚 *QA Commands Help*\nAvailable commands for testing and monitoring:",
      },
    } as SectionBlock,
    { type: "divider" } as DividerBlock,
  ];

  for (const [command, description] of Object.entries(QA_COMMANDS)) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `\`${command}\`\n${description}`,
      },
    } as SectionBlock);
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "💡 Tip: Use these commands in #it-test channel with @Nubabel mention",
      },
    ],
  } as ContextBlock);

  return blocks;
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

/**
 * Handle /qa:status command - Show current agent pool status
 */
async function handleStatusCommand(
  context: QACommandContext,
  _client: WebClient,
): Promise<KnownBlock[]> {
  const poolStats = getPoolStats();

  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "🏊 *Agent Pool Status*",
      },
    } as SectionBlock,
    { type: "divider" } as DividerBlock,
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          "*Redis Queue Pool*",
          `Total: ${poolStats.queue.total} | Available: ${poolStats.queue.available}`,
          `In Use: ${poolStats.queue.inUse} | Ready: ${poolStats.queue.ready}`,
        ].join("\n"),
      },
    } as SectionBlock,
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          "*Redis Worker Pool*",
          `Total: ${poolStats.worker.total} | Available: ${poolStats.worker.available}`,
          `In Use: ${poolStats.worker.inUse} | Ready: ${poolStats.worker.ready}`,
        ].join("\n"),
      },
    } as SectionBlock,
  ];

  // Get active agent activities count
  try {
    const activeAgents = await (db as any).agentActivity.count({
      where: {
        organizationId: context.organizationId,
        status: { in: ["pending", "running"] },
      },
    });

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Active Agents*: ${activeAgents}`,
      },
    } as SectionBlock);
  } catch {
    // AgentActivity table might not exist
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `🕐 Status at: ${new Date().toISOString()}`,
      },
    ],
  } as ContextBlock);

  return blocks;
}

/**
 * Handle /qa:accounts command - List Claude Max accounts with usage
 */
async function handleAccountsCommand(
  context: QACommandContext,
  _client: WebClient,
): Promise<KnownBlock[]> {
  const poolService = getClaudeMaxPoolService();
  const accounts = await poolService.getAccounts(context.organizationId);
  return formatAccountsTable(accounts);
}

/**
 * Handle /qa:test command - Run test prompt through orchestrator
 */
async function handleTestCommand(
  context: QACommandContext,
  _client: WebClient,
  args: string[],
): Promise<KnownBlock[]> {
  if (args.length === 0) {
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "❌ *Error*: Please provide a test prompt.\n\nUsage: `/qa:test <prompt>`\nExample: `/qa:test Hello, can you help me?`",
        },
      } as SectionBlock,
    ];
  }

  const testPrompt = args.join(" ");

  // Log the test execution
  logger.info("QA test command executed", {
    organizationId: context.organizationId,
    userId: context.userId,
    prompt: testPrompt.slice(0, 100),
  });

  // Create a test execution record
  try {
    const execution = await db.orchestratorExecution.create({
      data: {
        organizationId: context.organizationId,
        userId: context.userId,
        sessionId: `qa-test-${Date.now()}`,
        category: "qa-test",
        skills: [],
        status: "pending",
        inputData: { prompt: testPrompt, source: "slack-qa" },
      },
    });

    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            "🧪 *Test Execution Started*",
            `Execution ID: \`${execution.id.slice(0, 8)}...\``,
            `Prompt: "${testPrompt.slice(0, 100)}${testPrompt.length > 100 ? "..." : ""}"`,
            "",
            "_Note: Full orchestration requires the sidecar to be running._",
            "_Check execution status with `/qa:logs ${execution.id.slice(0, 8)}`_",
          ].join("\n"),
        },
      } as SectionBlock,
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `🕐 Started at: ${new Date().toISOString()}`,
          },
        ],
      } as ContextBlock,
    ];
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `❌ *Test Execution Failed*\nError: ${errorMessage}`,
        },
      } as SectionBlock,
    ];
  }
}

/**
 * Handle /qa:health command - Health check all services
 */
async function handleHealthCommand(
  context: QACommandContext,
  _client: WebClient,
): Promise<KnownBlock[]> {
  const results: HealthCheckResult[] = [];

  // Check PostgreSQL
  const pgStart = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    results.push({
      service: "PostgreSQL",
      status: "healthy",
      latencyMs: Date.now() - pgStart,
      details: "Database connection OK",
    });
  } catch (error) {
    results.push({
      service: "PostgreSQL",
      status: "down",
      latencyMs: Date.now() - pgStart,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Check Redis
  const redisStart = Date.now();
  try {
    await redis.set("health:check", "ok", 10);
    const value = await redis.get("health:check");
    if (value === "ok") {
      results.push({
        service: "Redis",
        status: "healthy",
        latencyMs: Date.now() - redisStart,
        details: "Cache connection OK",
      });
    } else {
      results.push({
        service: "Redis",
        status: "degraded",
        latencyMs: Date.now() - redisStart,
        details: "Read/write mismatch",
      });
    }
  } catch (error) {
    results.push({
      service: "Redis",
      status: "down",
      latencyMs: Date.now() - redisStart,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Check Redis Pool Stats
  try {
    const poolStats = getPoolStats();
    const queueHealthy = poolStats.queue.ready >= poolStats.queue.total * 0.5;
    const workerHealthy = poolStats.worker.ready >= poolStats.worker.total * 0.5;

    results.push({
      service: "Redis Pools",
      status: queueHealthy && workerHealthy ? "healthy" : "degraded",
      details: `Queue: ${poolStats.queue.ready}/${poolStats.queue.total}, Worker: ${poolStats.worker.ready}/${poolStats.worker.total}`,
    });
  } catch (error) {
    results.push({
      service: "Redis Pools",
      status: "down",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Check Claude Max Pool
  try {
    const poolService = getClaudeMaxPoolService();
    const accounts = await poolService.getAccounts(context.organizationId);
    const activeAccounts = accounts.filter((a) => a.status === "active").length;

    results.push({
      service: "Claude Max Pool",
      status: activeAccounts > 0 ? "healthy" : accounts.length > 0 ? "degraded" : "down",
      details: `${activeAccounts}/${accounts.length} accounts active`,
    });
  } catch (error) {
    results.push({
      service: "Claude Max Pool",
      status: "degraded",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Check Slack Integration
  try {
    const slackIntegration = await db.slackIntegration.findFirst({
      where: { organizationId: context.organizationId },
    });

    if (slackIntegration?.enabled) {
      results.push({
        service: "Slack Integration",
        status: "healthy",
        details: `Workspace: ${slackIntegration.workspaceName || "Connected"}`,
      });
    } else {
      results.push({
        service: "Slack Integration",
        status: slackIntegration ? "degraded" : "down",
        details: slackIntegration ? "Integration disabled" : "Not configured",
      });
    }
  } catch (error) {
    results.push({
      service: "Slack Integration",
      status: "down",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return formatHealthCheck(results);
}

/**
 * Handle /qa:logs command - Get recent logs for session
 */
async function handleLogsCommand(
  context: QACommandContext,
  _client: WebClient,
  args: string[],
): Promise<KnownBlock[]> {
  const sessionIdPrefix = args[0];

  try {
    let activities;

    if (sessionIdPrefix) {
      activities = await (db as any).agentActivity.findMany({
        where: {
          organizationId: context.organizationId,
          sessionId: { startsWith: sessionIdPrefix },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
    } else {
      activities = await (db as any).agentActivity.findMany({
        where: {
          organizationId: context.organizationId,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
    }

    return formatActivityLogs(activities);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to fetch activity logs", { error: errorMessage });

    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `❌ *Error fetching logs*\n${errorMessage}`,
        },
      } as SectionBlock,
    ];
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Handle QA command from Slack message
 * @returns true if command was handled, false to pass to regular orchestrator
 */
export async function handleQACommand(
  text: string,
  context: QACommandContext,
  client: WebClient,
): Promise<{ handled: boolean; blocks?: KnownBlock[] }> {
  const parsed = parseQACommand(text);

  if (!parsed) {
    return { handled: false };
  }

  logger.info("QA command received", {
    command: parsed.command,
    args: parsed.args,
    organizationId: context.organizationId,
  });

  let blocks: KnownBlock[];

  try {
    switch (parsed.command) {
      case "/qa:status":
        blocks = await handleStatusCommand(context, client);
        break;

      case "/qa:accounts":
        blocks = await handleAccountsCommand(context, client);
        break;

      case "/qa:test":
        blocks = await handleTestCommand(context, client, parsed.args);
        break;

      case "/qa:health":
        blocks = await handleHealthCommand(context, client);
        break;

      case "/qa:logs":
        blocks = await handleLogsCommand(context, client, parsed.args);
        break;

      case "/qa:help":
        blocks = formatHelpMessage();
        break;

      default:
        blocks = [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `❓ Unknown command: \`${parsed.command}\`\n\nUse \`/qa:help\` to see available commands.`,
            },
          } as SectionBlock,
        ];
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("QA command handler error", {
      command: parsed.command,
      error: errorMessage,
    });

    blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `❌ *Command Error*\n\`${parsed.command}\` failed: ${errorMessage}`,
        },
      } as SectionBlock,
    ];
  }

  return { handled: true, blocks };
}

export default {
  QA_COMMANDS,
  parseQACommand,
  handleQACommand,
  formatAccountsTable,
  formatHealthCheck,
};
