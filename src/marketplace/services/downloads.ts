import { db } from "../../db/client";
import { logger } from "../../utils/logger";
import { ExtensionInstall } from "../types";
import { incrementDownload, updateActiveInstalls } from "./catalog";

export async function installExtension(
  extensionId: string,
  organizationId: string,
  userId: string,
  versionId?: string,
): Promise<ExtensionInstall> {
  // Get extension and latest version
  const extension = await db.marketplaceExtension.findUnique({
    where: { id: extensionId },
    include: {
      versions: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!extension || extension.status !== "active") {
    throw new Error("Extension not found or not available");
  }

  const targetVersion = versionId
    ? await db.extensionVersion.findUnique({ where: { id: versionId } })
    : extension.versions[0];

  if (!targetVersion) {
    throw new Error("No version available");
  }

  // Check if already installed
  const existing = await db.extensionInstallation.findFirst({
    where: {
      extensionId,
      organizationId,
      status: "active",
    },
  });

  if (existing) {
    throw new Error("Extension is already installed");
  }

  // Create install record
  const install = await db.extensionInstallation.create({
    data: {
      extensionId,
      organizationId,
      version: targetVersion.version,
      installedBy: userId,
      status: "active",
      autoUpdate: true,
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
    versionId: targetVersion.id,
    organizationId: install.organizationId,
    installedBy: install.installedBy,
    status: install.status as "active" | "uninstalled",
    installedAt: install.installedAt,
    uninstalledAt: undefined,
    lastUsedAt: undefined,
  };
}

export async function uninstallExtension(
  extensionId: string,
  organizationId: string,
  userId: string,
): Promise<void> {
  const install = await db.extensionInstallation.findFirst({
    where: {
      extensionId,
      organizationId,
      status: "active",
    },
  });

  if (!install) {
    throw new Error("Extension is not installed");
  }

  await db.extensionInstallation.update({
    where: { id: install.id },
    data: {
      status: "uninstalled",
    },
  });

  // Update active installs count
  await updateActiveInstalls(extensionId);

  logger.info("Extension uninstalled", {
    extensionId,
    organizationId,
    userId,
  });
}

export async function updateExtensionVersion(
  extensionId: string,
  organizationId: string,
  userId: string,
  newVersionId: string,
): Promise<ExtensionInstall> {
  const install = await db.extensionInstallation.findFirst({
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

  if (!newVersion) {
    throw new Error("Version not found");
  }

  const updated = await db.extensionInstallation.update({
    where: { id: install.id },
    data: {
      version: newVersion.version,
    },
  });

  // Increment download for new version
  await incrementDownload(extensionId, newVersionId);

  logger.info("Extension updated", {
    extensionId,
    organizationId,
    oldVersion: install.version,
    newVersion: newVersion.version,
    userId,
  });

  return {
    id: updated.id,
    extensionId: updated.extensionId,
    versionId: newVersionId,
    organizationId: updated.organizationId,
    installedBy: updated.installedBy,
    status: updated.status as "active" | "uninstalled",
    installedAt: updated.installedAt,
    uninstalledAt: undefined,
    lastUsedAt: undefined,
  };
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
  const installs = await db.extensionInstallation.findMany({
    where: {
      organizationId,
      status: "active",
    },
    include: {
      extension: {
        select: { id: true, name: true, slug: true, manifest: true },
      },
    },
    orderBy: { installedAt: "desc" },
  });

  return installs.map((i) => {
    const manifest = i.extension.manifest as Record<string, unknown> | null;
    const metadata = (manifest?.metadata as Record<string, unknown>) || {};

    return {
      install: {
        id: i.id,
        extensionId: i.extensionId,
        versionId: "", // Not stored directly in ExtensionInstallation
        organizationId: i.organizationId,
        installedBy: i.installedBy,
        status: i.status as "active" | "uninstalled",
        installedAt: i.installedAt,
        uninstalledAt: undefined,
        lastUsedAt: undefined,
      },
      extension: {
        id: i.extension.id,
        name: i.extension.name,
        slug: i.extension.slug,
        icon: (metadata.icon as string) || null,
      },
      version: { version: i.version },
    };
  });
}

export async function isExtensionInstalled(
  extensionId: string,
  organizationId: string,
): Promise<boolean> {
  const install = await db.extensionInstallation.findFirst({
    where: {
      extensionId,
      organizationId,
      status: "active",
    },
  });

  return !!install;
}

export async function getInstallInfo(
  extensionId: string,
  organizationId: string,
): Promise<ExtensionInstall | null> {
  const install = await db.extensionInstallation.findFirst({
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
    versionId: "", // Not stored directly
    organizationId: install.organizationId,
    installedBy: install.installedBy,
    status: install.status as "active" | "uninstalled",
    installedAt: install.installedAt,
    uninstalledAt: undefined,
    lastUsedAt: undefined,
  };
}

export async function recordUsage(extensionId: string, organizationId: string): Promise<void> {
  // ExtensionInstallation doesn't have lastUsedAt field
  // We can log usage via ExtensionUsageLog instead
  logger.info("Extension usage recorded", { extensionId, organizationId });
}

export async function getDownloadStats(
  extensionId: string,
  days: number = 30,
): Promise<{ date: string; count: number }[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const installs = await db.extensionInstallation.findMany({
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
}
