/**
 * Kyndof Fashion Extension Uninstall Hook
 *
 * Runs when the extension is uninstalled.
 * Cleans up database records, states, and configurations.
 */

import { ExtensionContext } from "../../../src/extensions/types";
import { logger } from "../../../src/utils/logger";
import { prisma } from "../../../src/lib/prisma";

export async function onUninstall(context: ExtensionContext): Promise<void> {
  logger.info("Uninstalling Kyndof Fashion Extension", {
    extensionId: context.extensionId,
    organizationId: context.organizationId,
  });

  try {
    // 1. Archive or delete workflow states
    await prisma.workflowState.deleteMany({
      where: {
        extensionId: context.extensionId,
        organizationId: context.organizationId,
      },
    });

    logger.info("Deleted workflow states", {
      extensionId: context.extensionId,
    });

    // 2. Clean up extension configurations
    await prisma.extensionConfig.delete({
      where: {
        organizationId_extensionId: {
          organizationId: context.organizationId,
          extensionId: context.extensionId,
        },
      },
    });

    logger.info("Deleted extension configuration", {
      extensionId: context.extensionId,
    });

    // 3. Optional: Backup important data before deletion
    // In production, you might want to export data to a file
    // or move it to an archive table

    // 4. Remove MCP tool registrations
    // This would be handled by the extension loader automatically
    // but we can log it for clarity
    logger.info("MCP tools will be automatically unregistered", {
      tools: [
        "clo3d__getDesigns",
        "clo3d__exportPattern",
        "clo3d__render3D",
      ],
    });

    // 5. Record uninstallation event
    if (context.notepad) {
      await context.notepad.addDecision(
        "Extension Uninstalled",
        `Kyndof Fashion Extension uninstalled at ${new Date().toISOString()}.

All extension data has been cleaned up:
- Workflow states deleted
- Configuration removed
- MCP tools unregistered

If you need to restore data, check backup archives.`
      );
    }

    logger.info("Kyndof Fashion Extension uninstalled successfully", {
      extensionId: context.extensionId,
      organizationId: context.organizationId,
    });
  } catch (error) {
    logger.error("Failed to uninstall Kyndof Fashion Extension", {
      error: error instanceof Error ? error.message : String(error),
      extensionId: context.extensionId,
    });
    throw error;
  }
}
