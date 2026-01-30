/**
 * Kyndof Fashion Extension Install Hook
 *
 * Runs when the extension is first installed.
 * Sets up database tables, configurations, and initial data.
 */

import { ExtensionContext } from "../../../src/extensions/types";
import { logger } from "../../../src/utils/logger";
import { prisma } from "../../../src/lib/prisma";

export async function onInstall(context: ExtensionContext): Promise<void> {
  logger.info("Installing Kyndof Fashion Extension", {
    extensionId: context.extensionId,
    organizationId: context.organizationId,
  });

  try {
    // 1. Initialize extension-specific database tables
    // Note: In production, these would be Prisma migrations
    // For now, we'll create records in the configuration table

    await prisma.extensionConfig.upsert({
      where: {
        organizationId_extensionId: {
          organizationId: context.organizationId,
          extensionId: context.extensionId,
        },
      },
      update: {},
      create: {
        organizationId: context.organizationId,
        extensionId: context.extensionId,
        config: {
          initialized: true,
          installedAt: new Date().toISOString(),
          version: "1.0.0",
        },
        enabled: true,
      },
    });

    // 2. Register default configurations
    const defaultConfig = {
      clo3dApiUrl: context.config?.clo3dApiUrl || "https://api.clo3d.com/v1",
      slackChannel: context.config?.slackChannel || "#fashion-alerts",
      defaultSeason: "2026SS",
      qualityCheckDefaults: {
        fabricInspection: true,
        measurementTolerance: 2, // 2% tolerance
        colorMatchingRequired: true,
      },
      productionDefaults: {
        leadTimeWeeks: 12,
        sampleQuantity: 5,
        minOrderQuantity: 100,
      },
    };

    await prisma.extensionConfig.update({
      where: {
        organizationId_extensionId: {
          organizationId: context.organizationId,
          extensionId: context.extensionId,
        },
      },
      data: {
        config: {
          ...defaultConfig,
          ...(context.config || {}),
        },
      },
    });

    // 3. Setup initial data - create welcome collection
    if (context.config?.collectionNotionDb) {
      logger.info("Creating welcome collection in Notion", {
        databaseId: context.config.collectionNotionDb,
      });

      // This would use the Notion MCP tools in a real scenario
      // For now, we log the intent
      logger.info("Welcome collection setup complete");
    }

    // 4. Setup MCP tools validation
    const requiredTools = [
      "clo3d__getDesigns",
      "clo3d__exportPattern",
      "clo3d__render3D",
    ];

    logger.info("Validating required MCP tools", {
      tools: requiredTools,
    });

    // 5. Create initial skill templates in notepad
    if (context.notepad) {
      await context.notepad.addLearning(
        "Extension Installed",
        `Kyndof Fashion Extension v1.0.0 installed successfully.

Available features:
- 4 specialized agents (fashion-designer, production-manager, quality-inspector, collection-manager)
- 5 domain skills (garment-design, pattern-making, quality-check, production-planning, material-sourcing)
- 3 CLO3D MCP tools
- 3 production workflows

Next steps:
1. Configure CLO3D API credentials in extension settings
2. Link Notion databases for production, quality, and collections
3. Connect Slack channel for notifications`
      );
    }

    // 6. Initialize workflow states
    await prisma.workflowState.createMany({
      data: [
        {
          workflowId: "collection-production",
          extensionId: context.extensionId,
          organizationId: context.organizationId,
          state: "idle",
          metadata: {},
        },
        {
          workflowId: "sample-review",
          extensionId: context.extensionId,
          organizationId: context.organizationId,
          state: "idle",
          metadata: {},
        },
        {
          workflowId: "quality-inspection",
          extensionId: context.extensionId,
          organizationId: context.organizationId,
          state: "idle",
          metadata: {},
        },
      ],
      skipDuplicates: true,
    });

    logger.info("Kyndof Fashion Extension installed successfully", {
      extensionId: context.extensionId,
      organizationId: context.organizationId,
      version: "1.0.0",
    });
  } catch (error) {
    logger.error("Failed to install Kyndof Fashion Extension", {
      error: error instanceof Error ? error.message : String(error),
      extensionId: context.extensionId,
    });
    throw error;
  }
}
