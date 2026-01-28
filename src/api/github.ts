import { Router, Request, Response } from "express";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { getGitHubClient } from "../mcp-servers/github/client";
import { encrypt } from "../utils/encryption";
import { logger } from "../utils/logger";
import {
  validate,
  githubConnectionSchema,
  updateGithubConnectionSchema,
} from "../middleware/validation.middleware";

const router = Router();
const GITHUB_PROVIDER = "github";

router.post(
  "/github/connection",
  requireAuth,
  requirePermission(Permission.INTEGRATION_MANAGE),
  validate({ body: githubConnectionSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { accessToken, name } = req.body;

      const existingConnection = await prisma.mCPConnection.findFirst({
        where: { organizationId, provider: GITHUB_PROVIDER },
      });

      if (existingConnection) {
        return res
          .status(409)
          .json({ error: "GitHub connection already exists. Use PUT to update." });
      }

      const encryptedToken = encrypt(accessToken);

      const connection = await prisma.mCPConnection.create({
        data: {
          organizationId,
          provider: GITHUB_PROVIDER,
          namespace: GITHUB_PROVIDER,
          name: name || "GitHub",
          config: { accessToken: encryptedToken },
          enabled: true,
        },
      });

      return res.status(201).json({
        connection: {
          id: connection.id,
          organizationId: connection.organizationId,
          provider: connection.provider,
          name: connection.name,
          enabled: connection.enabled,
          createdAt: connection.createdAt,
          updatedAt: connection.updatedAt,
        },
      });
    } catch (error) {
      logger.error(
        "Create GitHub connection error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to create GitHub connection" });
    }
  },
);

router.get(
  "/github/connection",
  requireAuth,
  requirePermission(Permission.INTEGRATION_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;

      const connection = await prisma.mCPConnection.findFirst({
        where: { organizationId, provider: GITHUB_PROVIDER },
      });

      if (!connection) {
        return res.status(404).json({ error: "GitHub connection not found" });
      }

      return res.json({
        connection: {
          id: connection.id,
          organizationId: connection.organizationId,
          provider: connection.provider,
          name: connection.name,
          enabled: connection.enabled,
          createdAt: connection.createdAt,
          updatedAt: connection.updatedAt,
        },
      });
    } catch (error) {
      logger.error(
        "Get GitHub connection error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to fetch GitHub connection" });
    }
  },
);

router.put(
  "/github/connection",
  requireAuth,
  requirePermission(Permission.INTEGRATION_MANAGE),
  validate({ body: updateGithubConnectionSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { accessToken, name, enabled } = req.body;

      const existing = await prisma.mCPConnection.findFirst({
        where: { organizationId, provider: GITHUB_PROVIDER },
      });

      if (!existing) {
        return res.status(404).json({ error: "GitHub connection not found" });
      }

      const updateData: Record<string, unknown> = {};

      if (accessToken !== undefined) {
        const encryptedToken = encrypt(accessToken);
        updateData.config = { accessToken: encryptedToken };
      }
      if (name !== undefined) {
        updateData.name = name;
      }
      if (enabled !== undefined) {
        updateData.enabled = enabled;
      }

      const connection = await prisma.mCPConnection.update({
        where: { id: existing.id },
        data: updateData,
      });

      return res.json({
        connection: {
          id: connection.id,
          organizationId: connection.organizationId,
          provider: connection.provider,
          name: connection.name,
          enabled: connection.enabled,
          createdAt: connection.createdAt,
          updatedAt: connection.updatedAt,
        },
      });
    } catch (error) {
      logger.error(
        "Update GitHub connection error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to update GitHub connection" });
    }
  },
);

router.delete(
  "/github/connection",
  requireAuth,
  requirePermission(Permission.INTEGRATION_MANAGE),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;

      const existing = await prisma.mCPConnection.findFirst({
        where: { organizationId, provider: GITHUB_PROVIDER },
      });

      if (!existing) {
        return res.status(404).json({ error: "GitHub connection not found" });
      }

      await prisma.mCPConnection.delete({
        where: { id: existing.id },
      });

      return res.json({ success: true });
    } catch (error) {
      logger.error(
        "Delete GitHub connection error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to delete GitHub connection" });
    }
  },
);

router.get(
  "/github/repos",
  requireAuth,
  requirePermission(Permission.INTEGRATION_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const type = (req.query.type as string) || "all";
      const limit = parseInt(req.query.limit as string, 10) || 30;

      const connection = await prisma.mCPConnection.findFirst({
        where: { organizationId, provider: GITHUB_PROVIDER, enabled: true },
      });

      if (!connection) {
        return res.status(404).json({ error: "GitHub connection not found" });
      }

      const config = connection.config as Record<string, string>;
      const { client, release } = await getGitHubClient({
        accessToken: config.accessToken,
        organizationId,
        userId: req.user?.id,
      });

      try {
        const validTypes = ["all", "owner", "public", "private", "member"] as const;
        const repoType = validTypes.includes(type as (typeof validTypes)[number])
          ? (type as (typeof validTypes)[number])
          : "all";
        const repositories = await client.getRepositories(repoType, limit);
        return res.json({ repositories });
      } finally {
        release();
      }
    } catch (error) {
      logger.error(
        "Get GitHub repos error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to fetch GitHub repositories" });
    }
  },
);

router.post(
  "/github/test",
  requireAuth,
  requirePermission(Permission.INTEGRATION_MANAGE),
  async (req: Request, res: Response) => {
    try {
      const { accessToken } = req.body;

      if (!accessToken) {
        return res.status(400).json({ error: "Access token is required for testing" });
      }

      const { client, release } = await getGitHubClient({
        accessToken,
        organizationId: req.user?.organizationId,
        userId: req.user?.id,
      });

      try {
        const repositories = await client.getRepositories("all", 1);
        return res.json({
          success: true,
          repoCount: repositories.length,
          message: "GitHub access token is valid",
        });
      } finally {
        release();
      }
    } catch (error: unknown) {
      logger.error(
        "Test GitHub connection error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      const message = error instanceof Error ? error.message : "Invalid GitHub access token";
      return res.status(400).json({
        success: false,
        error: message,
      });
    }
  },
);

export default router;
