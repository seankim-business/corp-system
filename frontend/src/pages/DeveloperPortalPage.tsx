/**
 * Developer Portal Page
 *
 * Manage API keys, view webhooks, and access API documentation.
 */

import React, { useState, useEffect, useCallback } from "react";

interface APIKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimitTier: "free" | "pro" | "enterprise";
  status: "active" | "revoked" | "expired";
  lastUsedAt?: string;
  totalRequests: number;
  expiresAt?: string;
  createdAt: string;
}

interface Webhook {
  id: string;
  url: string;
  events: string[];
  status: "active" | "disabled";
  failureCount: number;
  lastSuccess?: string;
  lastFailure?: string;
  createdAt: string;
}

interface UsageStats {
  rateLimits: {
    minute: { limit: number; remaining: number; resetInSeconds: number };
    day: { limit: number; remaining: number; resetInSeconds: number };
  };
  totalRequests: number;
}

const ALL_SCOPES = [
  "agents:read",
  "agents:execute",
  "workflows:read",
  "workflows:write",
  "workflows:execute",
  "executions:read",
  "webhooks:manage",
  "organization:read",
];

const ALL_WEBHOOK_EVENTS = [
  "agent.execution.started",
  "agent.execution.completed",
  "agent.execution.failed",
  "workflow.started",
  "workflow.completed",
  "workflow.failed",
  "approval.requested",
  "approval.completed",
  "approval.rejected",
  "api_key.created",
  "api_key.revoked",
];

export const DeveloperPortalPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"keys" | "webhooks" | "docs">("keys");
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // API Key creation modal state
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([]);
  const [newKeyTier, setNewKeyTier] = useState<"free" | "pro" | "enterprise">("free");
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  // Webhook creation modal state
  const [showCreateWebhookModal, setShowCreateWebhookModal] = useState(false);
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>([]);
  const [createdWebhookSecret, setCreatedWebhookSecret] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [keysRes, webhooksRes, usageRes] = await Promise.all([
        fetch("/api/organization/api-keys"),
        fetch("/api/organization/webhooks"),
        fetch("/api/organization/usage"),
      ]);

      if (keysRes.ok) {
        const keysData = await keysRes.json();
        setApiKeys(keysData.data || []);
      }

      if (webhooksRes.ok) {
        const webhooksData = await webhooksRes.json();
        setWebhooks(webhooksData.data || []);
      }

      if (usageRes.ok) {
        const usageData = await usageRes.json();
        setUsage(usageData.data || null);
      }
    } catch (err) {
      setError("Failed to load data");
      console.error("Error fetching developer portal data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateKey = async () => {
    try {
      const res = await fetch("/api/organization/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName,
          scopes: newKeyScopes,
          rateLimitTier: newKeyTier,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setCreatedKey(data.data.key);
        setApiKeys((prev) => [...prev, data.data]);
        setNewKeyName("");
        setNewKeyScopes([]);
        setNewKeyTier("free");
      } else {
        const errData = await res.json();
        setError(errData.message || "Failed to create API key");
      }
    } catch (err) {
      setError("Failed to create API key");
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key? This action cannot be undone.")) {
      return;
    }

    try {
      const res = await fetch(`/api/organization/api-keys/${keyId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setApiKeys((prev) =>
          prev.map((k) => (k.id === keyId ? { ...k, status: "revoked" as const } : k))
        );
      }
    } catch (err) {
      setError("Failed to revoke API key");
    }
  };

  const handleCreateWebhook = async () => {
    try {
      const res = await fetch("/api/organization/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: newWebhookUrl,
          events: newWebhookEvents,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setCreatedWebhookSecret(data.data.secret);
        setWebhooks((prev) => [...prev, data.data]);
        setNewWebhookUrl("");
        setNewWebhookEvents([]);
      } else {
        const errData = await res.json();
        setError(errData.message || "Failed to create webhook");
      }
    } catch (err) {
      setError("Failed to create webhook");
    }
  };

  const handleDeleteWebhook = async (webhookId: string) => {
    if (!confirm("Are you sure you want to delete this webhook?")) {
      return;
    }

    try {
      const res = await fetch(`/api/organization/webhooks/${webhookId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setWebhooks((prev) => prev.filter((w) => w.id !== webhookId));
      }
    } catch (err) {
      setError("Failed to delete webhook");
    }
  };

  const handleTestWebhook = async (webhookId: string) => {
    try {
      const res = await fetch(`/api/organization/webhooks/${webhookId}/test`, {
        method: "POST",
      });

      const data = await res.json();
      if (data.data.success) {
        alert(`Webhook test successful! Response time: ${data.data.latencyMs}ms`);
      } else {
        alert(`Webhook test failed: ${data.data.error || "Unknown error"}`);
      }
    } catch (err) {
      alert("Failed to test webhook");
    }
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTierBadgeClass = (tier: string) => {
    switch (tier) {
      case "enterprise":
        return "bg-purple-100 text-purple-800";
      case "pro":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "revoked":
        return "bg-red-100 text-red-800";
      case "expired":
        return "bg-yellow-100 text-yellow-800";
      case "disabled":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Developer Portal</h1>
        <p className="text-gray-600 mt-1">
          Manage API keys, webhooks, and access API documentation
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">
            Dismiss
          </button>
        </div>
      )}

      {/* Usage Stats */}
      {usage && (
        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg shadow border">
            <h3 className="text-sm font-medium text-gray-500">Total Requests</h3>
            <p className="text-2xl font-bold text-gray-900">{usage.totalRequests.toLocaleString()}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border">
            <h3 className="text-sm font-medium text-gray-500">Rate Limit (per minute)</h3>
            <p className="text-2xl font-bold text-gray-900">
              {usage.rateLimits.minute.remaining} / {usage.rateLimits.minute.limit}
            </p>
            <p className="text-xs text-gray-500">
              Resets in {usage.rateLimits.minute.resetInSeconds}s
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border">
            <h3 className="text-sm font-medium text-gray-500">Rate Limit (per day)</h3>
            <p className="text-2xl font-bold text-gray-900">
              {usage.rateLimits.day.remaining.toLocaleString()} / {usage.rateLimits.day.limit.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500">
              Resets in {Math.floor(usage.rateLimits.day.resetInSeconds / 3600)}h
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {(["keys", "webhooks", "docs"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab === "keys" && "API Keys"}
              {tab === "webhooks" && "Webhooks"}
              {tab === "docs" && "Documentation"}
            </button>
          ))}
        </nav>
      </div>

      {/* API Keys Tab */}
      {activeTab === "keys" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">API Keys</h2>
            <button
              onClick={() => setShowCreateKeyModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create API Key
            </button>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Key Prefix
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Tier
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Last Used
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Requests
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {apiKeys.map((key) => (
                  <tr key={key.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{key.name}</div>
                      <div className="text-xs text-gray-500">
                        {key.scopes.slice(0, 3).join(", ")}
                        {key.scopes.length > 3 && ` +${key.scopes.length - 3} more`}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                        {key.keyPrefix}...
                      </code>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${getTierBadgeClass(
                          key.rateLimitTier
                        )}`}
                      >
                        {key.rateLimitTier}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${getStatusBadgeClass(
                          key.status
                        )}`}
                      >
                        {key.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(key.lastUsedAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {key.totalRequests.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      {key.status === "active" && (
                        <button
                          onClick={() => handleRevokeKey(key.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {apiKeys.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                      No API keys found. Create one to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Webhooks Tab */}
      {activeTab === "webhooks" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Webhooks</h2>
            <button
              onClick={() => setShowCreateWebhookModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create Webhook
            </button>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    URL
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Events
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Last Delivery
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {webhooks.map((webhook) => (
                  <tr key={webhook.id}>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                        {webhook.url}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-500">
                        {webhook.events.slice(0, 2).join(", ")}
                        {webhook.events.length > 2 && ` +${webhook.events.length - 2} more`}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${getStatusBadgeClass(
                          webhook.status
                        )}`}
                      >
                        {webhook.status}
                      </span>
                      {webhook.failureCount > 0 && (
                        <span className="ml-2 text-xs text-red-500">
                          ({webhook.failureCount} failures)
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {webhook.lastSuccess ? (
                        <span className="text-green-600">{formatDate(webhook.lastSuccess)}</span>
                      ) : webhook.lastFailure ? (
                        <span className="text-red-600">{formatDate(webhook.lastFailure)}</span>
                      ) : (
                        "Never"
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-2">
                      <button
                        onClick={() => handleTestWebhook(webhook.id)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Test
                      </button>
                      <button
                        onClick={() => handleDeleteWebhook(webhook.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {webhooks.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      No webhooks configured. Create one to receive event notifications.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Documentation Tab */}
      {activeTab === "docs" && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">API Documentation</h2>
            <p className="text-gray-600 mb-4">
              The Nubabel API allows you to programmatically manage agents, workflows, and
              executions.
            </p>

            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-900">Base URL</h3>
                <code className="block mt-1 p-2 bg-gray-100 rounded text-sm">
                  {window.location.origin}/api/v1
                </code>
              </div>

              <div>
                <h3 className="font-medium text-gray-900">Authentication</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Include your API key in the Authorization header:
                </p>
                <code className="block mt-1 p-2 bg-gray-100 rounded text-sm">
                  Authorization: Bearer YOUR_API_KEY
                </code>
              </div>

              <div>
                <h3 className="font-medium text-gray-900">OpenAPI Specification</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Download the full OpenAPI 3.0 specification for API clients:
                </p>
                <a
                  href="/api/v1/docs/openapi.yaml"
                  className="inline-block mt-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm"
                  download
                >
                  Download OpenAPI Spec
                </a>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-medium text-gray-900 mb-4">Available Endpoints</h3>
            <div className="space-y-3">
              {[
                { method: "GET", path: "/agents", desc: "List available agents" },
                { method: "POST", path: "/agents/:id/execute", desc: "Execute an agent" },
                { method: "GET", path: "/workflows", desc: "List workflows" },
                { method: "POST", path: "/workflows", desc: "Create a workflow" },
                { method: "POST", path: "/workflows/:id/execute", desc: "Execute a workflow" },
                { method: "GET", path: "/executions", desc: "List executions" },
                { method: "GET", path: "/executions/:id", desc: "Get execution details" },
                { method: "GET", path: "/webhooks", desc: "List webhooks" },
                { method: "POST", path: "/webhooks", desc: "Create a webhook" },
                { method: "GET", path: "/organization", desc: "Get organization info" },
              ].map((endpoint) => (
                <div key={endpoint.path} className="flex items-center text-sm">
                  <span
                    className={`px-2 py-1 rounded text-xs font-mono mr-3 ${
                      endpoint.method === "GET"
                        ? "bg-green-100 text-green-800"
                        : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {endpoint.method}
                  </span>
                  <code className="text-gray-900">{endpoint.path}</code>
                  <span className="ml-3 text-gray-500">{endpoint.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-medium text-gray-900 mb-4">Rate Limits by Tier</h3>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pb-2">Tier</th>
                  <th className="pb-2">Per Minute</th>
                  <th className="pb-2">Per Day</th>
                </tr>
              </thead>
              <tbody className="text-gray-900">
                <tr>
                  <td className="py-1">Free</td>
                  <td>60</td>
                  <td>1,000</td>
                </tr>
                <tr>
                  <td className="py-1">Pro</td>
                  <td>300</td>
                  <td>10,000</td>
                </tr>
                <tr>
                  <td className="py-1">Enterprise</td>
                  <td>1,000</td>
                  <td>100,000</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create API Key Modal */}
      {showCreateKeyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            {createdKey ? (
              <>
                <h3 className="text-lg font-semibold mb-4">API Key Created</h3>
                <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
                  <p className="text-sm text-yellow-800 mb-2">
                    Copy this key now. It won't be shown again!
                  </p>
                  <code className="block p-2 bg-white rounded border text-sm break-all">
                    {createdKey}
                  </code>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(createdKey);
                    alert("Copied to clipboard!");
                  }}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 mb-2"
                >
                  Copy to Clipboard
                </button>
                <button
                  onClick={() => {
                    setShowCreateKeyModal(false);
                    setCreatedKey(null);
                  }}
                  className="w-full px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold mb-4">Create API Key</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input
                      type="text"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="My API Key"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tier</label>
                    <select
                      value={newKeyTier}
                      onChange={(e) => setNewKeyTier(e.target.value as typeof newKeyTier)}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="free">Free (60/min, 1K/day)</option>
                      <option value="pro">Pro (300/min, 10K/day)</option>
                      <option value="enterprise">Enterprise (1K/min, 100K/day)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Scopes</label>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                      {ALL_SCOPES.map((scope) => (
                        <label key={scope} className="flex items-center text-sm">
                          <input
                            type="checkbox"
                            checked={newKeyScopes.includes(scope)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewKeyScopes((prev) => [...prev, scope]);
                              } else {
                                setNewKeyScopes((prev) => prev.filter((s) => s !== scope));
                              }
                            }}
                            className="mr-2"
                          />
                          {scope}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-2 mt-6">
                  <button
                    onClick={() => setShowCreateKeyModal(false)}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateKey}
                    disabled={!newKeyName || newKeyScopes.length === 0}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    Create
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Create Webhook Modal */}
      {showCreateWebhookModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            {createdWebhookSecret ? (
              <>
                <h3 className="text-lg font-semibold mb-4">Webhook Created</h3>
                <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
                  <p className="text-sm text-yellow-800 mb-2">
                    Copy this secret now. It won't be shown again!
                  </p>
                  <code className="block p-2 bg-white rounded border text-sm break-all">
                    {createdWebhookSecret}
                  </code>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  Use this secret to verify webhook signatures. Include it in your webhook handler
                  to validate that requests come from Nubabel.
                </p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(createdWebhookSecret);
                    alert("Copied to clipboard!");
                  }}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 mb-2"
                >
                  Copy to Clipboard
                </button>
                <button
                  onClick={() => {
                    setShowCreateWebhookModal(false);
                    setCreatedWebhookSecret(null);
                  }}
                  className="w-full px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold mb-4">Create Webhook</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                    <input
                      type="url"
                      value={newWebhookUrl}
                      onChange={(e) => setNewWebhookUrl(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="https://example.com/webhook"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Events</label>
                    <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                      {ALL_WEBHOOK_EVENTS.map((event) => (
                        <label key={event} className="flex items-center text-sm">
                          <input
                            type="checkbox"
                            checked={newWebhookEvents.includes(event)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewWebhookEvents((prev) => [...prev, event]);
                              } else {
                                setNewWebhookEvents((prev) => prev.filter((ev) => ev !== event));
                              }
                            }}
                            className="mr-2"
                          />
                          {event}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-2 mt-6">
                  <button
                    onClick={() => setShowCreateWebhookModal(false)}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateWebhook}
                    disabled={!newWebhookUrl || newWebhookEvents.length === 0}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    Create
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DeveloperPortalPage;
