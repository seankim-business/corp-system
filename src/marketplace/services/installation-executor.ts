/**
 * Installation Executor Service
 *
 * Handles installation and uninstallation of marketplace items (MCP servers, skills, extensions).
 * Creates MCPConnection and MarketplaceExtension records based on installation method.
 *
 * @module marketplace/services/installation-executor
 */

import { db as prisma } from "../../db/client";
import type { ExternalSourceItem } from "./sources/external/types";

/**
 * Result of an installation operation
 */
export interface InstallationResult {
  success: boolean;
  extensionId?: string;
  mcpConnectionId?: string;
  error?: string;
  instructions?: string; // For manual/git/download methods
}

/**
 * Status of an installation
 */
export interface InstallationStatus {
  extensionId: string;
  status: "active" | "inactive" | "error";
  installedAt: Date;
  version: string;
  mcpConnectionId?: string;
  error?: string;
}

/**
 * Installation Executor
 *
 * Orchestrates the installation process for marketplace items.
 * Does NOT execute shell commands - only stores configuration for runtime execution.
 */
export class InstallationExecutor {
  /**
   * Install a marketplace item
   *
   * @param item - External source item to install
   * @param orgId - Organization ID
   * @param userId - User ID performing installation
   * @param config - Optional configuration overrides
   * @returns Installation result
   */
  async install(
    item: ExternalSourceItem,
    orgId: string,
    userId: string,
    config?: Record<string, unknown>,
  ): Promise<InstallationResult> {
    console.log(
      `[InstallationExecutor] Installing ${item.name} (${item.installMethod}) for org ${orgId}`,
    );

    try {
      // Validate inputs
      if (!item.id || !item.name || !item.installMethod) {
        throw new Error("Invalid item: missing required fields");
      }

      if (!orgId || !userId) {
        throw new Error("Invalid parameters: orgId and userId required");
      }

      // Check if already installed
      const existing = await prisma.extensionInstallation.findUnique({
        where: {
          organizationId_extensionId: {
            organizationId: orgId,
            extensionId: item.id,
          },
        },
      });

      if (existing) {
        return {
          success: false,
          error: `Extension ${item.name} is already installed`,
        };
      }

      // Route to appropriate installation handler
      switch (item.installMethod) {
        case "npx":
          return await this.installNpx(item, orgId, userId, config);
        case "uvx":
          return await this.installUvx(item, orgId, userId, config);
        case "docker":
          return await this.installDocker(item, orgId, userId, config);
        case "http":
          return await this.installHttp(item, orgId, userId, config);
        case "git":
          return await this.installGit(item, orgId, userId, config);
        case "download":
          return await this.installDownload(item, orgId, userId, config);
        case "api":
          return await this.installApi(item, orgId, userId, config);
        case "manual":
          return await this.installManual(item, orgId, userId, config);
        default:
          return {
            success: false,
            error: `Unsupported installation method: ${item.installMethod}`,
          };
      }
    } catch (error) {
      console.error("[InstallationExecutor] Installation failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown installation error",
      };
    }
  }

  /**
   * Uninstall an extension
   *
   * @param extensionId - Extension ID to uninstall
   * @param orgId - Organization ID
   */
  async uninstall(extensionId: string, orgId: string): Promise<void> {
    console.log(`[InstallationExecutor] Uninstalling extension ${extensionId} for org ${orgId}`);

    try {
      // Find installation
      const installation = await prisma.extensionInstallation.findUnique({
        where: {
          organizationId_extensionId: {
            organizationId: orgId,
            extensionId,
          },
        },
        include: {
          extension: true,
        },
      });

      if (!installation) {
        throw new Error("Extension not installed");
      }

      const manifest = installation.extension.manifest as Record<string, unknown> | null;
      const mcpConnectionId = manifest?.mcpConnectionId;
      if (mcpConnectionId && typeof mcpConnectionId === "string") {
        await prisma.mCPConnection.delete({
          where: { id: mcpConnectionId },
        });
        console.log(`[InstallationExecutor] Deleted MCPConnection ${mcpConnectionId}`);
      }
      await prisma.extensionInstallation.delete({
        where: {
          organizationId_extensionId: {
            organizationId: orgId,
            extensionId,
          },
        },
      });

      console.log(`[InstallationExecutor] Successfully uninstalled ${installation.extension.name}`);
    } catch (error) {
      console.error("[InstallationExecutor] Uninstallation failed:", error);
      throw error;
    }
  }

  /**
   * Get installation status
   *
   * @param installationId - Installation ID (extensionId)
   * @returns Installation status
   */
  async getStatus(installationId: string): Promise<InstallationStatus> {
    const installation = await prisma.extensionInstallation.findFirst({
      where: { extensionId: installationId },
      include: { extension: true },
    });

    if (!installation) {
      throw new Error("Installation not found");
    }

    const manifest = installation.extension.manifest as Record<string, unknown> | null;
    const mcpConnectionId = manifest?.mcpConnectionId;

    return {
      extensionId: installation.extensionId,
      status: installation.status as "active" | "inactive" | "error",
      installedAt: installation.installedAt,
      version: installation.version,
      mcpConnectionId: typeof mcpConnectionId === "string" ? mcpConnectionId : undefined,
    };
  }

  // ============================================================================
  // PRIVATE INSTALLATION HANDLERS
  // ============================================================================

  /**
   * Install via npx (Node.js package)
   */
  private async installNpx(
    item: ExternalSourceItem,
    orgId: string,
    userId: string,
    config?: Record<string, unknown>,
  ): Promise<InstallationResult> {
    const packageName = item.installConfig.command || item.name;

    return await this.createMCPConnectionAndExtension(
      item,
      orgId,
      userId,
      {
        provider: "npx",
        namespace: packageName,
        name: item.name,
        config: {
          command: "npx",
          args: ["-y", packageName, ...(item.installConfig.args || [])],
          env: { ...item.installConfig.env, ...config } as Record<string, string>,
        } as Record<string, unknown>,
      },
      config,
    );
  }

  /**
   * Install via uvx (Python package)
   */
  private async installUvx(
    item: ExternalSourceItem,
    orgId: string,
    userId: string,
    config?: Record<string, unknown>,
  ): Promise<InstallationResult> {
    const packageName = item.installConfig.command || item.name;

    return await this.createMCPConnectionAndExtension(
      item,
      orgId,
      userId,
      {
        provider: "uvx",
        namespace: packageName,
        name: item.name,
        config: {
          command: "uvx",
          args: [packageName, ...(item.installConfig.args || [])],
          env: { ...item.installConfig.env, ...config } as Record<string, string>,
        } as Record<string, unknown>,
      },
      config,
    );
  }

  /**
   * Install via Docker
   */
  private async installDocker(
    item: ExternalSourceItem,
    orgId: string,
    userId: string,
    config?: Record<string, unknown>,
  ): Promise<InstallationResult> {
    const image = item.installConfig.command || item.name;

    return await this.createMCPConnectionAndExtension(
      item,
      orgId,
      userId,
      {
        provider: "docker",
        namespace: image,
        name: item.name,
        config: {
          command: "docker",
          args: ["run", "-i", "--rm", image, ...(item.installConfig.args || [])],
          env: { ...item.installConfig.env, ...config } as Record<string, string>,
        } as Record<string, unknown>,
      },
      config,
    );
  }

  /**
   * Install via HTTP (remote MCP server)
   */
  private async installHttp(
    item: ExternalSourceItem,
    orgId: string,
    userId: string,
    config?: Record<string, unknown>,
  ): Promise<InstallationResult> {
    if (!item.installConfig.url) {
      return {
        success: false,
        error: "HTTP installation requires a URL",
      };
    }

    return await this.createMCPConnectionAndExtension(
      item,
      orgId,
      userId,
      {
        provider: "http",
        namespace: item.installConfig.url,
        name: item.name,
        config: {
          url: item.installConfig.url,
          ...config,
        } as Record<string, unknown>,
      },
      config,
    );
  }

  /**
   * Install via Git (manual clone required)
   */
  private async installGit(
    item: ExternalSourceItem,
    orgId: string,
    userId: string,
    config?: Record<string, unknown>,
  ): Promise<InstallationResult> {
    const instructions = `
Git Installation Required:

1. Clone the repository:
   git clone ${item.installConfig.url || item.repository || "REPOSITORY_URL"}

2. Follow setup instructions in the repository README

3. Configure the extension in Nubabel after setup is complete
    `.trim();

    console.log(`[InstallationExecutor] Git installation instructions logged for ${item.name}`);

    // Create extension record without MCP connection (manual setup)
    const extension = await this.createExtensionRecord(item, orgId, {
      installMethod: "git",
      repository: item.installConfig.url || item.repository,
    });

    await prisma.extensionInstallation.create({
      data: {
        organizationId: orgId,
        extensionId: extension.id,
        version: item.version || "1.0.0",
        status: "inactive", // Requires manual setup
        installedBy: userId,
        configOverrides: (config || {}) as Record<string, never>,
      },
    });

    return {
      success: true,
      extensionId: extension.id,
      instructions,
    };
  }

  /**
   * Install via Download (manual download required)
   */
  private async installDownload(
    item: ExternalSourceItem,
    orgId: string,
    userId: string,
    config?: Record<string, unknown>,
  ): Promise<InstallationResult> {
    const instructions = `
Download Installation Required:

1. Download from: ${item.installConfig.url || "DOWNLOAD_URL"}

2. Extract and install according to documentation

3. Configure the extension in Nubabel after installation
    `.trim();

    console.log(`[InstallationExecutor] Download instructions logged for ${item.name}`);

    // Create extension record without MCP connection (manual setup)
    const extension = await this.createExtensionRecord(item, orgId, {
      installMethod: "download",
      downloadUrl: item.installConfig.url,
    });

    await prisma.extensionInstallation.create({
      data: {
        organizationId: orgId,
        extensionId: extension.id,
        version: item.version || "1.0.0",
        status: "inactive", // Requires manual setup
        installedBy: userId,
        configOverrides: (config || {}) as Record<string, never>,
      },
    });

    return {
      success: true,
      extensionId: extension.id,
      instructions,
    };
  }

  /**
   * Install via API (store API reference)
   */
  private async installApi(
    item: ExternalSourceItem,
    orgId: string,
    userId: string,
    config?: Record<string, unknown>,
  ): Promise<InstallationResult> {
    // Create extension record with API reference
    const extension = await this.createExtensionRecord(item, orgId, {
      installMethod: "api",
      apiUrl: item.installConfig.url,
      apiConfig: config,
    });

    await prisma.extensionInstallation.create({
      data: {
        organizationId: orgId,
        extensionId: extension.id,
        version: item.version || "1.0.0",
        status: "active",
        installedBy: userId,
        configOverrides: (config || {}) as Record<string, never>,
      },
    });

    return {
      success: true,
      extensionId: extension.id,
    };
  }

  /**
   * Install manually (return instructions only)
   */
  private async installManual(
    item: ExternalSourceItem,
    orgId: string,
    userId: string,
    config?: Record<string, unknown>,
  ): Promise<InstallationResult> {
    const instructions = `
Manual Installation Required:

Extension: ${item.name}
${item.description}

${item.installConfig.url ? `Documentation: ${item.installConfig.url}` : ""}

Please follow the official installation instructions and configure manually.
    `.trim();

    console.log(`[InstallationExecutor] Manual installation instructions for ${item.name}`);

    const extension = await this.createExtensionRecord(item, orgId, {
      installMethod: "manual",
      documentationUrl: item.installConfig.url,
    });

    await prisma.extensionInstallation.create({
      data: {
        organizationId: orgId,
        extensionId: extension.id,
        version: item.version || "1.0.0",
        status: "inactive",
        installedBy: userId,
        configOverrides: (config || {}) as Record<string, never>,
      },
    });

    return {
      success: true,
      extensionId: extension.id,
      instructions: instructions,
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Create MCPConnection and MarketplaceExtension records
   */
  private async createMCPConnectionAndExtension(
    item: ExternalSourceItem,
    orgId: string,
    userId: string,
    mcpConfig: {
      provider: string;
      namespace: string;
      name: string;
      config: Record<string, unknown>;
    },
    configOverrides?: Record<string, unknown>,
  ): Promise<InstallationResult> {
    try {
      // Use transaction for atomicity
      const result = await prisma.$transaction(async (tx) => {
        // Create MCPConnection
        const mcpConnection = await tx.mCPConnection.create({
          data: {
            organizationId: orgId,
            provider: mcpConfig.provider,
            namespace: mcpConfig.namespace,
            name: mcpConfig.name,
            config: JSON.parse(JSON.stringify(mcpConfig.config)),
            enabled: true,
          },
        });

        console.log(`[InstallationExecutor] Created MCPConnection ${mcpConnection.id}`);

        // Create MarketplaceExtension
        const extension = await tx.marketplaceExtension.create({
          data: {
            organizationId: orgId,
            slug: this.generateSlug(item.name),
            name: item.name,
            description: item.description,
            version: item.version || "1.0.0",
            extensionType: item.type,
            category: item.tags?.[0] || "general",
            tags: item.tags || [],
            source: item.source,
            manifest: JSON.parse(
              JSON.stringify({
                mcpConnectionId: mcpConnection.id,
                installMethod: item.installMethod,
                originalItem: item,
              }),
            ),
            runtimeType: mcpConfig.provider,
            runtimeConfig: mcpConfig.config as Record<string, never>,
            enabled: true,
            status: "active",
            createdBy: userId,
          },
        });

        console.log(`[InstallationExecutor] Created MarketplaceExtension ${extension.id}`);

        // Create ExtensionInstallation
        await tx.extensionInstallation.create({
          data: {
            organizationId: orgId,
            extensionId: extension.id,
            version: item.version || "1.0.0",
            status: "active",
            installedBy: userId,
            configOverrides: (configOverrides || {}) as Record<string, never>,
          },
        });

        return {
          extensionId: extension.id,
          mcpConnectionId: mcpConnection.id,
        };
      });

      return {
        success: true,
        extensionId: result.extensionId,
        mcpConnectionId: result.mcpConnectionId,
      };
    } catch (error) {
      console.error("[InstallationExecutor] Transaction failed, rolling back:", error);
      throw error;
    }
  }

  /**
   * Create MarketplaceExtension record (without MCP connection)
   */
  private async createExtensionRecord(
    item: ExternalSourceItem,
    orgId: string,
    manifestData: Record<string, unknown>,
  ) {
    return await prisma.marketplaceExtension.create({
      data: {
        organizationId: orgId,
        slug: this.generateSlug(item.name),
        name: item.name,
        description: item.description,
        version: item.version || "1.0.0",
        extensionType: item.type,
        category: item.tags?.[0] || "general",
        tags: item.tags || [],
        source: item.source,
        manifest: JSON.parse(
          JSON.stringify({
            ...manifestData,
            originalItem: item,
          }),
        ),
        enabled: true,
        status: "active",
      },
    });
  }

  /**
   * Generate URL-safe slug from name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }
}

// Export singleton instance
export const installationExecutor = new InstallationExecutor();
