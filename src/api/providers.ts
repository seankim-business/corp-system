import { Router, Request, Response } from "express";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { decrypt } from "../utils/encryption";
import { logger } from "../utils/logger";
import { ProviderName } from "../providers/ai-provider";
import { checkProviderHealth, checkAllProvidersHealth } from "../services/provider-health";

const router = Router();

interface ProviderConfig {
  name: ProviderName;
  displayName: string;
  supportsOAuth: boolean;
  oauthInstallPath?: string;
  settingsKey: {
    accessToken?: string;
    apiKey?: string;
    refreshToken?: string;
    connectedAt?: string;
    userIdentifier?: string;
  };
}

const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    name: "anthropic",
    displayName: "Anthropic (Claude)",
    supportsOAuth: false,
    settingsKey: {
      apiKey: "anthropicApiKey",
    },
  },
  {
    name: "openai",
    displayName: "OpenAI (GPT)",
    supportsOAuth: false,
    settingsKey: {
      apiKey: "openaiApiKey",
    },
  },
  {
    name: "google-ai",
    displayName: "Google AI (Gemini)",
    supportsOAuth: true,
    oauthInstallPath: "/api/google-ai/oauth/install",
    settingsKey: {
      accessToken: "googleAiAccessToken",
      apiKey: "googleAiApiKey",
      refreshToken: "googleAiRefreshToken",
      connectedAt: "googleAiConnectedAt",
      userIdentifier: "googleAiUserEmail",
    },
  },
  {
    name: "github-models",
    displayName: "GitHub Models",
    supportsOAuth: true,
    oauthInstallPath: "/api/github-models/oauth/install",
    settingsKey: {
      accessToken: "githubModelsAccessToken",
      apiKey: "githubModelsApiKey",
      refreshToken: "githubModelsRefreshToken",
      connectedAt: "githubModelsConnectedAt",
      userIdentifier: "githubModelsUsername",
    },
  },
  {
    name: "openrouter",
    displayName: "OpenRouter",
    supportsOAuth: false,
    settingsKey: {
      apiKey: "openrouterApiKey",
    },
  },
];

export interface ProviderStatus {
  name: ProviderName;
  displayName: string;
  connected: boolean;
  method: "oauth" | "api_key" | null;
  supportsOAuth: boolean;
  oauthInstallPath?: string;
  userIdentifier?: string;
  connectedAt?: string;
}

router.get(
  "/providers",
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

      const providers: ProviderStatus[] = PROVIDER_CONFIGS.map((config) => {
        const hasOAuthToken = config.settingsKey.accessToken
          ? !!settings[config.settingsKey.accessToken]
          : false;
        const hasApiKey = config.settingsKey.apiKey ? !!settings[config.settingsKey.apiKey] : false;

        const connected = hasOAuthToken || hasApiKey;
        const method = hasOAuthToken ? "oauth" : hasApiKey ? "api_key" : null;

        return {
          name: config.name,
          displayName: config.displayName,
          connected,
          method,
          supportsOAuth: config.supportsOAuth,
          oauthInstallPath: config.supportsOAuth ? config.oauthInstallPath : undefined,
          userIdentifier: config.settingsKey.userIdentifier
            ? (settings[config.settingsKey.userIdentifier] as string | undefined)
            : undefined,
          connectedAt: config.settingsKey.connectedAt
            ? (settings[config.settingsKey.connectedAt] as string | undefined)
            : undefined,
        };
      });

      return res.json({ providers });
    } catch (error) {
      logger.error("Failed to get providers status", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to get providers status" });
    }
  },
);

router.get(
  "/providers/:providerName/status",
  requireAuth,
  requirePermission(Permission.SETTINGS_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { providerName } = req.params;

      const config = PROVIDER_CONFIGS.find((p) => p.name === providerName);
      if (!config) {
        return res.status(404).json({ error: "Provider not found" });
      }

      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { settings: true },
      });

      if (!organization) {
        return res.status(404).json({ error: "Organization not found" });
      }

      const settings = (organization.settings as Record<string, unknown>) || {};

      const hasOAuthToken = config.settingsKey.accessToken
        ? !!settings[config.settingsKey.accessToken]
        : false;
      const hasApiKey = config.settingsKey.apiKey ? !!settings[config.settingsKey.apiKey] : false;

      const connected = hasOAuthToken || hasApiKey;
      const method = hasOAuthToken ? "oauth" : hasApiKey ? "api_key" : null;

      return res.json({
        name: config.name,
        displayName: config.displayName,
        connected,
        method,
        supportsOAuth: config.supportsOAuth,
        oauthInstallPath: config.supportsOAuth ? config.oauthInstallPath : undefined,
        userIdentifier: config.settingsKey.userIdentifier
          ? (settings[config.settingsKey.userIdentifier] as string | undefined)
          : undefined,
        connectedAt: config.settingsKey.connectedAt
          ? (settings[config.settingsKey.connectedAt] as string | undefined)
          : undefined,
      });
    } catch (error) {
      logger.error("Failed to get provider status", {
        error: error instanceof Error ? error.message : String(error),
        provider: req.params.providerName,
      });
      return res.status(500).json({ error: "Failed to get provider status" });
    }
  },
);

export function getProviderCredentials(
  settings: Record<string, unknown>,
  providerName: ProviderName,
): { accessToken?: string; apiKey?: string } | null {
  const config = PROVIDER_CONFIGS.find((p) => p.name === providerName);
  if (!config) return null;

  if (config.settingsKey.accessToken && settings[config.settingsKey.accessToken]) {
    return {
      accessToken: decrypt(settings[config.settingsKey.accessToken] as string),
    };
  }

  if (config.settingsKey.apiKey && settings[config.settingsKey.apiKey]) {
    return {
      apiKey: decrypt(settings[config.settingsKey.apiKey] as string),
    };
  }

  return null;
}

router.get(
  "/providers/:providerName/health",
  requireAuth,
  requirePermission(Permission.SETTINGS_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const providerName = req.params.providerName as ProviderName;

      const validProviders: ProviderName[] = [
        "anthropic",
        "openai",
        "google-ai",
        "github-models",
        "openrouter",
      ];
      if (!validProviders.includes(providerName)) {
        return res.status(404).json({ error: "Provider not found" });
      }

      const healthResult = await checkProviderHealth(organizationId, providerName);
      return res.json(healthResult);
    } catch (error) {
      logger.error("Failed to check provider health", {
        error: error instanceof Error ? error.message : String(error),
        provider: req.params.providerName,
      });
      return res.status(500).json({ error: "Failed to check provider health" });
    }
  },
);

router.get(
  "/providers/health",
  requireAuth,
  requirePermission(Permission.SETTINGS_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const healthResults = await checkAllProvidersHealth(organizationId);
      return res.json({ providers: healthResults });
    } catch (error) {
      logger.error("Failed to check all providers health", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to check providers health" });
    }
  },
);

router.get(
  "/providers/preferences",
  requireAuth,
  requirePermission(Permission.SETTINGS_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;

      const aiProvider = await prisma.organizationAIProvider.findUnique({
        where: { organizationId },
      });

      if (!aiProvider) {
        return res.json({
          preferredProvider: null,
          fallbackProvider: null,
          autoFallback: true,
        });
      }

      return res.json({
        preferredProvider: aiProvider.preferredProvider,
        fallbackProvider: aiProvider.fallbackProvider,
        autoFallback: aiProvider.autoFallback,
      });
    } catch (error) {
      logger.error("Failed to get provider preferences", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to get provider preferences" });
    }
  },
);

router.post(
  "/providers/preferences",
  requireAuth,
  requirePermission(Permission.SETTINGS_WRITE),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { preferredProvider, fallbackProvider, autoFallback } = req.body;

      const validProviders: ProviderName[] = [
        "anthropic",
        "openai",
        "google-ai",
        "github-models",
        "openrouter",
      ];

      if (preferredProvider && !validProviders.includes(preferredProvider)) {
        return res.status(400).json({ error: "Invalid preferred provider" });
      }

      if (fallbackProvider && !validProviders.includes(fallbackProvider)) {
        return res.status(400).json({ error: "Invalid fallback provider" });
      }

      if (preferredProvider && fallbackProvider && preferredProvider === fallbackProvider) {
        return res
          .status(400)
          .json({ error: "Preferred and fallback providers must be different" });
      }

      await prisma.organizationAIProvider.upsert({
        where: { organizationId },
        update: {
          preferredProvider: preferredProvider || "anthropic",
          fallbackProvider: fallbackProvider || null,
          autoFallback: autoFallback ?? true,
        },
        create: {
          organizationId,
          provider: preferredProvider || "anthropic",
          preferredProvider: preferredProvider || "anthropic",
          fallbackProvider: fallbackProvider || null,
          autoFallback: autoFallback ?? true,
        },
      });

      logger.info("Provider preferences updated", {
        organizationId,
        preferredProvider,
        fallbackProvider,
        autoFallback,
      });

      return res.json({ success: true });
    } catch (error) {
      logger.error("Failed to save provider preferences", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to save provider preferences" });
    }
  },
);

export { router as providersRouter, PROVIDER_CONFIGS };
