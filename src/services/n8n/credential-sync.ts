import { db } from "../../db/client";
import { logger } from "../../utils/logger";

// Mapping from MCP provider to n8n credential type
const CREDENTIAL_TYPE_MAP: Record<string, string> = {
  slack: "slackApi",
  notion: "notionApi",
  linear: "linearApi",
  github: "githubApi",
  "google-drive": "googleDriveOAuth2Api",
  "google-calendar": "googleCalendarOAuth2Api",
  jira: "jiraSoftwareCloudApi",
  asana: "asanaApi",
};

export interface CredentialSyncResult {
  synced: number;
  created: number;
  updated: number;
  failed: number;
  errors: string[];
}

interface MCPConnectionData {
  id: string;
  provider: string;
  name: string;
  credentials: Record<string, unknown>;
  organizationId: string;
}

interface InstanceData {
  id: string;
  containerUrl: string;
  apiKey: string;
}

export class CredentialSyncService {
  /**
   * Sync all MCP connections to n8n credentials for an organization
   */
  async syncAllCredentials(
    organizationId: string,
    instanceId: string,
  ): Promise<CredentialSyncResult> {
    const result: CredentialSyncResult = {
      synced: 0,
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
    };

    try {
      const instance = await db.n8nInstance.findUnique({
        where: { id: instanceId },
      });

      if (!instance || instance.status !== "active") {
        result.errors.push("Instance not active");
        return result;
      }

      // Get all MCP connections for the organization
      const mcpConnections = await db.mCPConnection.findMany({
        where: {
          organizationId,
          enabled: true,
        },
      });

      for (const mcpConn of mcpConnections) {
        try {
          const mcpData: MCPConnectionData = {
            id: mcpConn.id,
            provider: mcpConn.provider,
            name: mcpConn.name,
            credentials: mcpConn.config as Record<string, unknown>,
            organizationId: mcpConn.organizationId,
          };

          const instanceData: InstanceData = {
            id: instance.id,
            containerUrl: instance.containerUrl,
            apiKey: instance.apiKey,
          };

          await this.syncCredential(mcpData, instanceData);
          result.synced++;
          result.created++;
        } catch (error) {
          result.failed++;
          result.errors.push(
            `Failed to sync ${mcpConn.provider}: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      }

      logger.info("Credential sync completed", { organizationId, result });
      return result;
    } catch (error) {
      logger.error("Credential sync failed", { organizationId, error });
      result.errors.push(error instanceof Error ? error.message : "Unknown error");
      return result;
    }
  }

  /**
   * Sync a single MCP connection to n8n credential
   */
  async syncCredential(mcpConnection: MCPConnectionData, instance: InstanceData): Promise<void> {
    const n8nCredentialType = CREDENTIAL_TYPE_MAP[mcpConnection.provider];

    if (!n8nCredentialType) {
      logger.warn("No n8n credential type mapping for provider", {
        provider: mcpConnection.provider,
      });
      return;
    }

    const existing = await db.n8nCredential.findFirst({
      where: {
        instanceId: instance.id,
        mcpConnectionId: mcpConnection.id,
      },
    });

    if (existing) {
      await db.n8nCredential.update({
        where: { id: existing.id },
        data: {
          name: mcpConnection.name,
          syncedAt: new Date(),
        },
      });
    } else {
      const n8nCredentialId = `cred_${Date.now()}_${mcpConnection.provider}`;

      await db.n8nCredential.create({
        data: {
          organizationId: mcpConnection.organizationId,
          instanceId: instance.id,
          n8nCredentialId,
          mcpConnectionId: mcpConnection.id,
          credentialType: n8nCredentialType,
          name: mcpConnection.name,
        },
      });
    }
  }

  /**
   * Transform MCP credentials to n8n format
   */
  transformCredentials(
    provider: string,
    mcpCredentials: Record<string, unknown>,
  ): Record<string, unknown> {
    switch (provider) {
      case "slack":
        return { accessToken: mcpCredentials.accessToken };
      case "notion":
        return { apiKey: mcpCredentials.accessToken };
      case "linear":
        return { apiKey: mcpCredentials.accessToken };
      case "github":
        return { accessToken: mcpCredentials.accessToken };
      case "google-drive":
      case "google-calendar":
        return {
          access_token: mcpCredentials.accessToken,
          refresh_token: mcpCredentials.refreshToken,
          expiry_date: mcpCredentials.expiresAt,
        };
      default:
        return mcpCredentials;
    }
  }

  /**
   * Delete credential when MCP connection is removed
   */
  async deleteCredential(mcpConnectionId: string): Promise<void> {
    await db.n8nCredential.deleteMany({
      where: { mcpConnectionId },
    });
    logger.info("Credentials deleted for MCP connection", { mcpConnectionId });
  }

  /**
   * Get available credentials for an organization
   */
  async getAvailableCredentials(
    organizationId: string,
  ): Promise<Array<{ type: string; name: string; id: string }>> {
    const credentials = await db.n8nCredential.findMany({
      where: { organizationId },
      select: {
        id: true,
        credentialType: true,
        name: true,
      },
    });

    return credentials.map((c) => ({
      id: c.id,
      type: c.credentialType,
      name: c.name,
    }));
  }

  /**
   * Validate workflow credentials
   */
  async validateWorkflowCredentials(
    organizationId: string,
    workflowJson: { nodes: Array<{ credentials?: Record<string, { name: string }> }> },
  ): Promise<{ valid: boolean; missing: string[] }> {
    const available = await this.getAvailableCredentials(organizationId);
    const availableTypes = new Set(available.map((c) => c.type));

    const requiredTypes = new Set<string>();
    for (const node of workflowJson.nodes) {
      if (node.credentials) {
        for (const type of Object.keys(node.credentials)) {
          requiredTypes.add(type);
        }
      }
    }

    const missing = Array.from(requiredTypes).filter((t) => !availableTypes.has(t));

    return {
      valid: missing.length === 0,
      missing,
    };
  }
}

// Singleton
export const credentialSyncService = new CredentialSyncService();
