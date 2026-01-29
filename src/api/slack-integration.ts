import { Router, Request, Response } from "express";
import { WebClient } from "@slack/web-api";
import * as crypto from "crypto";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { encrypt, decrypt } from "../utils/encryption";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";

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

const SLACK_REDIRECT_URI =
  process.env.SLACK_REDIRECT_URI || "https://app.nubabel.com/api/slack/oauth/callback";
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

// Save Slack App credentials (BYOA)
slackIntegrationRouter.post(
  "/slack/credentials",
  requireAuth,
  requirePermission(Permission.INTEGRATION_MANAGE),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const userId = req.user!.id;
      const { clientId, clientSecret, signingSecret } = req.body;

      if (!clientId || !clientSecret || !signingSecret) {
        return res.status(400).json({
          error: "clientId, clientSecret, and signingSecret are required",
        });
      }

      const encryptedClientId = encrypt(clientId);
      const encryptedClientSecret = encrypt(clientSecret);
      const encryptedSigningSecret = encrypt(signingSecret);

      const existing = await prisma.slackIntegration.findUnique({
        where: { organizationId },
      });

      let integration;
      if (existing) {
        integration = await prisma.slackIntegration.update({
          where: { organizationId },
          data: {
            clientId: encryptedClientId,
            clientSecret: encryptedClientSecret,
            signingSecret: encryptedSigningSecret,
            updatedAt: new Date(),
          },
        });
      } else {
        integration = await prisma.slackIntegration.create({
          data: {
            organizationId,
            clientId: encryptedClientId,
            clientSecret: encryptedClientSecret,
            signingSecret: encryptedSigningSecret,
            installedBy: userId,
          },
        });
      }

      logger.info(`Slack credentials saved: org=${organizationId}`);
      return res.json({
        success: true,
        hasCredentials: true,
        hasWorkspace: !!integration.workspaceId,
      });
    } catch (error) {
      logger.error("Save Slack credentials error", {
        error: error instanceof Error ? error.message : error,
      });
      return res.status(500).json({ error: "Failed to save Slack credentials" });
    }
  },
);

// Start OAuth flow using org's stored credentials
slackIntegrationRouter.get(
  "/slack/oauth/install",
  requireAuth,
  requirePermission(Permission.INTEGRATION_MANAGE),
  async (req: Request, res: Response) => {
    const frontendUrl = process.env.FRONTEND_URL || "https://app.nubabel.com";
    const { organizationId, id: userId } = req.user!;

    // Get org's stored Slack credentials
    const integration = await prisma.slackIntegration.findUnique({
      where: { organizationId },
    });

    if (!integration?.clientId) {
      logger.error("Slack OAuth: No credentials configured for org", { organizationId });
      return res.redirect(`${frontendUrl}/settings/slack?error=credentials_not_configured`);
    }

    const clientId = decrypt(integration.clientId);
    const state = await encodeState(organizationId, userId);

    const authorizeUrl = new URL("https://slack.com/oauth/v2/authorize");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("scope", SLACK_SCOPES);
    authorizeUrl.searchParams.set("redirect_uri", SLACK_REDIRECT_URI);
    authorizeUrl.searchParams.set("state", state);

    return res.redirect(authorizeUrl.toString());
  },
);

// OAuth callback - uses org's stored credentials
slackOAuthRouter.get("/slack/oauth/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || "https://app.nubabel.com";

  if (error) {
    logger.error("Slack OAuth error", { error });
    return res.redirect(`${frontendUrl}/settings/slack?error=${encodeURIComponent(String(error))}`);
  }

  if (!code || !state) {
    return res.redirect(`${frontendUrl}/settings/slack?error=missing_params`);
  }

  const stateData = await decodeState(String(state));
  if (!stateData) {
    logger.error("Slack OAuth: Invalid state parameter");
    return res.redirect(`${frontendUrl}/settings/slack?error=invalid_state`);
  }

  // Get org's stored Slack credentials
  const integration = await prisma.slackIntegration.findUnique({
    where: { organizationId: stateData.organizationId },
  });

  if (!integration?.clientId || !integration?.clientSecret) {
    logger.error("Slack OAuth: Missing credentials for org", {
      organizationId: stateData.organizationId,
    });
    return res.redirect(`${frontendUrl}/settings/slack?error=credentials_not_configured`);
  }

  const clientId = decrypt(integration.clientId);
  const clientSecret = decrypt(integration.clientSecret);

  try {
    const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: String(code),
        redirect_uri: SLACK_REDIRECT_URI,
      }),
    });

    const tokenData = (await tokenResponse.json()) as SlackOAuthResponse;

    if (!tokenData.ok || !tokenData.access_token || !tokenData.team) {
      logger.error("Slack OAuth token exchange failed", { error: tokenData.error });
      return res.redirect(
        `${frontendUrl}/settings/slack?error=${encodeURIComponent(tokenData.error || "token_exchange_failed")}`,
      );
    }

    const botToken = tokenData.access_token;
    const workspaceId = tokenData.team.id;
    const workspaceName = tokenData.team.name;
    const botUserId = tokenData.bot_user_id;
    const scope = tokenData.scope;

    const encryptedBotToken = encrypt(botToken);

    await prisma.slackIntegration.update({
      where: { organizationId: stateData.organizationId },
      data: {
        workspaceId,
        workspaceName,
        botToken: encryptedBotToken,
        botUserId,
        scopes: scope ? scope.split(",") : [],
        installedAt: new Date(),
        healthStatus: "healthy",
        enabled: true,
        updatedAt: new Date(),
      },
    });

    logger.info(`Slack OAuth success: org=${stateData.organizationId}, workspace=${workspaceName}`);
    return res.redirect(`${frontendUrl}/settings/slack?success=true`);
  } catch (error) {
    logger.error("Slack OAuth callback error", {
      error: error instanceof Error ? error.message : error,
    });
    return res.redirect(`${frontendUrl}/settings/slack?error=server_error`);
  }
});

slackIntegrationRouter.get(
  "/slack/integration",
  requireAuth,
  requirePermission(Permission.INTEGRATION_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;

      const integration = await prisma.slackIntegration.findUnique({
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
          // Indicate whether credentials and workspace are configured
          hasCredentials: !!(integration.clientId && integration.clientSecret),
          hasWorkspace: !!integration.workspaceId,
        },
      });
    } catch (error) {
      logger.error("Get Slack integration error", {
        error: error instanceof Error ? error.message : error,
      });
      return res.status(500).json({ error: "Failed to fetch Slack integration" });
    }
  },
);

slackIntegrationRouter.put(
  "/slack/integration",
  requireAuth,
  requirePermission(Permission.INTEGRATION_MANAGE),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const userId = req.user!.id;
      const { workspaceId, workspaceName, botToken, signingSecret } = req.body;

      if (!workspaceId || !workspaceName) {
        return res.status(400).json({
          error: "workspaceId and workspaceName are required",
        });
      }

      const encryptedBotToken = botToken ? encrypt(botToken) : null;
      const encryptedSigningSecret = signingSecret ? encrypt(signingSecret) : null;

      const existing = await prisma.slackIntegration.findUnique({
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
          where: { organizationId },
          data: {
            workspaceId,
            workspaceName,
            ...(encryptedBotToken !== null && { botToken: encryptedBotToken }),
            ...(encryptedSigningSecret !== null && { signingSecret: encryptedSigningSecret }),
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
      logger.error("Upsert Slack integration error", {
        error: error instanceof Error ? error.message : error,
      });
      return res.status(500).json({ error: "Failed to save Slack integration" });
    }
  },
);

slackIntegrationRouter.post(
  "/slack/integration/test",
  requireAuth,
  requirePermission(Permission.INTEGRATION_MANAGE),
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
      logger.error("Test Slack connection error", {
        error: error instanceof Error ? error.message : error,
      });
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
  requirePermission(Permission.INTEGRATION_MANAGE),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;

      const existing = await prisma.slackIntegration.findUnique({
        where: { organizationId },
      });

      if (!existing) {
        return res.status(404).json({ error: "Slack integration not found" });
      }

      await prisma.slackIntegration.delete({
        where: { organizationId },
      });

      return res.json({ success: true });
    } catch (error) {
      logger.error("Delete Slack integration error", {
        error: error instanceof Error ? error.message : error,
      });
      return res.status(500).json({ error: "Failed to delete Slack integration" });
    }
  },
);

export async function getSlackIntegrationByWorkspace(workspaceId: string) {
  const integration = await prisma.slackIntegration.findUnique({
    where: { workspaceId },
  });

  if (!integration || !integration.botToken) {
    return null;
  }

  return {
    ...integration,
    botToken: integration.botToken ? decrypt(integration.botToken) : "",
    appToken: integration.appToken !== null ? decrypt(integration.appToken) : null,
    signingSecret: integration.signingSecret !== null ? decrypt(integration.signingSecret) : null,
    clientId: integration.clientId !== null ? decrypt(integration.clientId) : null,
    clientSecret: integration.clientSecret !== null ? decrypt(integration.clientSecret) : null,
  };
}

export async function getSlackIntegrationByOrg(organizationId: string) {
  const integration = await prisma.slackIntegration.findUnique({
    where: { organizationId },
  });

  if (!integration || !integration.botToken) {
    return null;
  }

  return {
    ...integration,
    botToken: integration.botToken ? decrypt(integration.botToken) : "",
    appToken: integration.appToken !== null ? decrypt(integration.appToken) : null,
    signingSecret: integration.signingSecret !== null ? decrypt(integration.signingSecret) : null,
    clientId: integration.clientId !== null ? decrypt(integration.clientId) : null,
    clientSecret: integration.clientSecret !== null ? decrypt(integration.clientSecret) : null,
  };
}

export { slackOAuthRouter, slackIntegrationRouter };
