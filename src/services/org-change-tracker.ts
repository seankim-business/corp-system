import { logger } from "../utils/logger";
import { db as prisma } from "../db/client";

export interface PRInfo {
  url: string;
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  htmlUrl: string;
  createdAt: string;
  mergedAt?: string;
  author?: string;
}

export interface PRStatus {
  state: "open" | "closed" | "merged";
  updatedAt: string;
}

export class OrgChangeTracker {
  private githubToken?: string;

  constructor(githubToken?: string) {
    this.githubToken = githubToken || process.env.GITHUB_TOKEN;
  }

  async linkPR(orgChangeId: string, prUrl: string): Promise<void> {
    try {
      const prInfo = await this.getPRInfo(prUrl);

      await prisma.organizationChange.update({
        where: { id: orgChangeId },
        data: {
          prUrl,
          metadata: {
            pr: {
              number: prInfo.number,
              title: prInfo.title,
              state: prInfo.state,
              author: prInfo.author,
              lastSynced: new Date().toISOString(),
            },
          },
        },
      });

      logger.info("Linked PR to organization change", {
        orgChangeId,
        prUrl,
        prNumber: prInfo.number,
      });
    } catch (error) {
      logger.error("Failed to link PR to organization change", {
        orgChangeId,
        prUrl,
        error,
      });
      throw error;
    }
  }

  async syncPRStatus(orgChangeId: string): Promise<PRStatus> {
    try {
      const orgChange = await prisma.organizationChange.findUnique({
        where: { id: orgChangeId },
        select: { prUrl: true, metadata: true },
      });

      if (!orgChange?.prUrl) {
        throw new Error("No PR URL linked to this organization change");
      }

      const prInfo = await this.getPRInfo(orgChange.prUrl);

      await prisma.organizationChange.update({
        where: { id: orgChangeId },
        data: {
          metadata: {
            ...(orgChange.metadata as object),
            pr: {
              number: prInfo.number,
              title: prInfo.title,
              state: prInfo.state,
              author: prInfo.author,
              lastSynced: new Date().toISOString(),
            },
          },
        },
      });

      return {
        state: prInfo.state,
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("Failed to sync PR status", { orgChangeId, error });
      throw error;
    }
  }

  async getPRInfo(prUrl: string): Promise<PRInfo> {
    try {
      const match = prUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
      if (!match) {
        throw new Error("Invalid GitHub PR URL format");
      }

      const [, owner, repo, prNumber] = match;

      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;

      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      };

      if (this.githubToken) {
        headers.Authorization = `Bearer ${this.githubToken}`;
      }

      const response = await fetch(apiUrl, { headers });

      if (!response.ok) {
        throw new Error(
          `GitHub API error: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json() as {
        title: string;
        state: string;
        merged_at?: string;
        html_url: string;
        created_at: string;
        user?: { login: string };
      };

      const state: "open" | "closed" | "merged" = data.merged_at
        ? "merged"
        : (data.state === "open" || data.state === "closed" ? data.state : "open");

      return {
        url: prUrl,
        number: parseInt(prNumber, 10),
        title: data.title,
        state,
        htmlUrl: data.html_url,
        createdAt: data.created_at,
        mergedAt: data.merged_at,
        author: data.user?.login,
      };
    } catch (error) {
      logger.error("Failed to get PR info from GitHub", { prUrl, error });
      throw error;
    }
  }
}
