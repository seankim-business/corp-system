/**
 * AR Scheduling - Availability Service
 *
 * Manages human and agent availability, including calendar synchronization
 * and real-time availability checking.
 */

import { db } from '../../db/client';
import { getGoogleCalendarClient } from '../../mcp-servers/google-calendar/client';
import {
  DateRange,
  TimeSlot,
  BlockedSlot,
  AvailabilityMatrix,
  CalendarSyncResult,
} from './types';
import { AvailabilityStatus } from '../types';
import { ARError } from '../errors';

export class AvailabilityService {
  /**
   * Sync availability from Google Calendar for a user
   */
  async syncFromCalendar(userId: string): Promise<CalendarSyncResult> {
    try {
      // Get user's organization and Google Calendar connection
      const user = await db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          memberships: {
            select: { organizationId: true },
            take: 1,
          },
        },
      });

      const organizationId = user?.memberships?.[0]?.organizationId;
      if (!user || !organizationId) {
        throw new ARError(
          'USER_NOT_FOUND',
          `User ${userId} not found or has no organization`,
        );
      }

      // Get organization's Google Calendar connection
      const connection = await db.googleCalendarConnection.findFirst({
        where: {
          organizationId,
        },
      });

      if (!connection) {
        throw new ARError(
          'NO_CALENDAR_CONNECTION',
          'No active Google Calendar connection found for organization',
        );
      }

      // Get calendar client
      const { client, release } = await getGoogleCalendarClient({
        accessToken: connection.accessToken,
        refreshToken: connection.refreshToken,
        connectionId: connection.id,
        organizationId,
        userId: user.id,
        expiresAt: connection.expiresAt,
      });

      try {
        // Fetch events for the next 30 days
        const now = new Date();
        const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const { events } = await client.listEvents(
          'primary',
          now.toISOString(),
          futureDate.toISOString(),
          100,
        );

        let eventsImported = 0;
        const errors: string[] = [];

        // Process each day in the range
        for (let d = new Date(now); d <= futureDate; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          const dayEvents = events.filter((e) => {
            const eventDate = new Date(e.startTime).toISOString().split('T')[0];
            return eventDate === dateStr;
          });

          // Determine blocked slots from events
          const blockedSlots: BlockedSlot[] = dayEvents.map((e) => ({
            from: new Date(e.startTime).toTimeString().slice(0, 5),
            to: new Date(e.endTime).toTimeString().slice(0, 5),
            reason: e.title,
          }));

          // Determine availability status
          const hasAllDayEvent = dayEvents.some((e) => {
            const start = new Date(e.startTime);
            const end = new Date(e.endTime);
            return (
              end.getTime() - start.getTime() >= 23 * 60 * 60 * 1000 ||
              e.status === 'cancelled'
            );
          });

          const status: AvailabilityStatus = hasAllDayEvent ? 'busy' : 'available';

          // Upsert availability record
          await db.humanAvailability.upsert({
            where: {
              organizationId_userId_date: {
                organizationId,
                userId: user.id,
                date: new Date(dateStr),
              },
            },
            create: {
              organizationId,
              userId: user.id,
              date: new Date(dateStr),
              availableFrom: '09:00',
              availableUntil: '18:00',
              timezone: 'UTC',
              status,
              blockedSlots: blockedSlots as any,
              calendarSyncId: connection.id,
              lastSyncAt: new Date(),
            },
            update: {
              status,
              blockedSlots: blockedSlots as any,
              lastSyncAt: new Date(),
            },
          });

          eventsImported += dayEvents.length;
        }

        return {
          userId: user.id,
          syncedAt: new Date(),
          eventsImported,
          availabilityUpdated: true,
          errors,
        };
      } finally {
        release();
      }
    } catch (error) {
      if (error instanceof ARError) {
        throw error;
      }
      throw new ARError(
        'SYNC_FAILED',
        `Failed to sync calendar for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get availability for a user within a date range
   */
  async getAvailability(
    userId: string,
    dateRange: DateRange,
  ): Promise<
    Array<{
      id: string;
      date: Date;
      availableFrom: string;
      availableUntil: string;
      timezone: string;
      status: AvailabilityStatus;
      blockedSlots: BlockedSlot[];
    }>
  > {
    const availability = await db.humanAvailability.findMany({
      where: {
        userId,
        date: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
      },
      orderBy: {
        date: 'asc',
      },
    });

    return availability.map((a) => ({
      id: a.id,
      date: a.date,
      availableFrom: a.availableFrom,
      availableUntil: a.availableUntil,
      timezone: a.timezone,
      status: a.status as AvailabilityStatus,
      blockedSlots: (a.blockedSlots as any) || [],
    }));
  }

  /**
   * Set availability for a user on a specific date
   */
  async setAvailability(
    userId: string,
    date: Date,
    status: AvailabilityStatus,
    slots?: BlockedSlot[],
  ): Promise<void> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        memberships: {
          select: { organizationId: true },
          take: 1,
        },
      },
    });

    const organizationId = user?.memberships?.[0]?.organizationId;
    if (!organizationId) {
      throw new ARError('USER_NOT_FOUND', `User ${userId} not found or has no organization`);
    }

    await db.humanAvailability.upsert({
      where: {
        organizationId_userId_date: {
          organizationId,
          userId,
          date,
        },
      },
      create: {
        organizationId,
        userId,
        date,
        availableFrom: '09:00',
        availableUntil: '18:00',
        timezone: 'UTC',
        status,
        blockedSlots: (slots as any) || [],
      },
      update: {
        status,
        blockedSlots: (slots as any) || [],
      },
    });
  }

  /**
   * Check availability for multiple users during a time slot
   */
  async checkAvailability(
    userIds: string[],
    slot: TimeSlot,
  ): Promise<AvailabilityMatrix> {
    const date = new Date(slot.start.toISOString().split('T')[0]);
    const startTime = slot.start.toTimeString().slice(0, 5);
    const endTime = slot.end.toTimeString().slice(0, 5);

    const availabilities = await db.humanAvailability.findMany({
      where: {
        userId: { in: userIds },
        date,
      },
    });

    const available = userIds.map((userId) => {
      const userAvail = availabilities.find((a) => a.userId === userId);

      if (!userAvail) {
        return {
          userId,
          isAvailable: false,
          status: 'busy' as AvailabilityStatus,
          conflicts: ['No availability data'],
        };
      }

      const conflicts: string[] = [];

      // Check if user is available during this time
      if (userAvail.status === 'vacation' || userAvail.status === 'sick') {
        conflicts.push(`User is on ${userAvail.status}`);
      }

      // Check if time is within available hours
      if (
        startTime < userAvail.availableFrom ||
        endTime > userAvail.availableUntil
      ) {
        conflicts.push(
          `Outside available hours (${userAvail.availableFrom}-${userAvail.availableUntil})`,
        );
      }

      // Check blocked slots
      const blockedSlots = (userAvail.blockedSlots as any) || [];
      for (const blocked of blockedSlots) {
        if (
          !(endTime <= blocked.from || startTime >= blocked.to) // Overlaps
        ) {
          conflicts.push(
            blocked.reason || `Blocked slot ${blocked.from}-${blocked.to}`,
          );
        }
      }

      return {
        userId,
        isAvailable: conflicts.length === 0,
        status: userAvail.status as AvailabilityStatus,
        conflicts,
      };
    });

    return {
      slot,
      available,
      allAvailable: available.every((a) => a.isAvailable),
    };
  }
}
