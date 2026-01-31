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

export default function SettingsPage() {
  const { user, currentOrganization } = useAuthStore();
  const [name, setName] = useState(user?.name || "");
  const [isSaving, setIsSaving] = useState(false);
  const [slackIdentity, setSlackIdentity] = useState<{
    linked: boolean;
    slackUserId?: string;
    displayName?: string;
    email?: string;
    avatarUrl?: string;
    workspaceId?: string;
    lastSyncedAt?: string;
  } | null>(null);
  const [isLoadingSlack, setIsLoadingSlack] = useState(true);
  const [isSyncingSlack, setIsSyncingSlack] = useState(false);

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

  useEffect(() => {
    const fetchSlackIdentity = async () => {
      try {
        interface SlackIdentityResponse {
          linked: boolean;
          slackUserId?: string;
          displayName?: string;
          email?: string;
          avatarUrl?: string;
          workspaceId?: string;
          lastSyncedAt?: string;
        }
        const data = await request<SlackIdentityResponse>({
          url: "/api/slack/my-identity",
          method: "GET",
        });
        setSlackIdentity(data);
      } catch (error) {
        console.error("Failed to fetch Slack identity:", error);
        setSlackIdentity({ linked: false });
      } finally {
        setIsLoadingSlack(false);
      }
    };

    fetchSlackIdentity();
  }, []);

  const handleSyncSlack = async () => {
    setIsSyncingSlack(true);
    try {
      interface SyncResponse {
        success: boolean;
        slackUserId?: string;
        displayName?: string;
        email?: string;
        avatarUrl?: string;
        lastSyncedAt?: string;
      }
      const data = await request<SyncResponse>({
        url: "/api/slack/sync-my-identity",
        method: "POST",
      });

      if (data.success) {
        setSlackIdentity(prev => prev ? {
          ...prev,
          displayName: data.displayName,
          email: data.email,
          avatarUrl: data.avatarUrl,
          lastSyncedAt: data.lastSyncedAt,
        } : prev);
        alert("Slack profile synced successfully");
      }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to sync Slack profile";
      console.error("Sync failed:", error);
      alert(message);
    } finally {
      setIsSyncingSlack(false);
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
              <div className="text-sm text-gray-500">Member management coming soon</div>
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

        {/* Slack Connection */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Slack Connection</h2>

          {isLoadingSlack ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : slackIdentity?.linked ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                {slackIdentity.avatarUrl ? (
                  <img
                    src={slackIdentity.avatarUrl}
                    alt={slackIdentity.displayName || "Slack avatar"}
                    className="w-12 h-12 rounded-full"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center">
                    <span className="text-white text-xl font-medium">
                      {(slackIdentity.displayName || slackIdentity.email || "S").charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-medium text-gray-900">
                    {slackIdentity.displayName || "Slack User"}
                  </p>
                  <p className="text-sm text-gray-500">{slackIdentity.email}</p>
                </div>
                <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                  Connected
                </span>
              </div>

              {slackIdentity.lastSyncedAt && (
                <p className="text-sm text-gray-500">
                  Last synced: {new Date(slackIdentity.lastSyncedAt).toLocaleString()}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSyncSlack}
                  disabled={isSyncingSlack}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSyncingSlack ? "Syncing..." : "Sync Profile"}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zm2.521-10.122a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.835a2.528 2.528 0 0 1 2.522-2.52h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.835a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.835zm-1.27 0a2.528 2.528 0 0 1-2.521 2.521 2.528 2.528 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 15.165 0a2.528 2.528 0 0 1 2.521 2.522v6.313zm-2.521 10.122a2.528 2.528 0 0 1 2.521 2.522A2.528 2.528 0 0 1 15.165 24a2.528 2.528 0 0 1-2.521-2.522v-2.522h2.521zm0-1.27a2.528 2.528 0 0 1-2.521-2.521 2.528 2.528 0 0 1 2.521-2.521h6.313A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.521h-6.313z"/>
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Connect Your Slack</h3>
              <p className="text-gray-500 mb-4 max-w-sm mx-auto">
                Link your Slack account to use @Nubabel in your workspace
              </p>
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600 max-w-md mx-auto">
                <p className="font-medium mb-2">How to connect:</p>
                <ol className="list-decimal list-inside space-y-1 text-left">
                  <li>Go to your Slack workspace</li>
                  <li>Mention <code className="bg-gray-200 px-1 rounded">@Nubabel</code> in any channel</li>
                  <li>Click the "Link My Account" button that appears</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
