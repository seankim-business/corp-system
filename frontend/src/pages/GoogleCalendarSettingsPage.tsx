/**
 * GoogleCalendarSettingsPage
 *
 * Google Calendar integration settings
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { request } from "../api/client";

interface CalendarConnection {
  id: string;
  email: string;
  connected: boolean;
  connectedAt?: string;
  calendars?: { id: string; name: string; primary: boolean }[];
}

export default function GoogleCalendarSettingsPage() {
  const [connection, setConnection] = useState<CalendarConnection | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchConnection = async () => {
      try {
        const data = await request<{ connection: CalendarConnection | null }>({
          url: "/api/settings/google-calendar",
          method: "GET",
        });
        setConnection(data.connection);
      } catch (error) {
        console.error("Failed to fetch Google Calendar connection:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchConnection();
  }, []);

  const handleConnect = async () => {
    try {
      const data = await request<{ authUrl: string }>({
        url: "/api/settings/google-calendar/connect",
        method: "POST",
      });
      window.location.href = data.authUrl;
    } catch (error) {
      console.error("Failed to initiate connection:", error);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect Google Calendar?")) return;
    try {
      await request({
        url: "/api/settings/google-calendar/disconnect",
        method: "POST",
      });
      setConnection(null);
    } catch (error) {
      console.error("Failed to disconnect:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <Link
          to="/settings"
          className="text-indigo-600 hover:underline text-sm mb-2 inline-block"
        >
          &larr; Back to settings
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Google Calendar Settings
        </h1>
        <p className="text-gray-600">
          Connect your Google Calendar to enable scheduling workflows
        </p>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg
                className="w-6 h-6 text-blue-600"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm-8 4H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900">
                Google Calendar
              </h2>
              <p className="text-sm text-gray-500">
                {connection?.connected
                  ? `Connected as ${connection.email}`
                  : "Not connected"}
              </p>
            </div>
            {connection?.connected ? (
              <button
                onClick={handleDisconnect}
                className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 font-medium"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={handleConnect}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
              >
                Connect
              </button>
            )}
          </div>
        </div>

        {connection?.connected && connection.calendars && (
          <div className="p-6">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
              Available Calendars
            </h3>
            <div className="space-y-3">
              {connection.calendars.map((calendar) => (
                <div
                  key={calendar.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-blue-500 rounded-full" />
                    <span className="text-sm text-gray-900">{calendar.name}</span>
                    {calendar.primary && (
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                        Primary
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!connection?.connected && (
          <div className="p-6">
            <h3 className="text-sm font-medium text-gray-900 mb-2">
              What you can do with Google Calendar:
            </h3>
            <ul className="text-sm text-gray-600 space-y-2">
              <li className="flex items-center gap-2">
                <span className="text-green-500">&#10003;</span>
                Create and manage calendar events
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">&#10003;</span>
                Trigger workflows based on calendar events
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">&#10003;</span>
                Sync meeting schedules automatically
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
