import { db as prisma } from "../db/client";
import { MCPConnection } from "../orchestrator/types";
import { cache } from "../utils/cache";

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

export async function getActiveMCPConnections(organizationId: string): Promise<MCPConnection[]> {
  return cache.remember(
    `mcp:${organizationId}`,
    async (): Promise<MCPConnection[]> => {
      const connections = await prisma.mCPConnection.findMany({
        where: {
          organizationId,
          enabled: true,
        },
      });

      return connections.map(
        (conn: {
          id: string;
          organizationId: string;
          provider: string;
          name: string;
          config: unknown;
          enabled: boolean;
          createdAt: Date;
          updatedAt: Date;
        }): MCPConnection => ({
          id: conn.id,
          organizationId: conn.organizationId,
          provider: conn.provider,
          namespace: getProviderNamespace(conn.provider),
          name: conn.name,
          config: conn.config as Record<string, unknown>,
          enabled: conn.enabled,
          createdAt: conn.createdAt,
          updatedAt: conn.updatedAt,
        }),
      );
    },
    { ttl: 300, prefix: "mcp-connections" },
  );
}

export async function getMCPConnectionsByProvider(
  organizationId: string,
  provider: string,
): Promise<MCPConnection[]> {
  const connections = await getActiveMCPConnections(organizationId);
  return connections.filter((conn) => conn.provider === provider);
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
