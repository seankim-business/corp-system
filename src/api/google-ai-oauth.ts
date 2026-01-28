import { Router, Request, Response } from "express";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { encrypt, decrypt } from "../utils/encryption";
import { OAuthRefreshConfig, OAuthRefreshError } from "../services/oauth-refresh";
import { redis } from "../db/redis";
import crypto from "crypto";

const router = Router();

const GOOGLE_AI_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/generative-language.retriever",
  "https://www.googleapis.com/auth/cloud-platform",
];

const GOOGLE_OAUTH_CONFIG: OAuthRefreshConfig = {
  tokenUrl: "https://oauth2.googleapis.com/token",
  clientId: process.env.GOOGLE_AI_CLIENT_ID || "",
  clientSecret: process.env.GOOGLE_AI_CLIENT_SECRET || "",
};

const GOOGLE_AI_REDIRECT_URI =
  process.env.GOOGLE_AI_REDIRECT_URI || "https://auth.nubabel.com/api/google-ai/oauth/callback";

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  name?: string;
}

router.get(
  "/google-ai/oauth/install",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
  async (req: Request, res: Response) => {
    const { organizationId, id: userId } = req.user!;

    if (!GOOGLE_OAUTH_CONFIG.clientId) {
      console.error("Google AI OAuth: GOOGLE_AI_CLIENT_ID not configured");
      return res.status(500).json({ error: "Google AI OAuth not configured" });
    }

    const nonce = crypto.randomBytes(16).toString("hex");
    const state = Buffer.from(
      JSON.stringify({
        organizationId,
        userId,
        nonce,
      }),
    ).toString("base64url");

    await redis.set(`google_ai_oauth_state:${nonce}`, state, 600);

    const authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizeUrl.searchParams.set("client_id", GOOGLE_OAUTH_CONFIG.clientId);
    authorizeUrl.searchParams.set("redirect_uri", GOOGLE_AI_REDIRECT_URI);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", GOOGLE_AI_OAUTH_SCOPES.join(" "));
    authorizeUrl.searchParams.set("access_type", "offline");
    authorizeUrl.searchParams.set("prompt", "consent");
    authorizeUrl.searchParams.set("state", state);

    return res.redirect(authorizeUrl.toString());
  },
);

router.get("/google-ai/oauth/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error("Google AI OAuth error:", error);
    return res.redirect("/settings?error=google_ai_oauth_denied");
  }

  if (!code || !state) {
    console.error("Google AI OAuth: Missing code or state");
    return res.redirect("/settings?error=google_ai_oauth_invalid");
  }

  if (!GOOGLE_OAUTH_CONFIG.clientId || !GOOGLE_OAUTH_CONFIG.clientSecret) {
    console.error("Google AI OAuth: Missing CLIENT_ID or CLIENT_SECRET");
    return res.redirect("/settings?error=google_ai_oauth_config");
  }

  try {
    const stateData = JSON.parse(Buffer.from(String(state), "base64url").toString()) as {
      organizationId: string;
      userId: string;
      nonce: string;
    };

    const stored = await redis.get(`google_ai_oauth_state:${stateData.nonce}`);
    if (!stored || stored !== state) {
      console.error("Google AI OAuth: Invalid state parameter");
      return res.redirect("/settings?error=google_ai_oauth_invalid_state");
    }

    await redis.del(`google_ai_oauth_state:${stateData.nonce}`);

    const tokenResponse = await fetch(GOOGLE_OAUTH_CONFIG.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(code),
        client_id: GOOGLE_OAUTH_CONFIG.clientId,
        client_secret: GOOGLE_OAUTH_CONFIG.clientSecret,
        redirect_uri: GOOGLE_AI_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;

    if (!tokenData.access_token) {
      console.error("Google AI OAuth token exchange failed");
      return res.redirect("/settings?error=google_ai_oauth_token_failed");
    }

    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const userInfo = (await userInfoResponse.json()) as GoogleUserInfo;

    const organization = await prisma.organization.findUnique({
      where: { id: stateData.organizationId },
      select: { settings: true },
    });

    if (!organization) {
      console.error("Google AI OAuth: Organization not found");
      return res.redirect("/settings?error=google_ai_oauth_org_not_found");
    }

    const currentSettings = (organization.settings as Record<string, unknown>) || {};
    const updatedSettings = {
      ...currentSettings,
      googleAiAccessToken: encrypt(tokenData.access_token),
      googleAiRefreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : undefined,
      googleAiTokenExpiresAt: Date.now() + tokenData.expires_in * 1000,
      googleAiUserEmail: userInfo.email,
      googleAiConnectedAt: new Date().toISOString(),
    };

    await prisma.organization.update({
      where: { id: stateData.organizationId },
      data: { settings: updatedSettings as object },
    });

    console.log(
      `Google AI OAuth success: org=${stateData.organizationId}, email=${userInfo.email}`,
    );
    return res.redirect("/settings?success=google_ai_connected");
  } catch (err) {
    console.error("Google AI OAuth callback error:", err);
    return res.redirect("/settings?error=google_ai_oauth_error");
  }
});

router.delete(
  "/google-ai/oauth/disconnect",
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
        googleAiAccessToken: _accessToken,
        googleAiRefreshToken: _refreshToken,
        googleAiTokenExpiresAt: _expiresAt,
        googleAiUserEmail: _email,
        googleAiConnectedAt: _connectedAt,
        ...restSettings
      } = currentSettings;

      await prisma.organization.update({
        where: { id: organizationId },
        data: { settings: restSettings as object },
      });

      return res.json({ success: true, message: "Google AI disconnected" });
    } catch (error) {
      console.error("Google AI disconnect error:", error);
      return res.status(500).json({ error: "Failed to disconnect Google AI" });
    }
  },
);

router.get(
  "/google-ai/status",
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

      const connected = !!(settings.googleAiAccessToken || settings.googleAiApiKey);
      const method = settings.googleAiAccessToken
        ? "oauth"
        : settings.googleAiApiKey
          ? "api_key"
          : null;

      return res.json({
        connected,
        method,
        email: settings.googleAiUserEmail || null,
        connectedAt: settings.googleAiConnectedAt || null,
      });
    } catch (error) {
      console.error("Google AI status error:", error);
      return res.status(500).json({ error: "Failed to get Google AI status" });
    }
  },
);

export async function refreshGoogleAiToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  if (!GOOGLE_OAUTH_CONFIG.clientId || !GOOGLE_OAUTH_CONFIG.clientSecret) {
    throw new OAuthRefreshError("Google AI OAuth not configured", "config_error", 500);
  }

  const response = await fetch(GOOGLE_OAUTH_CONFIG.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_OAUTH_CONFIG.clientId,
      client_secret: GOOGLE_OAUTH_CONFIG.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new OAuthRefreshError(
      `Google AI token refresh failed: ${errorText}`,
      "refresh_failed",
      response.status,
    );
  }

  const data = (await response.json()) as GoogleTokenResponse;
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}

export async function getGoogleAiCredentials(organizationId: string): Promise<{
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
} | null> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  if (!organization) return null;

  const settings = (organization.settings as Record<string, unknown>) || {};

  if (settings.googleAiApiKey) {
    return {
      apiKey: decrypt(settings.googleAiApiKey as string),
    };
  }

  if (settings.googleAiAccessToken) {
    const tokenExpiresAt = settings.googleAiTokenExpiresAt as number | undefined;
    const isExpired = tokenExpiresAt && Date.now() > tokenExpiresAt - 60000;

    if (isExpired && settings.googleAiRefreshToken) {
      try {
        const refreshResult = await refreshGoogleAiToken(
          decrypt(settings.googleAiRefreshToken as string),
        );

        await prisma.organization.update({
          where: { id: organizationId },
          data: {
            settings: {
              ...settings,
              googleAiAccessToken: encrypt(refreshResult.accessToken),
              googleAiTokenExpiresAt: Date.now() + refreshResult.expiresIn * 1000,
            } as object,
          },
        });

        return {
          accessToken: refreshResult.accessToken,
          refreshToken: decrypt(settings.googleAiRefreshToken as string),
        };
      } catch (error) {
        console.error("Failed to refresh Google AI token:", error);
        return null;
      }
    }

    return {
      accessToken: decrypt(settings.googleAiAccessToken as string),
      refreshToken: settings.googleAiRefreshToken
        ? decrypt(settings.googleAiRefreshToken as string)
        : undefined,
    };
  }

  return null;
}

export { router as googleAiOAuthRouter };
