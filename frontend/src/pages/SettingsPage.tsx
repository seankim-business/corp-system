/**
 * SettingsPage
 *
 * 기획:
 * - 사용자 설정 페이지
 * - 3개 섹션: Profile, Organization, Security
 * - 각 섹션은 카드 형태로 구분
 * - 저장 버튼은 각 섹션별로 독립적
 *
 * 구조:
 * SettingsPage
 * ├── PageHeader (제목 + 설명)
 * ├── ProfileSection
 * │   ├── Name (editable input)
 * │   ├── Email (readonly)
 * │   ├── Avatar (upload)
 * │   └── Save Button
 * ├── OrganizationSection
 * │   ├── Org Name (readonly)
 * │   ├── Domain (readonly)
 * │   └── Members List (readonly)
 * └── SecuritySection
 *     ├── Active Sessions
 *     └── Logout All Devices Button
 */

import { useState, useEffect } from "react";
import { ApiError, request } from "../api/client";
import { useAuthStore } from "../stores/authStore";

interface ApiKeySettings {
  anthropicApiKey?: string;
  anthropicApiKeySet?: boolean;
  openaiApiKey?: string;
  openaiApiKeySet?: boolean;
  openrouterApiKey?: string;
  openrouterApiKeySet?: boolean;
}

export default function SettingsPage() {
  const { user, currentOrganization } = useAuthStore();
  const [name, setName] = useState(user?.name || "");
  const [isSaving, setIsSaving] = useState(false);

  const [apiKeySettings, setApiKeySettings] = useState<ApiKeySettings>({});
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openrouterApiKey, setOpenrouterApiKey] = useState("");
  const [isSavingApiKeys, setIsSavingApiKeys] = useState(false);
  const [apiKeysError, setApiKeysError] = useState<string | null>(null);
  const [apiKeysSuccess, setApiKeysSuccess] = useState<string | null>(null);

  useEffect(() => {
    const fetchApiKeySettings = async () => {
      try {
        const response = await request<{ settings: ApiKeySettings }>({
          url: "/api/organization/settings",
          method: "GET",
        });
        setApiKeySettings(response.settings);
      } catch (error) {
        console.error("Failed to fetch API key settings:", error);
      }
    };
    fetchApiKeySettings();
  }, []);

  const handleSaveApiKeys = async () => {
    setIsSavingApiKeys(true);
    setApiKeysError(null);
    setApiKeysSuccess(null);

    try {
      const payload: Record<string, string> = {};
      if (anthropicApiKey) payload.anthropicApiKey = anthropicApiKey;
      if (openaiApiKey) payload.openaiApiKey = openaiApiKey;
      if (openrouterApiKey) payload.openrouterApiKey = openrouterApiKey;

      if (Object.keys(payload).length === 0) {
        setApiKeysError("Please enter at least one API key");
        setIsSavingApiKeys(false);
        return;
      }

      await request<{ success: boolean }>({
        url: "/api/organization/settings/api-keys",
        method: "PUT",
        data: payload,
      });

      const response = await request<{ settings: ApiKeySettings }>({
        url: "/api/organization/settings",
        method: "GET",
      });
      setApiKeySettings(response.settings);

      setAnthropicApiKey("");
      setOpenaiApiKey("");
      setOpenrouterApiKey("");
      setApiKeysSuccess("API keys saved successfully");
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to save API keys";
      setApiKeysError(message);
    } finally {
      setIsSavingApiKeys(false);
    }
  };

  const handleDeleteApiKey = async (keyName: string) => {
    if (!confirm(`Are you sure you want to delete ${keyName}?`)) {
      return;
    }

    try {
      await request<{ success: boolean }>({
        url: `/api/organization/settings/api-keys/${keyName}`,
        method: "DELETE",
      });

      const response = await request<{ settings: ApiKeySettings }>({
        url: "/api/organization/settings",
        method: "GET",
      });
      setApiKeySettings(response.settings);
      setApiKeysSuccess(`${keyName} deleted successfully`);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to delete API key";
      setApiKeysError(message);
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      interface UpdateProfileResponse {
        success: boolean;
      }
      await request<UpdateProfileResponse>({
        url: "/api/user/profile",
        method: "PUT",
        data: { name },
      });

      alert("Profile updated successfully");
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to update profile";
      console.error("Save failed:", error);
      alert(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoutAll = async () => {
    if (!confirm("Are you sure you want to logout from all devices?")) {
      return;
    }

    try {
      interface LogoutAllResponse {
        success: boolean;
      }
      await request<LogoutAllResponse>({
        url: "/api/auth/logout-all",
        method: "POST",
      });

      window.location.href = "/login";
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Failed to logout from all devices";
      console.error("Logout all failed:", error);
      alert(message);
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Settings</h1>
        <p className="text-gray-600">Manage your account settings and preferences</p>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Profile</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={user?.email || ""}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
              />
              <p className="mt-1 text-xs text-gray-500">Email cannot be changed</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Avatar</label>
              <div className="flex items-center gap-4">
                {user?.picture ? (
                  <img src={user.picture} alt={user.name} className="w-16 h-16 rounded-full" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center">
                    <span className="text-white text-2xl font-medium">
                      {(user?.name || user?.email || "?").charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <button className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                    Change Avatar
                  </button>
                  <p className="mt-1 text-xs text-gray-500">JPG, PNG or GIF (max. 2MB)</p>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button
                onClick={handleSaveProfile}
                disabled={isSaving}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Organization</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Organization Name
              </label>
              <input
                type="text"
                value={currentOrganization?.name || ""}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
              <input
                type="text"
                value={currentOrganization?.domain || ""}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Members</label>
              <a
                href="/settings/members"
                className="inline-flex items-center text-sm text-indigo-600 hover:text-indigo-800"
              >
                Manage organization members →
              </a>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">API Keys</h2>
          <p className="text-sm text-gray-500 mb-4">
            Configure API keys for AI-powered features. Keys are encrypted and stored securely.
          </p>

          {apiKeysError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {apiKeysError}
            </div>
          )}

          {apiKeysSuccess && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              {apiKeysSuccess}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Anthropic API Key
                {apiKeySettings.anthropicApiKeySet && (
                  <span className="ml-2 text-green-600 text-xs font-normal">(configured)</span>
                )}
              </label>
              {apiKeySettings.anthropicApiKeySet ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={apiKeySettings.anthropicApiKey || ""}
                    disabled
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 font-mono text-sm"
                  />
                  <button
                    onClick={() => handleDeleteApiKey("anthropicApiKey")}
                    className="px-3 py-2 text-sm text-red-600 hover:text-red-800 border border-red-300 rounded-lg hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              ) : (
                <input
                  type="password"
                  value={anthropicApiKey}
                  onChange={(e) => setAnthropicApiKey(e.target.value)}
                  placeholder="sk-ant-api03-..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
                />
              )}
              <p className="mt-1 text-xs text-gray-500">
                Required for Slack bot AI responses. Get your key at{" "}
                <a
                  href="https://console.anthropic.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline"
                >
                  console.anthropic.com
                </a>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                OpenAI API Key
                {apiKeySettings.openaiApiKeySet && (
                  <span className="ml-2 text-green-600 text-xs font-normal">(configured)</span>
                )}
              </label>
              {apiKeySettings.openaiApiKeySet ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={apiKeySettings.openaiApiKey || ""}
                    disabled
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 font-mono text-sm"
                  />
                  <button
                    onClick={() => handleDeleteApiKey("openaiApiKey")}
                    className="px-3 py-2 text-sm text-red-600 hover:text-red-800 border border-red-300 rounded-lg hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              ) : (
                <input
                  type="password"
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
                />
              )}
              <p className="mt-1 text-xs text-gray-500">Optional. For OpenAI-based features.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                OpenRouter API Key
                {apiKeySettings.openrouterApiKeySet && (
                  <span className="ml-2 text-green-600 text-xs font-normal">(configured)</span>
                )}
              </label>
              {apiKeySettings.openrouterApiKeySet ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={apiKeySettings.openrouterApiKey || ""}
                    disabled
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 font-mono text-sm"
                  />
                  <button
                    onClick={() => handleDeleteApiKey("openrouterApiKey")}
                    className="px-3 py-2 text-sm text-red-600 hover:text-red-800 border border-red-300 rounded-lg hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              ) : (
                <input
                  type="password"
                  value={openrouterApiKey}
                  onChange={(e) => setOpenrouterApiKey(e.target.value)}
                  placeholder="sk-or-..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
                />
              )}
              <p className="mt-1 text-xs text-gray-500">Optional. For OpenRouter-based features.</p>
            </div>

            <div className="pt-4">
              <button
                onClick={handleSaveApiKeys}
                disabled={
                  isSavingApiKeys || (!anthropicApiKey && !openaiApiKey && !openrouterApiKey)
                }
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingApiKeys ? "Saving..." : "Save API Keys"}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Security</h2>

          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Active Sessions</h3>
              <p className="text-sm text-gray-500 mb-4">
                You are currently logged in on this device. Session management coming soon.
              </p>

              <button
                onClick={handleLogoutAll}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Logout from All Devices
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
