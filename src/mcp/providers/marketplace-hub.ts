/**
 * Marketplace Hub MCP Provider
 *
 * Provides MCP tools for searching, installing, and managing extensions
 * from external marketplace sources.
 */

import { MCPTool, CallContext, ToolCallResult } from "../types";
import {
  searchMarketplaceTool,
} from "../../mcp-servers/marketplace-hub/tools/searchMarketplace";
import {
  installExtensionTool,
} from "../../mcp-servers/marketplace-hub/tools/installExtension";
import {
  recommendToolsTool,
} from "../../mcp-servers/marketplace-hub/tools/recommendTools";
import {
  getInstalledExtensionsTool,
} from "../../mcp-servers/marketplace-hub/tools/getInstalledExtensions";
import {
  uninstallExtensionTool,
} from "../../mcp-servers/marketplace-hub/tools/uninstallExtension";
import {
  listApiKeysTool,
  setApiKeyTool,
  deleteApiKeyTool,
} from "../../mcp-servers/marketplace-hub/tools/apiKeyManagement";
import { logger } from "../../utils/logger";

const TOOLS: MCPTool[] = [
  {
    name: "marketplace-hub__searchMarketplace",
    description:
      "Search for tools and extensions across external marketplaces (Smithery, MCP Registry, Glama, ComfyUI, CivitAI, LangChain Hub)",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        sources: {
          type: "array",
          items: { type: "string" },
          description: "Source IDs to search (optional)",
        },
        type: {
          type: "string",
          description:
            "Extension type filter (mcp_server, workflow, prompt, skill)",
        },
        limit: { type: "number", description: "Max results (default 20)" },
      },
      required: ["query"],
    },
    outputSchema: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: { type: "object" },
        },
      },
    },
    provider: "marketplace-hub",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "marketplace-hub__installExtension",
    description: "Install an extension from an external marketplace source",
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: "Source ID (e.g., smithery, mcp-registry)",
        },
        itemId: { type: "string", description: "Item ID within the source" },
        config: {
          type: "object",
          description: "Optional installation configuration",
        },
      },
      required: ["source", "itemId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        extensionId: { type: "string" },
      },
    },
    provider: "marketplace-hub",
    requiresAuth: false,
    permissions: {
      allowedAgents: ["all"],
      requiresApproval: {
        condition: "always",
        approver: "admin",
      },
    },
  },
  {
    name: "marketplace-hub__recommendTools",
    description:
      "Get AI-powered tool recommendations based on a natural language request",
    inputSchema: {
      type: "object",
      properties: {
        request: {
          type: "string",
          description: "Natural language description of what you need",
        },
        context: {
          type: "object",
          description: "Optional context for better recommendations",
        },
      },
      required: ["request"],
    },
    outputSchema: {
      type: "object",
      properties: {
        recommendations: {
          type: "array",
          items: { type: "object" },
        },
      },
    },
    provider: "marketplace-hub",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "marketplace-hub__getInstalledExtensions",
    description: "List all installed extensions for the organization",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    outputSchema: {
      type: "object",
      properties: {
        extensions: {
          type: "array",
          items: { type: "object" },
        },
      },
    },
    provider: "marketplace-hub",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "marketplace-hub__uninstallExtension",
    description: "Uninstall an extension from the organization",
    inputSchema: {
      type: "object",
      properties: {
        extensionId: {
          type: "string",
          description: "ID of the extension to uninstall",
        },
      },
      required: ["extensionId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
      },
    },
    provider: "marketplace-hub",
    requiresAuth: false,
    permissions: {
      allowedAgents: ["all"],
      requiresApproval: {
        condition: "always",
        approver: "admin",
      },
    },
  },
  {
    name: "marketplace-hub__listApiKeys",
    description:
      "List all configured marketplace API keys for the organization. Shows which external sources (Smithery, CivitAI, LangChain) have API keys configured. Keys are masked for security.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    outputSchema: {
      type: "object",
      properties: {
        keys: {
          type: "array",
          items: {
            type: "object",
            properties: {
              source: { type: "string" },
              configured: { type: "boolean" },
              maskedKey: { type: "string" },
            },
          },
        },
      },
    },
    provider: "marketplace-hub",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "marketplace-hub__setApiKey",
    description:
      "Set an API key for a marketplace source. Supported sources: smithery (premium MCP servers), civitai (higher rate limits, NSFW content), langchain (private prompts). Keys are stored encrypted.",
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          enum: ["smithery", "civitai", "langchain"],
          description: "Marketplace source to configure",
        },
        apiKey: {
          type: "string",
          description: "The API key to store",
        },
      },
      required: ["source", "apiKey"],
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        message: { type: "string" },
      },
    },
    provider: "marketplace-hub",
    requiresAuth: false,
    permissions: {
      allowedAgents: ["all"],
      requiresApproval: {
        condition: "always",
        approver: "admin",
      },
    },
  },
  {
    name: "marketplace-hub__deleteApiKey",
    description:
      "Remove an API key for a marketplace source. This will disable premium features for that source.",
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          enum: ["smithery", "civitai", "langchain"],
          description: "Marketplace source to remove API key from",
        },
      },
      required: ["source"],
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        message: { type: "string" },
      },
    },
    provider: "marketplace-hub",
    requiresAuth: false,
    permissions: {
      allowedAgents: ["all"],
      requiresApproval: {
        condition: "always",
        approver: "admin",
      },
    },
  },
];

export function createMarketplaceHubProvider() {
  return {
    name: "marketplace-hub",

    getTools(): MCPTool[] {
      return TOOLS;
    },

    async executeTool(
      toolName: string,
      args: Record<string, unknown>,
      context: CallContext,
    ): Promise<ToolCallResult> {
      const startTime = Date.now();

      try {
        let result: unknown;

        // Extract the actual tool name (remove provider prefix)
        const actualToolName = toolName.replace("marketplace-hub__", "");

        switch (actualToolName) {
          case "searchMarketplace":
            result = await searchMarketplaceTool(
              args as any,
              context.organizationId,
            );
            break;
          case "installExtension":
            result = await installExtensionTool(
              args as any,
              context.organizationId,
              context.userId,
            );
            break;
          case "recommendTools":
            result = await recommendToolsTool(
              args as any,
              context.organizationId,
            );
            break;
          case "getInstalledExtensions":
            result = await getInstalledExtensionsTool(context.organizationId);
            break;
          case "uninstallExtension":
            result = await uninstallExtensionTool(
              args as any,
              context.organizationId,
            );
            break;
          case "listApiKeys":
            result = await listApiKeysTool(context.organizationId);
            break;
          case "setApiKey":
            result = await setApiKeyTool(args as any, context.organizationId);
            break;
          case "deleteApiKey":
            result = await deleteApiKeyTool(args as any, context.organizationId);
            break;
          default:
            throw new Error(`Unknown tool: ${toolName}`);
        }

        return {
          success: true,
          data: result,
          metadata: {
            duration: Date.now() - startTime,
            cached: false,
          },
        };
      } catch (error) {
        logger.error(
          "Marketplace Hub tool execution failed",
          { toolName },
          error as Error,
        );
        return {
          success: false,
          error: {
            code: "EXECUTION_ERROR",
            message: (error as Error).message,
          },
          metadata: {
            duration: Date.now() - startTime,
            cached: false,
          },
        };
      }
    },
  };
}
