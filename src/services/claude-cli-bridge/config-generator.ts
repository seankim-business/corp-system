/**
 * Claude CLI Config Generator
 * Creates per-agent CLAUDE.md and MCP config files in temp directories
 */

import * as fs from "fs/promises";
import * as crypto from "crypto";
import * as path from "path";
import { Agent } from "@prisma/client";
import { logger } from "../../utils/logger";
import { DecryptedCredential } from "../agent-credential-vault";

// ============================================================================
// Types
// ============================================================================

export interface AgentEnvironment {
  tempDir: string;
  claudeMdPath: string;
  mcpConfigPath: string;
  envVars: Record<string, string>;
}

export interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface MCPServersConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

// ============================================================================
// Config Generator
// ============================================================================

const TEMP_BASE = "/tmp/nubabel-agent";

export class ConfigGenerator {
  /**
   * Create isolated environment for agent execution
   */
  async createAgentEnvironment(
    agent: Agent,
    executionId: string,
    credentials: DecryptedCredential[]
  ): Promise<AgentEnvironment> {
    const tempDir = `${TEMP_BASE}-${executionId}`;

    logger.info("Creating agent environment", {
      agentId: agent.id,
      executionId,
      tempDir,
    });

    // Create temp directory with restricted permissions
    await fs.mkdir(tempDir, { recursive: true, mode: 0o700 });

    // Create .claude subdirectory (Claude CLI expects this)
    const claudeConfigDir = path.join(tempDir, ".claude");
    await fs.mkdir(claudeConfigDir, { recursive: true, mode: 0o700 });

    // 1. Generate CLAUDE.md
    const claudeMdPath = path.join(tempDir, "CLAUDE.md");
    const claudeMdContent = this.buildClaudeMd(agent);
    await fs.writeFile(claudeMdPath, claudeMdContent, { mode: 0o600 });

    // 2. Generate MCP config (settings.json format)
    const mcpConfigPath = path.join(claudeConfigDir, "settings.json");
    const mcpConfig = this.buildMcpConfig(agent, credentials);
    await fs.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), { mode: 0o600 });

    // 3. Build environment variables
    const envVars: Record<string, string> = {
      HOME: tempDir, // Override HOME so Claude CLI uses our config
      ANTHROPIC_CONFIG_DIR: tempDir,
      CLAUDE_CONFIG_DIR: tempDir,
      // Inject credentials as env vars for MCP servers
      ...this.credentialsToEnvVars(credentials),
    };

    logger.debug("Agent environment created", {
      agentId: agent.id,
      executionId,
      claudeMdPath,
      mcpConfigPath,
      credentialCount: credentials.length,
    });

    return {
      tempDir,
      claudeMdPath,
      mcpConfigPath,
      envVars,
    };
  }

  /**
   * Cleanup temp directory securely
   */
  async cleanup(tempDir: string): Promise<void> {
    try {
      logger.debug("Cleaning up agent temp dir", { tempDir });

      // Recursive secure delete
      await this.secureDeleteDir(tempDir);

      logger.info("Agent temp dir cleaned up", { tempDir });
    } catch (error) {
      logger.error("Failed to cleanup agent temp dir", {
        tempDir,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  /**
   * Securely delete a directory (overwrite files before deletion)
   */
  private async secureDeleteDir(dirPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          await this.secureDeleteDir(fullPath);
        } else {
          // Overwrite file with random data before deletion
          const stat = await fs.stat(fullPath);
          if (stat.size > 0) {
            await fs.writeFile(fullPath, crypto.randomBytes(stat.size));
          }
          await fs.unlink(fullPath);
        }
      }

      await fs.rmdir(dirPath);
    } catch (error) {
      // Directory might not exist, that's ok
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  /**
   * Build CLAUDE.md content for an agent
   */
  private buildClaudeMd(agent: Agent): string {
    const displayName = agent.displayName || agent.name;
    const position = agent.position || "Team Member";
    const department = agent.department || "General";
    const skills = agent.skills?.join(", ") || "None specified";
    const permissionLevel = agent.permissionLevel || "member";

    let content = `# Agent: ${displayName}

## Role
${agent.role}

## Position
${position}

## Department
${department}

## Skills
${skills}

## Permissions
Level: ${permissionLevel}

## Tool Access
${this.formatToolAccess(agent)}

## Behavior Guidelines
- Act within your role and permission level
- Escalate to manager when encountering tasks beyond your scope
- Log all significant actions for audit
`;

    // Append agent-specific CLAUDE.md if exists
    if (agent.claudeMdContent) {
      content += `\n---\n\n# Custom Instructions\n\n${agent.claudeMdContent}`;
    }

    return content;
  }

  /**
   * Format tool access information
   */
  private formatToolAccess(agent: Agent): string {
    const allowlist = agent.toolAllowlist || [];
    const denylist = agent.toolDenylist || [];

    if (allowlist.length === 0 && denylist.length === 0) {
      return "All tools available (no restrictions)";
    }

    let access = "";

    if (allowlist.length > 0) {
      access += `Allowed tools: ${allowlist.join(", ")}\n`;
    }

    if (denylist.length > 0) {
      access += `Denied tools: ${denylist.join(", ")}\n`;
    }

    return access;
  }

  /**
   * Build MCP config for an agent
   */
  private buildMcpConfig(
    agent: Agent,
    credentials: DecryptedCredential[]
  ): { mcpServers: Record<string, MCPServerConfig> } {
    // Start with agent's stored MCP config
    const storedConfig = (agent.mcpConfigJson as unknown as MCPServersConfig) || { mcpServers: {} };
    const mcpServers: Record<string, MCPServerConfig> = { ...storedConfig.mcpServers };

    // Standard MCP servers based on available credentials
    for (const cred of credentials) {
      const serverConfig = this.getDefaultMcpServer(cred.provider);
      if (serverConfig && !mcpServers[cred.provider]) {
        mcpServers[cred.provider] = {
          ...serverConfig,
          // Credentials will be passed via env vars
        };
      }
    }

    return { mcpServers };
  }

  /**
   * Get default MCP server config for a provider
   */
  private getDefaultMcpServer(provider: string): MCPServerConfig | null {
    const servers: Record<string, MCPServerConfig> = {
      notion: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-notion"],
      },
      linear: {
        command: "npx",
        args: ["-y", "@linear/mcp-server"],
      },
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
      },
      slack: {
        command: "npx",
        args: ["-y", "@anthropic/mcp-server-slack"],
      },
      exa: {
        command: "npx",
        args: ["-y", "exa-mcp-server"],
      },
    };

    return servers[provider.toLowerCase()] || null;
  }

  /**
   * Convert credentials to environment variables
   */
  private credentialsToEnvVars(credentials: DecryptedCredential[]): Record<string, string> {
    const envVars: Record<string, string> = {};

    for (const cred of credentials) {
      // Standard provider env var names
      const envKey = this.getCredentialEnvKey(cred.provider, cred.type);
      if (envKey) {
        envVars[envKey] = cred.value;
      }

      // Also set Nubabel-prefixed version
      const nubabelKey = `NUBABEL_${cred.provider.toUpperCase()}_${cred.type.toUpperCase()}`;
      envVars[nubabelKey] = cred.value;
    }

    return envVars;
  }

  /**
   * Get standard env key for a credential
   */
  private getCredentialEnvKey(provider: string, type: string): string | null {
    const mapping: Record<string, string> = {
      notion_oauth_token: "NOTION_API_KEY",
      notion_api_key: "NOTION_API_KEY",
      linear_oauth_token: "LINEAR_API_KEY",
      linear_api_key: "LINEAR_API_KEY",
      github_oauth_token: "GITHUB_PERSONAL_ACCESS_TOKEN",
      github_token: "GITHUB_PERSONAL_ACCESS_TOKEN",
      slack_oauth_token: "SLACK_BOT_TOKEN",
      slack_token: "SLACK_BOT_TOKEN",
      exa_api_key: "EXA_API_KEY",
    };

    const key = `${provider.toLowerCase()}_${type.toLowerCase()}`;
    return mapping[key] || null;
  }
}

// ============================================================================
// Orphan Cleanup (for cron job)
// ============================================================================

/**
 * Clean up orphaned agent temp directories
 * Should be called by a cron job every 30 minutes
 */
export async function cleanupOrphanedAgentDirs(): Promise<void> {
  const tmpDir = "/tmp";
  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  try {
    const entries = await fs.readdir(tmpDir);
    const generator = new ConfigGenerator();

    let cleanedCount = 0;

    for (const entry of entries) {
      if (entry.startsWith("nubabel-agent-")) {
        const fullPath = path.join(tmpDir, entry);

        try {
          const stat = await fs.stat(fullPath);

          if (stat.mtimeMs < oneHourAgo) {
            await generator.cleanup(fullPath);
            cleanedCount++;
            logger.info("Cleaned up orphaned agent dir", { path: fullPath });
          }
        } catch (error) {
          // Skip if we can't stat the directory
          logger.debug("Could not stat potential orphan dir", {
            path: fullPath,
            error: error instanceof Error ? error.message : error,
          });
        }
      }
    }

    if (cleanedCount > 0) {
      logger.info("Orphan cleanup complete", { cleanedCount });
    }
  } catch (error) {
    logger.error("Orphan cleanup failed", {
      error: error instanceof Error ? error.message : error,
    });
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const configGenerator = new ConfigGenerator();
export default configGenerator;
