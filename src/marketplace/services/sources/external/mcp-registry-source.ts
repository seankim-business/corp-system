import type { ExtensionType } from "@prisma/client";
import {
  BaseExternalSource,
  ExternalSourceItem,
  SearchOptions,
  SearchResult,
  type InstallConfig,
  type InstallMethod,
} from "./types";

interface MCPServer {
  name: string;
  description: string;
  version: string;
  packages?: Array<{
    registryType: string;
    identifier: string;
    runtimeHint?: string;
  }>;
  remotes?: Array<{
    type: string;
    url: string;
  }>;
}

interface MCPRegistryResponse {
  servers: Array<{
    server: MCPServer;
    _meta?: Record<string, unknown>;
  }>;
  metadata?: {
    nextCursor?: string;
    count: number;
  };
}

interface MCPVersionResponse {
  server: MCPServer;
  _meta?: Record<string, unknown>;
}

export class MCPRegistrySource extends BaseExternalSource {
  readonly sourceId = "mcp-registry";
  readonly displayName = "MCP Registry";
  readonly supportedTypes: ExtensionType[] = ["mcp_server"];

  private readonly baseUrl = "https://registry.modelcontextprotocol.io/v0.1";
  private readonly requestTimeout = 10000;

  async search(options: SearchOptions): Promise<SearchResult> {
    const { query = "", limit = 20 } = options;
    const results: ExternalSourceItem[] = [];
    let cursor: string | undefined;
    let totalFetched = 0;

    try {
      while (totalFetched < limit) {
        const pageSize = Math.min(100, limit - totalFetched);
        const params = new URLSearchParams({
          search: query,
          limit: pageSize.toString(),
        });

        if (cursor) {
          params.append("cursor", cursor);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

        const url = `${this.baseUrl}/servers?${params.toString()}`;

        const response = await fetch(url, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          console.warn(`[MCP Registry] API returned status ${response.status}`);
          break;
        }

        const data = (await response.json()) as MCPRegistryResponse;
        const servers = data.servers || [];

        if (servers.length === 0) {
          break;
        }

        for (const item of servers) {
          if (totalFetched >= limit) break;

          const server = item.server;
          results.push(this.mapToExternalItem(server));
          totalFetched++;
        }

        cursor = data.metadata?.nextCursor;
        if (!cursor) {
          break;
        }
      }

      return {
        items: results,
        total: results.length,
        hasMore: !!cursor,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[MCP Registry] Search failed (${errorMessage}). Returning empty results.`);

      return {
        items: [],
        total: 0,
        hasMore: false,
      };
    }
  }

  async getById(id: string): Promise<ExternalSourceItem | null> {
    try {
      const fetchVersion = "latest";

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

      const url = `${this.baseUrl}/servers/${encodeURIComponent(id)}/versions/${encodeURIComponent(fetchVersion)}`;

      const response = await fetch(url, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) {
          console.debug(`[MCP Registry] Server not found: ${id}`);
          return null;
        }
        console.warn(`[MCP Registry] API returned status ${response.status} for ID ${id}`);
        return null;
      }

      const data = (await response.json()) as MCPVersionResponse;
      return this.mapToExternalItem(data.server);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[MCP Registry] getById failed for ${id} (${errorMessage}). Returning null.`);

      return null;
    }
  }

  private mapToExternalItem(server: MCPServer): ExternalSourceItem {
    const { installMethod, installConfig, command } = this.inferInstallation(server);

    return {
      id: `mcp-registry:${server.name}`,
      source: this.sourceId,
      type: "mcp_server",
      name: server.name,
      description: server.description || "MCP Server from Official Registry",
      version: server.version,
      author: this.extractAuthor(server.name),
      tags: ["mcp-server", installMethod],
      homepage: `https://registry.modelcontextprotocol.io/servers/${server.name}`,
      installMethod,
      installConfig,
      rawData: {
        ...server,
        command,
      },
    };
  }

  private inferInstallation(server: MCPServer): {
    installMethod: InstallMethod;
    installConfig: InstallConfig;
    command: string;
  } {
    if (!server.packages || server.packages.length === 0) {
      if (server.remotes && server.remotes.length > 0) {
        const remote = server.remotes[0];
        if (remote.type === "oci") {
          return {
            installMethod: "docker",
            installConfig: { url: remote.url },
            command: `docker run ${remote.url}`,
          };
        }
      }
      return {
        installMethod: "manual",
        installConfig: {},
        command: "",
      };
    }

    const pkg = server.packages[0];
    const runtimeHint = pkg.runtimeHint?.toLowerCase() || "";

    if (pkg.registryType === "npm" || runtimeHint.includes("npx")) {
      return {
        installMethod: "npx",
        installConfig: { command: pkg.identifier },
        command: `npx ${pkg.identifier}`,
      };
    }

    if (pkg.registryType === "pypi" || runtimeHint.includes("uvx")) {
      return {
        installMethod: "uvx",
        installConfig: { command: pkg.identifier },
        command: `uvx ${pkg.identifier}`,
      };
    }

    if (pkg.registryType === "oci" || runtimeHint.includes("docker")) {
      return {
        installMethod: "docker",
        installConfig: { command: pkg.identifier },
        command: `docker run ${pkg.identifier}`,
      };
    }

    return {
      installMethod: "manual",
      installConfig: { command: pkg.identifier },
      command: pkg.identifier,
    };
  }

  private extractAuthor(serverName: string): string {
    const parts = serverName.split("/");
    if (parts.length > 1) {
      const namespace = parts[0];
      const namespaceParts = namespace.split(".");
      return namespaceParts[namespaceParts.length - 1];
    }
    return "unknown";
  }
}
