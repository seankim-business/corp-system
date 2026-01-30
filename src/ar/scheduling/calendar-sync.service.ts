/**
 * Calendar Sync Service
 *
 * Bidirectional synchronization with Google Calendar for human availability,
 * meetings, and scheduling coordination.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { redis } from "../../db/redis";

// =============================================================================
// TYPES
// =============================================================================

export interface CalendarEvent {
  id: string;
  googleEventId?: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  attendees: {
    email: string;
    type: 'human' | 'agent';
    entityId: string;
    responseStatus: 'accepted' | 'declined' | 'tentative' | 'needsAction';
  }[];
  location?: string;
  meetingLink?: string;
  recurrence?: string; // RRULE format
  isAllDay: boolean;
  status: 'confirmed' | 'tentative' | 'cancelled';
  source: 'google' | 'ar_system';
  metadata?: Record<string, unknown>;
}

export interface AvailabilitySlot {
  date: Date;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  timezone: string;
  status: 'available' | 'busy' | 'tentative' | 'out_of_office';
  source: 'google' | 'manual' | 'inferred';
}

export interface SyncResult {
  userId: string;
  syncedAt: Date;
  eventsCreated: number;
  eventsUpdated: number;
  eventsDeleted: number;
  availabilitySlotsUpdated: number;
  errors: string[];
  nextSyncToken?: string;
}

export interface SyncConfig {
  syncWindowDays: number;      // How many days ahead to sync
  defaultTimezone: string;     // Default timezone for events
  syncIntervalMinutes: number; // How often to sync
  enableBidirectional: boolean; // Sync AR events back to Google
}

const DEFAULT_CONFIG: SyncConfig = {
  syncWindowDays: 30,
  defaultTimezone: 'Asia/Seoul',
  syncIntervalMinutes: 15,
  enableBidirectional: true,
};

// =============================================================================
// SERVICE
// =============================================================================

export class CalendarSyncService {
  private config: SyncConfig;

  constructor(config?: Partial<SyncConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Sync calendar for a user
   */
  async syncUserCalendar(
    organizationId: string,
    userId: string,
    options?: {
      forceFullSync?: boolean;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<SyncResult> {
    logger.info("Starting calendar sync", { organizationId, userId });

    const startTime = Date.now();
    const errors: string[] = [];

    // Get organization's Google Calendar connection
    // Note: GoogleCalendarConnection is org-level, not user-level
    const googleConnection = await prisma.googleCalendarConnection.findFirst({
      where: {
        organizationId,
      },
    });

    if (!googleConnection) {
      return {
        userId,
        syncedAt: new Date(),
        eventsCreated: 0,
        eventsUpdated: 0,
        eventsDeleted: 0,
        availabilitySlotsUpdated: 0,
        errors: ['No active Google Calendar connection found'],
      };
    }

    // Determine sync window
    const startDate = options?.startDate || new Date();
    const endDate = options?.endDate || new Date(
      Date.now() + this.config.syncWindowDays * 24 * 60 * 60 * 1000
    );

    // Get sync token for incremental sync
    const syncStateKey = `ar:calendar:sync:${userId}`;
    const syncState = await redis.get(syncStateKey);
    const lastSyncToken = !options?.forceFullSync && syncState
      ? JSON.parse(syncState).nextSyncToken
      : null;

    try {
      // Fetch events from Google Calendar
      const googleEvents = await this.fetchGoogleCalendarEvents(
        googleConnection,
        startDate,
        endDate,
        lastSyncToken
      );

      // Process events
      let eventsCreated = 0;
      let eventsUpdated = 0;
      let eventsDeleted = 0;

      for (const event of googleEvents.items) {
        try {
          const result = await this.processGoogleEvent(organizationId, userId, event);
          if (result === 'created') eventsCreated++;
          else if (result === 'updated') eventsUpdated++;
          else if (result === 'deleted') eventsDeleted++;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`Failed to process event ${event.id}: ${message}`);
        }
      }

      // Update availability based on events
      const availabilitySlotsUpdated = await this.updateAvailabilityFromEvents(
        organizationId,
        userId,
        startDate,
        endDate
      );

      // Store sync state
      await redis.set(
        syncStateKey,
        JSON.stringify({
          lastSyncAt: new Date(),
          nextSyncToken: googleEvents.nextSyncToken,
        }),
        86400 // 24 hours
      );

      logger.info("Calendar sync completed", {
        userId,
        eventsCreated,
        eventsUpdated,
        eventsDeleted,
        availabilitySlotsUpdated,
        durationMs: Date.now() - startTime,
      });

      return {
        userId,
        syncedAt: new Date(),
        eventsCreated,
        eventsUpdated,
        eventsDeleted,
        availabilitySlotsUpdated,
        errors,
        nextSyncToken: googleEvents.nextSyncToken,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Calendar sync failed", { userId, error: message });

      return {
        userId,
        syncedAt: new Date(),
        eventsCreated: 0,
        eventsUpdated: 0,
        eventsDeleted: 0,
        availabilitySlotsUpdated: 0,
        errors: [message],
      };
    }
  }

  /**
   * Fetch events from Google Calendar API
   */
  private async fetchGoogleCalendarEvents(
    connection: { accessToken: string | null; refreshToken: string | null },
    startDate: Date,
    endDate: Date,
    syncToken?: string | null
  ): Promise<{
    items: GoogleCalendarEvent[];
    nextSyncToken?: string;
  }> {
    // In production, this would use the Google Calendar API
    // For now, return mock data structure
    logger.debug("Fetching Google Calendar events", {
      hasAccessToken: !!connection.accessToken,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      hasSyncToken: !!syncToken,
    });

    // Mock response - in production, call Google Calendar API
    return {
      items: [],
      nextSyncToken: `sync-token-${Date.now()}`,
    };
  }

  /**
   * Process a single Google Calendar event
   */
  private async processGoogleEvent(
    organizationId: string,
    userId: string,
    event: GoogleCalendarEvent
  ): Promise<'created' | 'updated' | 'deleted' | 'skipped'> {
    // Check if event already exists
    const existingEvent = await prisma.aRMeeting.findFirst({
      where: {
        googleEventId: event.id,
        organizationId,
      },
    });

    if (event.status === 'cancelled') {
      if (existingEvent) {
        await prisma.aRMeeting.update({
          where: { id: existingEvent.id },
          data: { status: 'cancelled' },
        });
        return 'deleted';
      }
      return 'skipped';
    }

    const meetingData = {
      organizationId,
      title: event.summary || 'Untitled Event',
      description: event.description,
      meetingType: this.inferMeetingType(event),
      humanParticipants: [userId],
      agentParticipants: [],
      scheduledAt: new Date(event.start.dateTime || event.start.date!),
      durationMinutes: this.calculateDuration(event),
      timezone: event.start.timeZone || this.config.defaultTimezone,
      isRecurring: !!event.recurrence,
      recurrenceRule: event.recurrence?.[0],
      googleEventId: event.id,
      status: event.status === 'confirmed' ? 'scheduled' : 'tentative',
    };

    if (existingEvent) {
      await prisma.aRMeeting.update({
        where: { id: existingEvent.id },
        data: meetingData,
      });
      return 'updated';
    } else {
      await prisma.aRMeeting.create({
        data: meetingData,
      });
      return 'created';
    }
  }

  /**
   * Update availability slots based on calendar events
   */
  private async updateAvailabilityFromEvents(
    organizationId: string,
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    // Get all events in the window
    const events = await prisma.aRMeeting.findMany({
      where: {
        organizationId,
        humanParticipants: { has: userId },
        scheduledAt: {
          gte: startDate,
          lte: endDate,
        },
        status: { not: 'cancelled' },
      },
    });

    // Group events by date
    const eventsByDate = new Map<string, typeof events>();
    for (const event of events) {
      const dateKey = event.scheduledAt.toISOString().split('T')[0];
      const existing = eventsByDate.get(dateKey) || [];
      existing.push(event);
      eventsByDate.set(dateKey, existing);
    }

    let slotsUpdated = 0;

    // Update availability for each date
    for (const [dateStr, dateEvents] of eventsByDate.entries()) {
      const date = new Date(dateStr);

      // Calculate blocked slots
      const blockedSlots = dateEvents.map(event => ({
        from: event.scheduledAt.toTimeString().slice(0, 5),
        to: new Date(event.scheduledAt.getTime() + event.durationMinutes * 60000)
          .toTimeString().slice(0, 5),
        reason: event.title,
      }));

      // Upsert availability record
      await prisma.humanAvailability.upsert({
        where: {
          organizationId_userId_date: {
            organizationId,
            userId,
            date,
          },
        },
        update: {
          blockedSlots,
          lastSyncAt: new Date(),
        },
        create: {
          organizationId,
          userId,
          date,
          availableFrom: '09:00',
          availableUntil: '18:00',
          timezone: this.config.defaultTimezone,
          status: 'available',
          blockedSlots,
          lastSyncAt: new Date(),
        },
      });

      slotsUpdated++;
    }

    return slotsUpdated;
  }

  /**
   * Sync AR meeting to Google Calendar
   */
  async syncMeetingToGoogle(
    organizationId: string,
    meetingId: string
  ): Promise<{ googleEventId: string } | { error: string }> {
    if (!this.config.enableBidirectional) {
      return { error: 'Bidirectional sync is disabled' };
    }

    const meeting = await prisma.aRMeeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      return { error: 'Meeting not found' };
    }

    // Get organization's Google Calendar connection
    const googleConnection = await prisma.googleCalendarConnection.findFirst({
      where: {
        organizationId,
      },
    });

    if (!googleConnection) {
      return { error: 'Organization has no Google Calendar connection' };
    }

    try {
      // In production, this would call Google Calendar API to create/update event
      const googleEventId = await this.createGoogleEvent(googleConnection, meeting);

      // Update meeting with Google event ID
      await prisma.aRMeeting.update({
        where: { id: meetingId },
        data: { googleEventId },
      });

      return { googleEventId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { error: message };
    }
  }

  /**
   * Create event in Google Calendar
   */
  private async createGoogleEvent(
    _connection: { accessToken: string | null },
    meeting: {
      title: string;
      description: string | null;
      scheduledAt: Date;
      durationMinutes: number;
      timezone: string;
    }
  ): Promise<string> {
    // In production, this would use the Google Calendar API
    logger.debug("Creating Google Calendar event", {
      title: meeting.title,
      scheduledAt: meeting.scheduledAt,
    });

    // Mock response - in production, call Google Calendar API
    return `google-event-${Date.now()}`;
  }

  /**
   * Infer meeting type from Google event
   */
  private inferMeetingType(event: GoogleCalendarEvent): string {
    const summary = (event.summary || '').toLowerCase();

    if (summary.includes('standup') || summary.includes('daily')) {
      return 'standup';
    } else if (summary.includes('review') || summary.includes('retro')) {
      return 'review';
    } else if (summary.includes('planning') || summary.includes('sprint')) {
      return 'planning';
    } else if (summary.includes('1:1') || summary.includes('one on one')) {
      return '1on1';
    }

    return 'adhoc';
  }

  /**
   * Calculate event duration in minutes
   */
  private calculateDuration(event: GoogleCalendarEvent): number {
    if (event.start.date && event.end.date) {
      // All-day event
      const days = Math.ceil(
        (new Date(event.end.date).getTime() - new Date(event.start.date).getTime()) /
        (1000 * 60 * 60 * 24)
      );
      return days * 24 * 60;
    }

    if (event.start.dateTime && event.end.dateTime) {
      return Math.round(
        (new Date(event.end.dateTime).getTime() - new Date(event.start.dateTime).getTime()) /
        (1000 * 60)
      );
    }

    return 60; // Default 1 hour
  }

  /**
   * Get user's availability for a date range
   */
  async getUserAvailability(
    organizationId: string,
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<AvailabilitySlot[]> {
    const availability = await prisma.humanAvailability.findMany({
      where: {
        organizationId,
        userId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { date: 'asc' },
    });

    return availability.map(a => ({
      date: a.date,
      startTime: a.availableFrom,
      endTime: a.availableUntil,
      timezone: a.timezone,
      status: a.status as AvailabilitySlot['status'],
      source: a.calendarSyncId ? 'google' : 'manual',
    }));
  }

  /**
   * Find available time slots for a meeting
   */
  async findAvailableSlots(
    organizationId: string,
    participantIds: string[],
    durationMinutes: number,
    options?: {
      startDate?: Date;
      endDate?: Date;
      preferredTimes?: string[]; // HH:mm format
      excludeWeekends?: boolean;
    }
  ): Promise<{
    date: Date;
    startTime: string;
    endTime: string;
    score: number; // How good this slot is (0-100)
  }[]> {
    const startDate = options?.startDate || new Date();
    const endDate = options?.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const slots: ReturnType<typeof this.findAvailableSlots> extends Promise<infer T> ? T : never = [];

    // Get availability for all participants
    const availabilityByUser = new Map<string, AvailabilitySlot[]>();
    for (const userId of participantIds) {
      const availability = await this.getUserAvailability(
        organizationId,
        userId,
        startDate,
        endDate
      );
      availabilityByUser.set(userId, availability);
    }

    // Find overlapping available slots
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      // Skip weekends if requested
      if (options?.excludeWeekends && (currentDate.getDay() === 0 || currentDate.getDay() === 6)) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      const dateStr = currentDate.toISOString().split('T')[0];

      // Find common available time
      const commonSlots = this.findCommonAvailability(
        participantIds,
        availabilityByUser,
        dateStr,
        durationMinutes
      );

      for (const slot of commonSlots) {
        const score = this.calculateSlotScore(slot, options?.preferredTimes);
        slots.push({
          date: new Date(dateStr),
          startTime: slot.startTime,
          endTime: slot.endTime,
          score,
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Sort by score descending
    return slots.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  /**
   * Find common availability across participants
   */
  private findCommonAvailability(
    participantIds: string[],
    availabilityByUser: Map<string, AvailabilitySlot[]>,
    dateStr: string,
    durationMinutes: number
  ): { startTime: string; endTime: string }[] {
    const slots: { startTime: string; endTime: string }[] = [];

    // Default working hours
    const defaultStart = 9 * 60; // 9:00 in minutes
    const defaultEnd = 18 * 60;  // 18:00 in minutes

    // Find intersection of available times
    let commonStart = defaultStart;
    let commonEnd = defaultEnd;

    for (const userId of participantIds) {
      const userAvailability = availabilityByUser.get(userId) || [];
      const dayAvailability = userAvailability.find(
        a => a.date.toISOString().split('T')[0] === dateStr
      );

      if (dayAvailability) {
        const userStart = this.timeToMinutes(dayAvailability.startTime);
        const userEnd = this.timeToMinutes(dayAvailability.endTime);
        commonStart = Math.max(commonStart, userStart);
        commonEnd = Math.min(commonEnd, userEnd);
      }
    }

    // Generate available slots
    let currentTime = commonStart;
    while (currentTime + durationMinutes <= commonEnd) {
      slots.push({
        startTime: this.minutesToTime(currentTime),
        endTime: this.minutesToTime(currentTime + durationMinutes),
      });
      currentTime += 30; // 30-minute increments
    }

    return slots;
  }

  /**
   * Calculate slot score based on preferences
   */
  private calculateSlotScore(
    slot: { startTime: string; endTime: string },
    preferredTimes?: string[]
  ): number {
    let score = 50; // Base score

    const startMinutes = this.timeToMinutes(slot.startTime);

    // Prefer mid-morning and mid-afternoon
    if (startMinutes >= 10 * 60 && startMinutes <= 11 * 60) score += 20;
    if (startMinutes >= 14 * 60 && startMinutes <= 15 * 60) score += 20;

    // Avoid early morning and late evening
    if (startMinutes < 9 * 60) score -= 20;
    if (startMinutes > 17 * 60) score -= 20;

    // Avoid lunch time
    if (startMinutes >= 12 * 60 && startMinutes < 13 * 60) score -= 10;

    // Bonus for preferred times
    if (preferredTimes?.includes(slot.startTime)) score += 30;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Convert time string to minutes since midnight
   */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Convert minutes since midnight to time string
   */
  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }
}

// =============================================================================
// INTERNAL TYPES
// =============================================================================

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  status: 'confirmed' | 'tentative' | 'cancelled';
  recurrence?: string[];
  attendees?: {
    email: string;
    responseStatus: string;
  }[];
}

// Export singleton instance
export const calendarSyncService = new CalendarSyncService();
