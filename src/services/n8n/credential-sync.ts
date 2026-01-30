import { db } from "../../db/client";
import { logger } from "../../utils/logger";
import { decrypt } from "../../utils/encryption";
import { getAccessTokenFromConfig } from "../mcp-registry";
import { createN8nClient, N8nApiClient } from "./n8n-api-client";

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

type SyncOutcome = "created" | "updated" | "skipped";

type N8nInstanceRecord = {
  id: string;
  organizationId: string;
  containerUrl: string;
  apiKey: string;
  status: string;
};

type MCPConnectionRecord = {
  id: string;
  provider: string;
  name: string;
  config: Record<string, unknown>;
  refreshToken: string | null;
  expiresAt: Date | null;
  organizationId: string;
};

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
      // Get n8n instance (tenant-isolated)
      const instance = await db.n8nInstance.findFirst({
        where: { id: instanceId, organizationId },
        select: {
          id: true,
          organizationId: true,
          containerUrl: true,
          apiKey: true,
          status: true,
        },
      });

      if (!instance || instance.status !== "active") {
        result.errors.push("Instance not active or not found");
        return result;
      }

      // Get all MCP connections for the organization
      const mcpConnections = await db.mCPConnection.findMany({
        where: {
          organizationId,
          enabled: true,
        },
        select: {
          id: true,
          provider: true,
          name: true,
          config: true,
          refreshToken: true,
          expiresAt: true,
          organizationId: true,
        },
      });

      // Sync each connection
      for (const mcpConn of mcpConnections) {
        try {
          const normalized: MCPConnectionRecord = {
            ...mcpConn,
            config: this.normalizeConfig(mcpConn.config),
          };
          const outcome = await this.syncCredential(normalized, instance);
          if (outcome === "created") result.created++;
          if (outcome === "updated") result.updated++;
          if (outcome !== "skipped") result.synced++;
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
  async syncCredential(
    mcpConnection: MCPConnectionRecord,
    instance: N8nInstanceRecord,
  ): Promise<SyncOutcome> {
    if (mcpConnection.organizationId !== instance.organizationId) {
      throw new Error("Organization mismatch between MCP connection and n8n instance");
    }

    const n8nCredentialType = CREDENTIAL_TYPE_MAP[mcpConnection.provider];

    if (!n8nCredentialType) {
      logger.warn("No n8n credential type mapping for provider", {
        provider: mcpConnection.provider,
      });
      return "skipped";
    }

    // Check if credential already exists
    const existing = await db.n8nCredential.findFirst({
      where: {
        instanceId: instance.id,
        mcpConnectionId: mcpConnection.id,
      },
    });

    if (existing) {
      // Update existing credential mapping
      await db.n8nCredential.update({
        where: { id: existing.id },
        data: {
          name: mcpConnection.name,
          credentialType: n8nCredentialType,
          syncedAt: new Date(),
        },
      });

      // Note: In real implementation, would also update the credential in n8n
      // via API call: client.updateCredential(existing.n8nCredentialId, ...)
      return "updated";
    }

    // Transform credentials to n8n format (in-memory only)
    const n8nCredentialData = this.transformCredentials(mcpConnection.provider, mcpConnection);

    // Create new credential in n8n, then map it locally
    const client = this.createClient(instance);
    const created = await client.createCredential({
      name: mcpConnection.name,
      type: n8nCredentialType,
      data: n8nCredentialData,
    });

    await db.n8nCredential.create({
      data: {
        organizationId: mcpConnection.organizationId,
        instanceId: instance.id,
        n8nCredentialId: created.id,
        mcpConnectionId: mcpConnection.id,
        credentialType: n8nCredentialType,
        name: mcpConnection.name,
      },
    });

    return "created";
  }

  /**
   * Transform MCP credentials to n8n format
   */
  private transformCredentials(
    provider: string,
    mcpConnection: MCPConnectionRecord,
  ): Record<string, unknown> {
    const accessToken = getAccessTokenFromConfig(mcpConnection.config);
    const requireAccessToken = (label: string): string => {
      if (!accessToken) {
        throw new Error(`Missing access token for ${label} MCP connection ${mcpConnection.id}`);
      }
      return accessToken;
    };

    // Each provider has different credential schema
    switch (provider) {
      case "slack":
        return {
          accessToken: requireAccessToken("slack"),
        };

      case "notion":
        return {
          apiKey: requireAccessToken("notion"),
        };

      case "linear":
        return {
          apiKey: requireAccessToken("linear"),
        };

      case "github":
        return {
          accessToken: requireAccessToken("github"),
        };

      case "jira":
        return {
          accessToken: requireAccessToken("jira"),
        };

      case "asana":
        return {
          accessToken: requireAccessToken("asana"),
        };

      case "google-drive":
      case "google-calendar": {
        const refreshToken = this.getRefreshToken(mcpConnection);
        if (!refreshToken) {
          throw new Error(
            `Missing refresh token for ${provider} MCP connection ${mcpConnection.id}`,
          );
        }
        return {
          access_token: requireAccessToken("google"),
          refresh_token: refreshToken,
          expiry_date: mcpConnection.expiresAt ? mcpConnection.expiresAt.getTime() : null,
        };
      }

      default:
        // Generic passthrough for unknown providers
        return mcpConnection.config;
    }
  }

  /**
   * Delete credential when MCP connection is removed
   */
  async deleteCredential(mcpConnectionId: string): Promise<void> {
    const credentials = await db.n8nCredential.findMany({
      where: { mcpConnectionId },
    });

    for (const cred of credentials) {
      // In real implementation, would also delete from n8n via API
      await db.n8nCredential.delete({
        where: { id: cred.id },
      });
    }

    logger.info("Credentials deleted for MCP connection", { mcpConnectionId });
  }

  /**
   * Get credentials for a workflow (to show which integrations are available)
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
   * Check if required credentials exist for a workflow
   */
  async validateWorkflowCredentials(
    organizationId: string,
    workflowJson: { nodes: Array<{ credentials?: Record<string, { name: string }> }> },
  ): Promise<{ valid: boolean; missing: string[] }> {
    const availableTypes = new Set(
      (await this.getAvailableCredentials(organizationId)).map((c) => c.type),
    );

    const requiredTypes = new Set<string>();

    for (const node of workflowJson.nodes) {
      if (node.credentials) {
        for (const [type] of Object.entries(node.credentials)) {
          requiredTypes.add(type);
        }
      }
    }

    const missing: string[] = [];
    for (const type of requiredTypes) {
      if (!availableTypes.has(type)) {
        missing.push(type);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  private createClient(instance: N8nInstanceRecord): N8nApiClient {
    const apiKey = decrypt(instance.apiKey);
    return createN8nClient(instance.containerUrl, apiKey);
  }

  private normalizeConfig(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private getRefreshToken(connection: MCPConnectionRecord): string | null {
    const refreshFromConfig =
      typeof connection.config["refreshToken"] === "string"
        ? (connection.config["refreshToken"] as string)
        : typeof connection.config["refresh_token"] === "string"
          ? (connection.config["refresh_token"] as string)
          : null;
    const rawToken = connection.refreshToken ?? refreshFromConfig;
    if (!rawToken) {
      return null;
    }
    return decrypt(rawToken);
  }
}

// Singleton
export const credentialSyncService = new CredentialSyncService();
