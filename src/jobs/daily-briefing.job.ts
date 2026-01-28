import { logger } from "../utils/logger";
import { getUsersForBriefing, sendDailyBriefing } from "../services/daily-briefing";

const ONE_MINUTE_MS = 60 * 1000;
let briefingTimer: NodeJS.Timeout | null = null;

export function startDailyBriefingJob(): void {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  briefingTimer = setInterval(async () => {
    await processDailyBriefings();
  }, ONE_MINUTE_MS);

  briefingTimer.unref?.();
  logger.info("Daily briefing job started");

  processDailyBriefings().catch((error) => {
    logger.error("Initial daily briefing check failed", { error });
  });
}

export function stopDailyBriefingJob(): void {
  if (briefingTimer) {
    clearInterval(briefingTimer);
    briefingTimer = null;
    logger.info("Daily briefing job stopped");
  }
}

async function processDailyBriefings(): Promise<void> {
  const now = new Date();
  const timezoneOffsets = generateTimezoneOffsets();

  for (const offset of timezoneOffsets) {
    const localDate = new Date(now.getTime() + offset.offsetMs);
    const localHour = localDate.getUTCHours();
    const localMinute = localDate.getUTCMinutes();

    try {
      const users = await getUsersForBriefingByTimezone(localHour, localMinute, offset.timezones);

      for (const user of users) {
        try {
          const result = await sendDailyBriefing(user.userId, user.organizationId);
          if (result.success) {
            logger.debug("Daily briefing sent", {
              userId: user.userId,
              organizationId: user.organizationId,
            });
          } else {
            logger.warn("Daily briefing failed", {
              userId: user.userId,
              organizationId: user.organizationId,
              error: result.error,
            });
          }
        } catch (error) {
          logger.error("Error sending daily briefing", {
            userId: user.userId,
            organizationId: user.organizationId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      logger.error("Error processing daily briefings for timezone offset", {
        offset: offset.offsetMs,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function getUsersForBriefingByTimezone(
  hour: number,
  minute: number,
  timezones: string[],
): Promise<Array<{ userId: string; organizationId: string; timezone: string }>> {
  const allUsers = await getUsersForBriefing(hour, minute);
  return allUsers.filter((user) => timezones.includes(user.timezone));
}

interface TimezoneOffset {
  offsetMs: number;
  timezones: string[];
}

function generateTimezoneOffsets(): TimezoneOffset[] {
  const COMMON_TIMEZONES: Record<string, number> = {
    UTC: 0,
    "America/New_York": -5,
    "America/Chicago": -6,
    "America/Denver": -7,
    "America/Los_Angeles": -8,
    "America/Sao_Paulo": -3,
    "Europe/London": 0,
    "Europe/Paris": 1,
    "Europe/Berlin": 1,
    "Europe/Moscow": 3,
    "Asia/Dubai": 4,
    "Asia/Kolkata": 5.5,
    "Asia/Singapore": 8,
    "Asia/Shanghai": 8,
    "Asia/Tokyo": 9,
    "Asia/Seoul": 9,
    "Australia/Sydney": 11,
    "Pacific/Auckland": 13,
  };

  const offsetMap = new Map<number, string[]>();

  for (const [timezone, offsetHours] of Object.entries(COMMON_TIMEZONES)) {
    const offsetMs = offsetHours * 60 * 60 * 1000;
    const existing = offsetMap.get(offsetMs) || [];
    existing.push(timezone);
    offsetMap.set(offsetMs, existing);
  }

  return Array.from(offsetMap.entries()).map(([offsetMs, timezones]) => ({
    offsetMs,
    timezones,
  }));
}

export async function sendBriefingNow(
  userId: string,
  organizationId: string,
): Promise<{ success: boolean; error?: string }> {
  return sendDailyBriefing(userId, organizationId);
}
