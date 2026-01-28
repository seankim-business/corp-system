/**
 * List Events Tool
 *
 * 기획:
 * - Google Calendar에서 이벤트 목록 조회
 * - 기본값은 오늘 하루의 일정
 *
 * 구조:
 * - Input: calendarId, timeMin, timeMax, maxResults, timezone
 * - Output: events[], nextPageToken, timeZone
 */

import { getGoogleCalendarClient } from "../client";
import { ListEventsInput, ListEventsOutput, GoogleCalendarConnection } from "../types";
import { MCPConnection } from "../../../orchestrator/types";

export async function listEventsTool(
  connection: GoogleCalendarConnection,
  input: ListEventsInput,
  mcpConnection?: MCPConnection,
  userId?: string,
): Promise<ListEventsOutput> {
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
    // Default to today if no time range specified
    const now = new Date();
    const timeMin =
      input.timeMin || new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const timeMax =
      input.timeMax || new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    const result = await client.listEvents(
      input.calendarId || "primary",
      timeMin,
      timeMax,
      input.maxResults || 50,
      input.pageToken,
      input.singleEvents ?? true,
      input.orderBy || "startTime",
      input.timezone,
    );

    return {
      events: result.events,
      nextPageToken: result.nextPageToken,
      timeZone: result.timeZone,
    };
  } finally {
    release();
  }
}

/**
 * Get today's events for daily briefing
 */
export async function getTodayEventsTool(
  connection: GoogleCalendarConnection,
  timezone: string = "Asia/Seoul",
  userId?: string,
): Promise<ListEventsOutput> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  return listEventsTool(
    connection,
    {
      calendarId: connection.calendarId || "primary",
      timeMin: todayStart.toISOString(),
      timeMax: todayEnd.toISOString(),
      maxResults: 20,
      singleEvents: true,
      orderBy: "startTime",
      timezone,
    },
    undefined,
    userId,
  );
}
