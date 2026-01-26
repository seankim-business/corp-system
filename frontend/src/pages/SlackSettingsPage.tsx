import { useState, useEffect } from "react";

interface SlackIntegration {
  id: string;
  organizationId: string;
  workspaceId: string;
  workspaceName: string;
  botUserId?: string;
  scopes: string[];
  enabled: boolean;
  healthStatus: string;
  lastHealthCheck?: string;
  installedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface TestResult {
  teamId: string;
  teamName: string;
  botUserId: string;
  botId: string;
}

export default function SlackSettingsPage() {
  const [integration, setIntegration] = useState<SlackIntegration | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [botToken, setBotToken] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    fetchIntegration();
  }, []);

  const fetchIntegration = async () => {
    try {
      const response = await fetch("/api/slack/integration", {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setIntegration(data.integration);
        setWorkspaceId(data.integration.workspaceId || "");
        setWorkspaceName(data.integration.workspaceName || "");
      } else if (response.status !== 404) {
        throw new Error("Failed to fetch integration");
      }
    } catch (error) {
      console.error("Fetch integration error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const testConnection = async () => {
    if (!botToken) {
      setMessage({ type: "error", text: "Please enter a bot token" });
      return;
    }

    setIsTesting(true);
    setMessage(null);
    setTestResult(null);

    try {
      const response = await fetch("/api/slack/integration/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ botToken }),
      });

      const data = await response.json();

      if (data.success) {
        setTestResult(data.workspace);
        setWorkspaceId(data.workspace.teamId);
        setWorkspaceName(data.workspace.teamName);
        setMessage({
          type: "success",
          text: `Connection successful! Workspace: ${data.workspace.teamName}`,
        });
      } else {
        setMessage({ type: "error", text: data.error || "Connection failed" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to test connection" });
    } finally {
      setIsTesting(false);
    }
  };

  const saveIntegration = async () => {
    if (!botToken && !integration) {
      setMessage({ type: "error", text: "Please enter a bot token" });
      return;
    }

    if (!workspaceId || !workspaceName) {
      setMessage({ type: "error", text: "Please test the connection first to get workspace info" });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/slack/integration", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          workspaceId,
          workspaceName,
          botToken: botToken || undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setIntegration(data.integration);
        setMessage({ type: "success", text: "Slack integration saved successfully" });
        setBotToken("");
        setTestResult(null);
      } else {
        const data = await response.json();
        setMessage({ type: "error", text: data.error || "Failed to save integration" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to save integration" });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteIntegration = async () => {
    if (!confirm("Are you sure you want to delete the Slack integration?")) {
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/slack/integration", {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        setIntegration(null);
        setWorkspaceId("");
        setWorkspaceName("");
        setMessage({ type: "success", text: "Slack integration deleted" });
      } else {
        setMessage({ type: "error", text: "Failed to delete integration" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to delete integration" });
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Slack Settings</h1>
        <p className="text-gray-600">Configure Slack integration for your organization</p>
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

      {integration && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Current Integration</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Workspace:</span>
              <span className="ml-2 font-medium">{integration.workspaceName}</span>
            </div>
            <div>
              <span className="text-gray-500">Workspace ID:</span>
              <span className="ml-2 font-mono text-xs">{integration.workspaceId}</span>
            </div>
            <div>
              <span className="text-gray-500">Status:</span>
              <span
                className={`ml-2 px-2 py-1 rounded text-xs ${
                  integration.enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                }`}
              >
                {integration.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Health:</span>
              <span
                className={`ml-2 px-2 py-1 rounded text-xs ${
                  integration.healthStatus === "healthy"
                    ? "bg-green-100 text-green-800"
                    : integration.healthStatus === "degraded"
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-gray-100 text-gray-800"
                }`}
              >
                {integration.healthStatus}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Installed:</span>
              <span className="ml-2">{new Date(integration.installedAt).toLocaleDateString()}</span>
            </div>
            <div>
              <span className="text-gray-500">Last Updated:</span>
              <span className="ml-2">{new Date(integration.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">
          {integration ? "Update Credentials" : "Connect Slack Workspace"}
        </h2>

        <div className="space-y-4">
          <div>
            <label htmlFor="botToken" className="block text-sm font-medium text-gray-700 mb-2">
              Bot Token (xoxb-...)
            </label>
            <input
              id="botToken"
              type="password"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder={integration ? "••••••••••••••••" : "xoxb-..."}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <p className="text-sm text-gray-500">
            Bot Token은 Slack App에서 발급받아 여기에 저장합니다. Signing Secret / Socket Mode App
            Token은 서버 환경변수(Railway env)로 관리하세요. 자세한 설정은{" "}
            <a
              href="https://api.slack.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline"
            >
              Slack App settings
            </a>
          </p>
        </div>

        {testResult && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-medium text-blue-900 mb-2">Test Result</h3>
            <div className="text-sm text-blue-800 space-y-1">
              <p>
                Workspace: {testResult.teamName} ({testResult.teamId})
              </p>
              <p>Bot User ID: {testResult.botUserId}</p>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={testConnection}
            disabled={isTesting || !botToken}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isTesting ? "Testing..." : "Test Connection"}
          </button>

          <button
            onClick={saveIntegration}
            disabled={isSaving || (!botToken && !integration)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? "Saving..." : integration ? "Update" : "Save"}
          </button>

          {integration && (
            <button
              onClick={deleteIntegration}
              disabled={isSaving}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Setup Instructions</h3>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>
            Create a Slack App at{" "}
            <a
              href="https://api.slack.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline"
            >
              api.slack.com/apps
            </a>
          </li>
          <li>
            Add Bot Token Scopes:{" "}
            <code className="bg-gray-200 px-1 rounded">app_mentions:read</code>,{" "}
            <code className="bg-gray-200 px-1 rounded">chat:write</code>,{" "}
            <code className="bg-gray-200 px-1 rounded">users:read</code>,{" "}
            <code className="bg-gray-200 px-1 rounded">users:read.email</code>
          </li>
          <li>Install the app to your workspace</li>
          <li>Copy the Bot User OAuth Token (starts with xoxb-)</li>
          <li>
            For Socket Mode: Enable Socket Mode and generate an App-Level Token (xapp-). 이 값은
            서버 환경변수(SLACK_APP_TOKEN)로 설정합니다.
          </li>
          <li>Paste the Bot Token above and test the connection</li>
        </ol>
      </div>
    </div>
  );
}
