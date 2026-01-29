// import { db } from "../../db/client"; // Disabled until Prisma tables exist
import { logger } from "../../utils/logger";
import { ExtensionInstall } from "../types";
// import { updateActiveInstalls, incrementDownload } from "./catalog"; // Disabled until Prisma tables exist

export async function installExtension(
  extensionId: string,
  organizationId: string,
  userId: string,
  versionId?: string,
): Promise<ExtensionInstall> {
  // TODO: Implement once marketplace tables are created via Prisma migration
  logger.warn("installExtension not implemented - tables not yet created", {
    extensionId,
    organizationId,
    userId,
    versionId,
  });
  throw new Error("Marketplace functionality not yet available - database tables need to be created");

  /* ORIGINAL IMPLEMENTATION - Restore after Prisma migration:
  // Get extension and latest version
  const extension = await db.marketplaceExtension.findUnique({
    where: { id: extensionId },
    include: {
      versions: {
        where: { status: "published" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!extension || extension.status !== "published") {
    throw new Error("Extension not found or not available");
  }

  const targetVersion = versionId
    ? await db.extensionVersion.findUnique({ where: { id: versionId } })
    : extension.versions[0];

  if (!targetVersion) {
    throw new Error("No published version available");
  }

  // Check if already installed
  const existing = await db.extensionInstall.findFirst({
    where: {
      extensionId,
      organizationId,
      status: "active",
    },
  });

  if (existing) {
    throw new Error("Extension is already installed");
  }

  // Check if paid extension requires purchase
  if (extension.pricing === "paid") {
    const purchase = await db.extensionPurchase.findFirst({
      where: {
        extensionId,
        organizationId,
        status: "active",
      },
    });

    if (!purchase) {
      throw new Error("Please purchase this extension before installing");
    }
  }

  // Create install record
  const install = await db.extensionInstall.create({
    data: {
      extensionId,
      versionId: targetVersion.id,
      organizationId,
      installedBy: userId,
      status: "active",
      installedAt: new Date(),
    },
  });

  // Update stats
  await Promise.all([
    incrementDownload(extensionId, targetVersion.id),
    updateActiveInstalls(extensionId),
  ]);

  logger.info("Extension installed", {
    extensionId,
    versionId: targetVersion.id,
    organizationId,
    userId,
  });

  return {
    id: install.id,
    extensionId: install.extensionId,
    versionId: install.versionId,
    organizationId: install.organizationId,
    installedBy: install.installedBy,
    status: install.status as "active" | "uninstalled",
    installedAt: install.installedAt,
    uninstalledAt: install.uninstalledAt || undefined,
    lastUsedAt: install.lastUsedAt || undefined,
  };
  */
}

export async function uninstallExtension(
  extensionId: string,
  organizationId: string,
  userId: string,
): Promise<void> {
  // TODO: Implement once extensionInstall table is created via Prisma migration
  logger.warn("uninstallExtension not implemented - tables not yet created", {
    extensionId,
    organizationId,
    userId,
  });
  throw new Error("Marketplace functionality not yet available - database tables need to be created");

  /* ORIGINAL IMPLEMENTATION - Restore after Prisma migration:
  const install = await db.extensionInstall.findFirst({
    where: {
      extensionId,
      organizationId,
      status: "active",
    },
  });

  if (!install) {
    throw new Error("Extension is not installed");
  }

  await db.extensionInstall.update({
    where: { id: install.id },
    data: {
      status: "uninstalled",
      uninstalledAt: new Date(),
    },
  });

  // Update active installs count
  await updateActiveInstalls(extensionId);

  logger.info("Extension uninstalled", {
    extensionId,
    organizationId,
    userId,
  });
  */
}

export async function updateExtensionVersion(
  extensionId: string,
  organizationId: string,
  userId: string,
  newVersionId: string,
): Promise<ExtensionInstall> {
  // TODO: Implement once marketplace tables are created via Prisma migration
  logger.warn("updateExtensionVersion not implemented - tables not yet created", {
    extensionId,
    organizationId,
    userId,
    newVersionId,
  });
  throw new Error("Marketplace functionality not yet available - database tables need to be created");

  /* ORIGINAL IMPLEMENTATION - Restore after Prisma migration:
  const install = await db.extensionInstall.findFirst({
    where: {
      extensionId,
      organizationId,
      status: "active",
    },
  });

  if (!install) {
    throw new Error("Extension is not installed");
  }

  const newVersion = await db.extensionVersion.findUnique({
    where: { id: newVersionId },
  });

  if (!newVersion || newVersion.status !== "published") {
    throw new Error("Version not found or not available");
  }

  const updated = await db.extensionInstall.update({
    where: { id: install.id },
    data: {
      versionId: newVersionId,
    },
  });

  // Increment download for new version
  await incrementDownload(extensionId, newVersionId);

  logger.info("Extension updated", {
    extensionId,
    organizationId,
    oldVersion: install.versionId,
    newVersion: newVersionId,
    userId,
  });

  return {
    id: updated.id,
    extensionId: updated.extensionId,
    versionId: updated.versionId,
    organizationId: updated.organizationId,
    installedBy: updated.installedBy,
    status: updated.status as "active" | "uninstalled",
    installedAt: updated.installedAt,
    uninstalledAt: updated.uninstalledAt || undefined,
    lastUsedAt: updated.lastUsedAt || undefined,
  };
  */
}

export async function getInstalledExtensions(
  organizationId: string,
): Promise<
  {
    install: ExtensionInstall;
    extension: { id: string; name: string; slug: string; icon: string | null };
    version: { version: string };
  }[]
> {
  // TODO: Implement once extensionInstall table is created via Prisma migration
  logger.warn("getInstalledExtensions returning empty array - tables not yet created", { organizationId });
  return [];

  /* ORIGINAL IMPLEMENTATION - Restore after Prisma migration:
  const installs = await db.extensionInstall.findMany({
    where: {
      organizationId,
      status: "active",
    },
    include: {
      extension: {
        select: { id: true, name: true, slug: true, icon: true },
      },
      version: {
        select: { version: true },
      },
    },
    orderBy: { installedAt: "desc" },
  });

  return installs.map((i) => ({
    install: {
      id: i.id,
      extensionId: i.extensionId,
      versionId: i.versionId,
      organizationId: i.organizationId,
      installedBy: i.installedBy,
      status: i.status as "active" | "uninstalled",
      installedAt: i.installedAt,
      uninstalledAt: i.uninstalledAt || undefined,
      lastUsedAt: i.lastUsedAt || undefined,
    },
    extension: i.extension,
    version: i.version,
  }));
  */
}

export async function isExtensionInstalled(
  extensionId: string,
  organizationId: string,
): Promise<boolean> {
  // TODO: Implement once extensionInstall table is created via Prisma migration
  logger.warn("isExtensionInstalled returning false - tables not yet created", { extensionId, organizationId });
  return false;

  /* ORIGINAL IMPLEMENTATION - Restore after Prisma migration:
  const install = await db.extensionInstall.findFirst({
    where: {
      extensionId,
      organizationId,
      status: "active",
    },
  });

  return !!install;
  */
}

export async function getInstallInfo(
  extensionId: string,
  organizationId: string,
): Promise<ExtensionInstall | null> {
  // TODO: Implement once extensionInstall table is created via Prisma migration
  logger.warn("getInstallInfo returning null - tables not yet created", { extensionId, organizationId });
  return null;

  /* ORIGINAL IMPLEMENTATION - Restore after Prisma migration:
  const install = await db.extensionInstall.findFirst({
    where: {
      extensionId,
      organizationId,
      status: "active",
    },
  });

  if (!install) return null;

  return {
    id: install.id,
    extensionId: install.extensionId,
    versionId: install.versionId,
    organizationId: install.organizationId,
    installedBy: install.installedBy,
    status: install.status as "active" | "uninstalled",
    installedAt: install.installedAt,
    uninstalledAt: install.uninstalledAt || undefined,
    lastUsedAt: install.lastUsedAt || undefined,
  };
  */
}

export async function recordUsage(
  extensionId: string,
  organizationId: string,
): Promise<void> {
  // TODO: Implement once extensionInstall table is created via Prisma migration
  logger.warn("recordUsage skipped - tables not yet created", { extensionId, organizationId });
  return;

  /* ORIGINAL IMPLEMENTATION - Restore after Prisma migration:
  await db.extensionInstall.updateMany({
    where: {
      extensionId,
      organizationId,
      status: "active",
    },
    data: {
      lastUsedAt: new Date(),
    },
  });
  */
}

export async function getDownloadStats(
  extensionId: string,
  days: number = 30,
): Promise<{ date: string; count: number }[]> {
  // TODO: Implement once extensionInstall table is created via Prisma migration
  logger.warn("getDownloadStats returning empty array - tables not yet created", { extensionId, days });
  return [];

  /* ORIGINAL IMPLEMENTATION - Restore after Prisma migration:
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const installs = await db.extensionInstall.findMany({
    where: {
      extensionId,
      installedAt: { gte: startDate },
    },
    select: { installedAt: true },
    orderBy: { installedAt: "asc" },
  });

  // Group by date
  const byDate: Record<string, number> = {};
  for (const install of installs) {
    const date = install.installedAt.toISOString().split("T")[0];
    byDate[date] = (byDate[date] || 0) + 1;
  }

  // Fill in missing dates
  const result: { date: string; count: number }[] = [];
  const current = new Date(startDate);
  const today = new Date();

  while (current <= today) {
    const dateStr = current.toISOString().split("T")[0];
    result.push({
      date: dateStr,
      count: byDate[dateStr] || 0,
    });
    current.setDate(current.getDate() + 1);
  }

  return result;
  */
}
