import { db as prisma } from "../db/client";
import { MCPConnection } from "../orchestrator/types";
import { cache } from "../utils/cache";

export async function getActiveMCPConnections(organizationId: string): Promise<MCPConnection[]> {
  return cache.remember(
    `mcp:${organizationId}`,
    async () => {
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
        }) => ({
          id: conn.id,
          organizationId: conn.organizationId,
          provider: conn.provider,
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
