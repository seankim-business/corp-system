import { Router, Request, Response } from "express";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { encrypt, decrypt } from "../utils/encryption";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";
import crypto from "crypto";

const router = Router();

const GITHUB_OAUTH_CONFIG = {
  authorizeUrl: "https://github.com/login/oauth/authorize",
  tokenUrl: "https://github.com/login/oauth/access_token",
  clientId: process.env.GITHUB_OAUTH_CLIENT_ID || "",
  clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET || "",
};

const GITHUB_MODELS_REDIRECT_URI =
  process.env.GITHUB_OAUTH_REDIRECT_URI ||
  "https://auth.nubabel.com/api/github-models/oauth/callback";

const GITHUB_OAUTH_SCOPES = ["read:user"];

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GitHubUserInfo {
  id: number;
  login: string;
  email: string | null;
  name: string | null;
  avatar_url: string;
}

router.get(
  "/github-models/oauth/install",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
  async (req: Request, res: Response) => {
    const { organizationId, id: userId } = req.user!;

    if (!GITHUB_OAUTH_CONFIG.clientId) {
      logger.error("GitHub Models OAuth: GITHUB_OAUTH_CLIENT_ID not configured", {
        context: "oauth_install",
      });
      return res.status(500).json({ error: "GitHub Models OAuth not configured" });
    }

    const nonce = crypto.randomBytes(16).toString("hex");
    const state = Buffer.from(
      JSON.stringify({
        organizationId,
        userId,
        nonce,
      }),
    ).toString("base64url");

    await redis.set(`github_models_oauth_state:${nonce}`, state, 600);

    const authorizeUrl = new URL(GITHUB_OAUTH_CONFIG.authorizeUrl);
    authorizeUrl.searchParams.set("client_id", GITHUB_OAUTH_CONFIG.clientId);
    authorizeUrl.searchParams.set("redirect_uri", GITHUB_MODELS_REDIRECT_URI);
    authorizeUrl.searchParams.set("scope", GITHUB_OAUTH_SCOPES.join(" "));
    authorizeUrl.searchParams.set("state", state);

    logger.info("GitHub Models OAuth: Starting OAuth flow", {
      organizationId,
      userId,
    });

    return res.redirect(authorizeUrl.toString());
  },
);

router.get("/github-models/oauth/callback", async (req: Request, res: Response) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    logger.error("GitHub Models OAuth error from provider", {
      error: String(error),
      description: String(error_description || ""),
    });
    return res.redirect(
      `/settings?error=github_models_oauth_denied&message=${encodeURIComponent(String(error_description || error))}`,
    );
  }

  if (!code || !state) {
    logger.error("GitHub Models OAuth: Missing code or state", { context: "oauth_callback" });
    return res.redirect("/settings?error=github_models_oauth_invalid");
  }

  if (!GITHUB_OAUTH_CONFIG.clientId || !GITHUB_OAUTH_CONFIG.clientSecret) {
    logger.error("GitHub Models OAuth: Missing CLIENT_ID or CLIENT_SECRET", {
      context: "oauth_callback",
    });
    return res.redirect("/settings?error=github_models_oauth_config");
  }

  try {
    const stateData = JSON.parse(Buffer.from(String(state), "base64url").toString()) as {
      organizationId: string;
      userId: string;
      nonce: string;
    };

    const stored = await redis.get(`github_models_oauth_state:${stateData.nonce}`);
    if (!stored || stored !== state) {
      logger.error("GitHub Models OAuth: Invalid state parameter", { context: "oauth_callback" });
      return res.redirect("/settings?error=github_models_oauth_invalid_state");
    }

    await redis.del(`github_models_oauth_state:${stateData.nonce}`);

    const tokenResponse = await fetch(GITHUB_OAUTH_CONFIG.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_OAUTH_CONFIG.clientId,
        client_secret: GITHUB_OAUTH_CONFIG.clientSecret,
        code: String(code),
        redirect_uri: GITHUB_MODELS_REDIRECT_URI,
      }),
    });

    const tokenData = (await tokenResponse.json()) as GitHubTokenResponse;

    if (tokenData.error || !tokenData.access_token) {
      logger.error("GitHub Models OAuth token exchange failed", {
        error: tokenData.error,
        description: tokenData.error_description,
      });
      return res.redirect("/settings?error=github_models_oauth_token_failed");
    }

    const userInfoResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!userInfoResponse.ok) {
      logger.error("GitHub Models OAuth: Failed to get user info", {
        status: userInfoResponse.status,
      });
      return res.redirect("/settings?error=github_models_oauth_user_failed");
    }

    const userInfo = (await userInfoResponse.json()) as GitHubUserInfo;

    const organization = await prisma.organization.findUnique({
      where: { id: stateData.organizationId },
      select: { settings: true },
    });

    if (!organization) {
      logger.error("GitHub Models OAuth: Organization not found", {
        organizationId: stateData.organizationId,
      });
      return res.redirect("/settings?error=github_models_oauth_org_not_found");
    }

    const currentSettings = (organization.settings as Record<string, unknown>) || {};
    const updatedSettings = {
      ...currentSettings,
      githubModelsAccessToken: encrypt(tokenData.access_token),
      githubModelsRefreshToken: tokenData.refresh_token
        ? encrypt(tokenData.refresh_token)
        : undefined,
      githubModelsTokenExpiresAt: tokenData.expires_in
        ? Date.now() + tokenData.expires_in * 1000
        : undefined,
      githubModelsUsername: userInfo.login,
      githubModelsUserId: userInfo.id,
      githubModelsConnectedAt: new Date().toISOString(),
    };

    await prisma.organization.update({
      where: { id: stateData.organizationId },
      data: { settings: updatedSettings as object },
    });

    logger.info("GitHub Models OAuth success", {
      organizationId: stateData.organizationId,
      username: userInfo.login,
    });

    return res.redirect("/settings?success=github_models_connected");
  } catch (err) {
    logger.error("GitHub Models OAuth callback error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return res.redirect("/settings?error=github_models_oauth_error");
  }
});

router.delete(
  "/github-models/oauth/disconnect",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
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

      const currentSettings = (organization.settings as Record<string, unknown>) || {};
      const {
        githubModelsAccessToken: _accessToken,
        githubModelsRefreshToken: _refreshToken,
        githubModelsTokenExpiresAt: _expiresAt,
        githubModelsUsername: _username,
        githubModelsUserId: _userId,
        githubModelsConnectedAt: _connectedAt,
        ...restSettings
      } = currentSettings;

      await prisma.organization.update({
        where: { id: organizationId },
        data: { settings: restSettings as object },
      });

      logger.info("GitHub Models OAuth disconnected", { organizationId });

      return res.json({ success: true, message: "GitHub Models disconnected" });
    } catch (error) {
      logger.error("GitHub Models disconnect error", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to disconnect GitHub Models" });
    }
  },
);

router.get(
  "/github-models/status",
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

      const connected = !!(settings.githubModelsAccessToken || settings.githubModelsApiKey);
      const method = settings.githubModelsAccessToken
        ? "oauth"
        : settings.githubModelsApiKey
          ? "api_key"
          : null;

      return res.json({
        connected,
        method,
        username: settings.githubModelsUsername || null,
        connectedAt: settings.githubModelsConnectedAt || null,
      });
    } catch (error) {
      logger.error("GitHub Models status error", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to get GitHub Models status" });
    }
  },
);

export async function getGitHubModelsCredentials(organizationId: string): Promise<{
  apiKey?: string;
  accessToken?: string;
} | null> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  if (!organization) return null;

  const settings = (organization.settings as Record<string, unknown>) || {};

  if (settings.githubModelsAccessToken) {
    return {
      accessToken: decrypt(settings.githubModelsAccessToken as string),
    };
  }

  if (settings.githubModelsApiKey) {
    return {
      apiKey: decrypt(settings.githubModelsApiKey as string),
    };
  }

  return null;
}

export { router as githubModelsOAuthRouter };
