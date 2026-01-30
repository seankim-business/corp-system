/**
 * Native Slash Commands for Nubabel Bot
 *
 * OpenClaw-style native commands for controlling bot behavior.
 */

import { WebClient } from "@slack/web-api";
import { logger } from "../utils/logger";
import { redis } from "../db/redis";

// Command registry
export interface NativeCommand {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  handler: (ctx: CommandContext) => Promise<CommandResponse>;
}

export interface CommandContext {
  userId: string;
  channelId: string;
  threadTs?: string;
  organizationId: string;
  sessionId: string;
  args: string[];
  client: WebClient;
}

export interface CommandResponse {
  text: string;
  blocks?: any[];
  ephemeral?: boolean; // If true, only visible to user
}

// Session preferences stored in Redis
interface SessionPreferences {
  thinkingLevel: "brief" | "normal" | "detailed";
  verboseMode: boolean;
  locale: "en" | "ko";
}

const PREFS_KEY = (sessionId: string) => `nubabel:prefs:${sessionId}`;
const PREFS_TTL = 86400 * 7; // 7 days

async function getPreferences(sessionId: string): Promise<SessionPreferences> {
  const data = await redis.get(PREFS_KEY(sessionId));
  if (data) {
    try {
      return JSON.parse(data);
    } catch {}
  }
  return { thinkingLevel: "normal", verboseMode: false, locale: "en" };
}

async function setPreferences(sessionId: string, prefs: Partial<SessionPreferences>): Promise<void> {
  const current = await getPreferences(sessionId);
  const updated = { ...current, ...prefs };
  await redis.set(PREFS_KEY(sessionId), JSON.stringify(updated), PREFS_TTL);
}

// Command implementations
const commands: NativeCommand[] = [
  {
    name: "help",
    aliases: ["?", "commands"],
    description: "Show available commands",
    usage: "/nubabel help",
    handler: async () => ({
      text: `*Nubabel Commands* 🦞\n\n` +
        `• \`/nubabel status\` - Show session info\n` +
        `• \`/nubabel reset\` - Start a new conversation\n` +
        `• \`/nubabel think [brief|normal|detailed]\` - Set reasoning depth\n` +
        `• \`/nubabel verbose [on|off]\` - Toggle detailed output\n` +
        `• \`/nubabel usage\` - Show token usage\n` +
        `• \`/nubabel help\` - Show this help`,
      ephemeral: true,
    }),
  },
  {
    name: "status",
    aliases: ["info", "session"],
    description: "Show current session status",
    usage: "/nubabel status",
    handler: async (ctx) => {
      const prefs = await getPreferences(ctx.sessionId);
      const sessionData = await redis.get(`session:${ctx.sessionId}`);

      let sessionInfo = "No active session";
      if (sessionData) {
        try {
          const session = JSON.parse(sessionData);
          sessionInfo = `Started: ${new Date(session.createdAt).toLocaleString()}\n` +
            `Messages: ${session.messageCount || 0}`;
        } catch {}
      }

      return {
        text: `*Session Status* 📊\n\n` +
          `*Session ID:* \`${ctx.sessionId.substring(0, 12)}...\`\n` +
          `*Channel:* <#${ctx.channelId}>\n` +
          `*Thinking Level:* ${prefs.thinkingLevel}\n` +
          `*Verbose Mode:* ${prefs.verboseMode ? "On" : "Off"}\n\n` +
          `${sessionInfo}`,
        ephemeral: true,
      };
    },
  },
  {
    name: "reset",
    aliases: ["new", "clear"],
    description: "Start a new conversation",
    usage: "/nubabel reset",
    handler: async (ctx) => {
      // Clear session data
      await redis.del(`session:${ctx.sessionId}`);
      await redis.del(`session:state:${ctx.sessionId}`);

      return {
        text: `✨ *Conversation reset!*\n\nStarting fresh. How can I help you?`,
        ephemeral: false,
      };
    },
  },
  {
    name: "think",
    aliases: ["reasoning", "depth"],
    description: "Set reasoning depth",
    usage: "/nubabel think [brief|normal|detailed]",
    handler: async (ctx) => {
      const level = ctx.args[0]?.toLowerCase();
      const validLevels = ["brief", "normal", "detailed"];

      if (!level || !validLevels.includes(level)) {
        const prefs = await getPreferences(ctx.sessionId);
        return {
          text: `*Current thinking level:* ${prefs.thinkingLevel}\n\n` +
            `Usage: \`/nubabel think [brief|normal|detailed]\`\n\n` +
            `• *brief* - Quick, concise responses\n` +
            `• *normal* - Balanced reasoning (default)\n` +
            `• *detailed* - Thorough explanations`,
          ephemeral: true,
        };
      }

      await setPreferences(ctx.sessionId, {
        thinkingLevel: level as "brief" | "normal" | "detailed"
      });

      const emoji = level === "brief" ? "⚡" : level === "detailed" ? "🔬" : "💭";
      return {
        text: `${emoji} Thinking level set to *${level}*`,
        ephemeral: true,
      };
    },
  },
  {
    name: "verbose",
    aliases: ["debug", "detailed"],
    description: "Toggle verbose output",
    usage: "/nubabel verbose [on|off]",
    handler: async (ctx) => {
      const arg = ctx.args[0]?.toLowerCase();
      const prefs = await getPreferences(ctx.sessionId);

      let newValue: boolean;
      if (arg === "on" || arg === "true" || arg === "1") {
        newValue = true;
      } else if (arg === "off" || arg === "false" || arg === "0") {
        newValue = false;
      } else {
        // Toggle if no argument
        newValue = !prefs.verboseMode;
      }

      await setPreferences(ctx.sessionId, { verboseMode: newValue });

      return {
        text: `🔧 Verbose mode is now *${newValue ? "ON" : "OFF"}*`,
        ephemeral: true,
      };
    },
  },
  {
    name: "usage",
    aliases: ["tokens", "cost"],
    description: "Show token usage for current session",
    usage: "/nubabel usage",
    handler: async (ctx) => {
      // Get usage data from Redis or database
      const usageKey = `usage:session:${ctx.sessionId}`;
      const usageData = await redis.get(usageKey);

      let usage = { inputTokens: 0, outputTokens: 0, cost: 0, requests: 0 };
      if (usageData) {
        try {
          usage = JSON.parse(usageData);
        } catch {}
      }

      return {
        text: `*Token Usage* 📈\n\n` +
          `*Input tokens:* ${usage.inputTokens.toLocaleString()}\n` +
          `*Output tokens:* ${usage.outputTokens.toLocaleString()}\n` +
          `*Total tokens:* ${(usage.inputTokens + usage.outputTokens).toLocaleString()}\n` +
          `*Estimated cost:* $${usage.cost.toFixed(4)}\n` +
          `*Requests:* ${usage.requests}`,
        ephemeral: true,
      };
    },
  },
];

// Command registry lookup
const commandMap = new Map<string, NativeCommand>();
commands.forEach(cmd => {
  commandMap.set(cmd.name, cmd);
  cmd.aliases.forEach(alias => commandMap.set(alias, cmd));
});

/**
 * Check if text is a native command
 */
export function isNativeCommand(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed.startsWith("/nubabel")) return false;

  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return true; // Just /nubabel shows help

  const cmdName = parts[1];
  return commandMap.has(cmdName);
}

/**
 * Parse and execute a native command
 */
export async function executeNativeCommand(
  text: string,
  ctx: Omit<CommandContext, "args">,
): Promise<CommandResponse | null> {
  const trimmed = text.trim();
  const parts = trimmed.split(/\s+/);

  // Handle bare /nubabel
  if (parts.length < 2 || parts[0].toLowerCase() !== "/nubabel") {
    return commands.find(c => c.name === "help")!.handler({ ...ctx, args: [] });
  }

  const cmdName = parts[1].toLowerCase();
  const args = parts.slice(2);

  const command = commandMap.get(cmdName);
  if (!command) {
    return {
      text: `❌ Unknown command: \`${cmdName}\`\n\nType \`/nubabel help\` to see available commands.`,
      ephemeral: true,
    };
  }

  try {
    logger.info("Executing native command", { command: cmdName, args, userId: ctx.userId });
    return await command.handler({ ...ctx, args });
  } catch (error) {
    logger.error("Native command failed", { command: cmdName, error });
    return {
      text: `❌ Command failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      ephemeral: true,
    };
  }
}

/**
 * Get all available commands (for help/documentation)
 */
export function getAllCommands(): NativeCommand[] {
  return commands;
}
