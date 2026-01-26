import { Router, Request, Response } from "express";
import { WebClient } from "@slack/web-api";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { encrypt, decrypt } from "../utils/encryption";

const router = Router();

router.get("/slack/integration", requireAuth, async (req: Request, res: Response) => {
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
});

router.put("/slack/integration", requireAuth, async (req: Request, res: Response) => {
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
});

router.post("/slack/integration/test", requireAuth, async (req: Request, res: Response) => {
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
});

router.delete("/slack/integration", requireAuth, async (req: Request, res: Response) => {
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
});

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

export default router;
