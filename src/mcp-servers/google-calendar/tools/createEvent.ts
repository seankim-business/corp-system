/**
 * Create Event Tool
 *
 * 기획:
 * - Google Calendar에 새 이벤트 생성
 * - 참석자 초대 및 알림 지원
 *
 * 구조:
 * - Input: calendarId, title, startTime, endTime, description, location, attendees
 * - Output: event (created)
 */

import { getGoogleCalendarClient } from "../client";
import { CreateEventInput, CreateEventOutput, GoogleCalendarConnection } from "../types";
import { MCPConnection } from "../../../orchestrator/types";

export async function createEventTool(
  connection: GoogleCalendarConnection,
  input: CreateEventInput,
  mcpConnection?: MCPConnection,
  userId?: string,
): Promise<CreateEventOutput> {
  const { client, release } = await getGoogleCalendarClient({
    accessToken: connection.accessToken,
    refreshToken: connection.refreshToken,
    connectionId: connection.id,
    expiresAt: connection.expiresAt,
    organizationId: connection.organizationId,
    userId,
    connection: mcpConnection,
  });

  try {
    if (!input.title) {
      throw new Error("title is required");
    }

    if (!input.startTime) {
      throw new Error("startTime is required");
    }

    if (!input.endTime) {
      throw new Error("endTime is required");
    }

    const event = await client.createEvent(
      input.calendarId || connection.calendarId || "primary",
      input.title,
      input.startTime,
      input.endTime,
      {
        description: input.description,
        location: input.location,
        isAllDay: input.isAllDay,
        attendees: input.attendees,
        sendUpdates: input.sendUpdates,
        timezone: input.timezone,
      },
    );

    return { event };
  } finally {
    release();
  }
}
