import { db as prisma } from "../db/client";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";
import { getGitHubClient, GitHubClient } from "../mcp-servers/github/client";
import { GitHubPullRequest } from "../mcp-servers/github/types";
import { MCPConnection } from "../orchestrator/types";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import YAML from "yaml";

export type SSOTResourceType = "agent" | "sop" | "skill" | "policy" | "function" | "role";

export interface SSOTResource {
  id: string;
  type: SSOTResourceType;
  path: string;
  name: string;
  content: string;
  metadata: Record<string, unknown>;
  sha: string;
  lastSyncedAt: Date;
}

export interface SSOTSyncResult {
  success: boolean;
  resourcesAdded: number;
  resourcesUpdated: number;
  resourcesDeleted: number;
  errors: Array<{ path: string; error: string }>;
  syncedAt: Date;
}

export interface SSOTPromoteRequest {
  resourceType: SSOTResourceType;
  resourceId: string;
  title: string;
  body?: string;
  content: string;
  metadata?: Record<string, unknown>;
  branch?: string;
}

export interface SSOTPromoteResult {
  success: boolean;
  pullRequest?: GitHubPullRequest;
  error?: string;
}

export interface SSOTWebhookEvent {
  action: "push" | "pull_request";
  ref?: string;
  commits?: Array<{
    id: string;
    added: string[];
    modified: string[];
    removed: string[];
  }>;
  pullRequest?: {
    number: number;
    state: "open" | "closed";
    merged: boolean;
    head: { ref: string };
    base: { ref: string };
  };
}

export interface GitHubSSOTConfig {
  owner: string;
  repo: string;
  branch: string;
  basePath?: string;
}

interface GitHubContentsResponse {
  path: string;
  type: "file" | "dir";
  sha: string;
  name?: string;
  content?: string;
  encoding?: string;
}

const CACHE_PREFIX = "ssot:github";
const CACHE_TTL_SECONDS = 300;
const CACHE_TTL_STABLE = 3600;

const tracer = trace.getTracer("github-ssot");

const RESOURCE_PATHS: Record<SSOTResourceType, string> = {
  agent: "agents",
  sop: "sops",
  skill: "skills",
  policy: "docs/policies",
  function: "org/functions",
  role: "org/roles",
};

const RESOURCE_EXTENSIONS: Record<SSOTResourceType, string[]> = {
  agent: [".yml", ".yaml"],
  sop: [".md"],
  skill: [".yml", ".yaml"],
  policy: [".md"],
  function: [".yml", ".yaml"],
  role: [".yml", ".yaml"],
};

function getCacheKey(
  organizationId: string,
  resourceType: SSOTResourceType | "all",
  resourceId?: string,
): string {
  const base = `${CACHE_PREFIX}:${organizationId}:${resourceType}`;
  return resourceId ? `${base}:${resourceId}` : base;
}

function getListCacheKey(organizationId: string, resourceType: SSOTResourceType): string {
  return `${CACHE_PREFIX}:${organizationId}:list:${resourceType}`;
}

async function getCached<T>(key: string): Promise<T | null> {
  try {
    const cached = await redis.get(key);
    if (!cached) return null;
    return JSON.parse(cached) as T;
  } catch (error) {
    logger.warn("Failed to read SSOT cache", { key, error });
    return null;
  }
}

async function setCache<T>(key: string, value: T, ttl: number = CACHE_TTL_SECONDS): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), ttl);
  } catch (error) {
    logger.warn("Failed to write SSOT cache", { key, error });
  }
}

async function invalidateCache(
  organizationId: string,
  resourceType?: SSOTResourceType,
): Promise<void> {
  try {
    const types = resourceType
      ? [resourceType]
      : (Object.keys(RESOURCE_PATHS) as SSOTResourceType[]);

    for (const type of types) {
      await redis.del(getListCacheKey(organizationId, type));
    }

    logger.debug("Invalidated SSOT cache", { organizationId, resourceType });
  } catch (error) {
    logger.warn("Failed to invalidate SSOT cache", { organizationId, resourceType, error });
  }
}

async function getGitHubClientForOrg(
  organizationId: string,
  userId?: string,
): Promise<{ client: GitHubClient; release: () => void; config: GitHubSSOTConfig }> {
  const connection = await prisma.mCPConnection.findFirst({
    where: { organizationId, provider: "github", enabled: true },
  });

  if (!connection) {
    throw new Error("GitHub connection not configured for this organization");
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  const settings = (org?.settings as Record<string, unknown>) || {};
  const ssotConfig = settings.githubSsot as GitHubSSOTConfig | undefined;

  if (!ssotConfig?.owner || !ssotConfig?.repo) {
    throw new Error(
      "GitHub SSOT repository not configured. Set owner and repo in organization settings.",
    );
  }

  const config: GitHubSSOTConfig = {
    owner: ssotConfig.owner,
    repo: ssotConfig.repo,
    branch: ssotConfig.branch || "main",
    basePath: ssotConfig.basePath || "",
  };

  const accessConnection: MCPConnection = {
    id: connection.id,
    organizationId: connection.organizationId,
    provider: connection.provider,
    namespace: connection.provider.toLowerCase(),
    name: connection.name,
    config: connection.config as Record<string, unknown>,
    refreshToken: connection.refreshToken ?? null,
    expiresAt: connection.expiresAt ?? null,
    enabled: connection.enabled,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };

  const connConfig = connection.config as { accessToken: string };
  const { client, release } = await getGitHubClient({
    accessToken: connConfig.accessToken,
    connection: accessConnection,
    organizationId,
    userId,
  });

  return { client, release, config };
}

function parseYAMLContent(content: string): { metadata: Record<string, unknown>; valid: boolean } {
  try {
    const parsed = YAML.parse(content);
    return { metadata: parsed || {}, valid: true };
  } catch (error) {
    logger.warn("Failed to parse YAML content", { error });
    return { metadata: {}, valid: false };
  }
}

function parseMarkdownWithFrontmatter(content: string): {
  metadata: Record<string, unknown>;
  body: string;
  valid: boolean;
} {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { metadata: {}, body: content, valid: true };
  }

  try {
    const metadata = YAML.parse(match[1]) || {};
    return { metadata, body: match[2], valid: true };
  } catch (error) {
    logger.warn("Failed to parse Markdown frontmatter", { error });
    return { metadata: {}, body: content, valid: false };
  }
}

function extractResourceMetadata(
  content: string,
  resourceType: SSOTResourceType,
): Record<string, unknown> {
  if (resourceType === "sop" || resourceType === "policy") {
    const { metadata } = parseMarkdownWithFrontmatter(content);
    return metadata;
  } else {
    const { metadata } = parseYAMLContent(content);
    return metadata;
  }
}

function generateResourceId(metadata: Record<string, unknown>, path: string): string {
  if (metadata.metadata && typeof metadata.metadata === "object") {
    const meta = metadata.metadata as Record<string, unknown>;
    if (meta.id && typeof meta.id === "string") {
      return meta.id;
    }
  }
  if (metadata.id && typeof metadata.id === "string") {
    return metadata.id;
  }

  const filename = path.split("/").pop() || path;
  const name = filename.replace(/\.(yml|yaml|md)$/, "");
  return name;
}

async function listDirectoryContents(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  accessToken: string,
): Promise<Array<{ path: string; type: "file" | "dir"; sha: string }>> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${ref}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!response.ok) {
    if (response.status === 404) {
      return [];
    }
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const contents = (await response.json()) as GitHubContentsResponse | GitHubContentsResponse[];

  if (!Array.isArray(contents)) {
    return [{ path: contents.path, type: "file", sha: contents.sha }];
  }

  return contents.map((item) => ({
    path: item.path,
    type: item.type === "file" ? "file" : "dir",
    sha: item.sha,
  }));
}

export async function syncFromGitHub(
  organizationId: string,
  resourceType?: SSOTResourceType,
  userId?: string,
): Promise<SSOTSyncResult> {
  return tracer.startActiveSpan("ssot.syncFromGitHub", async (span) => {
    span.setAttribute("organization.id", organizationId);
    if (resourceType) {
      span.setAttribute("ssot.resource_type", resourceType);
    }

    const result: SSOTSyncResult = {
      success: false,
      resourcesAdded: 0,
      resourcesUpdated: 0,
      resourcesDeleted: 0,
      errors: [],
      syncedAt: new Date(),
    };

    let release: (() => void) | undefined;

    try {
      const {
        client,
        release: releaseClient,
        config,
      } = await getGitHubClientForOrg(organizationId, userId);
      release = releaseClient;

      const connection = await prisma.mCPConnection.findFirst({
        where: { organizationId, provider: "github", enabled: true },
      });
      const connConfig = connection?.config as { accessToken: string } | undefined;
      const accessToken = connConfig?.accessToken || "";

      const types = resourceType
        ? [resourceType]
        : (Object.keys(RESOURCE_PATHS) as SSOTResourceType[]);

      for (const type of types) {
        try {
          const resources = await syncResourceType(
            client,
            config,
            organizationId,
            type,
            accessToken,
          );

          result.resourcesAdded += resources.added;
          result.resourcesUpdated += resources.updated;
          result.resourcesDeleted += resources.deleted;
          result.errors.push(...resources.errors);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          result.errors.push({ path: RESOURCE_PATHS[type], error: message });
          logger.error("Failed to sync resource type", { type, organizationId, error });
        }
      }

      await invalidateCache(organizationId, resourceType);

      result.success = result.errors.length === 0;
      span.setStatus({ code: result.success ? SpanStatusCode.OK : SpanStatusCode.ERROR });

      logger.info("GitHub SSOT sync completed", {
        organizationId,
        resourceType,
        ...result,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push({ path: "/", error: message });
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      logger.error("GitHub SSOT sync failed", { organizationId, error });
      return result;
    } finally {
      if (release) release();
      span.end();
    }
  });
}

async function syncResourceType(
  client: GitHubClient,
  config: GitHubSSOTConfig,
  organizationId: string,
  resourceType: SSOTResourceType,
  accessToken: string,
): Promise<{
  added: number;
  updated: number;
  deleted: number;
  errors: Array<{ path: string; error: string }>;
}> {
  const result = {
    added: 0,
    updated: 0,
    deleted: 0,
    errors: [] as Array<{ path: string; error: string }>,
  };

  const basePath = config.basePath
    ? `${config.basePath}/${RESOURCE_PATHS[resourceType]}`
    : RESOURCE_PATHS[resourceType];

  const extensions = RESOURCE_EXTENSIONS[resourceType];
  const resources: SSOTResource[] = [];

  await fetchResourcesRecursively(
    client,
    config.owner,
    config.repo,
    basePath,
    config.branch,
    resourceType,
    extensions,
    resources,
    result.errors,
    accessToken,
  );

  const cacheKey = getListCacheKey(organizationId, resourceType);
  await setCache(cacheKey, resources, CACHE_TTL_STABLE);

  for (const resource of resources) {
    const resourceCacheKey = getCacheKey(organizationId, resourceType, resource.id);
    await setCache(resourceCacheKey, resource, CACHE_TTL_STABLE);
  }

  result.added = resources.length;

  logger.debug("Synced resource type", {
    resourceType,
    count: resources.length,
    errors: result.errors.length,
  });

  return result;
}

async function fetchResourcesRecursively(
  client: GitHubClient,
  owner: string,
  repo: string,
  path: string,
  ref: string,
  resourceType: SSOTResourceType,
  extensions: string[],
  resources: SSOTResource[],
  errors: Array<{ path: string; error: string }>,
  accessToken: string,
): Promise<void> {
  try {
    const contents = await listDirectoryContents(owner, repo, path, ref, accessToken);

    for (const item of contents) {
      if (item.type === "dir") {
        await fetchResourcesRecursively(
          client,
          owner,
          repo,
          item.path,
          ref,
          resourceType,
          extensions,
          resources,
          errors,
          accessToken,
        );
      } else if (item.type === "file") {
        const hasValidExtension = extensions.some((ext) => item.path.endsWith(ext));
        if (!hasValidExtension) continue;

        const filename = item.path.split("/").pop() || "";
        if (filename.startsWith("_")) continue;

        try {
          const file = await client.getFile({ owner, repo, path: item.path, ref });
          const metadata = extractResourceMetadata(file.content, resourceType);
          const id = generateResourceId(metadata, item.path);

          resources.push({
            id,
            type: resourceType,
            path: item.path,
            name:
              metadata.metadata && typeof metadata.metadata === "object"
                ? ((metadata.metadata as Record<string, unknown>).name as string) || filename
                : filename,
            content: file.content,
            metadata,
            sha: file.sha,
            lastSyncedAt: new Date(),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push({ path: item.path, error: message });
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push({ path, error: message });
  }
}

export async function getResources(
  organizationId: string,
  resourceType: SSOTResourceType,
  forceRefresh: boolean = false,
): Promise<SSOTResource[]> {
  const cacheKey = getListCacheKey(organizationId, resourceType);

  if (!forceRefresh) {
    const cached = await getCached<SSOTResource[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  await syncFromGitHub(organizationId, resourceType);

  const resources = await getCached<SSOTResource[]>(cacheKey);
  return resources || [];
}

export async function getResource(
  organizationId: string,
  resourceType: SSOTResourceType,
  resourceId: string,
  forceRefresh: boolean = false,
): Promise<SSOTResource | null> {
  const cacheKey = getCacheKey(organizationId, resourceType, resourceId);

  if (!forceRefresh) {
    const cached = await getCached<SSOTResource>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  await syncFromGitHub(organizationId, resourceType);
  return getCached<SSOTResource>(cacheKey);
}

export async function syncToGitHub(
  organizationId: string,
  request: SSOTPromoteRequest,
  userId?: string,
): Promise<SSOTPromoteResult> {
  return tracer.startActiveSpan("ssot.syncToGitHub", async (span) => {
    span.setAttribute("organization.id", organizationId);
    span.setAttribute("ssot.resource_type", request.resourceType);
    span.setAttribute("ssot.resource_id", request.resourceId);

    let release: (() => void) | undefined;

    try {
      const {
        client,
        release: releaseClient,
        config,
      } = await getGitHubClientForOrg(organizationId, userId);
      release = releaseClient;

      const connection = await prisma.mCPConnection.findFirst({
        where: { organizationId, provider: "github", enabled: true },
      });
      const connConfig = connection?.config as { accessToken: string } | undefined;
      const accessToken = connConfig?.accessToken || "";

      const timestamp = Date.now();
      const branchName =
        request.branch || `ssot/${request.resourceType}/${request.resourceId}-${timestamp}`;

      const basePath = config.basePath
        ? `${config.basePath}/${RESOURCE_PATHS[request.resourceType]}`
        : RESOURCE_PATHS[request.resourceType];

      const extension = RESOURCE_EXTENSIONS[request.resourceType][0];
      const filePath = `${basePath}/${request.resourceId}${extension}`;

      let formattedContent: string;
      if (request.resourceType === "sop" || request.resourceType === "policy") {
        const frontmatter = request.metadata || {};
        const yamlFrontmatter = YAML.stringify(frontmatter);
        formattedContent = `---\n${yamlFrontmatter}---\n\n${request.content}`;
      } else {
        const yamlContent = request.metadata
          ? { ...request.metadata, content: request.content }
          : YAML.parse(request.content);
        formattedContent = YAML.stringify(yamlContent);
      }

      const defaultBranchRef = await getRefSha(
        config.owner,
        config.repo,
        `heads/${config.branch}`,
        accessToken,
      );

      await createBranch(config.owner, config.repo, branchName, defaultBranchRef, accessToken);

      await createOrUpdateFile(
        config.owner,
        config.repo,
        filePath,
        formattedContent,
        `Add/Update ${request.resourceType}: ${request.title}`,
        branchName,
        accessToken,
      );

      const pullRequest = await client.createPullRequest({
        owner: config.owner,
        repo: config.repo,
        title: request.title,
        body:
          request.body ||
          `Automated PR to add/update ${request.resourceType}: ${request.resourceId}`,
        head: branchName,
        base: config.branch,
      });

      span.setAttribute("github.pull_request_number", pullRequest.number);
      span.setStatus({ code: SpanStatusCode.OK });

      logger.info("Created PR for SSOT update", {
        organizationId,
        resourceType: request.resourceType,
        resourceId: request.resourceId,
        prNumber: pullRequest.number,
      });

      return {
        success: true,
        pullRequest,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      logger.error("Failed to create PR for SSOT update", { organizationId, request, error });
      return {
        success: false,
        error: message,
      };
    } finally {
      if (release) release();
      span.end();
    }
  });
}

async function getRefSha(
  owner: string,
  repo: string,
  ref: string,
  accessToken: string,
): Promise<string> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/${ref}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get ref ${ref}: ${response.status}`);
  }

  const data = (await response.json()) as { object: { sha: string } };
  return data.object.sha;
}

async function createBranch(
  owner: string,
  repo: string,
  branchName: string,
  baseSha: string,
  accessToken: string,
): Promise<void> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create branch ${branchName}: ${response.status}`);
  }
}

async function createOrUpdateFile(
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string,
  accessToken: string,
): Promise<void> {
  let existingSha: string | undefined;
  try {
    const getResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${accessToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (getResponse.ok) {
      const data = (await getResponse.json()) as { sha: string };
      existingSha = data.sha;
    }
  } catch {
    // File doesn't exist
  }

  const body: Record<string, unknown> = {
    message,
    content: Buffer.from(content).toString("base64"),
    branch,
  };

  if (existingSha) {
    body.sha = existingSha;
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to create/update file ${path}: ${response.status}`);
  }
}

export async function watchGitHub(organizationId: string, event: SSOTWebhookEvent): Promise<void> {
  return tracer.startActiveSpan("ssot.watchGitHub", async (span) => {
    span.setAttribute("organization.id", organizationId);
    span.setAttribute("ssot.webhook_action", event.action);

    try {
      if (event.action === "push") {
        await handlePushEvent(organizationId, event);
      } else if (event.action === "pull_request") {
        await handlePullRequestEvent(organizationId, event);
      }

      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      logger.error("Failed to handle GitHub webhook", { organizationId, event, error });
      throw error;
    } finally {
      span.end();
    }
  });
}

async function handlePushEvent(organizationId: string, event: SSOTWebhookEvent): Promise<void> {
  if (!event.commits) return;

  const affectedPaths = new Set<string>();
  for (const commit of event.commits) {
    commit.added.forEach((p) => affectedPaths.add(p));
    commit.modified.forEach((p) => affectedPaths.add(p));
    commit.removed.forEach((p) => affectedPaths.add(p));
  }

  const affectedTypes = new Set<SSOTResourceType>();
  for (const path of affectedPaths) {
    for (const [type, basePath] of Object.entries(RESOURCE_PATHS)) {
      if (path.startsWith(basePath) || path.includes(`/${basePath}/`)) {
        affectedTypes.add(type as SSOTResourceType);
      }
    }
  }

  for (const type of affectedTypes) {
    await invalidateCache(organizationId, type);
    logger.info("Queued SSOT sync for push event", { organizationId, resourceType: type });
  }
}

async function handlePullRequestEvent(
  organizationId: string,
  event: SSOTWebhookEvent,
): Promise<void> {
  if (!event.pullRequest) return;

  if (event.pullRequest.state !== "closed" || !event.pullRequest.merged) {
    return;
  }

  await invalidateCache(organizationId);
  logger.info("Queued full SSOT sync for merged PR", {
    organizationId,
    prNumber: event.pullRequest.number,
  });
}

export { invalidateCache as invalidateSSOTCache };

export interface PendingSSOTPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  head: { ref: string };
  base: { ref: string };
  resourceType?: SSOTResourceType;
  resourceId?: string;
}

export async function getPendingSSOTPullRequests(
  organizationId: string,
  userId?: string,
): Promise<PendingSSOTPullRequest[]> {
  return tracer.startActiveSpan("ssot.getPendingSSOTPullRequests", async (span) => {
    span.setAttribute("organization.id", organizationId);

    let release: (() => void) | undefined;

    try {
      const {
        client,
        release: releaseClient,
        config,
      } = await getGitHubClientForOrg(organizationId, userId);
      release = releaseClient;

      const pullRequests = await client.getPullRequests({
        owner: config.owner,
        repo: config.repo,
        state: "open",
      });

      // Filter for SSOT-related PRs (branches starting with "ssot/")
      const ssotPRs = pullRequests.filter((pr: GitHubPullRequest) => pr.head.ref.startsWith("ssot/"));

      const result: PendingSSOTPullRequest[] = ssotPRs.map((pr: GitHubPullRequest) => {
        // Parse resource type and id from branch name (format: ssot/{type}/{id}-{timestamp})
        const branchParts = pr.head.ref.replace("ssot/", "").split("/");
        const resourceType = branchParts[0] as SSOTResourceType | undefined;
        const resourceIdPart = branchParts[1];
        const resourceId = resourceIdPart?.split("-").slice(0, -1).join("-") || resourceIdPart;

        return {
          id: pr.id,
          number: pr.number,
          title: pr.title,
          body: pr.body || null,
          state: pr.state,
          htmlUrl: pr.htmlUrl,
          createdAt: pr.createdAt,
          updatedAt: pr.updatedAt,
          head: { ref: pr.head.ref },
          base: { ref: pr.base.ref },
          resourceType: Object.keys(RESOURCE_PATHS).includes(resourceType || "")
            ? resourceType
            : undefined,
          resourceId,
        };
      });

      span.setAttribute("ssot.pending_prs", result.length);
      span.setStatus({ code: SpanStatusCode.OK });

      logger.info("Fetched pending SSOT pull requests", {
        organizationId,
        count: result.length,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      logger.error("Failed to fetch pending SSOT pull requests", { organizationId, error });
      return [];
    } finally {
      if (release) release();
      span.end();
    }
  });
}

export function getSupportedResourceTypes(): SSOTResourceType[] {
  return Object.keys(RESOURCE_PATHS) as SSOTResourceType[];
}

export function getResourcePath(resourceType: SSOTResourceType): string {
  return RESOURCE_PATHS[resourceType];
}
