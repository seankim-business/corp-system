/**
 * Get Installed Extensions Tool
 *
 * List extensions installed for the organization
 */

import { GetInstalledOutput, InstalledExtension } from "../types";
import { db } from "../../../db/client";
import { logger } from "../../../utils/logger";

export async function getInstalledExtensionsTool(
  organizationId: string,
): Promise<GetInstalledOutput> {
  try {
    const installations = await db.extensionInstallation.findMany({
      where: { organizationId },
      include: {
        extension: {
          select: {
            id: true,
            slug: true,
            name: true,
            description: true,
            version: true,
            extensionType: true,
            source: true,
          },
        },
      },
      orderBy: { installedAt: "desc" },
    });

    const items: InstalledExtension[] = installations.map((inst) => ({
      id: inst.id,
      extensionId: inst.extension.id,
      name: inst.extension.name,
      source: inst.extension.source || "unknown",
      type: inst.extension.extensionType,
      version: inst.version,
      installedAt: inst.installedAt.toISOString(),
    }));

    logger.info("Listed installed extensions via MCP tool", {
      organizationId,
      count: items.length,
    });

    return { items };
  } catch (error) {
    logger.error("Failed to list installed extensions", { organizationId }, error as Error);
    return { items: [] };
  }
}
