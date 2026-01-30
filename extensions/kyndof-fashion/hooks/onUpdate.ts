/**
 * Kyndof Fashion Extension Update Hook
 *
 * Runs when the extension is updated to a new version.
 * Handles migrations, schema changes, and configuration updates.
 */

import { ExtensionContext } from "../../../src/extensions/types";
import { logger } from "../../../src/utils/logger";
import { prisma } from "../../../src/lib/prisma";

interface UpdateContext extends ExtensionContext {
  fromVersion: string;
  toVersion: string;
}

export async function onUpdate(context: UpdateContext): Promise<void> {
  logger.info("Updating Kyndof Fashion Extension", {
    extensionId: context.extensionId,
    organizationId: context.organizationId,
    fromVersion: context.fromVersion,
    toVersion: context.toVersion,
  });

  try {
    // Get current configuration
    const currentConfig = await prisma.extensionConfig.findUnique({
      where: {
        organizationId_extensionId: {
          organizationId: context.organizationId,
          extensionId: context.extensionId,
        },
      },
    });

    if (!currentConfig) {
      throw new Error("Extension configuration not found");
    }

    // Version-specific migrations
    const migrations = [
      {
        version: "1.0.1",
        migrate: async () => {
          // Example: Add new configuration field
          await prisma.extensionConfig.update({
            where: {
              organizationId_extensionId: {
                organizationId: context.organizationId,
                extensionId: context.extensionId,
              },
            },
            data: {
              config: {
                ...(currentConfig.config as object),
                autoQualityCheck: true,
              },
            },
          });
          logger.info("Migrated to 1.0.1: Added autoQualityCheck setting");
        },
      },
      {
        version: "1.1.0",
        migrate: async () => {
          // Example: Add new workflow state
          await prisma.workflowState.upsert({
            where: {
              workflowId_organizationId: {
                workflowId: "material-procurement",
                organizationId: context.organizationId,
              },
            },
            update: {},
            create: {
              workflowId: "material-procurement",
              extensionId: context.extensionId,
              organizationId: context.organizationId,
              state: "idle",
              metadata: {},
            },
          });
          logger.info("Migrated to 1.1.0: Added material-procurement workflow");
        },
      },
      {
        version: "2.0.0",
        migrate: async () => {
          // Example: Breaking changes - restructure config
          const oldConfig = currentConfig.config as any;
          const newConfig = {
            ...oldConfig,
            clo3d: {
              apiUrl: oldConfig.clo3dApiUrl,
              apiKey: oldConfig.clo3dApiKey,
              workspace: oldConfig.clo3dWorkspace,
            },
            notion: {
              productionDb: oldConfig.productionNotionDb,
              qualityDb: oldConfig.qualityNotionDb,
              collectionDb: oldConfig.collectionNotionDb,
            },
            slack: {
              channel: oldConfig.slackChannel,
            },
          };

          // Remove old keys
          delete newConfig.clo3dApiUrl;
          delete newConfig.clo3dApiKey;
          delete newConfig.clo3dWorkspace;
          delete newConfig.productionNotionDb;
          delete newConfig.qualityNotionDb;
          delete newConfig.collectionNotionDb;
          delete newConfig.slackChannel;

          await prisma.extensionConfig.update({
            where: {
              organizationId_extensionId: {
                organizationId: context.organizationId,
                extensionId: context.extensionId,
              },
            },
            data: {
              config: newConfig,
            },
          });
          logger.info("Migrated to 2.0.0: Restructured configuration schema");
        },
      },
    ];

    // Run migrations for versions between fromVersion and toVersion
    for (const migration of migrations) {
      if (
        compareVersions(migration.version, context.fromVersion) > 0 &&
        compareVersions(migration.version, context.toVersion) <= 0
      ) {
        logger.info(`Running migration for version ${migration.version}`);
        await migration.migrate();
      }
    }

    // Update version in configuration
    await prisma.extensionConfig.update({
      where: {
        organizationId_extensionId: {
          organizationId: context.organizationId,
          extensionId: context.extensionId,
        },
      },
      data: {
        config: {
          ...(currentConfig.config as object),
          version: context.toVersion,
          lastUpdated: new Date().toISOString(),
        },
      },
    });

    // Record update event
    if (context.notepad) {
      await context.notepad.addDecision(
        "Extension Updated",
        `Kyndof Fashion Extension updated from v${context.fromVersion} to v${context.toVersion}.

Update completed successfully at ${new Date().toISOString()}.
All migrations have been applied.`
      );
    }

    logger.info("Kyndof Fashion Extension updated successfully", {
      extensionId: context.extensionId,
      organizationId: context.organizationId,
      fromVersion: context.fromVersion,
      toVersion: context.toVersion,
    });
  } catch (error) {
    logger.error("Failed to update Kyndof Fashion Extension", {
      error: error instanceof Error ? error.message : String(error),
      extensionId: context.extensionId,
      fromVersion: context.fromVersion,
      toVersion: context.toVersion,
    });
    throw error;
  }
}

/**
 * Compare semantic version strings
 * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;

    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  return 0;
}
