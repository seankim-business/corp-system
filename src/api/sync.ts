import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import {
  promoteDocument,
  getSyncStatus,
  handlePrMerged,
  findPagesReadyForPromotion,
  SyncConfig,
} from "../services/document-sync";
import { logger } from "../utils/logger";
import { db } from "../db/client";
import { getAccessTokenFromConfig } from "../services/mcp-registry";
import crypto from "crypto";

const router = Router();

function getDefaultSyncConfig(): SyncConfig {
  return {
    owner: process.env.GITHUB_DEFAULT_OWNER || "",
    repo: process.env.GITHUB_DEFAULT_REPO || "",
    baseBranch: process.env.GITHUB_DEFAULT_BRANCH || "main",
    targetDir: "docs",
    labels: ["sync", "notion"],
  };
}

router.post(
  "/sync/promote",
  authenticate,
  requirePermission(Permission.INTEGRATION_MANAGE),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const { pageId, owner, repo, baseBranch, targetDir, labels } = req.body;

      if (!pageId) {
        return res.status(400).json({ error: "pageId is required" });
      }

      const defaultConfig = getDefaultSyncConfig();
      const config: SyncConfig = {
        owner: owner || defaultConfig.owner,
        repo: repo || defaultConfig.repo,
        baseBranch: baseBranch || defaultConfig.baseBranch,
        targetDir: targetDir || defaultConfig.targetDir,
        labels: labels || defaultConfig.labels,
      };

      if (!config.owner || !config.repo) {
        return res.status(400).json({
          error:
            "GitHub owner and repo are required. Set them in the request or configure defaults.",
        });
      }

      const result = await promoteDocument(pageId, organizationId, userId, config);

      if (result.success) {
        return res.status(201).json({
          success: true,
          pageId: result.pageId,
          status: result.status,
          prUrl: result.prUrl,
          prNumber: result.prNumber,
        });
      } else {
        return res.status(400).json({
          success: false,
          pageId: result.pageId,
          status: result.status,
          error: result.error,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Promote document error", { error: message });
      return res.status(500).json({ error: "Failed to promote document" });
    }
  },
);

router.get(
  "/sync/status/:pageId",
  authenticate,
  requirePermission(Permission.INTEGRATION_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const pageId = req.params.pageId as string;
      const owner = req.query.owner as string | undefined;
      const repo = req.query.repo as string | undefined;

      const defaultConfig = getDefaultSyncConfig();
      const config: SyncConfig = {
        owner: owner || defaultConfig.owner,
        repo: repo || defaultConfig.repo,
        baseBranch: defaultConfig.baseBranch,
      };

      if (!config.owner || !config.repo) {
        return res.status(400).json({
          error: "GitHub owner and repo are required",
        });
      }

      const status = await getSyncStatus(pageId, organizationId, userId, config);

      return res.json(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Get sync status error", { error: message });
      return res.status(500).json({ error: "Failed to get sync status" });
    }
  },
);

router.get(
  "/sync/ready",
  authenticate,
  requirePermission(Permission.INTEGRATION_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const databaseId = req.query.databaseId as string | undefined;

      if (!databaseId) {
        return res.status(400).json({ error: "databaseId is required" });
      }

      const pages = await findPagesReadyForPromotion(organizationId, userId, databaseId);

      return res.json({ pages });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Find ready pages error", { error: message });
      return res.status(500).json({ error: "Failed to find pages ready for promotion" });
    }
  },
);

router.post("/webhooks/notion", async (req: Request, res: Response) => {
  try {
    const signature = req.headers["x-notion-signature"] as string;
    const rawBody = (req as any).rawBody;

    if (signature && rawBody && process.env.NOTION_WEBHOOK_SECRET) {
      const expectedSignature = crypto
        .createHmac("sha256", process.env.NOTION_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");

      if (signature !== `sha256=${expectedSignature}`) {
        logger.warn("Invalid Notion webhook signature");
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    const { type, page_id, workspace_id, properties } = req.body;

    logger.info("Notion webhook received", { type, page_id, workspace_id });

    if (type === "page.updated" || type === "page.created") {
      const status = properties?.Status?.status?.name;

      if (status === "Ready for Review" || status === "Ready for Official") {
        const connection = await db.mCPConnection.findFirst({
          where: {
            provider: "notion",
            enabled: true,
            config: {
              path: ["workspace_id"],
              equals: workspace_id,
            },
          },
        });

        if (connection) {
          logger.info("Page ready for promotion detected via webhook", {
            pageId: page_id,
            organizationId: connection.organizationId,
          });
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Notion webhook error", { error: message });
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

router.post("/webhooks/github/sync", async (req: Request, res: Response) => {
  try {
    const signature = req.headers["x-hub-signature-256"] as string;
    const rawBody = (req as any).rawBody;

    if (signature && rawBody && process.env.GITHUB_WEBHOOK_SECRET) {
      const expectedSignature = crypto
        .createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");

      if (signature !== `sha256=${expectedSignature}`) {
        logger.warn("Invalid GitHub webhook signature");
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    const event = req.headers["x-github-event"] as string;
    const { action, pull_request } = req.body;

    logger.info("GitHub webhook received", { event, action });

    if (event === "pull_request" && action === "closed" && pull_request?.merged) {
      const branchName = pull_request.head?.ref || "";

      const syncMatch = branchName.match(/^sync\/notion-([a-f0-9]{8})-/);
      if (syncMatch) {
        const pageIdPrefix = syncMatch[1];
        const prUrl = pull_request.html_url;

        logger.info("Sync PR merged", { branchName, pageIdPrefix, prUrl });

        const connections = await db.mCPConnection.findMany({
          where: { provider: "notion", enabled: true },
        });

        for (const connection of connections) {
          const notionToken = getAccessTokenFromConfig(
            connection.config as Record<string, unknown>,
          );
          if (!notionToken) continue;

          try {
            await handlePrMerged(pageIdPrefix, connection.organizationId, "system", prUrl);
            logger.info("Notion page updated after merge", {
              pageIdPrefix,
              organizationId: connection.organizationId,
            });
            break;
          } catch {
            continue;
          }
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("GitHub webhook error", { error: message });
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
