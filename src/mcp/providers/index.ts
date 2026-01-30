/**
 * MCP Provider Registry
 *
 * Barrel export and dynamic provider loader for all MCP integrations.
 * Each provider implements a standard interface for tool discovery and execution.
 */
import { logger } from "../../utils/logger";
import { MCPTool, CallContext, ToolCallResult } from "../types";

// =============================================================================
// Provider Interface
// =============================================================================

export interface MCPProvider {
  readonly name: string;
  getTools(): MCPTool[];
  executeTool(
    toolName: string,
    args: Record<string, unknown>,
    context: CallContext,
  ): Promise<ToolCallResult>;
}

// =============================================================================
// Provider Registry
// =============================================================================

const providers = new Map<string, MCPProvider>();

/**
 * Register an MCP provider instance.
 */
export function registerProvider(provider: MCPProvider): void {
  providers.set(provider.name, provider);
  logger.info("MCP provider registered", {
    name: provider.name,
    toolCount: provider.getTools().length,
  });
}

/**
 * Get a registered provider by name.
 */
export function getProvider(name: string): MCPProvider | undefined {
  return providers.get(name);
}

/**
 * Get all registered providers.
 */
export function getAllProviders(): MCPProvider[] {
  return Array.from(providers.values());
}

/**
 * Get all tools from all registered providers.
 */
export function getAllProviderTools(): MCPTool[] {
  const tools: MCPTool[] = [];
  for (const provider of providers.values()) {
    tools.push(...provider.getTools());
  }
  return tools;
}

/**
 * Execute a tool by finding the right provider.
 */
export async function executeProviderTool(
  toolName: string,
  args: Record<string, unknown>,
  context: CallContext,
): Promise<ToolCallResult> {
  for (const provider of providers.values()) {
    const tool = provider.getTools().find((t) => t.name === toolName);
    if (tool) {
      return provider.executeTool(toolName, args, context);
    }
  }
  return {
    success: false,
    error: {
      code: "TOOL_NOT_FOUND",
      message: `No provider found for tool: ${toolName}`,
    },
    metadata: { duration: 0, cached: false },
  };
}

/**
 * Dynamically load available providers based on environment configuration.
 */
export async function loadAvailableProviders(): Promise<string[]> {
  const loaded: string[] = [];

  const providerConfigs: Array<{
    name: string;
    envKey: string;
    loader: () => Promise<MCPProvider>;
  }> = [
    {
      name: "linear",
      envKey: "LINEAR_API_KEY",
      loader: async () => {
        const { createLinearProvider } = await import("./linear");
        return createLinearProvider() as unknown as MCPProvider;
      },
    },
    {
      name: "jira",
      envKey: "JIRA_API_TOKEN",
      loader: async () => {
        const { createJiraProvider } = await import("./jira");
        return createJiraProvider() as unknown as MCPProvider;
      },
    },
    {
      name: "asana",
      envKey: "ASANA_ACCESS_TOKEN",
      loader: async () => {
        const { createAsanaProvider } = await import("./asana");
        return createAsanaProvider() as unknown as MCPProvider;
      },
    },
    {
      name: "airtable",
      envKey: "AIRTABLE_ACCESS_TOKEN",
      loader: async () => {
        const { createAirtableProvider } = await import("./airtable");
        return createAirtableProvider() as unknown as MCPProvider;
      },
    },
    {
      name: "github",
      envKey: "GITHUB_TOKEN",
      loader: async () => {
        const { createGitHubProvider } = await import("./github");
        return createGitHubProvider() as unknown as MCPProvider;
      },
    },
    {
      name: "google-drive",
      envKey: "GOOGLE_DRIVE_ACCESS_TOKEN",
      loader: async () => {
        const { createGoogleDriveProvider } = await import("./google-drive");
        return createGoogleDriveProvider() as unknown as MCPProvider;
      },
    },
    {
      name: "slack",
      envKey: "SLACK_BOT_TOKEN",
      loader: async () => {
        const { createSlackProvider } = await import("./slack");
        return createSlackProvider() as unknown as MCPProvider;
      },
    },
  ];

  for (const config of providerConfigs) {
    if (process.env[config.envKey]) {
      try {
        const provider = await config.loader();
        registerProvider(provider);
        loaded.push(config.name);
      } catch (err) {
        logger.warn("Failed to load MCP provider", {
          name: config.name,
          error: String(err),
        });
      }
    }
  }

  logger.info("MCP providers loaded", { count: loaded.length, providers: loaded });
  return loaded;
}

/**
 * Get provider stats.
 */
export function getProviderStats(): {
  totalProviders: number;
  totalTools: number;
  providers: Array<{ name: string; toolCount: number }>;
} {
  const providerList = Array.from(providers.entries()).map(([name, p]) => ({
    name,
    toolCount: p.getTools().length,
  }));

  return {
    totalProviders: providers.size,
    totalTools: providerList.reduce((sum, p) => sum + p.toolCount, 0),
    providers: providerList,
  };
}
