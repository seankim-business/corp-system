import { Prisma } from "@prisma/client";
import { db as prisma } from "../db/client";
import { MCPConnection } from "../orchestrator/types";
import { cache, CacheOptions } from "../utils/cache";
import { auditLogger } from "./audit-logger";
import { notificationQueue } from "../queue/notification.queue";
import { logger } from "../utils/logger";
import { decrypt, encryptIfNeeded, isEncryptionEnabled } from "../utils/encryption";
import {
  refreshGitHubToken,
  refreshLinearToken,
  refreshNotionToken,
  OAuthRefreshConfig,
  OAuthRefreshError,
} from "./oauth-refresh";
import { mcpConnectionPool } from "./mcp-connection-pool";

type ToolExecutionRequest = {
  params: {
    name: string;
    arguments?: Record<string, unknown>;
  };
  connection: MCPConnection;
};

type ParsedToolName = {
  namespace: string | null;
  toolName: string;
  isLegacy: boolean;
};

const getProviderNamespace = (provider: string): string => provider.trim().toLowerCase();

const parseToolName = (toolName: string, provider: string): ParsedToolName => {
  const providerNamespace = getProviderNamespace(provider);
  if (toolName.includes("__")) {
    const [namespace, name] = toolName.split("__");
    return {
      namespace: namespace || null,
      toolName: name || "",
      isLegacy: false,
    };
  }

  const legacyPrefix = `${providerNamespace}_`;
  if (toolName.startsWith(legacyPrefix)) {
    return {
      namespace: providerNamespace,
      toolName: toolName.slice(legacyPrefix.length),
      isLegacy: true,
    };
  }

  return {
    namespace: null,
    toolName,
    isLegacy: false,
  };
};

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const MAX_REFRESH_ATTEMPTS = 2;

type RawMCPConnection = {
  id: string;
  organizationId: string;
  provider: string;
  name: string;
  config: unknown;
  refreshToken?: string | null;
  expiresAt?: Date | string | null;
  enabled: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
};

const DEFAULT_TOKEN_URLS: Record<string, string> = {
  notion: "https://api.notion.com/v1/oauth/token",
  linear: "https://api.linear.app/oauth/token",
  github: "https://github.com/login/oauth/access_token",
};

const DEFAULT_EXPIRES_IN_SECONDS: Record<string, number> = {
  notion: 24 * 60 * 60,
  linear: 60 * 60,
  github: 8 * 60 * 60,
};

const normalizeDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeConnectionDates = (connection: MCPConnection): MCPConnection => ({
  ...connection,
  expiresAt: normalizeDate(connection.expiresAt ?? null),
  createdAt: normalizeDate(connection.createdAt) ?? new Date(),
  updatedAt: normalizeDate(connection.updatedAt) ?? new Date(),
});

const mapConnectionRecord = (conn: RawMCPConnection): MCPConnection => ({
  id: conn.id,
  organizationId: conn.organizationId,
  provider: conn.provider,
  namespace: getProviderNamespace(conn.provider),
  name: conn.name,
  config: conn.config as Record<string, unknown>,
  refreshToken: conn.refreshToken ?? null,
  expiresAt: normalizeDate(conn.expiresAt),
  enabled: conn.enabled,
  createdAt: normalizeDate(conn.createdAt) ?? new Date(),
  updatedAt: normalizeDate(conn.updatedAt) ?? new Date(),
});

const getStringValue = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const getOAuthRefreshConfig = (
  provider: string,
  config: Record<string, unknown>,
): OAuthRefreshConfig => {
  const oauthConfig =
    typeof config.oauth === "object" && config.oauth
      ? (config.oauth as Record<string, unknown>)
      : {};

  const tokenUrl =
    getStringValue(oauthConfig.tokenUrl) ||
    getStringValue(config.tokenUrl) ||
    DEFAULT_TOKEN_URLS[provider];
  const clientId =
    getStringValue(oauthConfig.clientId) ||
    getStringValue(config.clientId) ||
    getStringValue(config.oauthClientId);
  const clientSecret =
    getStringValue(oauthConfig.clientSecret) ||
    getStringValue(config.clientSecret) ||
    getStringValue(config.oauthClientSecret);

  if (!tokenUrl || !clientId || !clientSecret) {
    throw new Error(
      `Missing OAuth refresh config for provider ${provider}. tokenUrl=${tokenUrl || ""}`,
    );
  }

  return { tokenUrl, clientId, clientSecret };
};

const isInvalidGrantError = (error: unknown): boolean => {
  if (error instanceof OAuthRefreshError) {
    return error.code === "invalid_grant";
  }

  if (error instanceof Error) {
    return error.message.includes("invalid_grant");
  }

  return false;
};

const getRefreshTokenFromConnection = (
  connection: RawMCPConnection,
  config: Record<string, unknown>,
): string | null => {
  const rawRefreshToken =
    getStringValue(connection.refreshToken) || getStringValue(config.refreshToken);
  if (!rawRefreshToken) return null;
  return decrypt(rawRefreshToken);
};

const updateConfigWithAccessToken = (
  config: Record<string, unknown>,
  accessToken: string,
): Record<string, unknown> => {
  const encrypted = encryptIfNeeded(accessToken);
  const updated: Record<string, unknown> = { ...config, accessToken: encrypted };
  if (typeof config.apiKey === "string") {
    updated.apiKey = encrypted;
  }
  return updated;
};

const getExpiresAt = (provider: string, expiresIn?: number): Date => {
  const fallback = DEFAULT_EXPIRES_IN_SECONDS[provider] || 60 * 60;
  const ttlSeconds = expiresIn && expiresIn > 0 ? expiresIn : fallback;
  return new Date(Date.now() + ttlSeconds * 1000);
};

const enqueueReauthNotification = async (
  connection: MCPConnection,
  reason: string,
): Promise<void> => {
  const config = connection.config;
  const channel =
    getStringValue((config as Record<string, unknown>).notificationChannel) ||
    getStringValue((config as Record<string, unknown>).slackChannelId) ||
    getStringValue((config as Record<string, unknown>).channel);
  const threadTs =
    getStringValue((config as Record<string, unknown>).notificationThreadTs) ||
    getStringValue((config as Record<string, unknown>).slackThreadTs) ||
    undefined;
  const userId =
    getStringValue((config as Record<string, unknown>).notificationUserId) ||
    getStringValue((config as Record<string, unknown>).userId);

  if (!channel || !userId) {
    logger.warn("Skipping re-auth notification due to missing channel/user", {
      connectionId: connection.id,
      provider: connection.provider,
    });
    return;
  }

  await notificationQueue.enqueueNotification({
    channel,
    threadTs,
    text: `MCP connection for ${connection.provider} requires re-authentication: ${reason}`,
    organizationId: connection.organizationId,
    userId,
    eventId: `mcp-reauth-${connection.id}-${Date.now()}`,
  });
};

const proactivelyRefreshConnections = async (
  connections: MCPConnection[],
  cacheKey: string,
  cacheOptions: CacheOptions,
): Promise<void> => {
  const expiring = connections.filter(
    (conn) => conn.refreshToken && shouldRefreshToken(conn.expiresAt ?? null),
  );

  if (expiring.length === 0) return;

  try {
    const results = await Promise.allSettled(expiring.map((conn) => refreshOAuthToken(conn.id)));

    const refreshedById = new Map<string, MCPConnection>();
    results.forEach((result) => {
      if (result.status === "fulfilled") {
        refreshedById.set(result.value.id, result.value);
      }
    });

    const updated = connections
      .map((conn) => refreshedById.get(conn.id) ?? conn)
      .filter((conn) => conn.enabled);

    await cache.set(cacheKey, updated, cacheOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("Background token refresh failed", { error: message });
  }
};

export function getAccessTokenFromConfig(config: Record<string, unknown>): string | null {
  const rawToken =
    getStringValue(config.accessToken) ||
    getStringValue(config.apiKey) ||
    getStringValue(config.token);
  return rawToken ? decrypt(rawToken) : null;
}

export function isTokenExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() <= Date.now();
}

export function shouldRefreshToken(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() - Date.now() <= TOKEN_REFRESH_BUFFER_MS;
}

export async function getActiveMCPConnections(organizationId: string): Promise<MCPConnection[]> {
  const cacheKey = `mcp:${organizationId}`;
  const cacheOptions = { ttl: 300, prefix: "mcp-connections" };

  const cached = await cache.get<MCPConnection[]>(cacheKey, cacheOptions);
  if (cached) {
    const normalized = cached.map(normalizeConnectionDates);
    void proactivelyRefreshConnections(normalized, cacheKey, cacheOptions);
    return normalized;
  }

  const connections = await prisma.mCPConnection.findMany({
    where: {
      organizationId,
      enabled: true,
    },
  });

  const mapped = connections.map(mapConnectionRecord);
  await cache.set(cacheKey, mapped, cacheOptions);
  void proactivelyRefreshConnections(mapped, cacheKey, cacheOptions);

  return mapped;
}

export async function getMCPConnectionsByProvider(
  organizationId: string,
  provider: string,
): Promise<MCPConnection[]> {
  const connections = await getActiveMCPConnections(organizationId);
  return connections.filter((conn) => conn.provider === provider);
}

export async function acquireMcpClient<T extends object>(params: {
  provider: string;
  organizationId: string;
  credentials: Record<string, unknown> | string;
  createClient: () => T;
}): Promise<{ client: T; release: () => void }> {
  return mcpConnectionPool.acquire(params);
}

const refreshTokenForProvider = async (
  provider: string,
  refreshToken: string,
  config: OAuthRefreshConfig,
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> => {
  switch (provider) {
    case "notion":
      return refreshNotionToken(refreshToken, config);
    case "linear":
      return refreshLinearToken(refreshToken, config);
    case "github":
      return refreshGitHubToken(refreshToken, config);
    default:
      throw new Error(`Unsupported OAuth refresh provider: ${provider}`);
  }
};

export async function refreshOAuthToken(connectionId: string): Promise<MCPConnection> {
  const connectionRecord = await prisma.mCPConnection.findUnique({
    where: { id: connectionId },
  });

  if (!connectionRecord) {
    throw new Error(`MCP connection not found: ${connectionId}`);
  }

  const rawConnection = connectionRecord as RawMCPConnection;
  const provider = getProviderNamespace(rawConnection.provider);
  const config = rawConnection.config as Record<string, unknown>;
  const refreshToken = getRefreshTokenFromConnection(rawConnection, config);

  if (!refreshToken) {
    throw new Error(`Missing refresh token for MCP connection ${connectionId}`);
  }

  const oauthConfig = getOAuthRefreshConfig(provider, config);

  let attempt = 0;
  let lastError: unknown;

  while (attempt < MAX_REFRESH_ATTEMPTS) {
    attempt += 1;

    try {
      await auditLogger.log({
        action: "mcp.tool_call",
        organizationId: rawConnection.organizationId,
        resourceType: "mcp_connection",
        resourceId: rawConnection.id,
        details: {
          event: "token_refresh_attempt",
          provider,
          attempt,
        },
        success: true,
      });

      const refreshed = await refreshTokenForProvider(provider, refreshToken, oauthConfig);
      if (!isEncryptionEnabled()) {
        throw new Error("Credential encryption not configured; refusing to store tokens");
      }
      const updatedConfig = updateConfigWithAccessToken(config, refreshed.accessToken);
      const encryptedRefreshToken = refreshed.refreshToken
        ? encryptIfNeeded(refreshed.refreshToken)
        : (rawConnection.refreshToken ?? null);
      const expiresAt = getExpiresAt(provider, refreshed.expiresIn);

      const updated = await (
        prisma.mCPConnection as unknown as {
          update: (args: {
            where: { id: string };
            data: {
              config?: Prisma.InputJsonValue;
              refreshToken?: string | null;
              expiresAt?: Date | null;
              enabled?: boolean;
            };
          }) => Promise<RawMCPConnection>;
        }
      ).update({
        where: { id: rawConnection.id },
        data: {
          config: updatedConfig as Prisma.InputJsonValue,
          refreshToken: encryptedRefreshToken,
          expiresAt,
        },
      });

      await auditLogger.log({
        action: "mcp.tool_call",
        organizationId: rawConnection.organizationId,
        resourceType: "mcp_connection",
        resourceId: rawConnection.id,
        details: {
          event: "token_refresh_success",
          provider,
          attempt,
        },
        success: true,
      });

      return mapConnectionRecord(updated as RawMCPConnection);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);

      await auditLogger.log({
        action: "mcp.tool_call",
        organizationId: rawConnection.organizationId,
        resourceType: "mcp_connection",
        resourceId: rawConnection.id,
        details: {
          event: "token_refresh_failed",
          provider,
          attempt,
        },
        success: false,
        errorMessage: message,
      });

      if (isInvalidGrantError(error)) {
        await (
          prisma.mCPConnection as unknown as {
            update: (args: {
              where: { id: string };
              data: { enabled: boolean };
            }) => Promise<RawMCPConnection>;
          }
        ).update({
          where: { id: rawConnection.id },
          data: { enabled: false },
        });

        await auditLogger.log({
          action: "mcp.disconnect",
          organizationId: rawConnection.organizationId,
          resourceType: "mcp_connection",
          resourceId: rawConnection.id,
          details: {
            event: "token_refresh_invalid_grant",
            provider,
          },
          success: true,
        });

        await enqueueReauthNotification(
          mapConnectionRecord({
            ...rawConnection,
            enabled: false,
          }),
          "refresh token invalid or expired",
        );

        throw error;
      }

      logger.warn("Token refresh attempt failed", {
        connectionId: rawConnection.id,
        provider,
        attempt,
        error: message,
      });
    }
  }

  const finalMessage =
    lastError instanceof Error ? lastError.message : "Unknown token refresh error";
  throw new Error(`Failed to refresh OAuth token: ${finalMessage}`);
}

export async function createMCPConnection(params: {
  organizationId: string;
  provider: string;
  name: string;
  config: Record<string, any>;
}): Promise<MCPConnection> {
  const connection = await prisma.mCPConnection.create({
    data: {
      organizationId: params.organizationId,
      provider: params.provider,
      name: params.name,
      config: params.config,
      enabled: true,
    },
  });

  return {
    id: connection.id,
    organizationId: connection.organizationId,
    provider: connection.provider,
    namespace: getProviderNamespace(connection.provider),
    name: connection.name,
    config: connection.config as Record<string, any>,
    enabled: connection.enabled,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

export async function updateMCPConnection(
  connectionId: string,
  updates: Partial<Pick<MCPConnection, "name" | "config" | "enabled">>,
): Promise<void> {
  await prisma.mCPConnection.update({
    where: { id: connectionId },
    data: updates,
  });
}

export async function deleteMCPConnection(connectionId: string): Promise<void> {
  await prisma.mCPConnection.delete({
    where: { id: connectionId },
  });
}

export function validateToolAccess(
  toolName: string,
  provider: string,
  organizationId: string,
  connection: MCPConnection,
): ParsedToolName {
  const providerNamespace = getProviderNamespace(provider);
  const parsed = parseToolName(toolName, providerNamespace);

  if (!parsed.namespace) {
    throw new Error(
      `MCP tool access denied: missing namespace for tool ${toolName}. provider=${providerNamespace} connectionId=${connection.id}`,
    );
  }

  if (parsed.namespace !== providerNamespace) {
    throw new Error(
      `MCP tool access denied: namespace mismatch for tool ${toolName}. expected=${providerNamespace} received=${parsed.namespace} connectionId=${connection.id}`,
    );
  }

  if (organizationId !== connection.organizationId) {
    throw new Error(
      `MCP tool access denied: organization mismatch for tool ${toolName}. expectedOrganization=${connection.organizationId} receivedOrganization=${organizationId} provider=${providerNamespace} connectionId=${connection.id}`,
    );
  }

  return parsed;
}

export function executeToolWithIsolation(
  request: ToolExecutionRequest,
  namespace: string,
  organizationId: string,
): { toolName: string; toolArguments?: Record<string, unknown> } {
  const parsed = validateToolAccess(
    request.params.name,
    request.connection.provider,
    organizationId,
    request.connection,
  );

  if (parsed.namespace !== namespace) {
    throw new Error(
      `MCP tool access denied: namespace routing mismatch for tool ${request.params.name}. expectedNamespace=${namespace} connectionId=${request.connection.id}`,
    );
  }

  return {
    toolName: parsed.toolName,
    toolArguments: request.params.arguments,
  };
}
