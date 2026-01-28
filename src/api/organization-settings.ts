import { Router, Request, Response } from "express";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { encrypt, decrypt } from "../utils/encryption";

const router = Router();

const SECRET_KEYS = ["anthropicApiKey", "openaiApiKey", "openrouterApiKey"] as const;
type SecretKeyName = (typeof SECRET_KEYS)[number];

function isSecretKey(key: string): key is SecretKeyName {
  return SECRET_KEYS.includes(key as SecretKeyName);
}

router.get(
  "/organization/settings",
  requireAuth,
  requirePermission(Permission.SETTINGS_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;

      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { settings: true },
      });

      if (!organization) {
        return res.status(404).json({ error: "Organization not found" });
      }

      const settings = (organization.settings as Record<string, unknown>) || {};
      const maskedSettings: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(settings)) {
        if (isSecretKey(key) && typeof value === "string" && value.length > 0) {
          maskedSettings[key] = "••••••••" + (value.length > 8 ? value.slice(-4) : "");
          maskedSettings[`${key}Set`] = true;
        } else {
          maskedSettings[key] = value;
        }
      }

      return res.json({ settings: maskedSettings });
    } catch (error) {
      console.error("Get organization settings error:", error);
      return res.status(500).json({ error: "Failed to fetch settings" });
    }
  },
);

router.put(
  "/organization/settings/api-keys",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { anthropicApiKey, openaiApiKey, openrouterApiKey } = req.body;

      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { settings: true },
      });

      if (!organization) {
        return res.status(404).json({ error: "Organization not found" });
      }

      const currentSettings = (organization.settings as Record<string, unknown>) || {};
      const updatedSettings = { ...currentSettings };

      if (anthropicApiKey !== undefined) {
        if (anthropicApiKey === "" || anthropicApiKey === null) {
          delete updatedSettings.anthropicApiKey;
        } else {
          if (!anthropicApiKey.startsWith("sk-ant-")) {
            return res
              .status(400)
              .json({ error: "Invalid Anthropic API key format. Should start with 'sk-ant-'" });
          }
          updatedSettings.anthropicApiKey = encrypt(anthropicApiKey);
        }
      }

      if (openaiApiKey !== undefined) {
        if (openaiApiKey === "" || openaiApiKey === null) {
          delete updatedSettings.openaiApiKey;
        } else {
          if (!openaiApiKey.startsWith("sk-")) {
            return res
              .status(400)
              .json({ error: "Invalid OpenAI API key format. Should start with 'sk-'" });
          }
          updatedSettings.openaiApiKey = encrypt(openaiApiKey);
        }
      }

      if (openrouterApiKey !== undefined) {
        if (openrouterApiKey === "" || openrouterApiKey === null) {
          delete updatedSettings.openrouterApiKey;
        } else {
          if (!openrouterApiKey.startsWith("sk-or-")) {
            return res
              .status(400)
              .json({ error: "Invalid OpenRouter API key format. Should start with 'sk-or-'" });
          }
          updatedSettings.openrouterApiKey = encrypt(openrouterApiKey);
        }
      }

      await prisma.organization.update({
        where: { id: organizationId },
        data: { settings: updatedSettings as object },
      });

      return res.json({
        success: true,
        message: "API keys updated successfully",
      });
    } catch (error) {
      console.error("Update API keys error:", error);
      return res.status(500).json({ error: "Failed to update API keys" });
    }
  },
);

router.delete(
  "/organization/settings/api-keys/:keyName",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const keyName = req.params.keyName as string;

      if (!isSecretKey(keyName)) {
        return res.status(400).json({ error: "Invalid key name" });
      }

      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { settings: true },
      });

      if (!organization) {
        return res.status(404).json({ error: "Organization not found" });
      }

      const currentSettings = (organization.settings as Record<string, unknown>) || {};
      const updatedSettings = { ...currentSettings };
      delete updatedSettings[keyName];

      await prisma.organization.update({
        where: { id: organizationId },
        data: { settings: updatedSettings },
      });

      return res.json({
        success: true,
        message: `${keyName} deleted successfully`,
      });
    } catch (error) {
      console.error("Delete API key error:", error);
      return res.status(500).json({ error: "Failed to delete API key" });
    }
  },
);

export async function getOrganizationApiKey(
  organizationId: string,
  keyName: SecretKeyName,
): Promise<string | null> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  if (!organization) {
    return null;
  }

  const settings = (organization.settings as Record<string, unknown>) || {};
  const encryptedKey = settings[keyName] as string | undefined;

  if (!encryptedKey) {
    return null;
  }

  try {
    return decrypt(encryptedKey);
  } catch (error) {
    console.error(`Failed to decrypt ${keyName}:`, error);
    return null;
  }
}

export { router as organizationSettingsRouter };
