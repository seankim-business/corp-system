import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError, request } from "../api/client";

interface SlackIntegration {
  id: string;
  organizationId: string;
  workspaceId?: string;
  workspaceName?: string;
  botUserId?: string;
  scopes: string[];
  enabled: boolean;
  healthStatus: string;
  lastHealthCheck?: string;
  installedAt?: string;
  createdAt: string;
  updatedAt: string;
  hasCredentials: boolean;
  hasWorkspace: boolean;
}

export default function SlackSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [integration, setIntegration] = useState<SlackIntegration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingCredentials, setIsSavingCredentials] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Credential form state
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [signingSecret, setSigningSecret] = useState("");

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");

    if (success === "true") {
      setMessage({ type: "success", text: "Slack workspace connected successfully!" });
      setSearchParams({});
    } else if (error) {
      const errorMessages: Record<string, string> = {
        access_denied: "You denied the Slack authorization request",
        missing_params: "Missing required parameters from Slack",
        server_config: "Server configuration error. Please contact support.",
        invalid_state: "Invalid state parameter. Please try again.",
        token_exchange_failed: "Failed to exchange token with Slack",
        server_error: "Server error occurred. Please try again.",
        credentials_not_configured:
          "Please configure your Slack App credentials first, then click 'Add to Slack'.",
        slack_not_configured:
          "Please configure your Slack App credentials first, then click 'Add to Slack'.",
      };
      setMessage({ type: "error", text: errorMessages[error] || `Error: ${error}` });
      setSearchParams({});
    }

    fetchIntegration();
  }, [searchParams, setSearchParams]);

  const fetchIntegration = async () => {
    try {
      const data = await request<{ integration: SlackIntegration }>({
        url: "/api/slack/integration",
        method: "GET",
      });
      setIntegration(data.integration);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setIntegration(null);
        return;
      }
      console.error("Fetch integration error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingCredentials(true);
    setMessage(null);

    try {
      await request<{ success: boolean; hasCredentials: boolean; hasWorkspace: boolean }>({
        url: "/api/slack/credentials",
        method: "POST",
        data: { clientId, clientSecret, signingSecret },
      });

      setMessage({ type: "success", text: "Slack App credentials saved. You can now connect your workspace." });
      // Clear the form
      setClientId("");
      setClientSecret("");
      setSigningSecret("");
      // Refresh integration data
      await fetchIntegration();
    } catch (error) {
      setMessage({ type: "error", text: "Failed to save credentials. Please check your input." });
    } finally {
      setIsSavingCredentials(false);
    }
  };

  const handleAddToSlack = () => {
    window.location.href = "/api/slack/oauth/install";
  };

  const deleteIntegration = async () => {
    if (!confirm("Are you sure you want to disconnect Slack? This will remove all credentials.")) {
      return;
    }

    setIsDeleting(true);
    setMessage(null);

    try {
      await request<{ success: boolean }>({
        url: "/api/slack/integration",
        method: "DELETE",
      });

      setIntegration(null);
      setMessage({ type: "success", text: "Slack disconnected successfully" });
    } catch (error) {
      setMessage({ type: "error", text: "Failed to disconnect Slack" });
    } finally {
      setIsDeleting(false);
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

  const hasCredentials = integration?.hasCredentials ?? false;
  const hasWorkspace = integration?.hasWorkspace ?? false;

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Slack Integration</h1>
        <p className="text-gray-600">
          Connect your Slack workspace to enable AI-powered automation
        </p>
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

      {/* Step 1: Configure Slack App Credentials */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-medium ${
            hasCredentials ? "bg-green-100 text-green-600" : "bg-indigo-100 text-indigo-600"
          }`}>
            {hasCredentials ? "✓" : "1"}
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Configure Slack App</h2>
        </div>

        {!hasCredentials ? (
          <>
            <p className="text-sm text-gray-600 mb-4">
              First, create a Slack App at{" "}
              <a
                href="https://api.slack.com/apps"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline"
              >
                api.slack.com/apps
              </a>
              , then enter your app credentials below.
            </p>

            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Required OAuth Redirect URL:</h4>
              <code className="text-xs bg-gray-200 px-2 py-1 rounded block overflow-x-auto">
                https://app.nubabel.com/api/slack/oauth/callback
              </code>
              <p className="text-xs text-gray-500 mt-2">
                Add this URL to your Slack App's OAuth & Permissions → Redirect URLs
              </p>
            </div>

            <form onSubmit={handleSaveCredentials} className="space-y-4">
              <div>
                <label htmlFor="clientId" className="block text-sm font-medium text-gray-700 mb-1">
                  Client ID
                </label>
                <input
                  type="text"
                  id="clientId"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="Your Slack App Client ID"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="clientSecret" className="block text-sm font-medium text-gray-700 mb-1">
                  Client Secret
                </label>
                <input
                  type="password"
                  id="clientSecret"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="Your Slack App Client Secret"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="signingSecret" className="block text-sm font-medium text-gray-700 mb-1">
                  Signing Secret
                </label>
                <input
                  type="password"
                  id="signingSecret"
                  value={signingSecret}
                  onChange={(e) => setSigningSecret(e.target.value)}
                  placeholder="Your Slack App Signing Secret"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Found in Basic Information → App Credentials
                </p>
              </div>
              <button
                type="submit"
                disabled={isSavingCredentials}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSavingCredentials ? "Saving..." : "Save Credentials"}
              </button>
            </form>
          </>
        ) : (
          <div className="flex items-center gap-2 text-green-700">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-sm">Slack App credentials configured</span>
          </div>
        )}
      </div>

      {/* Step 2: Connect Workspace */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-medium ${
            hasWorkspace ? "bg-green-100 text-green-600" : hasCredentials ? "bg-indigo-100 text-indigo-600" : "bg-gray-100 text-gray-400"
          }`}>
            {hasWorkspace ? "✓" : "2"}
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Connect Workspace</h2>
        </div>

        {hasWorkspace && integration ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#4A154B] rounded-lg flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{integration.workspaceName}</h3>
                  <p className="text-sm text-gray-500">Connected Workspace</p>
                </div>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  integration.enabled && integration.healthStatus === "healthy"
                    ? "bg-green-100 text-green-800"
                    : integration.healthStatus === "degraded"
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-gray-100 text-gray-800"
                }`}
              >
                {integration.enabled && integration.healthStatus === "healthy"
                  ? "Connected"
                  : integration.healthStatus === "degraded"
                    ? "Degraded"
                    : "Disconnected"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm border-t border-gray-100 pt-4">
              <div>
                <span className="text-gray-500">Workspace ID:</span>
                <span className="ml-2 font-mono text-xs text-gray-700">
                  {integration.workspaceId}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Bot User ID:</span>
                <span className="ml-2 font-mono text-xs text-gray-700">
                  {integration.botUserId || "N/A"}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Installed:</span>
                <span className="ml-2 text-gray-700">
                  {integration.installedAt
                    ? new Date(integration.installedAt).toLocaleDateString()
                    : "N/A"}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Last Updated:</span>
                <span className="ml-2 text-gray-700">
                  {new Date(integration.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {integration.scopes && integration.scopes.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <span className="text-sm text-gray-500">Permissions:</span>
                <div className="flex flex-wrap gap-2 mt-2">
                  {integration.scopes.map((scope) => (
                    <span key={scope} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                      {scope}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
              <button
                onClick={handleAddToSlack}
                className="px-4 py-2 bg-[#4A154B] text-white rounded-lg hover:bg-[#3e1240] transition-colors"
              >
                Reconnect Workspace
              </button>
              <button
                onClick={deleteIntegration}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isDeleting ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          </div>
        ) : (
          <div className={hasCredentials ? "" : "opacity-50"}>
            <p className="text-sm text-gray-600 mb-4">
              {hasCredentials
                ? "Click the button below to authorize Nubabel in your Slack workspace."
                : "Configure your Slack App credentials first."}
            </p>
            <button
              onClick={handleAddToSlack}
              disabled={!hasCredentials}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#4A154B] text-white rounded-lg hover:bg-[#3e1240] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
              </svg>
              Add to Slack
            </button>
          </div>
        )}
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">How It Works</h3>
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-medium">
              1
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Create a Slack App</h4>
              <p className="text-sm text-gray-600">
                Go to{" "}
                <a
                  href="https://api.slack.com/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline"
                >
                  api.slack.com/apps
                </a>{" "}
                and create a new app from scratch.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-medium">
              2
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Configure OAuth</h4>
              <p className="text-sm text-gray-600">
                Add the redirect URL above to OAuth & Permissions, then enter your credentials.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-medium">
              3
            </div>
            <div>
              <h4 className="font-medium text-gray-900">Connect Your Workspace</h4>
              <p className="text-sm text-gray-600">
                Click "Add to Slack" to authorize and start using AI automation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
