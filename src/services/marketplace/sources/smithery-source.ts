import { SkillSource, ExternalSkillRef, FetchedSkill, SearchOptions } from "./types";
import { logger } from "../../../utils/logger";

interface SmitheryServer {
  qualifiedName: string;
  displayName: string;
  description: string;
  version?: string;
  author?: string;
  license?: string;
  tags?: string[];
  connections?: Array<{
    type: "stdio" | "http" | "sse";
    command?: string;
    url?: string;
  }>;
  tools?: Array<{
    name: string;
    description: string;
  }>;
}

interface SmitherySearchResponse {
  servers?: SmitheryServer[];
  total?: number;
  page?: number;
  pageSize?: number;
}

interface SmitheryServerResponse {
  server?: SmitheryServer;
}

export class SmitherySource implements SkillSource {
  readonly name = "smithery";
  private baseUrl = "https://registry.smithery.ai";
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.SMITHERY_API_KEY;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Nubabel-MCP-Fetcher",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async search(query: string, options: SearchOptions = {}): Promise<ExternalSkillRef[]> {
    const { limit = 20, page = 1 } = options;

    try {
      const searchUrl = `${this.baseUrl}/servers?q=${encodeURIComponent(query)}&limit=${limit}&page=${page}`;

      const response = await fetch(searchUrl, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Smithery API error: ${response.status}`);
      }

      const data = (await response.json()) as SmitherySearchResponse;
      const servers = data.servers || [];

      return servers.map((server) => this.mapToRef(server));
    } catch (error) {
      logger.error("Smithery search failed", { query }, error as Error);
      return [];
    }
  }

  async fetch(ref: ExternalSkillRef): Promise<FetchedSkill> {
    const { identifier } = ref;

    try {
      const serverUrl = `${this.baseUrl}/servers/${encodeURIComponent(identifier)}`;

      const response = await fetch(serverUrl, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Server not found: ${identifier}`);
      }

      const data = (await response.json()) as SmitheryServerResponse;
      const server = data.server;

      if (!server) {
        throw new Error(`No server data returned for: ${identifier}`);
      }

      return this.mapToItem(server, ref);
    } catch (error) {
      logger.error("Smithery fetch failed", { ref }, error as Error);
      throw error;
    }
  }

  async getVersions(ref: ExternalSkillRef): Promise<string[]> {
    return [ref.version || "latest"];
  }

  private mapToRef(server: SmitheryServer): ExternalSkillRef {
    return {
      source: "smithery",
      identifier: server.qualifiedName,
      version: server.version || "latest",
      url: `https://smithery.ai/servers/${server.qualifiedName}`,
    };
  }

  private mapToItem(server: SmitheryServer, ref: ExternalSkillRef): FetchedSkill {
    let installMethod = "npx";
    let installConfig: Record<string, any> = {};

    if (server.connections && server.connections.length > 0) {
      const connection = server.connections[0];

      if (connection.type === "http" && connection.url) {
        installMethod = "http";
        installConfig = {
          url: connection.url,
        };
      } else if (connection.type === "stdio" && connection.command) {
        installMethod = "npx";
        installConfig = {
          command: connection.command,
        };
      } else if (connection.type === "sse" && connection.url) {
        installMethod = "http";
        installConfig = {
          url: connection.url,
          type: "sse",
        };
      }
    }

    const content = `
# ${server.displayName}

${server.description}

## Installation

\`\`\`bash
${installMethod === "http" ? `# HTTP Server at ${installConfig.url}` : `npx ${installConfig.command || server.qualifiedName}`}
\`\`\`

## Tools

${
  server.tools && server.tools.length > 0
    ? server.tools.map((tool) => `- **${tool.name}**: ${tool.description}`).join("\n")
    : "No tools available"
}

## Metadata

- **Qualified Name**: ${server.qualifiedName}
- **Version**: ${server.version || "latest"}
- **Author**: ${server.author || "Unknown"}
- **License**: ${server.license || "Unknown"}
- **Tags**: ${server.tags?.join(", ") || "None"}
`.trim();

    return {
      ref: {
        ...ref,
        version: server.version || "latest",
      },
      metadata: {
        name: server.displayName,
        description: server.description,
        version: server.version || "latest",
        author: server.author,
        license: server.license,
        tags: server.tags || [],
      },
      content,
      format: "yaml",
    };
  }
}
