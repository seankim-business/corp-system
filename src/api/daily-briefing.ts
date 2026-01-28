import { Router, Request, Response } from "express";
import { z } from "zod";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import { logger } from "../utils/logger";
import { sendBriefingNow } from "../jobs/daily-briefing.job";

const router = Router();

const VALID_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const updateDailyBriefingSchema = z.object({
  enabled: z.boolean(),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must be in HH:MM format (24-hour)")
    .optional(),
  timezone: z
    .string()
    .refine((tz) => VALID_TIMEZONES.includes(tz), {
      message: `Invalid timezone. Supported: ${VALID_TIMEZONES.join(", ")}`,
    })
    .optional(),
});

type UpdateDailyBriefingInput = z.infer<typeof updateDailyBriefingSchema>;

router.get(
  "/users/preferences/daily-briefing",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id: userId, organizationId } = req.user!;

      const membership = await prisma.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId,
          },
        },
        select: {
          dailyBriefingEnabled: true,
          dailyBriefingTime: true,
          dailyBriefingTimezone: true,
        },
      });

      if (!membership) {
        return res.status(404).json({ error: "Membership not found" });
      }

      return res.json({
        preferences: {
          enabled: membership.dailyBriefingEnabled,
          time: membership.dailyBriefingTime,
          timezone: membership.dailyBriefingTimezone,
        },
        supportedTimezones: VALID_TIMEZONES,
      });
    } catch (error) {
      logger.error(
        "Get daily briefing preferences error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to get preferences" });
    }
  },
);

router.put(
  "/users/preferences/daily-briefing",
  requireAuth,
  validate({ body: updateDailyBriefingSchema }),
  async (req: Request, res: Response) => {
    try {
      const { id: userId, organizationId } = req.user!;
      const { enabled, time, timezone } = req.body as UpdateDailyBriefingInput;

      const membership = await prisma.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId,
          },
        },
      });

      if (!membership) {
        return res.status(404).json({ error: "Membership not found" });
      }

      const updateData: {
        dailyBriefingEnabled: boolean;
        dailyBriefingTime?: string;
        dailyBriefingTimezone?: string;
      } = {
        dailyBriefingEnabled: enabled,
      };

      if (time !== undefined) {
        updateData.dailyBriefingTime = time;
      }

      if (timezone !== undefined) {
        updateData.dailyBriefingTimezone = timezone;
      }

      const updated = await prisma.membership.update({
        where: { id: membership.id },
        data: updateData,
        select: {
          dailyBriefingEnabled: true,
          dailyBriefingTime: true,
          dailyBriefingTimezone: true,
        },
      });

      logger.info("Daily briefing preferences updated", {
        userId,
        organizationId,
        enabled: updated.dailyBriefingEnabled,
        time: updated.dailyBriefingTime,
        timezone: updated.dailyBriefingTimezone,
      });

      return res.json({
        success: true,
        preferences: {
          enabled: updated.dailyBriefingEnabled,
          time: updated.dailyBriefingTime,
          timezone: updated.dailyBriefingTimezone,
        },
      });
    } catch (error) {
      logger.error(
        "Update daily briefing preferences error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to update preferences" });
    }
  },
);

router.post(
  "/users/preferences/daily-briefing/send-now",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id: userId, organizationId } = req.user!;

      const result = await sendBriefingNow(userId, organizationId);

      if (result.success) {
        return res.json({ success: true, message: "Daily briefing sent" });
      } else {
        return res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      logger.error(
        "Send daily briefing now error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to send daily briefing" });
    }
  },
);

export default router;
