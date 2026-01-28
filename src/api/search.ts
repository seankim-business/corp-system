/**
 * Unified Document Search API
 *
 * POST /api/search - Search across all or filtered integrations
 */

import { Router, Request, Response } from "express";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { getNotionClient } from "../mcp-servers/notion/client";
import { getDriveClient } from "../mcp-servers/drive/client";
import { getGitHubClient } from "../mcp-servers/github/client";
import { getAccessTokenFromConfig } from "../services/mcp-registry";
import { WebClient } from "@slack/web-api";
import { decrypt } from "../utils/encryption";
import { logger } from "../utils/logger";
import type { MCPConnection } from "../orchestrator/types";

const router = Router();

export type SearchSource = "notion" | "drive" | "github" | "slack";

export interface SearchRequest {
  query: string;
  sources?: SearchSource[];
  limit?: number;
}

export interface SearchResult {
  source: SearchSource;
  title: string;
  snippet: string;
  url: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  sources: {
    source: SearchSource;
    count: number;
    connected: boolean;
  }[];
}

interface ConnectedIntegrations {
  notion: boolean;
  drive: boolean;
  github: boolean;
  slack: boolean;
}

async function getConnectedIntegrations(organizationId: string): Promise<ConnectedIntegrations> {
  const [notionConnection, driveConnection, githubConnection, slackIntegration] = await Promise.all(
    [
      prisma.notionConnection.findUnique({ where: { organizationId } }),
      prisma.driveConnection.findUnique({ where: { organizationId } }),
      prisma.mCPConnection.findFirst({
        where: { organizationId, provider: "github", enabled: true },
      }),
      prisma.slackIntegration.findFirst({
        where: { organizationId, enabled: true },
      }),
    ],
  );

  return {
    notion: !!notionConnection,
    drive: !!driveConnection,
    github: !!githubConnection,
    slack: !!slackIntegration,
  };
}

async function searchNotion(
  organizationId: string,
  query: string,
  limit: number,
  userId?: string,
): Promise<SearchResult[]> {
  const connection = await prisma.notionConnection.findUnique({
    where: { organizationId },
  });

  if (!connection) {
    return [];
  }

  try {
    const { client, release } = await getNotionClient({
      apiKey: connection.apiKey,
      organizationId,
      userId,
    });

    try {
      const searchResults = await client.search(query, limit);

      return searchResults.map(
        (
          result: {
            id: string;
            title: string;
            snippet: string;
            url: string;
            type: string;
            createdTime?: string;
            lastEditedTime?: string;
          },
          index: number,
        ) => ({
          source: "notion" as SearchSource,
          title: result.title || "Untitled",
          snippet: result.snippet || "",
          url: result.url || "",
          score: 1 - index / limit,
          metadata: {
            id: result.id,
            type: result.type,
            createdTime: result.createdTime,
            lastEditedTime: result.lastEditedTime,
          },
        }),
      );
    } finally {
      release();
    }
  } catch (error) {
    logger.error("Notion search error", { organizationId, error: String(error) });
    return [];
  }
}

async function searchDrive(
  organizationId: string,
  query: string,
  limit: number,
): Promise<SearchResult[]> {
  try {
    const connection = await prisma.driveConnection.findUnique({
      where: { organizationId },
    });
    if (!connection) {
      return [];
    }

    const { client, release } = await getDriveClient({
      organizationId,
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      expiresAt: connection.expiresAt,
    });

    try {
      const result = await client.listFiles(undefined, query, undefined, limit);

      return result.files.map((file) => ({
        source: "drive" as SearchSource,
        title: file.name,
        snippet: file.description || file.mimeType || "",
        url: file.webViewLink || `https://drive.google.com/file/d/${file.id}`,
        score: 0.8,
        metadata: {
          id: file.id,
          mimeType: file.mimeType,
          modifiedTime: file.modifiedTime,
          size: file.size,
        },
      }));
    } finally {
      release();
    }
  } catch (error) {
    logger.error("Drive search error", { organizationId, error: String(error) });
    return [];
  }
}

async function searchGitHub(
  organizationId: string,
  query: string,
  limit: number,
): Promise<SearchResult[]> {
  try {
    const connection = await prisma.mCPConnection.findFirst({
      where: { organizationId, provider: "github", enabled: true },
    });
    if (!connection) {
      return [];
    }

    const accessToken = getAccessTokenFromConfig(connection.config as Record<string, unknown>);
    if (!accessToken) {
      return [];
    }

    const mcpConnection: MCPConnection = {
      id: connection.id,
      name: connection.name,
      organizationId: connection.organizationId,
      provider: connection.provider,
      namespace: connection.namespace,
      config: connection.config as Record<string, unknown>,
      enabled: connection.enabled,
      expiresAt: connection.expiresAt,
      refreshToken: connection.refreshToken,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };

    const { client, release } = await getGitHubClient({
      organizationId,
      accessToken,
      connection: mcpConnection,
    });

    try {
      const repos = await client.getRepositories("all");
      const results: SearchResult[] = [];

      for (const repo of repos.slice(0, 3)) {
        const [owner, repoName] = repo.fullName.split("/");
        const issues = await client.getIssues({
          owner,
          repo: repoName,
          state: "all",
          limit: Math.ceil(limit / 3),
        });

        for (const issue of issues) {
          if (
            issue.title.toLowerCase().includes(query.toLowerCase()) ||
            (issue.body && issue.body.toLowerCase().includes(query.toLowerCase()))
          ) {
            results.push({
              source: "github" as SearchSource,
              title: `${repo.fullName}#${issue.number}: ${issue.title}`,
              snippet: issue.body?.substring(0, 200) || "",
              url: issue.htmlUrl,
              score: 0.7,
              metadata: {
                repo: repo.fullName,
                issueNumber: issue.number,
                state: issue.state,
                labels: issue.labels,
              },
            });
          }
        }
      }

      return results.slice(0, limit);
    } finally {
      release();
    }
  } catch (error) {
    logger.error("GitHub search error", { organizationId, error: String(error) });
    return [];
  }
}

async function searchSlack(
  organizationId: string,
  query: string,
  limit: number,
): Promise<SearchResult[]> {
  try {
    const integration = await prisma.slackIntegration.findFirst({
      where: { organizationId, enabled: true },
    });
    if (!integration || !integration.botToken) {
      return [];
    }

    const client = new WebClient(decrypt(integration.botToken));

    const response = await client.search.messages({
      query,
      count: limit,
      sort: "timestamp",
      sort_dir: "desc",
    });

    if (!response.ok || !response.messages?.matches) {
      return [];
    }

    return response.messages.matches.map((match) => ({
      source: "slack" as SearchSource,
      title: `#${match.channel?.name || "unknown"}: ${match.username || "Unknown User"}`,
      snippet: match.text?.substring(0, 200) || "",
      url: match.permalink || "",
      score: 0.75,
      metadata: {
        channel: match.channel?.name,
        channelId: match.channel?.id,
        username: match.username,
        timestamp: match.ts,
      },
    }));
  } catch (error) {
    logger.error("Slack search error", { organizationId, error: String(error) });
    return [];
  }
}

router.post(
  "/search",
  requireAuth,
  requirePermission(Permission.INTEGRATION_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const { query, sources, limit = 20 } = req.body as SearchRequest;

      if (!query || typeof query !== "string" || query.trim().length === 0) {
        return res.status(400).json({ error: "Query string is required" });
      }

      const trimmedQuery = query.trim();
      const searchLimit = Math.min(Math.max(1, limit), 50);

      const connected = await getConnectedIntegrations(organizationId);

      const allSources: SearchSource[] = ["notion", "drive", "github", "slack"];
      const requestedSources = sources && sources.length > 0 ? sources : allSources;
      const sourcesToSearch = requestedSources.filter((source) => connected[source]);

      const searchPromises: Promise<SearchResult[]>[] = [];
      const sourceOrder: SearchSource[] = [];

      for (const source of sourcesToSearch) {
        sourceOrder.push(source);
        switch (source) {
          case "notion":
            searchPromises.push(searchNotion(organizationId, trimmedQuery, searchLimit, userId));
            break;
          case "drive":
            searchPromises.push(searchDrive(organizationId, trimmedQuery, searchLimit));
            break;
          case "github":
            searchPromises.push(searchGitHub(organizationId, trimmedQuery, searchLimit));
            break;
          case "slack":
            searchPromises.push(searchSlack(organizationId, trimmedQuery, searchLimit));
            break;
        }
      }

      const searchResults = await Promise.all(searchPromises);

      const allResults: SearchResult[] = [];
      const sourceCounts = new Map<SearchSource, number>();

      for (let i = 0; i < sourceOrder.length; i++) {
        const source = sourceOrder[i];
        const results = searchResults[i];
        sourceCounts.set(source, results.length);
        allResults.push(...results);
      }

      allResults.sort((a, b) => b.score - a.score);
      const topResults = allResults.slice(0, searchLimit);

      const response: SearchResponse = {
        results: topResults,
        totalCount: allResults.length,
        sources: allSources.map((source) => ({
          source,
          count: sourceCounts.get(source) || 0,
          connected: connected[source],
        })),
      };

      return res.json(response);
    } catch (error) {
      logger.error("Search error", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Search failed" });
    }
  },
);

export default router;
