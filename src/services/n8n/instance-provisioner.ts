import * as crypto from "crypto";
import { db } from "../../db/client";
import { createN8nClient, N8nApiClient } from "./n8n-api-client";
import { logger } from "../../utils/logger";

// Local development mode detection
const isLocalDev = process.env.NODE_ENV !== 'production';
const LOCAL_N8N_URL = process.env.LOCAL_N8N_URL || 'http://localhost:5678';

export interface ProvisioningConfig {
  organizationId: string;
  orgSlug: string;
  webhookBaseUrl?: string;
}

export interface ProvisioningResult {
  success: boolean;
  instanceId?: string;
  containerUrl?: string;
  error?: string;
}

export interface N8nInstanceConfig {
  executionMode: "regular" | "queue";
  timezone: string;
  maxConcurrency: number;
  webhookPath?: string;
}

export class N8nInstanceProvisioner {
  private defaultConfig: N8nInstanceConfig = {
    executionMode: "queue",
    timezone: "Asia/Seoul",
    maxConcurrency: 10,
  };

  /**
   * Generate a unique 32-character encryption key for n8n
   */
  generateEncryptionKey(): string {
    return crypto.randomBytes(32).toString("hex").substring(0, 32);
  }

  /**
   * Generate a secure API key for n8n instance
   */
  generateApiKey(): string {
    return `n8n_${crypto.randomBytes(24).toString("base64url")}`;
  }

  /**
   * Provision a new n8n instance for an organization
   */
  async provisionInstance(config: ProvisioningConfig): Promise<ProvisioningResult> {
    const { organizationId, orgSlug } = config;

    try {
      // Check if instance already exists
      const existing = await db.n8nInstance.findUnique({
        where: { organizationId },
      });

      if (existing) {
        logger.warn("N8n instance already exists for organization", { organizationId });
        return {
          success: true,
          instanceId: existing.id,
          containerUrl: existing.containerUrl,
        };
      }

      // Generate credentials
      const encryptionKey = this.generateEncryptionKey();
      const apiKey = this.generateApiKey();

      // Container URL - use local in dev, Railway in production
      const containerUrl = isLocalDev
        ? LOCAL_N8N_URL
        : `https://${orgSlug}.workflows.nubabel.com`;
      const webhookBaseUrl = config.webhookBaseUrl || `${containerUrl}/webhook`;

      // Create instance record
      const instance = await db.n8nInstance.create({
        data: {
          organizationId,
          containerUrl,
          apiKey, // In production, should be encrypted
          encryptionKey, // In production, should be encrypted
          webhookBaseUrl,
          status: "provisioning",
          config: {
            ...this.defaultConfig,
            provisionedAt: new Date().toISOString(),
          },
        },
      });

      logger.info("N8n instance provisioned", {
        instanceId: instance.id,
        organizationId,
        containerUrl,
      });

      // Mark as active (in production, would wait for container health check)
      await this.markInstanceActive(instance.id);

      return {
        success: true,
        instanceId: instance.id,
        containerUrl,
      };
    } catch (error) {
      logger.error("Failed to provision n8n instance", { organizationId, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Mark instance as active
   */
  async markInstanceActive(instanceId: string): Promise<void> {
    await db.n8nInstance.update({
      where: { id: instanceId },
      data: {
        status: "active",
        lastHealthCheck: new Date(),
      },
    });
  }

  /**
   * Mark instance as failed
   */
  async markInstanceFailed(instanceId: string, errorMessage: string): Promise<void> {
    await db.n8nInstance.update({
      where: { id: instanceId },
      data: {
        status: "failed",
        errorMessage,
      },
    });
  }

  /**
   * Stop an n8n instance
   */
  async stopInstance(instanceId: string): Promise<void> {
    await db.n8nInstance.update({
      where: { id: instanceId },
      data: { status: "stopped" },
    });
    logger.info("N8n instance stopped", { instanceId });
  }

  /**
   * Deprovision (delete) an n8n instance
   */
  async deprovisionInstance(instanceId: string): Promise<void> {
    // Delete all related data in transaction
    await db.$transaction([
      db.n8nWorkflowPermission.deleteMany({
        where: { workflow: { instanceId } },
      }),
      db.n8nExecution.deleteMany({
        where: { workflow: { instanceId } },
      }),
      db.n8nWorkflow.deleteMany({
        where: { instanceId },
      }),
      db.n8nCredential.deleteMany({
        where: { instanceId },
      }),
      db.n8nInstance.delete({
        where: { id: instanceId },
      }),
    ]);

    logger.info("N8n instance deprovisioned", { instanceId });
  }

  /**
   * Get n8n API client for an instance
   */
  async getClient(instanceId: string): Promise<N8nApiClient | null> {
    const instance = await db.n8nInstance.findUnique({
      where: { id: instanceId },
    });

    if (!instance || instance.status !== "active") {
      return null;
    }

    return createN8nClient(instance.containerUrl, instance.apiKey);
  }

  /**
   * Get client by organization ID
   */
  async getClientByOrganization(organizationId: string): Promise<N8nApiClient | null> {
    const instance = await db.n8nInstance.findUnique({
      where: { organizationId },
    });

    if (!instance || instance.status !== "active") {
      return null;
    }

    return createN8nClient(instance.containerUrl, instance.apiKey);
  }

  /**
   * Perform health check on an instance
   */
  async performHealthCheck(instanceId: string): Promise<boolean> {
    const client = await this.getClient(instanceId);
    if (!client) return false;

    try {
      const isHealthy = await client.healthCheck();

      await db.n8nInstance.update({
        where: { id: instanceId },
        data: {
          lastHealthCheck: new Date(),
          status: isHealthy ? "active" : "failed",
          errorMessage: isHealthy ? null : "Health check failed",
        },
      });

      return isHealthy;
    } catch (error) {
      logger.error("Health check failed", { instanceId, error });
      await this.markInstanceFailed(
        instanceId,
        error instanceof Error ? error.message : "Health check error",
      );
      return false;
    }
  }

  /**
   * Get instance by organization ID
   */
  async getInstance(organizationId: string) {
    return db.n8nInstance.findUnique({
      where: { organizationId },
    });
  }

  /**
   * Get all instances with optional status filter
   */
  async listInstances(status?: string) {
    return db.n8nInstance.findMany({
      where: status ? { status } : undefined,
      include: {
        organization: {
          select: { id: true, name: true },
        },
        _count: {
          select: { workflows: true, credentials: true },
        },
      },
    });
  }
}

// Singleton
export const n8nProvisioner = new N8nInstanceProvisioner();
