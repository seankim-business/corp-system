/**
 * Notion Settings Page
 *
 * 기획:
 * - Organization의 Notion API Key 설정
 * - 데이터베이스 목록 조회
 * - 연결 테스트
 *
 * 구조:
 * NotionSettingsPage
 * ├── API Key Input Form
 * ├── Test Connection Button
 * └── Database List (if connected)
 */

import { useEffect, useState } from "react";
import { ApiError, request } from "../api/client";

interface NotionConnection {
  id: string;
  organizationId: string;
  defaultDatabaseId?: string;
  createdAt: string;
  updatedAt: string;
}

interface NotionDatabase {
  id: string;
  title: string;
  url: string;
}

export default function NotionSettingsPage() {
  const [connection, setConnection] = useState<NotionConnection | null>(null);
  const [databases, setDatabases] = useState<NotionDatabase[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [defaultDatabaseId, setDefaultDatabaseId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isResettingCircuit, setIsResettingCircuit] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isCircuitBreakerError = message?.text?.toLowerCase().includes("circuit breaker");

  const resetCircuitBreaker = async () => {
    setIsResettingCircuit(true);
    try {
      await request({
        url: "/health/circuits/reset",
        method: "POST",
        data: { name: "notion-api" },
      });
      setMessage({ type: "success", text: "Circuit breaker reset. Please try again." });
    } catch (error) {
      setMessage({ type: "error", text: "Failed to reset circuit breaker" });
    } finally {
      setIsResettingCircuit(false);
    }
  };

  useEffect(() => {
    fetchConnection();
  }, []);

  const fetchConnection = async () => {
    try {
      const data = await request<{ connection: NotionConnection }>({
        url: "/api/notion/connection",
        method: "GET",
      });
      setConnection(data.connection);
      setDefaultDatabaseId(data.connection.defaultDatabaseId || "");
      await fetchDatabases();
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

  const fetchDatabases = async () => {
    try {
      const data = await request<{ databases: NotionDatabase[] }>({
        url: "/api/notion/databases",
        method: "GET",
      });
      setDatabases(data.databases || []);
    } catch (error) {
      console.error("Fetch databases error:", error);
    }
  };

  const testConnection = async () => {
    if (!apiKey) {
      setMessage({ type: "error", text: "Please enter an API key" });
      return;
    }

    setIsTesting(true);
    setMessage(null);

    try {
      const data = await request<{ success: boolean; databaseCount?: number; error?: string }>({
        url: "/api/notion/test",
        method: "POST",
        data: { apiKey },
      });

      if (data.success) {
        setMessage({
          type: "success",
          text: `Connection successful! Found ${data.databaseCount || 0} databases.`,
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
    if (!apiKey) {
      setMessage({ type: "error", text: "Please enter an API key" });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const method = connection ? "PUT" : "POST";
      interface SaveConnectionResponse {
        connection: NotionConnection;
        error?: string;
      }
      const data = await request<SaveConnectionResponse>({
        url: "/api/notion/connection",
        method,
        data: { apiKey, defaultDatabaseId },
      });

      setConnection(data.connection);
      setMessage({ type: "success", text: "Notion connection saved successfully" });
      await fetchDatabases();
      setApiKey("");
    } catch (error) {
      const text = error instanceof ApiError ? error.message : "Failed to save connection";
      setMessage({ type: "error", text });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteConnection = async () => {
    if (!confirm("Are you sure you want to delete the Notion connection?")) {
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      interface DeleteConnectionResponse {
        success: boolean;
      }
      await request<DeleteConnectionResponse>({
        url: "/api/notion/connection",
        method: "DELETE",
      });

      setConnection(null);
      setDatabases([]);
      setDefaultDatabaseId("");
      setMessage({ type: "success", text: "Notion connection deleted" });
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Notion Settings</h1>
        <p className="text-gray-600">Configure Notion integration for workflows</p>
      </div>

      {message && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <span>{message.text}</span>
            {isCircuitBreakerError && (
              <button
                onClick={resetCircuitBreaker}
                disabled={isResettingCircuit}
                className="ml-4 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
              >
                {isResettingCircuit ? "Resetting..." : "Reset Circuit Breaker"}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">API Key</h2>

        <div className="mb-4">
          <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-2">
            Notion Internal Integration Token
          </label>
          <input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={connection ? "••••••••••••••••" : "secret_..."}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <p className="mt-2 text-sm text-gray-500">
            Create an integration at{" "}
            <a
              href="https://www.notion.so/my-integrations"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline"
            >
              notion.so/my-integrations
            </a>
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={testConnection}
            disabled={isTesting || !apiKey}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isTesting ? "Testing..." : "Test Connection"}
          </button>

          <button
            onClick={saveConnection}
            disabled={isSaving || !apiKey}
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

      {connection && databases.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Available Databases</h2>

          <div className="mb-4">
            <label htmlFor="defaultDb" className="block text-sm font-medium text-gray-700 mb-2">
              Default Database (optional)
            </label>
            <select
              id="defaultDb"
              value={defaultDatabaseId}
              onChange={(e) => setDefaultDatabaseId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">-- Select a database --</option>
              {databases.map((db) => (
                <option key={db.id} value={db.id}>
                  {db.title}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            {databases.map((db) => (
              <div
                key={db.id}
                className="p-4 border border-gray-200 rounded-lg hover:border-indigo-300 transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{db.title}</h3>
                    <p className="text-sm text-gray-500 font-mono">{db.id}</p>
                  </div>
                  <a
                    href={db.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:underline text-sm"
                  >
                    Open in Notion →
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {connection && databases.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-yellow-900 mb-2">No databases found</h3>
          <p className="text-yellow-700 mb-4">
            Your Notion integration is connected, but it doesn't have access to any databases yet.
          </p>
          <div className="bg-yellow-100 rounded-md p-4 mb-4">
            <p className="text-sm font-medium text-yellow-800 mb-2">How to grant access:</p>
            <ol className="text-sm text-yellow-700 list-decimal list-inside space-y-1">
              <li>Open the database you want to connect in Notion</li>
              <li>
                Click the <strong>...</strong> menu in the top-right corner
              </li>
              <li>
                Select <strong>Connections</strong> (or Add connections)
              </li>
              <li>Find and add your integration</li>
            </ol>
          </div>
          <div className="flex gap-3">
            <a
              href="https://notion.so"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-md hover:bg-yellow-700"
            >
              Open Notion
              <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
            <button
              onClick={() => fetchDatabases()}
              className="inline-flex items-center px-4 py-2 bg-white border border-yellow-300 text-yellow-700 text-sm font-medium rounded-md hover:bg-yellow-50"
            >
              <svg className="mr-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh Databases
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
