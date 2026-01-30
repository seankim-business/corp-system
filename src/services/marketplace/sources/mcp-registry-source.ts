import { SkillSource, ExternalSkillRef, FetchedSkill, SearchOptions } from "./types";
import { logger } from "../../../utils/logger";

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

export class MCPRegistrySource implements SkillSource {
  readonly name = "mcp-registry";
  private baseUrl = "https://registry.modelcontextprotocol.io/v0.1";

  async search(query: string, options: SearchOptions = {}): Promise<ExternalSkillRef[]> {
    const { limit = 20 } = options;
    const results: ExternalSkillRef[] = [];
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

        const url = `${this.baseUrl}/servers?${params.toString()}`;
        logger.debug("MCP Registry search", { url, query });

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`MCP Registry API error: ${response.status}`);
        }

        const data = (await response.json()) as MCPRegistryResponse;
        const servers = data.servers || [];

        if (servers.length === 0) {
          break;
        }

        for (const item of servers) {
          if (totalFetched >= limit) break;

          const server = item.server;
          results.push({
            source: "mcp-registry",
            identifier: server.name,
            version: server.version,
            url: `https://registry.modelcontextprotocol.io/servers/${server.name}`,
          });

          totalFetched++;
        }

        cursor = data.metadata?.nextCursor;
        if (!cursor) {
          break;
        }
      }

      return results;
    } catch (error) {
      logger.error("MCP Registry search failed", { query }, error as Error);
      return [];
    }
  }

  async fetch(ref: ExternalSkillRef): Promise<FetchedSkill> {
    const { identifier, version = "latest" } = ref;

    try {
      const serverName = identifier;
      const fetchVersion = version === "latest" ? "latest" : version;

      const url = `${this.baseUrl}/servers/${encodeURIComponent(serverName)}/versions/${encodeURIComponent(fetchVersion)}`;
      logger.debug("MCP Registry fetch", { url, serverName, version: fetchVersion });

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`MCP server not found: ${serverName}@${fetchVersion}`);
      }

      const data = (await response.json()) as MCPVersionResponse;
      const server = data.server;

      const installMethod = this.determineInstallMethod(server);
      const command = this.extractCommand(server);

      const content = JSON.stringify(
        {
          name: server.name,
          description: server.description,
          version: server.version,
          installMethod,
          command,
          packages: server.packages,
          remotes: server.remotes,
        },
        null,
        2,
      );

      return {
        ref: { ...ref, version: server.version },
        metadata: {
          name: server.name,
          description: server.description || "",
          version: server.version,
          author: this.extractAuthor(server.name),
          license: undefined,
          tags: ["mcp-server", installMethod],
        },
        content,
        format: "yaml",
      };
    } catch (error) {
      logger.error("MCP Registry fetch failed", { ref }, error as Error);
      throw error;
    }
  }

  async getVersions(ref: ExternalSkillRef): Promise<string[]> {
    try {
      return [ref.version || "latest"];
    } catch {
      return ["latest"];
    }
  }

  /**
   * Determine install method from server packages and remotes.
   * Maps registry types and runtime hints to install commands (npx, uvx, docker).
   */
  private determineInstallMethod(server: MCPServer): string {
    if (!server.packages || server.packages.length === 0) {
      if (server.remotes && server.remotes.length > 0) {
        const remote = server.remotes[0];
        if (remote.type === "oci") {
          return "docker";
        }
      }
      return "unknown";
    }

    const pkg = server.packages[0];
    const runtimeHint = pkg.runtimeHint?.toLowerCase() || "";

    if (pkg.registryType === "npm" || runtimeHint.includes("npx")) {
      return "npx";
    }

    if (pkg.registryType === "pypi" || runtimeHint.includes("uvx")) {
      return "uvx";
    }

    if (pkg.registryType === "oci" || runtimeHint.includes("docker")) {
      return "docker";
    }

    switch (pkg.registryType) {
      case "npm":
        return "npx";
      case "pypi":
        return "uvx";
      case "oci":
        return "docker";
      default:
        return "unknown";
    }
  }

  /**
   * Extract install command from server packages.
   * Generates command string based on install method and package identifier.
   */
  private extractCommand(server: MCPServer): string {
    if (!server.packages || server.packages.length === 0) {
      return "";
    }

    const pkg = server.packages[0];
    const installMethod = this.determineInstallMethod(server);

    switch (installMethod) {
      case "npx":
        return `npx ${pkg.identifier}`;
      case "uvx":
        return `uvx ${pkg.identifier}`;
      case "docker":
        return `docker run ${pkg.identifier}`;
      default:
        return pkg.identifier;
    }
  }

  /**
   * Extract author from server name.
   * Parses namespace format (e.g., "io.modelcontextprotocol/filesystem" -> "modelcontextprotocol").
   */
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
