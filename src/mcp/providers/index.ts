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
    {
      name: "notion",
      envKey: "NOTION_API_KEY",
      loader: async () => {
        const { createNotionProvider } = await import("./notion");
        return createNotionProvider() as unknown as MCPProvider;
      },
    },
    {
      name: "marketplace-hub",
      envKey: "MARKETPLACE_HUB_ENABLED", // Will load even if not set, see loader
      loader: async () => {
        const { createMarketplaceHubProvider } = await import(
          "./marketplace-hub"
        );
        return createMarketplaceHubProvider() as unknown as MCPProvider;
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

  // Always load marketplace-hub (no env key required)
  try {
    const { createMarketplaceHubProvider } = await import("./marketplace-hub");
    const provider = createMarketplaceHubProvider() as unknown as MCPProvider;
    registerProvider(provider);
    loaded.push("marketplace-hub");
  } catch (err) {
    logger.warn("Failed to load marketplace-hub provider", {
      error: String(err),
    });
  }

  // Always load resource-registry (core internal provider)
  try {
    const { resourceRegistryProvider } = await import("./resource-registry");
    registerProvider(resourceRegistryProvider as unknown as MCPProvider);
    loaded.push("resource-registry");
  } catch (err) {
    logger.warn("Failed to load resource-registry provider", {
      error: String(err),
    });
  }

  // Always load workflow provider (core internal provider)
  try {
    const { createWorkflowProvider } = await import("./workflow");
    registerProvider(createWorkflowProvider() as unknown as MCPProvider);
    loaded.push("workflow");
  } catch (err) {
    logger.warn("Failed to load workflow provider", {
      error: String(err),
    });
  }

  // Always load memory provider (core internal provider)
  try {
    const { createMemoryProvider } = await import("./memory");
    registerProvider(createMemoryProvider() as unknown as MCPProvider);
    loaded.push("memory");
  } catch (err) {
    logger.warn("Failed to load memory provider", {
      error: String(err),
    });
  }

  // Always load schedule provider (core internal provider)
  try {
    const { createScheduleProvider } = await import("./schedule");
    registerProvider(createScheduleProvider() as unknown as MCPProvider);
    loaded.push("schedule");
  } catch (err) {
    logger.warn("Failed to load schedule provider", {
      error: String(err),
    });
  }

  // Always load analytics provider (core internal provider)
  try {
    const { createAnalyticsProvider } = await import("./analytics");
    registerProvider(createAnalyticsProvider() as unknown as MCPProvider);
    loaded.push("analytics");
  } catch (err) {
    logger.warn("Failed to load analytics provider", {
      error: String(err),
    });
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
