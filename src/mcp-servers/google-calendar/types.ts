/**
 * Google Calendar MCP Types
 *
 * Type definitions for Google Calendar API integration.
 * - CalendarEvent: Calendar event representation
 * - Calendar: Calendar metadata
 * - MCP Tool input/output types
 */

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  isAllDay: boolean;
  status: "confirmed" | "tentative" | "cancelled";
  attendees?: Array<{
    email: string;
    name?: string;
    responseStatus?: "needsAction" | "declined" | "tentative" | "accepted";
  }>;
  htmlLink?: string;
  creatorEmail?: string;
  organizerEmail?: string;
}

export interface Calendar {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  accessRole?: string;
}

export interface ListEventsInput {
  calendarId?: string; // defaults to 'primary'
  timeMin?: string; // ISO 8601, defaults to today start
  timeMax?: string; // ISO 8601, defaults to today end
  maxResults?: number;
  pageToken?: string;
  singleEvents?: boolean; // expand recurring events
  orderBy?: "startTime" | "updated";
  timezone?: string;
}

export interface ListEventsOutput {
  events: CalendarEvent[];
  nextPageToken?: string;
  timeZone?: string;
}

export interface CreateEventInput {
  calendarId?: string; // defaults to 'primary'
  title: string;
  description?: string;
  location?: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  isAllDay?: boolean;
  attendees?: Array<{ email: string }>;
  sendUpdates?: "all" | "externalOnly" | "none";
  timezone?: string;
}

export interface CreateEventOutput {
  event: CalendarEvent;
}

export interface UpdateEventInput {
  calendarId?: string;
  eventId: string;
  title?: string;
  description?: string;
  location?: string;
  startTime?: string;
  endTime?: string;
  attendees?: Array<{ email: string }>;
  sendUpdates?: "all" | "externalOnly" | "none";
}

export interface UpdateEventOutput {
  event: CalendarEvent;
}

export interface DeleteEventInput {
  calendarId?: string;
  eventId: string;
  sendUpdates?: "all" | "externalOnly" | "none";
}

export interface DeleteEventOutput {
  success: boolean;
  eventId: string;
}

export interface GoogleCalendarConnection {
  id: string;
  organizationId: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  calendarId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
