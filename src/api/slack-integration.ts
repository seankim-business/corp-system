import { Router, Request, Response } from "express";
import { WebClient } from "@slack/web-api";
import * as crypto from "crypto";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { encrypt, decrypt } from "../utils/encryption";
import { redis } from "../db/redis";

const slackOAuthRouter = Router();
const slackIntegrationRouter = Router();

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  team?: { id: string; name: string };
  bot_user_id?: string;
  scope?: string;
}

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET;
const SLACK_REDIRECT_URI =
  process.env.SLACK_REDIRECT_URI || "https://auth.nubabel.com/api/slack/oauth/callback";
const SLACK_SCOPES = [
  "app_mentions:read",
  "chat:write",
  "channels:history",
  "groups:history",
  "im:history",
  "mpim:history",
  "users:read",
  "users:read.email",
  "team:read",
].join(",");

async function encodeState(organizationId: string, userId: string): Promise<string> {
  const nonce = crypto.randomBytes(16).toString("hex");
  const timestamp = Date.now();

  await redis.set(
    `slack_oauth_state:${nonce}`,
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

    const stored = await redis.get(`slack_oauth_state:${String(payload.nonce)}`);
    if (!stored) return null;

    await redis.del(`slack_oauth_state:${String(payload.nonce)}`);

    return { organizationId: payload.organizationId, userId: payload.userId };
  } catch {
    return null;
  }
}

slackIntegrationRouter.get(
  "/slack/oauth/install",
  requireAuth,
  async (req: Request, res: Response) => {
    const frontendUrl = process.env.FRONTEND_URL || "https://auth.nubabel.com";

    if (!SLACK_CLIENT_ID) {
      console.error("Slack OAuth: SLACK_CLIENT_ID not configured");
      return res.redirect(`${frontendUrl}/settings/slack?error=slack_not_configured`);
    }

    const { organizationId, id: userId } = req.user!;
    const state = await encodeState(organizationId, userId);

    const authorizeUrl = new URL("https://slack.com/oauth/v2/authorize");
    authorizeUrl.searchParams.set("client_id", SLACK_CLIENT_ID);
    authorizeUrl.searchParams.set("scope", SLACK_SCOPES);
    authorizeUrl.searchParams.set("redirect_uri", SLACK_REDIRECT_URI);
    authorizeUrl.searchParams.set("state", state);

    return res.redirect(authorizeUrl.toString());
  },
);

slackOAuthRouter.get("/slack/oauth/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || "https://app.nubabel.com";

  if (error) {
    console.error("Slack OAuth error:", error);
    return res.redirect(`${frontendUrl}/settings/slack?error=${encodeURIComponent(String(error))}`);
  }

  if (!code || !state) {
    return res.redirect(`${frontendUrl}/settings/slack?error=missing_params`);
  }

  if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET) {
    console.error("Slack OAuth: Missing CLIENT_ID or CLIENT_SECRET");
    return res.redirect(`${frontendUrl}/settings/slack?error=server_config`);
  }

  const stateData = await decodeState(String(state));
  if (!stateData) {
    console.error("Slack OAuth: Invalid state parameter");
    return res.redirect(`${frontendUrl}/settings/slack?error=invalid_state`);
  }

  try {
    const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: SLACK_CLIENT_ID,
        client_secret: SLACK_CLIENT_SECRET,
        code: String(code),
        redirect_uri: SLACK_REDIRECT_URI,
      }),
    });

    const tokenData = (await tokenResponse.json()) as SlackOAuthResponse;

    if (!tokenData.ok || !tokenData.access_token || !tokenData.team) {
      console.error("Slack OAuth token exchange failed:", tokenData.error);
      return res.redirect(
        `${frontendUrl}/settings/slack?error=${encodeURIComponent(tokenData.error || "token_exchange_failed")}`,
      );
    }

    const botToken = tokenData.access_token;
    const workspaceId = tokenData.team.id;
    const workspaceName = tokenData.team.name;
    const botUserId = tokenData.bot_user_id;
    const scope = tokenData.scope;

    const envAppToken = process.env.SLACK_APP_TOKEN;
    const envSigningSecret = process.env.SLACK_SIGNING_SECRET;

    if (!envSigningSecret) {
      console.error("Slack OAuth: SLACK_SIGNING_SECRET not configured");
      return res.redirect(`${frontendUrl}/settings/slack?error=server_config`);
    }

    const encryptedBotToken = encrypt(botToken);
    const encryptedAppToken = envAppToken ? encrypt(envAppToken) : null;
    const encryptedSigningSecret = encrypt(envSigningSecret);

    const existing = await prisma.slackIntegration.findFirst({
      where: { organizationId: stateData.organizationId },
    });

    if (existing) {
      await prisma.slackIntegration.update({
        where: { id: existing.id },
        data: {
          workspaceId,
          workspaceName,
          botToken: encryptedBotToken,
          botUserId,
          scopes: scope ? scope.split(",") : [],
          appToken: encryptedAppToken,
          signingSecret: encryptedSigningSecret,
          installedAt: new Date(),
          healthStatus: "healthy",
          enabled: true,
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.slackIntegration.create({
        data: {
          organizationId: stateData.organizationId,
          workspaceId,
          workspaceName,
          botToken: encryptedBotToken,
          botUserId,
          scopes: scope ? scope.split(",") : [],
          appToken: encryptedAppToken,
          signingSecret: encryptedSigningSecret,
          installedBy: stateData.userId,
          installedAt: new Date(),
          healthStatus: "healthy",
          enabled: true,
        },
      });
    }

    console.log(`Slack OAuth success: org=${stateData.organizationId}, workspace=${workspaceName}`);
    return res.redirect(`${frontendUrl}/settings/slack?success=true`);
  } catch (error) {
    console.error("Slack OAuth callback error:", error);
    return res.redirect(`${frontendUrl}/settings/slack?error=server_error`);
  }
});

slackIntegrationRouter.get(
  "/slack/integration",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;

      const integration = await prisma.slackIntegration.findFirst({
        where: { organizationId },
      });

      if (!integration) {
        return res.status(404).json({ error: "Slack integration not found" });
      }

      return res.json({
        integration: {
          id: integration.id,
          organizationId: integration.organizationId,
          workspaceId: integration.workspaceId,
          workspaceName: integration.workspaceName,
          botUserId: integration.botUserId,
          scopes: integration.scopes,
          enabled: integration.enabled,
          healthStatus: integration.healthStatus,
          lastHealthCheck: integration.lastHealthCheck,
          installedAt: integration.installedAt,
          createdAt: integration.createdAt,
          updatedAt: integration.updatedAt,
        },
      });
    } catch (error) {
      console.error("Get Slack integration error:", error);
      return res.status(500).json({ error: "Failed to fetch Slack integration" });
    }
  },
);

slackIntegrationRouter.put(
  "/slack/integration",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const userId = req.user!.id;
      const { workspaceId, workspaceName, botToken } = req.body;

      if (!workspaceId || !workspaceName) {
        return res.status(400).json({
          error: "workspaceId and workspaceName are required",
        });
      }

      const envSigningSecret = process.env.SLACK_SIGNING_SECRET;
      if (!envSigningSecret) {
        return res.status(500).json({
          error: "SLACK_SIGNING_SECRET must be set on the server (Railway env)",
        });
      }

      const envAppToken = process.env.SLACK_APP_TOKEN;
      const encryptedBotToken = botToken ? encrypt(botToken) : null;
      const encryptedAppToken = envAppToken ? encrypt(envAppToken) : null;
      const encryptedSigningSecret = encrypt(envSigningSecret);

      const existing = await prisma.slackIntegration.findFirst({
        where: { organizationId },
      });

      if (!existing && !encryptedBotToken) {
        return res.status(400).json({
          error: "botToken is required for first-time Slack integration setup",
        });
      }

      let integration;
      if (existing) {
        integration = await prisma.slackIntegration.update({
          where: { id: existing.id },
          data: {
            workspaceId,
            workspaceName,
            ...(encryptedBotToken !== null && { botToken: encryptedBotToken }),
            appToken: encryptedAppToken,
            signingSecret: encryptedSigningSecret,
            updatedAt: new Date(),
          },
        });
      } else {
        integration = await prisma.slackIntegration.create({
          data: {
            organizationId,
            workspaceId,
            workspaceName,
            botToken: encryptedBotToken!,
            appToken: encryptedAppToken,
            signingSecret: encryptedSigningSecret,
            installedBy: userId,
          },
        });
      }

      return res.json({
        integration: {
          id: integration.id,
          organizationId: integration.organizationId,
          workspaceId: integration.workspaceId,
          workspaceName: integration.workspaceName,
          enabled: integration.enabled,
          createdAt: integration.createdAt,
          updatedAt: integration.updatedAt,
        },
      });
    } catch (error) {
      console.error("Upsert Slack integration error:", error);
      return res.status(500).json({ error: "Failed to save Slack integration" });
    }
  },
);

slackIntegrationRouter.post(
  "/slack/integration/test",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { botToken } = req.body;

      if (!botToken) {
        return res.status(400).json({ error: "botToken is required for testing" });
      }

      const client = new WebClient(botToken);

      const authResult = await client.auth.test();

      if (!authResult.ok) {
        return res.status(400).json({
          success: false,
          error: "Invalid bot token",
        });
      }

      return res.json({
        success: true,
        workspace: {
          teamId: authResult.team_id,
          teamName: authResult.team,
          botUserId: authResult.user_id,
          botId: authResult.bot_id,
        },
      });
    } catch (error: unknown) {
      console.error("Test Slack connection error:", error);
      const errorMessage = error instanceof Error ? error.message : "Invalid bot token";
      return res.status(400).json({
        success: false,
        error: errorMessage,
      });
    }
  },
);

slackIntegrationRouter.delete(
  "/slack/integration",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;

      const existing = await prisma.slackIntegration.findFirst({
        where: { organizationId },
      });

      if (!existing) {
        return res.status(404).json({ error: "Slack integration not found" });
      }

      await prisma.slackIntegration.delete({
        where: { id: existing.id },
      });

      return res.json({ success: true });
    } catch (error) {
      console.error("Delete Slack integration error:", error);
      return res.status(500).json({ error: "Failed to delete Slack integration" });
    }
  },
);

export async function getSlackIntegrationByWorkspace(workspaceId: string) {
  const integration = await prisma.slackIntegration.findUnique({
    where: { workspaceId },
  });

  if (!integration) {
    return null;
  }

  return {
    ...integration,
    botToken: decrypt(integration.botToken),
    appToken: integration.appToken ? decrypt(integration.appToken) : null,
    signingSecret: decrypt(integration.signingSecret),
  };
}

export async function getSlackIntegrationByOrg(organizationId: string) {
  const integration = await prisma.slackIntegration.findFirst({
    where: { organizationId },
  });

  if (!integration) {
    return null;
  }

  return {
    ...integration,
    botToken: decrypt(integration.botToken),
    appToken: integration.appToken ? decrypt(integration.appToken) : null,
    signingSecret: decrypt(integration.signingSecret),
  };
}

export { slackOAuthRouter, slackIntegrationRouter };
