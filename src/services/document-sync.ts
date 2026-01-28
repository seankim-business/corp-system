import { db } from "../db/client";
import { getNotionClient, NotionClient } from "../mcp-servers/notion/client";
import { getGitHubClient } from "../mcp-servers/github/client";
import { getAccessTokenFromConfig } from "./mcp-registry";
import {
  convertNotionToMarkdown,
  isReadyForPromotion,
  NotionBlock,
  NotionPageProperties,
  ConversionResult,
} from "./notion-to-markdown";
import { logger } from "../utils/logger";
import { trace, SpanStatusCode } from "@opentelemetry/api";

const tracer = trace.getTracer("document-sync");

export type SyncStatus = "pending" | "in_progress" | "synced" | "failed" | "conflict";

export interface SyncResult {
  success: boolean;
  pageId: string;
  status: SyncStatus;
  prUrl?: string;
  prNumber?: number;
  error?: string;
  markdown?: string;
}

export interface SyncConfig {
  owner: string;
  repo: string;
  baseBranch?: string;
  targetDir?: string;
  labels?: string[];
  functionMapping?: Record<string, string>;
}

interface NotionPage {
  id: string;
  properties: NotionPageProperties;
  url: string;
  createdTime: string;
  lastEditedTime: string;
  parent: { type: string; database_id?: string; page_id?: string };
}

function extractTitle(properties: NotionPageProperties): string {
  const titleKeys = ["Name", "Title", "name", "title"];
  for (const key of titleKeys) {
    const prop = properties[key];
    if (prop?.title) {
      return prop.title.map((t: any) => t.plain_text).join("");
    }
  }
  return "Untitled";
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

function extractPropertyValue(property: any): any {
  if (!property) return null;

  switch (property.type) {
    case "title":
      return property.title?.map((t: any) => t.plain_text).join("") || "";
    case "rich_text":
      return property.rich_text?.map((t: any) => t.plain_text).join("") || "";
    case "select":
      return property.select?.name || null;
    case "multi_select":
      return property.multi_select?.map((s: any) => s.name) || [];
    case "status":
      return property.status?.name || null;
    case "url":
      return property.url || null;
    default:
      return null;
  }
}

function determineTargetPath(
  properties: NotionPageProperties,
  databaseName: string | undefined,
  config: SyncConfig,
): string {
  const functionProp = extractPropertyValue(properties.Function);
  const functionSlug = functionProp ? generateSlug(functionProp) : "general";

  const normalizedDbName = databaseName?.toLowerCase() || "";

  if (normalizedDbName.includes("sop")) {
    return `sops/${functionSlug}`;
  }
  if (normalizedDbName.includes("policy") || normalizedDbName.includes("policies")) {
    return "docs/policies";
  }
  if (normalizedDbName.includes("brand")) {
    return "docs/brand";
  }
  if (normalizedDbName.includes("skill")) {
    return `skills/${functionSlug}`;
  }
  if (normalizedDbName.includes("function")) {
    return "org/functions";
  }

  return config.targetDir || "docs";
}

async function getDatabaseName(
  notionClient: NotionClient,
  databaseId: string | undefined,
): Promise<string | undefined> {
  if (!databaseId) return undefined;

  try {
    const databases = await notionClient.getDatabases();
    const db = databases.find((d) => d.id === databaseId || d.id.replace(/-/g, "") === databaseId);
    return db?.title;
  } catch {
    return undefined;
  }
}

export async function promoteDocument(
  pageId: string,
  organizationId: string,
  userId: string,
  config: SyncConfig,
): Promise<SyncResult> {
  return tracer.startActiveSpan("document-sync.promote", async (span) => {
    span.setAttribute("notion.page_id", pageId);
    span.setAttribute("organization.id", organizationId);
    span.setAttribute("github.owner", config.owner);
    span.setAttribute("github.repo", config.repo);

    let notionRelease: (() => void) | undefined;
    let githubRelease: (() => void) | undefined;

    try {
      const notionConnection = await db.mCPConnection.findFirst({
        where: { organizationId, provider: "notion", enabled: true },
      });

      if (!notionConnection) {
        throw new Error("No active Notion connection found for organization");
      }

      const githubConnection = await db.mCPConnection.findFirst({
        where: { organizationId, provider: "github", enabled: true },
      });

      if (!githubConnection) {
        throw new Error("No active GitHub connection found for organization");
      }

      const notionToken = getAccessTokenFromConfig(
        notionConnection.config as Record<string, unknown>,
      );
      if (!notionToken) {
        throw new Error("Notion access token not found in connection config");
      }

      const { client: notionClient, release: nRelease } = await getNotionClient({
        apiKey: notionToken,
        connection: notionConnection as any,
        organizationId,
        userId,
      });
      notionRelease = nRelease;

      const githubToken = getAccessTokenFromConfig(
        githubConnection.config as Record<string, unknown>,
      );
      if (!githubToken) {
        throw new Error("GitHub access token not found in connection config");
      }

      const { client: githubClient, release: gRelease } = await getGitHubClient({
        accessToken: githubToken,
        connection: githubConnection as any,
        organizationId,
        userId,
      });
      githubRelease = gRelease;

      const page = (await notionClient.getPage(pageId)) as NotionPage;
      span.setAttribute("notion.page_url", page.url);

      const readiness = isReadyForPromotion(page.properties);
      if (!readiness.ready) {
        logger.warn("Page not ready for promotion", { pageId, reasons: readiness.reasons });
        return {
          success: false,
          pageId,
          status: "failed" as SyncStatus,
          error: `Page not ready for promotion: ${readiness.reasons.join(", ")}`,
        };
      }

      const blocks = (await notionClient.getBlocks(pageId, {
        includeChildren: true,
      })) as NotionBlock[];
      span.setAttribute("notion.blocks_count", blocks.length);

      const databaseId = page.parent.database_id;
      const databaseName = await getDatabaseName(notionClient, databaseId);

      const conversionResult: ConversionResult = convertNotionToMarkdown(
        pageId,
        page.properties,
        blocks,
        { functionMapping: config.functionMapping },
      );

      const title = extractTitle(page.properties);
      const slug = generateSlug(title);
      const targetDir = determineTargetPath(page.properties, databaseName, config);
      const filePath = `${targetDir}/${slug}.md`;
      const timestamp = Date.now();
      const branchName = `sync/notion-${pageId.slice(0, 8)}-${timestamp}`;

      span.setAttribute("github.branch", branchName);
      span.setAttribute("github.file_path", filePath);

      await githubClient.createBranch({
        owner: config.owner,
        repo: config.repo,
        branchName,
        fromRef: `heads/${config.baseBranch || "main"}`,
      });

      const existingSha = await githubClient.getFileSha({
        owner: config.owner,
        repo: config.repo,
        path: filePath,
        ref: config.baseBranch || "main",
      });

      await githubClient.createOrUpdateFile({
        owner: config.owner,
        repo: config.repo,
        path: filePath,
        message: `sync: Update "${title}" from Notion`,
        content: conversionResult.markdown,
        branch: branchName,
        sha: existingSha || undefined,
      });

      const pr = await githubClient.createPullRequest({
        owner: config.owner,
        repo: config.repo,
        title: `sync: Update "${title}" from Notion`,
        body: buildPrBody(page, conversionResult, filePath),
        head: branchName,
        base: config.baseBranch || "main",
      });

      span.setAttribute("github.pr_number", pr.number);
      span.setAttribute("github.pr_url", pr.htmlUrl);

      const labels = ["sync", "notion", ...(config.labels || [])];
      const functionProp = extractPropertyValue(page.properties.Function);
      if (functionProp) {
        labels.push(generateSlug(functionProp));
      }

      await githubClient.addLabels({
        owner: config.owner,
        repo: config.repo,
        issueNumber: pr.number,
        labels,
      });

      await notionClient.updatePage(pageId, {
        "Sync Status": { select: { name: "Pending" } },
        "Last Synced": { date: { start: new Date().toISOString() } },
      });

      span.setStatus({ code: SpanStatusCode.OK });

      logger.info("Document promoted successfully", {
        pageId,
        prNumber: pr.number,
        prUrl: pr.htmlUrl,
        filePath,
      });

      return {
        success: true,
        pageId,
        status: "pending" as SyncStatus,
        prUrl: pr.htmlUrl,
        prNumber: pr.number,
        markdown: conversionResult.markdown,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message });

      logger.error("Document promotion failed", { pageId, error: message });

      return {
        success: false,
        pageId,
        status: "failed" as SyncStatus,
        error: message,
      };
    } finally {
      notionRelease?.();
      githubRelease?.();
      span.end();
    }
  });
}

function buildPrBody(page: NotionPage, conversion: ConversionResult, filePath: string): string {
  const title = extractTitle(page.properties);
  const owner = extractPropertyValue(page.properties.Owner);
  const tags = extractPropertyValue(page.properties.Tags) || [];

  return `## Summary

This PR syncs the document **"${title}"** from Notion to GitHub.

## Details

| Field | Value |
|-------|-------|
| Notion Page | [View in Notion](${page.url}) |
| File Path | \`${filePath}\` |
| Document Type | ${conversion.frontmatter.kind} |
| Owner | ${Array.isArray(owner) ? owner.join(", ") : owner || "Not assigned"} |
| Tags | ${Array.isArray(tags) ? tags.join(", ") : tags || "None"} |

## Automated Sync

This PR was automatically created by the Notion → GitHub sync system.

After merging:
- The Notion page status will be updated to "Official"
- The GitHub URL will be added to the Notion page

---

*Synced at: ${new Date().toISOString()}*
`;
}

export async function getSyncStatus(
  pageId: string,
  organizationId: string,
  userId: string,
  config: SyncConfig,
): Promise<{
  status: SyncStatus;
  notionStatus?: string;
  githubUrl?: string;
  lastSynced?: string;
  openPr?: { number: number; url: string };
}> {
  let notionRelease: (() => void) | undefined;
  let githubRelease: (() => void) | undefined;

  try {
    const notionConnection = await db.mCPConnection.findFirst({
      where: { organizationId, provider: "notion", enabled: true },
    });

    if (!notionConnection) {
      throw new Error("No active Notion connection found");
    }

    const notionToken = getAccessTokenFromConfig(
      notionConnection.config as Record<string, unknown>,
    );
    if (!notionToken) {
      throw new Error("Notion access token not found in connection config");
    }

    const { client: notionClient, release: nRelease } = await getNotionClient({
      apiKey: notionToken,
      connection: notionConnection as any,
      organizationId,
      userId,
    });
    notionRelease = nRelease;

    const page = await notionClient.getPage(pageId);

    const syncStatus = extractPropertyValue(page.properties["Sync Status"]);
    const githubUrl = extractPropertyValue(page.properties["GitHub URL"]);
    const lastSynced = extractPropertyValue(page.properties["Last Synced"]);
    const notionStatus = extractPropertyValue(page.properties.Status);

    let openPr: { number: number; url: string } | undefined;

    if (syncStatus === "Pending") {
      const githubConnection = await db.mCPConnection.findFirst({
        where: { organizationId, provider: "github", enabled: true },
      });

      if (githubConnection) {
        const githubToken = getAccessTokenFromConfig(
          githubConnection.config as Record<string, unknown>,
        );
        if (githubToken) {
          const { client: githubClient, release: gRelease } = await getGitHubClient({
            accessToken: githubToken,
            connection: githubConnection as any,
            organizationId,
            userId,
          });
          githubRelease = gRelease;

          const prs = await githubClient.getPullRequests({
            owner: config.owner,
            repo: config.repo,
            state: "open",
            head: `${config.owner}:sync/notion-${pageId.slice(0, 8)}`,
          });

          if (prs.length > 0) {
            openPr = { number: prs[0].number, url: prs[0].htmlUrl };
          }
        }
      }
    }

    let status: SyncStatus;
    if (syncStatus === "Synced" && githubUrl) {
      status = "synced";
    } else if (syncStatus === "Pending") {
      status = "pending";
    } else if (syncStatus === "Conflict") {
      status = "conflict";
    } else {
      status = "pending";
    }

    return {
      status,
      notionStatus,
      githubUrl,
      lastSynced,
      openPr,
    };
  } finally {
    notionRelease?.();
    githubRelease?.();
  }
}

export async function handlePrMerged(
  pageId: string,
  organizationId: string,
  userId: string,
  prUrl: string,
): Promise<void> {
  let notionRelease: (() => void) | undefined;

  try {
    const notionConnection = await db.mCPConnection.findFirst({
      where: { organizationId, provider: "notion", enabled: true },
    });

    if (!notionConnection) {
      throw new Error("No active Notion connection found");
    }

    const notionToken = getAccessTokenFromConfig(
      notionConnection.config as Record<string, unknown>,
    );
    if (!notionToken) {
      throw new Error("Notion access token not found in connection config");
    }

    const { client: notionClient, release } = await getNotionClient({
      apiKey: notionToken,
      connection: notionConnection as any,
      organizationId,
      userId,
    });
    notionRelease = release;

    await notionClient.updatePage(pageId, {
      Status: { status: { name: "Official" } },
      "Sync Status": { select: { name: "Synced" } },
      "GitHub URL": { url: prUrl },
      "Last Synced": { date: { start: new Date().toISOString() } },
    });

    logger.info("Notion page updated after PR merge", { pageId, prUrl });
  } finally {
    notionRelease?.();
  }
}

export async function findPagesReadyForPromotion(
  organizationId: string,
  userId: string,
  databaseId: string,
): Promise<Array<{ id: string; title: string; ready: boolean; reasons: string[] }>> {
  let notionRelease: (() => void) | undefined;

  try {
    const notionConnection = await db.mCPConnection.findFirst({
      where: { organizationId, provider: "notion", enabled: true },
    });

    if (!notionConnection) {
      throw new Error("No active Notion connection found");
    }

    const notionToken = getAccessTokenFromConfig(
      notionConnection.config as Record<string, unknown>,
    );
    if (!notionToken) {
      throw new Error("Notion access token not found in connection config");
    }

    const { client: notionClient, release } = await getNotionClient({
      apiKey: notionToken,
      connection: notionConnection as any,
      organizationId,
      userId,
    });
    notionRelease = release;

    const { tasks } = await notionClient.getTasks(databaseId, {
      status: "Ready for Review",
    });

    return tasks.map((task) => {
      const readiness = isReadyForPromotion(task.properties);
      return {
        id: task.id,
        title: task.title,
        ready: readiness.ready,
        reasons: readiness.reasons,
      };
    });
  } finally {
    notionRelease?.();
  }
}
