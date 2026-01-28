import { Router, Request, Response } from "express";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { getDriveClient } from "../mcp-servers/drive/client";
import { encrypt } from "../utils/encryption";
import { logger } from "../utils/logger";
import {
  validate,
  driveConnectionSchema,
  updateDriveConnectionSchema,
} from "../middleware/validation.middleware";

const router = Router();

router.post(
  "/drive/connection",
  requireAuth,
  validate({ body: driveConnectionSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { accessToken, refreshToken, expiresAt, defaultFolderId } = req.body;

      const existingConnection = await (prisma as any).driveConnection.findUnique({
        where: { organizationId },
      });

      if (existingConnection) {
        return res
          .status(409)
          .json({ error: "Drive connection already exists. Use PUT to update." });
      }

      const connection = await (prisma as any).driveConnection.create({
        data: {
          organizationId,
          accessToken: encrypt(accessToken),
          refreshToken: refreshToken ? encrypt(refreshToken) : null,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          defaultFolderId: defaultFolderId || null,
        },
      });

      return res.status(201).json({
        connection: {
          id: connection.id,
          organizationId: connection.organizationId,
          defaultFolderId: connection.defaultFolderId,
          expiresAt: connection.expiresAt,
          createdAt: connection.createdAt,
          updatedAt: connection.updatedAt,
        },
      });
    } catch (error) {
      logger.error(
        "Create Drive connection error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to create Drive connection" });
    }
  },
);

router.get("/drive/connection", requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;

    const connection = await (prisma as any).driveConnection.findUnique({
      where: { organizationId },
    });

    if (!connection) {
      return res.status(404).json({ error: "Drive connection not found" });
    }

    return res.json({
      connection: {
        id: connection.id,
        organizationId: connection.organizationId,
        defaultFolderId: connection.defaultFolderId,
        expiresAt: connection.expiresAt,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
      },
    });
  } catch (error) {
    logger.error(
      "Get Drive connection error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to fetch Drive connection" });
  }
});

router.put(
  "/drive/connection",
  requireAuth,
  validate({ body: updateDriveConnectionSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { accessToken, refreshToken, expiresAt, defaultFolderId } = req.body;

      const existing = await (prisma as any).driveConnection.findUnique({
        where: { organizationId },
      });

      if (!existing) {
        return res.status(404).json({ error: "Drive connection not found" });
      }

      const updateData: Record<string, any> = {};
      if (accessToken !== undefined) {
        updateData.accessToken = encrypt(accessToken);
      }
      if (refreshToken !== undefined) {
        updateData.refreshToken = refreshToken ? encrypt(refreshToken) : null;
      }
      if (expiresAt !== undefined) {
        updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;
      }
      if (defaultFolderId !== undefined) {
        updateData.defaultFolderId = defaultFolderId;
      }

      const connection = await (prisma as any).driveConnection.update({
        where: { organizationId },
        data: updateData,
      });

      return res.json({
        connection: {
          id: connection.id,
          organizationId: connection.organizationId,
          defaultFolderId: connection.defaultFolderId,
          expiresAt: connection.expiresAt,
          createdAt: connection.createdAt,
          updatedAt: connection.updatedAt,
        },
      });
    } catch (error) {
      logger.error(
        "Update Drive connection error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to update Drive connection" });
    }
  },
);

router.delete("/drive/connection", requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;

    const existing = await (prisma as any).driveConnection.findUnique({
      where: { organizationId },
    });

    if (!existing) {
      return res.status(404).json({ error: "Drive connection not found" });
    }

    await (prisma as any).driveConnection.delete({
      where: { organizationId },
    });

    return res.json({ success: true });
  } catch (error) {
    logger.error(
      "Delete Drive connection error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to delete Drive connection" });
  }
});

router.get("/drive/files", requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const { folderId, query, mimeType, pageSize, pageToken } = req.query;

    const connection = await (prisma as any).driveConnection.findUnique({
      where: { organizationId },
    });

    if (!connection) {
      return res.status(404).json({ error: "Drive connection not found" });
    }

    const { client, release } = await getDriveClient({
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      connectionId: connection.id,
      expiresAt: connection.expiresAt,
      organizationId,
      userId: req.user?.id,
    });

    try {
      const result = await client.listFiles(
        folderId as string | undefined,
        query as string | undefined,
        mimeType as string | undefined,
        pageSize ? parseInt(pageSize as string, 10) : 50,
        pageToken as string | undefined,
      );
      return res.json(result);
    } finally {
      release();
    }
  } catch (error) {
    logger.error(
      "List Drive files error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to list Drive files" });
  }
});

router.post("/drive/test", requireAuth, async (req: Request, res: Response) => {
  try {
    const { accessToken, refreshToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({ error: "Access token is required for testing" });
    }

    const { client, release } = await getDriveClient({
      accessToken,
      refreshToken,
      organizationId: req.user?.organizationId,
      userId: req.user?.id,
    });

    try {
      const result = await client.testConnection();
      return res.json({
        success: result.success,
        email: result.email,
        message: "Google Drive connection is valid",
      });
    } finally {
      release();
    }
  } catch (error: any) {
    logger.error(
      "Test Drive connection error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(400).json({
      success: false,
      error: error.message || "Invalid Google Drive credentials",
    });
  }
});

export default router;
