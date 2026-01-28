/**
 * Google Calendar API Routes
 *
 * Endpoints:
 * - POST /api/google-calendar/connection - Create connection
 * - GET /api/google-calendar/connection - Get connection
 * - PUT /api/google-calendar/connection - Update connection
 * - DELETE /api/google-calendar/connection - Delete connection
 * - POST /api/google-calendar/test - Test connection
 * - GET /api/google-calendar/events - List events
 * - GET /api/google-calendar/calendars - List calendars
 */

import { Router, Request, Response } from "express";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { getGoogleCalendarClient } from "../mcp-servers/google-calendar/client";
import { encrypt } from "../utils/encryption";
import {
  validate,
  googleCalendarConnectionSchema,
  updateGoogleCalendarConnectionSchema,
} from "../middleware/validation.middleware";

const router = Router();

// Create Google Calendar connection
router.post(
  "/google-calendar/connection",
  requireAuth,
  validate({ body: googleCalendarConnectionSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { accessToken, refreshToken, expiresAt, calendarId } = req.body;

      const existingConnection = await (prisma as any).googleCalendarConnection.findUnique({
        where: { organizationId },
      });

      if (existingConnection) {
        return res
          .status(409)
          .json({ error: "Google Calendar connection already exists. Use PUT to update." });
      }

      const connection = await (prisma as any).googleCalendarConnection.create({
        data: {
          organizationId,
          accessToken: encrypt(accessToken),
          refreshToken: refreshToken ? encrypt(refreshToken) : null,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          calendarId: calendarId || null,
        },
      });

      return res.status(201).json({
        connection: {
          id: connection.id,
          organizationId: connection.organizationId,
          calendarId: connection.calendarId,
          expiresAt: connection.expiresAt,
          createdAt: connection.createdAt,
          updatedAt: connection.updatedAt,
        },
      });
    } catch (error) {
      console.error("Create Google Calendar connection error:", error);
      return res.status(500).json({ error: "Failed to create Google Calendar connection" });
    }
  },
);

// Get Google Calendar connection
router.get("/google-calendar/connection", requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;

    const connection = await (prisma as any).googleCalendarConnection.findUnique({
      where: { organizationId },
    });

    if (!connection) {
      return res.status(404).json({ error: "Google Calendar connection not found" });
    }

    return res.json({
      connection: {
        id: connection.id,
        organizationId: connection.organizationId,
        calendarId: connection.calendarId,
        expiresAt: connection.expiresAt,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
      },
    });
  } catch (error) {
    console.error("Get Google Calendar connection error:", error);
    return res.status(500).json({ error: "Failed to fetch Google Calendar connection" });
  }
});

// Update Google Calendar connection
router.put(
  "/google-calendar/connection",
  requireAuth,
  validate({ body: updateGoogleCalendarConnectionSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { accessToken, refreshToken, expiresAt, calendarId } = req.body;

      const existing = await (prisma as any).googleCalendarConnection.findUnique({
        where: { organizationId },
      });

      if (!existing) {
        return res.status(404).json({ error: "Google Calendar connection not found" });
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
      if (calendarId !== undefined) {
        updateData.calendarId = calendarId;
      }

      const connection = await (prisma as any).googleCalendarConnection.update({
        where: { organizationId },
        data: updateData,
      });

      return res.json({
        connection: {
          id: connection.id,
          organizationId: connection.organizationId,
          calendarId: connection.calendarId,
          expiresAt: connection.expiresAt,
          createdAt: connection.createdAt,
          updatedAt: connection.updatedAt,
        },
      });
    } catch (error) {
      console.error("Update Google Calendar connection error:", error);
      return res.status(500).json({ error: "Failed to update Google Calendar connection" });
    }
  },
);

// Delete Google Calendar connection
router.delete("/google-calendar/connection", requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;

    const existing = await (prisma as any).googleCalendarConnection.findUnique({
      where: { organizationId },
    });

    if (!existing) {
      return res.status(404).json({ error: "Google Calendar connection not found" });
    }

    await (prisma as any).googleCalendarConnection.delete({
      where: { organizationId },
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("Delete Google Calendar connection error:", error);
    return res.status(500).json({ error: "Failed to delete Google Calendar connection" });
  }
});

// Test Google Calendar connection
router.post("/google-calendar/test", requireAuth, async (req: Request, res: Response) => {
  try {
    const { accessToken, refreshToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({ error: "Access token is required for testing" });
    }

    const { client, release } = await getGoogleCalendarClient({
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
        calendars: result.calendars,
        message: "Google Calendar connection is valid",
      });
    } finally {
      release();
    }
  } catch (error: any) {
    console.error("Test Google Calendar connection error:", error);
    return res.status(400).json({
      success: false,
      error: error.message || "Invalid Google Calendar credentials",
    });
  }
});

// List calendars
router.get("/google-calendar/calendars", requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;

    const connection = await (prisma as any).googleCalendarConnection.findUnique({
      where: { organizationId },
    });

    if (!connection) {
      return res.status(404).json({ error: "Google Calendar connection not found" });
    }

    const { client, release } = await getGoogleCalendarClient({
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      connectionId: connection.id,
      expiresAt: connection.expiresAt,
      organizationId,
      userId: req.user?.id,
    });

    try {
      const calendars = await client.listCalendars();
      return res.json({ calendars });
    } finally {
      release();
    }
  } catch (error) {
    console.error("List calendars error:", error);
    return res.status(500).json({ error: "Failed to list calendars" });
  }
});

// List events
router.get("/google-calendar/events", requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const { calendarId, timeMin, timeMax, maxResults, pageToken, timezone } = req.query;

    const connection = await (prisma as any).googleCalendarConnection.findUnique({
      where: { organizationId },
    });

    if (!connection) {
      return res.status(404).json({ error: "Google Calendar connection not found" });
    }

    const { client, release } = await getGoogleCalendarClient({
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      connectionId: connection.id,
      expiresAt: connection.expiresAt,
      organizationId,
      userId: req.user?.id,
    });

    try {
      const result = await client.listEvents(
        (calendarId as string) || connection.calendarId || "primary",
        timeMin as string | undefined,
        timeMax as string | undefined,
        maxResults ? parseInt(maxResults as string, 10) : 50,
        pageToken as string | undefined,
        true,
        "startTime",
        timezone as string | undefined,
      );
      return res.json(result);
    } finally {
      release();
    }
  } catch (error) {
    console.error("List events error:", error);
    return res.status(500).json({ error: "Failed to list events" });
  }
});

export default router;
