import { google, calendar_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { getCircuitBreaker } from "../../utils/circuit-breaker";
import { acquireMcpClient, isTokenExpired } from "../../services/mcp-registry";
import { recordMcpToolCall } from "../../services/metrics";
import { trace, SpanStatusCode, Span } from "@opentelemetry/api";
import { MCPConnection } from "../../orchestrator/types";
import { decrypt } from "../../utils/encryption";
import { CalendarEvent, Calendar } from "./types";
import { db as prisma } from "../../db/client";

const tracer = trace.getTracer("mcp-google-calendar");

const formatToolSpanName = (toolName: string): string =>
  toolName.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();

export class GoogleCalendarClient {
  private calendar: calendar_v3.Calendar;
  private oauth2Client: OAuth2Client;
  private connectionId?: string;
  private expiresAt?: Date | null;
  private organizationId?: string;
  private userId?: string;
  private circuitBreaker = getCircuitBreaker("google-calendar-api", {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 60000,
  });

  constructor(
    accessToken: string,
    options?: {
      connectionId?: string;
      expiresAt?: Date | null;
      organizationId?: string;
      userId?: string;
      refreshToken?: string | null;
    },
  ) {
    this.oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    );

    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: options?.refreshToken ?? undefined,
    });

    this.calendar = google.calendar({ version: "v3", auth: this.oauth2Client });
    this.connectionId = options?.connectionId;
    this.expiresAt = options?.expiresAt ?? null;
    this.organizationId = options?.organizationId;
    this.userId = options?.userId;
  }

  setContext(options: {
    connectionId?: string;
    expiresAt?: Date | null;
    organizationId?: string;
    userId?: string;
  }): void {
    this.connectionId = options.connectionId;
    this.expiresAt = options.expiresAt ?? null;
    this.organizationId = options.organizationId;
    this.userId = options.userId;
  }

  private async ensureFreshToken(): Promise<void> {
    if (!this.connectionId || !isTokenExpired(this.expiresAt ?? null)) {
      return;
    }

    const refreshed = await this.refreshCalendarToken(this.connectionId);
    this.oauth2Client.setCredentials({
      access_token: refreshed.accessToken,
      refresh_token: refreshed.refreshToken ?? undefined,
    });
    this.expiresAt = refreshed.expiresAt ?? null;
  }

  private async refreshCalendarToken(connectionId: string): Promise<{
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: Date | null;
  }> {
    const connection = await (prisma as any).googleCalendarConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new Error(`Google Calendar connection not found: ${connectionId}`);
    }

    if (!connection.refreshToken) {
      throw new Error(`Missing refresh token for Google Calendar connection ${connectionId}`);
    }

    const refreshToken = decrypt(connection.refreshToken);
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });

    const { credentials } = await this.oauth2Client.refreshAccessToken();
    const expiresAt = credentials.expiry_date ? new Date(credentials.expiry_date) : null;

    await (prisma as any).googleCalendarConnection.update({
      where: { id: connectionId },
      data: {
        accessToken: credentials.access_token!,
        expiresAt,
      },
    });

    return {
      accessToken: credentials.access_token!,
      refreshToken: connection.refreshToken,
      expiresAt,
    };
  }

  private async executeWithAuth<T>(operation: () => Promise<T>): Promise<T> {
    return this.circuitBreaker.execute(async () => {
      await this.ensureFreshToken();
      return operation();
    });
  }

  private async executeWithMetrics<T>(
    toolName: string,
    spanAttributes: Record<string, string | number | boolean> = {},
    operation: () => Promise<T>,
    onSuccess?: (result: T, span: Span) => void,
  ): Promise<T> {
    const start = Date.now();
    const spanName = `mcp.google_calendar.${formatToolSpanName(toolName)}`;
    const environment = process.env.NODE_ENV || "development";

    return tracer.startActiveSpan(spanName, async (span) => {
      try {
        span.setAttribute("mcp.provider", "google-calendar");
        span.setAttribute("mcp.tool", toolName);
        span.setAttribute("environment", environment);

        if (this.connectionId) {
          span.setAttribute("mcp.connection_id", this.connectionId);
        }

        if (this.organizationId) {
          span.setAttribute("organization.id", this.organizationId);
        }

        if (this.userId) {
          span.setAttribute("user.id", this.userId);
        }

        Object.entries(spanAttributes).forEach(([key, value]) => {
          span.setAttribute(key, value);
        });

        const result = await this.executeWithAuth(operation);
        recordMcpToolCall({
          provider: "google-calendar",
          toolName,
          success: true,
          duration: Date.now() - start,
        });
        if (onSuccess) {
          onSuccess(result, span);
        }
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        recordMcpToolCall({
          provider: "google-calendar",
          toolName,
          success: false,
          duration: Date.now() - start,
        });
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async listCalendars(): Promise<Calendar[]> {
    return this.executeWithMetrics(
      "listCalendars",
      {},
      async () => {
        const response = await this.calendar.calendarList.list();

        const calendars: Calendar[] = (response.data.items || []).map((cal) => ({
          id: cal.id!,
          summary: cal.summary || "Untitled",
          description: cal.description ?? undefined,
          primary: cal.primary ?? false,
          accessRole: cal.accessRole ?? undefined,
        }));

        return calendars;
      },
      (result, span) => {
        span.setAttribute("result.count", result.length);
      },
    );
  }

  async listEvents(
    calendarId: string = "primary",
    timeMin?: string,
    timeMax?: string,
    maxResults: number = 50,
    pageToken?: string,
    singleEvents: boolean = true,
    orderBy: "startTime" | "updated" = "startTime",
    timezone?: string,
  ): Promise<{ events: CalendarEvent[]; nextPageToken?: string; timeZone?: string }> {
    return this.executeWithMetrics(
      "listEvents",
      {
        "calendar.calendar_id": calendarId,
        "calendar.max_results": maxResults,
      },
      async () => {
        const response = await this.calendar.events.list({
          calendarId,
          timeMin,
          timeMax,
          maxResults,
          pageToken,
          singleEvents,
          orderBy: singleEvents ? orderBy : undefined,
          timeZone: timezone,
        });

        const events: CalendarEvent[] = (response.data.items || []).map((event) =>
          this.eventToCalendarEvent(event),
        );

        return {
          events,
          nextPageToken: response.data.nextPageToken ?? undefined,
          timeZone: response.data.timeZone ?? undefined,
        };
      },
      (result, span) => {
        span.setAttribute("result.count", result.events.length);
      },
    );
  }

  async getEvent(calendarId: string = "primary", eventId: string): Promise<CalendarEvent> {
    return this.executeWithMetrics(
      "getEvent",
      {
        "calendar.calendar_id": calendarId,
        "calendar.event_id": eventId,
      },
      async () => {
        const response = await this.calendar.events.get({
          calendarId,
          eventId,
        });

        return this.eventToCalendarEvent(response.data);
      },
      (_result, span) => {
        span.setAttribute("result.event_id", eventId);
      },
    );
  }

  async createEvent(
    calendarId: string = "primary",
    title: string,
    startTime: string,
    endTime: string,
    options?: {
      description?: string;
      location?: string;
      isAllDay?: boolean;
      attendees?: Array<{ email: string }>;
      sendUpdates?: "all" | "externalOnly" | "none";
      timezone?: string;
    },
  ): Promise<CalendarEvent> {
    return this.executeWithMetrics(
      "createEvent",
      {
        "calendar.calendar_id": calendarId,
      },
      async () => {
        const eventResource: calendar_v3.Schema$Event = {
          summary: title,
          description: options?.description,
          location: options?.location,
          start: options?.isAllDay
            ? { date: startTime.split("T")[0] }
            : { dateTime: startTime, timeZone: options?.timezone },
          end: options?.isAllDay
            ? { date: endTime.split("T")[0] }
            : { dateTime: endTime, timeZone: options?.timezone },
          attendees: options?.attendees?.map((a) => ({ email: a.email })),
        };

        const response = await this.calendar.events.insert({
          calendarId,
          requestBody: eventResource,
          sendUpdates: options?.sendUpdates,
        });

        return this.eventToCalendarEvent(response.data);
      },
      (event, span) => {
        span.setAttribute("calendar.created_event_id", event.id);
      },
    );
  }

  async updateEvent(
    calendarId: string = "primary",
    eventId: string,
    updates: {
      title?: string;
      description?: string;
      location?: string;
      startTime?: string;
      endTime?: string;
      attendees?: Array<{ email: string }>;
      sendUpdates?: "all" | "externalOnly" | "none";
      timezone?: string;
    },
  ): Promise<CalendarEvent> {
    return this.executeWithMetrics(
      "updateEvent",
      {
        "calendar.calendar_id": calendarId,
        "calendar.event_id": eventId,
      },
      async () => {
        const existing = await this.calendar.events.get({ calendarId, eventId });
        const existingEvent = existing.data;

        const eventResource: calendar_v3.Schema$Event = {
          ...existingEvent,
          summary: updates.title ?? existingEvent.summary,
          description: updates.description ?? existingEvent.description,
          location: updates.location ?? existingEvent.location,
        };

        if (updates.startTime) {
          eventResource.start = { dateTime: updates.startTime, timeZone: updates.timezone };
        }

        if (updates.endTime) {
          eventResource.end = { dateTime: updates.endTime, timeZone: updates.timezone };
        }

        if (updates.attendees) {
          eventResource.attendees = updates.attendees.map((a) => ({ email: a.email }));
        }

        const response = await this.calendar.events.update({
          calendarId,
          eventId,
          requestBody: eventResource,
          sendUpdates: updates.sendUpdates,
        });

        return this.eventToCalendarEvent(response.data);
      },
      (event, span) => {
        span.setAttribute("calendar.updated_event_id", event.id);
      },
    );
  }

  async deleteEvent(
    calendarId: string = "primary",
    eventId: string,
    sendUpdates?: "all" | "externalOnly" | "none",
  ): Promise<boolean> {
    return this.executeWithMetrics(
      "deleteEvent",
      {
        "calendar.calendar_id": calendarId,
        "calendar.event_id": eventId,
      },
      async () => {
        await this.calendar.events.delete({
          calendarId,
          eventId,
          sendUpdates,
        });

        return true;
      },
      (result, span) => {
        span.setAttribute("result.success", result);
      },
    );
  }

  async testConnection(): Promise<{ success: boolean; email?: string; calendars?: number }> {
    return this.executeWithMetrics(
      "testConnection",
      {},
      async () => {
        const response = await this.calendar.calendarList.list();
        const calendars = response.data.items || [];
        const primary = calendars.find((c) => c.primary);

        return {
          success: true,
          email: primary?.id ?? calendars[0]?.id ?? undefined,
          calendars: calendars.length,
        };
      },
      (_result, span) => {
        span.setAttribute("result.success", true);
      },
    );
  }

  private eventToCalendarEvent(event: calendar_v3.Schema$Event): CalendarEvent {
    const isAllDay = !event.start?.dateTime;

    return {
      id: event.id!,
      title: event.summary || "Untitled",
      description: event.description ?? undefined,
      location: event.location ?? undefined,
      startTime: event.start?.dateTime || event.start?.date || "",
      endTime: event.end?.dateTime || event.end?.date || "",
      isAllDay,
      status: (event.status as "confirmed" | "tentative" | "cancelled") || "confirmed",
      attendees: event.attendees?.map((a) => ({
        email: a.email!,
        name: a.displayName ?? undefined,
        responseStatus: a.responseStatus as
          | "needsAction"
          | "declined"
          | "tentative"
          | "accepted"
          | undefined,
      })),
      htmlLink: event.htmlLink ?? undefined,
      creatorEmail: event.creator?.email ?? undefined,
      organizerEmail: event.organizer?.email ?? undefined,
    };
  }
}

type GoogleCalendarClientFactoryOptions = {
  accessToken: string;
  refreshToken?: string | null;
  connection?: MCPConnection;
  organizationId?: string;
  userId?: string;
  expiresAt?: Date | null;
  connectionId?: string;
};

const resolveCalendarToken = (accessToken: string, connection?: MCPConnection): string => {
  if (connection?.config?.accessToken) {
    return decrypt(connection.config.accessToken as string);
  }
  return decrypt(accessToken);
};

export async function getGoogleCalendarClient(
  options: GoogleCalendarClientFactoryOptions,
): Promise<{ client: GoogleCalendarClient; release: () => void }> {
  const organizationId = options.connection?.organizationId ?? options.organizationId;
  const token = resolveCalendarToken(options.accessToken, options.connection);

  if (!organizationId) {
    return {
      client: new GoogleCalendarClient(token, {
        connectionId: options.connectionId ?? options.connection?.id,
        expiresAt: options.expiresAt ?? options.connection?.expiresAt ?? null,
        organizationId: options.organizationId,
        userId: options.userId,
        refreshToken: options.refreshToken,
      }),
      release: () => undefined,
    };
  }

  const credentials = {
    accessToken: token,
    refreshToken: options.refreshToken ?? options.connection?.refreshToken ?? null,
  };

  const { client, release } = await acquireMcpClient({
    provider: "google-calendar",
    organizationId,
    credentials,
    createClient: () =>
      new GoogleCalendarClient(token, {
        connectionId: options.connectionId ?? options.connection?.id,
        expiresAt: options.expiresAt ?? options.connection?.expiresAt ?? null,
        organizationId,
        userId: options.userId,
        refreshToken: options.refreshToken,
      }),
  });

  client.setContext({
    connectionId: options.connectionId ?? options.connection?.id,
    expiresAt: options.expiresAt ?? options.connection?.expiresAt ?? null,
    organizationId,
    userId: options.userId,
  });

  return { client, release };
}
