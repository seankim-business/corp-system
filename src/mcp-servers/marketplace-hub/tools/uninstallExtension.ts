/**
 * Uninstall Extension Tool
 *
 * Uninstall an extension from the organization
 */

import { UninstallExtensionInput, UninstallExtensionOutput } from "../types";
import { db } from "../../../db/client";
import { logger } from "../../../utils/logger";

export async function uninstallExtensionTool(
  input: UninstallExtensionInput,
  organizationId: string,
): Promise<UninstallExtensionOutput> {
  const { extensionId } = input;

  if (!extensionId) {
    throw new Error("extensionId is required");
  }

  try {
    // Find installation
    const installation = await db.extensionInstallation.findFirst({
      where: {
        extensionId,
        organizationId,
      },
    });

    if (!installation) {
      return {
        success: false,
        message: "Extension is not installed",
      };
    }

    // Delete installation
    await db.extensionInstallation.delete({
      where: { id: installation.id },
    });

    logger.info("Extension uninstalled via MCP tool", {
      organizationId,
      extensionId,
      installationId: installation.id,
    });

    return {
      success: true,
      message: "Extension uninstalled successfully",
    };
  } catch (error) {
    logger.error("Failed to uninstall extension", { extensionId, organizationId }, error as Error);
    return {
      success: false,
      message: (error as Error).message,
    };
  }
}
