import { GoogleCalendarClient } from "./client";
import {
  MCPExecuteToolOptions,
  executeTool,
  validateToolAccess,
} from "../../services/mcp-registry";
import { MCPConnection } from "../../orchestrator/types";
import { recordMcpToolCall } from "../../services/metrics";
import { ListEventsInput, CreateEventInput, UpdateEventInput, DeleteEventInput } from "./types";

const legacyToolMap: Record<string, string> = {
  list_calendars: "listCalendars",
  list_events: "listEvents",
  get_event: "getEvent",
  create_event: "createEvent",
  update_event: "updateEvent",
  delete_event: "deleteEvent",
};

export function registerTools(): string[] {
  return [
    "google-calendar__listCalendars",
    "google-calendar__listEvents",
    "google-calendar__getEvent",
    "google-calendar__createEvent",
    "google-calendar__updateEvent",
    "google-calendar__deleteEvent",
  ];
}

export async function executeGoogleCalendarTool(
  accessToken: string,
  toolName: string,
  input: any,
  organizationId: string,
  connection: MCPConnection,
  userId?: string,
  options?: MCPExecuteToolOptions,
): Promise<any> {
  const parsed = validateToolAccess(toolName, "google-calendar", organizationId, connection);
  const resolvedToolName = parsed.isLegacy
    ? (legacyToolMap[parsed.toolName] ?? parsed.toolName)
    : parsed.toolName;

  const startTime = Date.now();
  let success = false;

  try {
    const result = await executeTool({
      provider: "google-calendar",
      toolName: resolvedToolName,
      args: input,
      organizationId,
      skipCache: options?.skipCache,
      ttlSeconds: options?.ttlSeconds,
      dataType: options?.dataType,
      sensitive: options?.sensitive,
      execute: async () => {
        const client = new GoogleCalendarClient(accessToken, {
          connectionId: connection.id,
          expiresAt: connection.expiresAt,
          organizationId,
          userId,
          refreshToken: connection.refreshToken,
        });

        switch (resolvedToolName) {
          case "listCalendars":
            return await client.listCalendars();

          case "listEvents": {
            const listInput = input as ListEventsInput;
            return await client.listEvents(
              listInput.calendarId,
              listInput.timeMin,
              listInput.timeMax,
              listInput.maxResults,
              listInput.pageToken,
              listInput.singleEvents,
              listInput.orderBy,
              listInput.timezone,
            );
          }

          case "getEvent": {
            const { calendarId, eventId } = input;
            return await client.getEvent(calendarId, eventId);
          }

          case "createEvent": {
            const createInput = input as CreateEventInput;
            return await client.createEvent(
              createInput.calendarId,
              createInput.title,
              createInput.startTime,
              createInput.endTime,
              {
                description: createInput.description,
                location: createInput.location,
                isAllDay: createInput.isAllDay,
                attendees: createInput.attendees,
                sendUpdates: createInput.sendUpdates,
                timezone: createInput.timezone,
              },
            );
          }

          case "updateEvent": {
            const updateInput = input as UpdateEventInput;
            return await client.updateEvent(updateInput.calendarId, updateInput.eventId, {
              title: updateInput.title,
              description: updateInput.description,
              location: updateInput.location,
              startTime: updateInput.startTime,
              endTime: updateInput.endTime,
              attendees: updateInput.attendees,
              sendUpdates: updateInput.sendUpdates,
            });
          }

          case "deleteEvent": {
            const deleteInput = input as DeleteEventInput;
            return await client.deleteEvent(
              deleteInput.calendarId,
              deleteInput.eventId,
              deleteInput.sendUpdates,
            );
          }

          default:
            throw new Error(`Unknown Google Calendar tool: ${toolName}`);
        }
      },
    });

    success = true;
    return result;
  } finally {
    const duration = Date.now() - startTime;
    recordMcpToolCall({
      provider: "google-calendar",
      toolName: resolvedToolName,
      success,
      duration,
    });
  }
}

export * from "./types";
export { GoogleCalendarClient } from "./client";
