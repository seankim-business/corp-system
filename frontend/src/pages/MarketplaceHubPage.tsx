import { useState, useEffect, useCallback } from "react";
import { request } from "../api/client";

interface ExternalSourceItem {
  id: string;
  source: string;
  type: string;
  name: string;
  description: string;
  version?: string;
  author?: string;
  downloads?: number;
  stars?: number;
  rating?: number;
  installMethod: string;
  tags?: string[];
}

interface ToolRecommendation {
  item: ExternalSourceItem;
  reason: string;
  confidence: number;
}

interface InstalledExtension {
  id: string;
  extensionId: string;
  name: string;
  source: string;
  type: string;
  version: string;
  installedAt: string;
}

interface MarketplaceSettings {
  smitheryApiKey?: string | null;
  smitheryApiKeySet?: boolean;
  civitaiApiKey?: string | null;
  civitaiApiKeySet?: boolean;
  langchainApiKey?: string | null;
  langchainApiKeySet?: boolean;
}

const SOURCE_COLORS: Record<string, string> = {
  smithery: "bg-purple-100 text-purple-800",
  "mcp-registry": "bg-blue-100 text-blue-800",
  glama: "bg-green-100 text-green-800",
  comfyui: "bg-orange-100 text-orange-800",
  civitai: "bg-pink-100 text-pink-800",
  "langchain-hub": "bg-yellow-100 text-yellow-800",
};

const TYPE_ICONS: Record<string, string> = {
  mcp_server: "🔌",
  workflow: "⚡",
  prompt: "💬",
  skill: "🎯",
  extension: "📦",
};

export default function MarketplaceHubPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<string>("");
  const [results, setResults] = useState<ExternalSourceItem[]>([]);
  const [installed, setInstalled] = useState<InstalledExtension[]>([]);
  const [recommendations, setRecommendations] = useState<ToolRecommendation[]>([]);

  const [isSearching, setIsSearching] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [showInstalled, setShowInstalled] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [recommendQuery, setRecommendQuery] = useState("");
  const [isRecommending, setIsRecommending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // API Key settings state
  const [settings, setSettings] = useState<MarketplaceSettings>({});
  const [apiKeyInputs, setApiKeyInputs] = useState({
    smitheryApiKey: "",
    civitaiApiKey: "",
    langchainApiKey: "",
  });
  const [isSavingKeys, setIsSavingKeys] = useState(false);

  const sources = [
    { id: "smithery", name: "Smithery", types: ["mcp_server"] },
    { id: "mcp-registry", name: "MCP Registry", types: ["mcp_server"] },
    { id: "glama", name: "Glama", types: ["mcp_server"] },
    { id: "comfyui", name: "ComfyUI", types: ["workflow", "extension"] },
    { id: "civitai", name: "CivitAI", types: ["workflow"] },
    { id: "langchain-hub", name: "LangChain Hub", types: ["prompt", "skill"] },
  ];

  const types = [
    { id: "", name: "All Types" },
    { id: "mcp_server", name: "MCP Servers" },
    { id: "workflow", name: "Workflows" },
    { id: "prompt", name: "Prompts" },
    { id: "skill", name: "Skills" },
  ];

  const fetchInstalled = useCallback(async () => {
    try {
      const result = await request<{ success: boolean; data: { items: InstalledExtension[] } }>({
        url: "/api/marketplace-hub/installed",
        method: "GET",
      });
      setInstalled(result.data?.items || []);
    } catch (err) {
      console.error("Failed to fetch installed:", err);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const result = await request<{ success: boolean; data: MarketplaceSettings }>({
        url: "/api/marketplace-hub/settings",
        method: "GET",
      });
      setSettings(result.data || {});
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    }
  }, []);

  useEffect(() => {
    fetchInstalled();
    fetchSettings();
  }, [fetchInstalled, fetchSettings]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setError(null);

    try {
      const params = new URLSearchParams({ q: searchQuery });
      if (selectedSources.length > 0) {
        params.set("sources", selectedSources.join(","));
      }
      if (selectedType) {
        params.set("type", selectedType);
      }
      params.set("limit", "30");

      const result = await request<{ success: boolean; data: { items: ExternalSourceItem[] } }>({
        url: `/api/marketplace-hub/search?${params.toString()}`,
        method: "GET",
      });

      setResults(result.data?.items || []);
    } catch (err) {
      setError("Search failed. Please try again.");
      console.error("Search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleInstall = async (item: ExternalSourceItem) => {
    setInstalling(item.id);
    setError(null);

    try {
      await request({
        url: "/api/marketplace-hub/install",
        method: "POST",
        data: {
          source: item.source,
          itemId: item.id,
        },
      });

      await fetchInstalled();
      alert(`Successfully installed: ${item.name}`);
    } catch (err) {
      setError(`Failed to install ${item.name}`);
      console.error("Install failed:", err);
    } finally {
      setInstalling(null);
    }
  };

  const handleUninstall = async (extensionId: string) => {
    try {
      await request({
        url: `/api/marketplace-hub/uninstall/${extensionId}`,
        method: "DELETE",
      });
      await fetchInstalled();
    } catch (err) {
      setError("Failed to uninstall");
      console.error("Uninstall failed:", err);
    }
  };

  const handleRecommend = async () => {
    if (!recommendQuery.trim()) return;

    setIsRecommending(true);
    setError(null);

    try {
      const result = await request<{ success: boolean; data: { recommendations: ToolRecommendation[] } }>({
        url: "/api/marketplace-hub/recommend",
        method: "POST",
        data: { request: recommendQuery },
      });

      setRecommendations(result.data?.recommendations || []);
    } catch (err) {
      setError("Recommendation failed. Please try again.");
      console.error("Recommend failed:", err);
    } finally {
      setIsRecommending(false);
    }
  };

  const toggleSource = (sourceId: string) => {
    setSelectedSources((prev) =>
      prev.includes(sourceId) ? prev.filter((s) => s !== sourceId) : [...prev, sourceId],
    );
  };

  const handleSaveApiKeys = async () => {
    setIsSavingKeys(true);
    setError(null);

    try {
      const updates: Record<string, string | null> = {};
      if (apiKeyInputs.smitheryApiKey) updates.smitheryApiKey = apiKeyInputs.smitheryApiKey;
      if (apiKeyInputs.civitaiApiKey) updates.civitaiApiKey = apiKeyInputs.civitaiApiKey;
      if (apiKeyInputs.langchainApiKey) updates.langchainApiKey = apiKeyInputs.langchainApiKey;

      if (Object.keys(updates).length === 0) {
        setError("Please enter at least one API key");
        return;
      }

      await request({
        url: "/api/marketplace-hub/settings/api-keys",
        method: "PUT",
        data: updates,
      });

      await fetchSettings();
      setApiKeyInputs({ smitheryApiKey: "", civitaiApiKey: "", langchainApiKey: "" });
      alert("API keys saved successfully");
    } catch (err) {
      setError("Failed to save API keys");
      console.error("Save API keys failed:", err);
    } finally {
      setIsSavingKeys(false);
    }
  };

  const handleDeleteApiKey = async (keyName: string) => {
    if (!confirm(`Are you sure you want to delete ${keyName}?`)) return;

    try {
      await request({
        url: `/api/marketplace-hub/settings/api-keys/${keyName}`,
        method: "DELETE",
      });
      await fetchSettings();
    } catch (err) {
      setError(`Failed to delete ${keyName}`);
      console.error("Delete API key failed:", err);
    }
  };

  const isInstalled = (itemId: string) => {
    return installed.some((i) => i.extensionId === itemId);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Marketplace Hub</h1>
          <p className="mt-2 text-gray-600">
            Connect external AI ecosystems - MCP servers, workflows, prompts, and more
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex gap-4 mb-4">
            <input
              type="text"
              placeholder="Search across all marketplaces..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isSearching ? "Searching..." : "Search"}
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-sm text-gray-500 mr-2">Sources:</span>
            {sources.map((source) => (
              <button
                key={source.id}
                onClick={() => toggleSource(source.id)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  selectedSources.includes(source.id) || selectedSources.length === 0
                    ? SOURCE_COLORS[source.id] || "bg-gray-200 text-gray-800"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {source.name}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <span className="text-sm text-gray-500 mr-2">Type:</span>
            {types.map((type) => (
              <button
                key={type.id}
                onClick={() => setSelectedType(type.id)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  selectedType === type.id
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {type.name}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {results.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Search Results ({results.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map((item) => (
                <div
                  key={`${item.source}-${item.id}`}
                  className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{TYPE_ICONS[item.type] || "📦"}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          SOURCE_COLORS[item.source] || "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {item.source}
                      </span>
                    </div>
                    {item.version && <span className="text-xs text-gray-500">v{item.version}</span>}
                  </div>

                  <h3 className="font-semibold text-gray-900 mb-1">{item.name}</h3>
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{item.description}</p>

                  <div className="flex items-center justify-between">
                    <div className="flex gap-3 text-xs text-gray-500">
                      {item.downloads !== undefined && (
                        <span>📥 {item.downloads.toLocaleString()}</span>
                      )}
                      {item.stars !== undefined && <span>⭐ {item.stars.toLocaleString()}</span>}
                      {item.rating !== undefined && <span>Rating: {item.rating.toFixed(1)}</span>}
                    </div>

                    <button
                      onClick={() => handleInstall(item)}
                      disabled={installing === item.id || isInstalled(item.id)}
                      className={`px-3 py-1 rounded text-sm font-medium ${
                        isInstalled(item.id)
                          ? "bg-green-100 text-green-700 cursor-default"
                          : installing === item.id
                            ? "bg-gray-100 text-gray-500"
                            : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                    >
                      {isInstalled(item.id)
                        ? "Installed"
                        : installing === item.id
                          ? "Installing..."
                          : "Install"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">AI-Powered Recommendations</h2>
          <p className="text-gray-600 mb-4">
            Describe what you want to do, and we'll find the right tools
          </p>

          <div className="flex gap-4 mb-4">
            <input
              type="text"
              placeholder="e.g., I need to send messages to Slack channels..."
              value={recommendQuery}
              onChange={(e) => setRecommendQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRecommend()}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <button
              onClick={handleRecommend}
              disabled={isRecommending}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {isRecommending ? "Finding..." : "Get Recommendations"}
            </button>
          </div>

          {recommendations.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recommendations.map((rec, idx) => (
                <div key={idx} className="bg-white rounded-lg p-4 border border-purple-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{TYPE_ICONS[rec.item.type] || "📦"}</span>
                      <span className="font-semibold">{rec.item.name}</span>
                    </div>
                    <span className="text-xs text-purple-600 font-medium">
                      {Math.round(rec.confidence * 100)}% match
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{rec.reason}</p>
                  <button
                    onClick={() => handleInstall(rec.item)}
                    disabled={installing === rec.item.id || isInstalled(rec.item.id)}
                    className="w-full py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 text-sm"
                  >
                    {isInstalled(rec.item.id) ? "Installed" : "Install"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow">
          <button
            onClick={() => setShowInstalled(!showInstalled)}
            className="w-full px-6 py-4 flex items-center justify-between text-left"
          >
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Installed Extensions ({installed.length})
              </h2>
              <p className="text-sm text-gray-500">External tools installed in your workspace</p>
            </div>
            <svg
              className={`w-5 h-5 text-gray-500 transition-transform ${
                showInstalled ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {showInstalled && installed.length > 0 && (
            <div className="px-6 pb-6">
              <div className="divide-y divide-gray-100">
                {installed.map((ext) => (
                  <div key={ext.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{ext.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs ${
                            SOURCE_COLORS[ext.source] || "bg-gray-100"
                          }`}
                        >
                          {ext.source}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        v{ext.version} • Installed {new Date(ext.installedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <button
                      onClick={() => handleUninstall(ext.extensionId)}
                      className="text-red-600 hover:text-red-700 text-sm"
                    >
                      Uninstall
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showInstalled && installed.length === 0 && (
            <div className="px-6 pb-6 text-center text-gray-500">
              No external extensions installed yet
            </div>
          )}
        </div>

        {/* API Key Settings Section */}
        <div className="bg-white rounded-lg shadow mt-6">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-full px-6 py-4 flex items-center justify-between text-left"
          >
            <div>
              <h2 className="text-lg font-semibold text-gray-900">API Key Settings</h2>
              <p className="text-sm text-gray-500">
                Optional: Configure API keys for premium features or higher rate limits
              </p>
            </div>
            <svg
              className={`w-5 h-5 text-gray-500 transition-transform ${
                showSettings ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {showSettings && (
            <div className="px-6 pb-6 space-y-4">
              <p className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
                API keys are <strong>optional</strong>. External sources work without keys,
                but keys may unlock premium features or bypass rate limits.
              </p>

              {/* Smithery API Key */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_COLORS.smithery}`}>
                      Smithery
                    </span>
                    {settings.smitheryApiKeySet && (
                      <span className="text-green-600 text-xs">Configured</span>
                    )}
                  </div>
                  {settings.smitheryApiKeySet && (
                    <button
                      onClick={() => handleDeleteApiKey("smitheryApiKey")}
                      className="text-red-600 hover:text-red-700 text-xs"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  placeholder={settings.smitheryApiKeySet ? settings.smitheryApiKey || "••••••••" : "Enter Smithery API key"}
                  value={apiKeyInputs.smitheryApiKey}
                  onChange={(e) => setApiKeyInputs((prev) => ({ ...prev, smitheryApiKey: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-xs text-gray-500 mt-1">For premium MCP servers access</p>
              </div>

              {/* CivitAI API Key */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_COLORS.civitai}`}>
                      CivitAI
                    </span>
                    {settings.civitaiApiKeySet && (
                      <span className="text-green-600 text-xs">Configured</span>
                    )}
                  </div>
                  {settings.civitaiApiKeySet && (
                    <button
                      onClick={() => handleDeleteApiKey("civitaiApiKey")}
                      className="text-red-600 hover:text-red-700 text-xs"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  placeholder={settings.civitaiApiKeySet ? settings.civitaiApiKey || "••••••••" : "Enter CivitAI API key"}
                  value={apiKeyInputs.civitaiApiKey}
                  onChange={(e) => setApiKeyInputs((prev) => ({ ...prev, civitaiApiKey: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-pink-500"
                />
                <p className="text-xs text-gray-500 mt-1">For higher rate limits and NSFW content access</p>
              </div>

              {/* LangChain Hub API Key */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_COLORS["langchain-hub"]}`}>
                      LangChain Hub
                    </span>
                    {settings.langchainApiKeySet && (
                      <span className="text-green-600 text-xs">Configured</span>
                    )}
                  </div>
                  {settings.langchainApiKeySet && (
                    <button
                      onClick={() => handleDeleteApiKey("langchainApiKey")}
                      className="text-red-600 hover:text-red-700 text-xs"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  placeholder={settings.langchainApiKeySet ? settings.langchainApiKey || "••••••••" : "Enter LangChain Hub API key"}
                  value={apiKeyInputs.langchainApiKey}
                  onChange={(e) => setApiKeyInputs((prev) => ({ ...prev, langchainApiKey: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-yellow-500"
                />
                <p className="text-xs text-gray-500 mt-1">For private prompts and chains access</p>
              </div>

              <button
                onClick={handleSaveApiKeys}
                disabled={isSavingKeys}
                className="w-full py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {isSavingKeys ? "Saving..." : "Save API Keys"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
