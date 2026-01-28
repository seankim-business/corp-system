import { useEffect, useState } from "react";
import { ApiError, request } from "../api/client";

interface GoogleCalendarConnection {
  id: string;
  organizationId: string;
  calendarId?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface Calendar {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
}

export default function GoogleCalendarSettingsPage() {
  const [connection, setConnection] = useState<GoogleCalendarConnection | null>(null);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [calendarId, setCalendarId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchConnection();
  }, []);

  const fetchConnection = async () => {
    try {
      const data = await request<{ connection: GoogleCalendarConnection }>({
        url: "/api/google-calendar/connection",
        method: "GET",
      });
      setConnection(data.connection);
      setCalendarId(data.connection.calendarId || "");
      await fetchCalendars();
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setConnection(null);
        return;
      }
      console.error("Fetch connection error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCalendars = async () => {
    try {
      const data = await request<{ calendars: Calendar[] }>({
        url: "/api/google-calendar/calendars",
        method: "GET",
      });
      setCalendars(data.calendars || []);
    } catch (error) {
      console.error("Fetch calendars error:", error);
    }
  };

  const testConnection = async () => {
    if (!accessToken) {
      setMessage({ type: "error", text: "Please enter an access token" });
      return;
    }

    setIsTesting(true);
    setMessage(null);

    try {
      const data = await request<{
        success: boolean;
        email?: string;
        calendars?: number;
        error?: string;
      }>({
        url: "/api/google-calendar/test",
        method: "POST",
        data: { accessToken, refreshToken: refreshToken || undefined },
      });

      if (data.success) {
        setMessage({
          type: "success",
          text: `Connection successful! Email: ${data.email}, ${data.calendars || 0} calendars found.`,
        });
      } else {
        setMessage({ type: "error", text: data.error || "Connection failed" });
      }
    } catch (error) {
      const text = error instanceof ApiError ? error.message : "Failed to test connection";
      setMessage({ type: "error", text });
    } finally {
      setIsTesting(false);
    }
  };

  const saveConnection = async () => {
    if (!accessToken) {
      setMessage({ type: "error", text: "Please enter an access token" });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const method = connection ? "PUT" : "POST";
      interface SaveConnectionResponse {
        connection: GoogleCalendarConnection;
        error?: string;
      }
      const data = await request<SaveConnectionResponse>({
        url: "/api/google-calendar/connection",
        method,
        data: {
          accessToken,
          refreshToken: refreshToken || undefined,
          calendarId: calendarId || undefined,
        },
      });

      setConnection(data.connection);
      setMessage({ type: "success", text: "Google Calendar connection saved successfully" });
      await fetchCalendars();
      setAccessToken("");
      setRefreshToken("");
    } catch (error) {
      const text = error instanceof ApiError ? error.message : "Failed to save connection";
      setMessage({ type: "error", text });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteConnection = async () => {
    if (!confirm("Are you sure you want to delete the Google Calendar connection?")) {
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      interface DeleteConnectionResponse {
        success: boolean;
      }
      await request<DeleteConnectionResponse>({
        url: "/api/google-calendar/connection",
        method: "DELETE",
      });

      setConnection(null);
      setCalendars([]);
      setCalendarId("");
      setMessage({ type: "success", text: "Google Calendar connection deleted" });
    } catch (error) {
      const text = error instanceof ApiError ? error.message : "Failed to delete connection";
      setMessage({ type: "error", text });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Google Calendar Settings</h1>
        <p className="text-gray-600">Configure Google Calendar integration for daily briefings</p>
      </div>

      {message && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">OAuth Credentials</h2>

        <div className="mb-4">
          <label htmlFor="accessToken" className="block text-sm font-medium text-gray-700 mb-2">
            Access Token
          </label>
          <input
            id="accessToken"
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder={connection ? "••••••••••••••••" : "Enter access token"}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="refreshToken" className="block text-sm font-medium text-gray-700 mb-2">
            Refresh Token (optional)
          </label>
          <input
            id="refreshToken"
            type="password"
            value={refreshToken}
            onChange={(e) => setRefreshToken(e.target.value)}
            placeholder={connection ? "••••••••••••••••" : "Enter refresh token"}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <p className="mt-2 text-sm text-gray-500">
            Get tokens from{" "}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline"
            >
              Google Cloud Console
            </a>
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={testConnection}
            disabled={isTesting || !accessToken}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isTesting ? "Testing..." : "Test Connection"}
          </button>

          <button
            onClick={saveConnection}
            disabled={isSaving || !accessToken}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? "Saving..." : connection ? "Update" : "Save"}
          </button>

          {connection && (
            <button
              onClick={deleteConnection}
              disabled={isSaving}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {connection && calendars.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Available Calendars</h2>

          <div className="mb-4">
            <label
              htmlFor="defaultCalendar"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Default Calendar for Daily Briefing
            </label>
            <select
              id="defaultCalendar"
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">-- Primary Calendar --</option>
              {calendars.map((cal) => (
                <option key={cal.id} value={cal.id}>
                  {cal.summary} {cal.primary ? "(Primary)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            {calendars.map((cal) => (
              <div
                key={cal.id}
                className={`p-4 border rounded-lg transition ${
                  cal.primary
                    ? "border-indigo-300 bg-indigo-50"
                    : "border-gray-200 hover:border-indigo-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {cal.summary}
                      {cal.primary && (
                        <span className="ml-2 text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded">
                          Primary
                        </span>
                      )}
                    </h3>
                    {cal.description && <p className="text-sm text-gray-500">{cal.description}</p>}
                    <p className="text-xs text-gray-400 font-mono mt-1">{cal.id}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {connection && calendars.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-yellow-900 mb-2">No calendars found</h3>
          <p className="text-yellow-700">
            Make sure your Google account has at least one calendar and the OAuth scope includes
            calendar access.
          </p>
        </div>
      )}

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-blue-900 mb-2">Daily Briefing Integration</h3>
        <p className="text-blue-700">
          Once configured, your calendar events will automatically appear in your daily briefing
          messages on Slack. The briefing shows today&apos;s schedule in Korean format:
        </p>
        <pre className="mt-3 p-3 bg-white rounded text-sm font-mono text-gray-700">
          {`:calendar: 오늘 일정 (3)
├─ 10:00 마케팅 캠페인 검토 미팅
├─ 14:00 Q2 OKR 체크인
└─ 16:30 1:1 with 박대리`}
        </pre>
      </div>
    </div>
  );
}
