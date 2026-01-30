/**
 * Notion OAuth API Routes
 *
 * Platform-level OAuth flow for connecting Notion workspaces.
 * Customers click "Connect to Notion" -> authorize -> done.
 *
 * Endpoints:
 * - GET    /api/notion/oauth/install    - Start OAuth flow
 * - GET    /api/notion/oauth/callback   - Handle OAuth callback
 * - GET    /api/notion/oauth/status     - Check connection status
 * - DELETE /api/notion/oauth/disconnect - Disconnect Notion
 */

import { Router, Request, Response } from "express";
import * as crypto from "crypto";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { encrypt, decrypt } from "../utils/encryption";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";

const router = Router();

const NOTION_CLIENT_ID = process.env.NOTION_OAUTH_CLIENT_ID || "";
const NOTION_CLIENT_SECRET = process.env.NOTION_OAUTH_CLIENT_SECRET || "";
const NOTION_REDIRECT_URI =
  process.env.NOTION_OAUTH_REDIRECT_URI || "https://app.nubabel.com/api/notion/oauth/callback";

interface NotionTokenResponse {
  access_token: string;
  token_type: string;
  bot_id: string;
  workspace_id: string;
  workspace_name: string | null;
  workspace_icon: string | null;
  duplicated_template_id: string | null;
  owner: {
    type: string;
    user?: {
      id: string;
      name: string;
      avatar_url: string | null;
    };
  };
}

async function encodeState(organizationId: string, userId: string): Promise<string> {
  const nonce = crypto.randomBytes(16).toString("hex");
  const timestamp = Date.now();

  await redis.set(
    `notion_oauth_state:${nonce}`,
    JSON.stringify({ organizationId, userId, timestamp }),
    600,
  );

  const payload = JSON.stringify({ organizationId, userId, nonce, timestamp });
  return Buffer.from(payload).toString("base64url");
}

async function decodeState(
  state: string,
): Promise<{ organizationId: string; userId: string } | null> {
  try {
    const payload = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
    if (!payload.organizationId || !payload.userId || !payload.nonce || !payload.timestamp)
      return null;

    if (Date.now() - Number(payload.timestamp) > 10 * 60 * 1000) {
      return null;
    }

    const stored = await redis.get(`notion_oauth_state:${String(payload.nonce)}`);
    if (!stored) return null;

    await redis.del(`notion_oauth_state:${String(payload.nonce)}`);

    return { organizationId: payload.organizationId, userId: payload.userId };
  } catch {
    return null;
  }
}

// Start OAuth flow
router.get(
  "/notion/oauth/install",
  requireAuth,
  requirePermission(Permission.INTEGRATION_MANAGE),
  async (req: Request, res: Response) => {
    const frontendUrl = process.env.FRONTEND_URL || "https://app.nubabel.com";
    const { organizationId, id: userId } = req.user!;

    if (!NOTION_CLIENT_ID) {
      logger.error("Notion OAuth: NOTION_OAUTH_CLIENT_ID not configured");
      return res.redirect(`${frontendUrl}/settings/notion?error=notion_not_configured`);
    }

    const state = await encodeState(organizationId, userId);

    const authorizeUrl = new URL("https://api.notion.com/v1/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", NOTION_CLIENT_ID);
    authorizeUrl.searchParams.set("redirect_uri", NOTION_REDIRECT_URI);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("owner", "user");
    authorizeUrl.searchParams.set("state", state);

    return res.redirect(authorizeUrl.toString());
  },
);

// OAuth callback
router.get("/notion/oauth/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || "https://app.nubabel.com";

  if (error) {
    logger.error("Notion OAuth error", { error });
    return res.redirect(
      `${frontendUrl}/settings/notion?error=${encodeURIComponent(String(error))}`,
    );
  }

  if (!code || !state) {
    return res.redirect(`${frontendUrl}/settings/notion?error=missing_params`);
  }

  const stateData = await decodeState(String(state));
  if (!stateData) {
    logger.error("Notion OAuth: Invalid state parameter");
    return res.redirect(`${frontendUrl}/settings/notion?error=invalid_state`);
  }

  if (!NOTION_CLIENT_ID || !NOTION_CLIENT_SECRET) {
    logger.error("Notion OAuth: Platform credentials not configured");
    return res.redirect(`${frontendUrl}/settings/notion?error=notion_not_configured`);
  }

  try {
    // Exchange code for access token
    // Notion uses Basic auth: Base64(client_id:client_secret)
    const basicAuth = Buffer.from(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`).toString(
      "base64",
    );

    const tokenResponse = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${basicAuth}`,
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri: NOTION_REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      logger.error("Notion OAuth token exchange failed", {
        status: tokenResponse.status,
        body: errorBody,
      });
      return res.redirect(`${frontendUrl}/settings/notion?error=token_exchange_failed`);
    }

    const tokenData = (await tokenResponse.json()) as NotionTokenResponse;
    const encryptedAccessToken = encrypt(tokenData.access_token);

    // Upsert the Notion connection
    const existing = await prisma.notionConnection.findUnique({
      where: { organizationId: stateData.organizationId },
    });

    if (existing) {
      await prisma.notionConnection.update({
        where: { organizationId: stateData.organizationId },
        data: {
          accessToken: encryptedAccessToken,
          botId: tokenData.bot_id,
          workspaceId: tokenData.workspace_id,
          workspaceName: tokenData.workspace_name,
          workspaceIcon: tokenData.workspace_icon,
          connectedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.notionConnection.create({
        data: {
          organizationId: stateData.organizationId,
          apiKey: "", // Empty - using OAuth token instead
          accessToken: encryptedAccessToken,
          botId: tokenData.bot_id,
          workspaceId: tokenData.workspace_id,
          workspaceName: tokenData.workspace_name,
          workspaceIcon: tokenData.workspace_icon,
          connectedAt: new Date(),
        },
      });
    }

    logger.info(
      `Notion OAuth success: org=${stateData.organizationId}, workspace=${tokenData.workspace_name}`,
    );
    return res.redirect(`${frontendUrl}/settings/notion?success=true`);
  } catch (error) {
    logger.error("Notion OAuth callback error", {
      error: error instanceof Error ? error.message : error,
    });
    return res.redirect(`${frontendUrl}/settings/notion?error=server_error`);
  }
});

// Check connection status
router.get(
  "/notion/oauth/status",
  requireAuth,
  requirePermission(Permission.INTEGRATION_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;

      const connection = await prisma.notionConnection.findUnique({
        where: { organizationId },
      });

      if (!connection) {
        return res.json({ connected: false });
      }

      const hasOAuth = !!connection.accessToken;
      const hasApiKey = !!connection.apiKey && connection.apiKey !== "";

      return res.json({
        connected: hasOAuth || hasApiKey,
        method: hasOAuth ? "oauth" : hasApiKey ? "api_key" : "none",
        workspaceId: connection.workspaceId || null,
        workspaceName: connection.workspaceName || null,
        workspaceIcon: connection.workspaceIcon || null,
        botId: connection.botId || null,
        connectedAt: connection.connectedAt || connection.createdAt,
        defaultDatabaseId: connection.defaultDatabaseId || null,
      });
    } catch (error) {
      logger.error("Notion OAuth status error", {
        error: error instanceof Error ? error.message : error,
      });
      return res.status(500).json({ error: "Failed to fetch Notion status" });
    }
  },
);

// Disconnect Notion
router.delete(
  "/notion/oauth/disconnect",
  requireAuth,
  requirePermission(Permission.INTEGRATION_MANAGE),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;

      const existing = await prisma.notionConnection.findUnique({
        where: { organizationId },
      });

      if (!existing) {
        return res.status(404).json({ error: "No Notion connection found" });
      }

      await prisma.notionConnection.delete({
        where: { organizationId },
      });

      logger.info(`Notion disconnected: org=${organizationId}`);
      return res.json({ success: true });
    } catch (error) {
      logger.error("Notion OAuth disconnect error", {
        error: error instanceof Error ? error.message : error,
      });
      return res.status(500).json({ error: "Failed to disconnect Notion" });
    }
  },
);

/**
 * Get the active Notion access token for an organization.
 * Prefers OAuth token over legacy API key.
 */
export async function getNotionTokenForOrg(organizationId: string): Promise<string | null> {
  const connection = await prisma.notionConnection.findUnique({
    where: { organizationId },
  });

  if (!connection) return null;

  // Prefer OAuth token
  if (connection.accessToken) {
    return decrypt(connection.accessToken);
  }

  // Fallback to legacy API key
  if (connection.apiKey && connection.apiKey !== "") {
    return connection.apiKey;
  }

  return null;
}

export default router;
