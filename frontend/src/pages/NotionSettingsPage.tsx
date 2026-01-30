/**
 * Notion Settings Page
 *
 * Single-click OAuth flow to connect Notion.
 * Shows workspace info and available databases after connection.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError, request } from "../api/client";

interface NotionStatus {
  connected: boolean;
  method: "oauth" | "api_key" | "none";
  workspaceId: string | null;
  workspaceName: string | null;
  workspaceIcon: string | null;
  botId: string | null;
  connectedAt: string | null;
  defaultDatabaseId: string | null;
}

interface NotionDatabase {
  id: string;
  title: string;
  url: string;
}

export default function NotionSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<NotionStatus | null>(null);
  const [databases, setDatabases] = useState<NotionDatabase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");

    if (success === "true") {
      setMessage({ type: "success", text: "Notion workspace connected successfully!" });
      setSearchParams({});
    } else if (error) {
      const errorMessages: Record<string, string> = {
        access_denied: "You denied the Notion authorization request.",
        missing_params: "Missing required parameters from Notion.",
        invalid_state: "Invalid state parameter. Please try again.",
        token_exchange_failed: "Failed to exchange token with Notion.",
        server_error: "Server error occurred. Please try again.",
        notion_not_configured: "Notion integration is not yet configured. Please contact support.",
      };
      setMessage({ type: "error", text: errorMessages[error] || `Error: ${error}` });
      setSearchParams({});
    }

    fetchStatus();
  }, [searchParams, setSearchParams]);

  const fetchStatus = async () => {
    try {
      const data = await request<NotionStatus>({
        url: "/api/notion/oauth/status",
        method: "GET",
      });
      setStatus(data);

      if (data.connected) {
        await fetchDatabases();
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setStatus({ connected: false, method: "none", workspaceId: null, workspaceName: null, workspaceIcon: null, botId: null, connectedAt: null, defaultDatabaseId: null });
        return;
      }
      console.error("Fetch status error:", error);
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
    } catch {
      // Databases may not be accessible yet
      setDatabases([]);
    }
  };

  const handleConnectNotion = () => {
    window.location.href = "/api/notion/oauth/install";
  };

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect Notion?")) {
      return;
    }

    setIsDisconnecting(true);
    setMessage(null);

    try {
      await request<{ success: boolean }>({
        url: "/api/notion/oauth/disconnect",
        method: "DELETE",
      });

      setStatus({ connected: false, method: "none", workspaceId: null, workspaceName: null, workspaceIcon: null, botId: null, connectedAt: null, defaultDatabaseId: null });
      setDatabases([]);
      setMessage({ type: "success", text: "Notion disconnected successfully." });
    } catch {
      setMessage({ type: "error", text: "Failed to disconnect Notion." });
    } finally {
      setIsDisconnecting(false);
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

  const isConnected = status?.connected ?? false;

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Notion Integration</h1>
        <p className="text-gray-600">Connect your Notion workspace for workflows and knowledge management</p>
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

      {/* Connection Status */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        {isConnected && status ? (
          /* Connected State */
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-black rounded-lg flex items-center justify-center">
                  {status.workspaceIcon ? (
                    <img
                      src={status.workspaceIcon}
                      alt=""
                      className="w-8 h-8 rounded"
                    />
                  ) : (
                    <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.119 20 4.5v15c0 1.381-1.119 2.5-2.5 2.5h-11C5.119 22 4 20.881 4 19.5v-15zM6.5 4C6.224 4 6 4.224 6 4.5v15c0 .276.224.5.5.5h11c.276 0 .5-.224.5-.5v-15c0-.276-.224-.5-.5-.5h-11zM8 7h8v2H8V7zm0 4h8v2H8v-2zm0 4h5v2H8v-2z" />
                    </svg>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {status.workspaceName || "Notion Workspace"}
                  </h3>
                  <p className="text-sm text-gray-500">Connected via OAuth</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                Connected
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm border-t border-gray-100 pt-4">
              {status.workspaceId && (
                <div>
                  <span className="text-gray-500">Workspace ID:</span>
                  <span className="ml-2 font-mono text-xs text-gray-700">{status.workspaceId}</span>
                </div>
              )}
              {status.botId && (
                <div>
                  <span className="text-gray-500">Bot ID:</span>
                  <span className="ml-2 font-mono text-xs text-gray-700">{status.botId}</span>
                </div>
              )}
              {status.connectedAt && (
                <div>
                  <span className="text-gray-500">Connected:</span>
                  <span className="ml-2 text-gray-700">
                    {new Date(status.connectedAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
              <button
                onClick={handleConnectNotion}
                className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                Reconnect
              </button>
              <button
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isDisconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          </div>
        ) : (
          /* Not Connected State */
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.119 20 4.5v15c0 1.381-1.119 2.5-2.5 2.5h-11C5.119 22 4 20.881 4 19.5v-15zM6.5 4C6.224 4 6 4.224 6 4.5v15c0 .276.224.5.5.5h11c.276 0 .5-.224.5-.5v-15c0-.276-.224-.5-.5-.5h-11zM8 7h8v2H8V7zm0 4h8v2H8v-2zm0 4h5v2H8v-2z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Connect your Notion workspace
            </h2>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              Click the button below to authorize Nubabel to access your Notion workspace.
              Your team's pages and databases will be available for AI workflows.
            </p>
            <button
              onClick={handleConnectNotion}
              className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium text-lg"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.119 20 4.5v15c0 1.381-1.119 2.5-2.5 2.5h-11C5.119 22 4 20.881 4 19.5v-15zM6.5 4C6.224 4 6 4.224 6 4.5v15c0 .276.224.5.5.5h11c.276 0 .5-.224.5-.5v-15c0-.276-.224-.5-.5-.5h-11zM8 7h8v2H8V7zm0 4h8v2H8v-2zm0 4h5v2H8v-2z" />
              </svg>
              Connect to Notion
            </button>
          </div>
        )}
      </div>

      {/* Databases */}
      {isConnected && databases.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Available Databases</h2>
            <button
              onClick={fetchDatabases}
              className="text-sm text-indigo-600 hover:text-indigo-700"
            >
              Refresh
            </button>
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
                    Open in Notion
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isConnected && databases.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-medium text-yellow-900 mb-2">No databases found</h3>
          <p className="text-yellow-700 mb-4">
            Your Notion workspace is connected, but no databases are accessible yet.
            Grant access to specific pages in Notion for the integration to see them.
          </p>
          <div className="flex gap-3">
            <a
              href="https://notion.so"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-md hover:bg-yellow-700"
            >
              Open Notion
              <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            <button
              onClick={fetchDatabases}
              className="inline-flex items-center px-4 py-2 bg-white border border-yellow-300 text-yellow-700 text-sm font-medium rounded-md hover:bg-yellow-50"
            >
              Refresh Databases
            </button>
          </div>
        </div>
      )}

      {/* How It Works */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">How It Works</h3>
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-medium">
              1
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Connect your workspace</h4>
              <p className="text-sm text-gray-600">
                Click "Connect to Notion" and authorize Nubabel to access your workspace.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-medium">
              2
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Share pages with the integration</h4>
              <p className="text-sm text-gray-600">
                In Notion, share specific pages or databases with the Nubabel integration to give it access.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-medium">
              3
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Use in workflows</h4>
              <p className="text-sm text-gray-600">
                Your Notion content will be available to AI agents for knowledge retrieval and automation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
