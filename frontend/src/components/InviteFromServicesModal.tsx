/**
 * InviteFromServicesModal Component
 *
 * Modal for inviting members from connected services (Slack, Google, Notion).
 * Features provider selection tabs, searchable user list, and bulk invitation.
 */

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Search, Check, Users, Loader2, AlertCircle } from "lucide-react";

// =============================================================================
// Types
// =============================================================================

interface ConnectedService {
  provider: "slack" | "google" | "notion";
  workspaceName: string | null;
  workspaceId: string | null;
  connected: boolean;
  userCount: number;
}

interface ProviderUser {
  providerUserId: string;
  provider: "slack" | "google" | "notion";
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isBot?: boolean;
}

interface InviteResult {
  providerUserId: string;
  email: string | null;
  status: "invited" | "already_member" | "error";
  membershipId?: string;
  error?: string;
}

interface InviteResponse {
  success: boolean;
  summary: {
    total: number;
    invited: number;
    alreadyMembers: number;
    errors: number;
  };
  results: InviteResult[];
}

// =============================================================================
// API Hooks
// =============================================================================

function useInviteSources() {
  return useQuery({
    queryKey: ["members", "invite", "sources"],
    queryFn: async () => {
      const response = await fetch("/api/members/invite/sources", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch connected services");
      }

      const data = await response.json();
      return data.sources as ConnectedService[];
    },
  });
}

function useProviderUsers(provider: string | null, search: string) {
  return useQuery({
    queryKey: ["members", "invite", "users", provider, search],
    queryFn: async () => {
      if (!provider) return [];

      const params = new URLSearchParams({ provider });
      if (search) params.set("search", search);

      const response = await fetch(`/api/members/invite/users?${params}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }

      const data = await response.json();
      return data.users as ProviderUser[];
    },
    enabled: !!provider,
    staleTime: 30000,
  });
}

function useInviteFromService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      provider: string;
      providerUserIds: string[];
      role: string;
    }) => {
      const response = await fetch("/api/members/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to invite members");
      }

      return response.json() as Promise<InviteResponse>;
    },
    onSuccess: () => {
      // Invalidate members list
      queryClient.invalidateQueries({ queryKey: ["members"] });
      // Refresh the users list
      queryClient.invalidateQueries({ queryKey: ["members", "invite", "users"] });
    },
  });
}

// =============================================================================
// Provider Icons
// =============================================================================

function ProviderIcon({
  provider,
  size = 20,
}: {
  provider: "slack" | "google" | "notion";
  size?: number;
}) {
  const icons = {
    slack: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
      </svg>
    ),
    google: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    ),
    notion: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.373.466l1.822 1.447zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.84-.046.934-.56.934-1.166V6.354c0-.606-.233-.933-.746-.886l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.747 0-.934-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.22.186c-.094-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.454-.233 4.763 7.278v-6.44l-1.215-.14c-.093-.514.28-.886.747-.933l3.222-.186zm-14.617-7c-.094-.093-.047-.14.093-.14l13.028-.792c.14-.047.186.047.14.093l-1.868 1.447c-.28.233-.42.327-.747.373L2.775 2.808c-.186.046-.186.14-.047.186l1.914 1.04z"/>
      </svg>
    ),
  };

  return <span className="text-gray-600">{icons[provider]}</span>;
}

// =============================================================================
// Component Props
// =============================================================================

interface InviteFromServicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// =============================================================================
// Main Component
// =============================================================================

export default function InviteFromServicesModal({
  isOpen,
  onClose,
  onSuccess,
}: InviteFromServicesModalProps) {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [selectedRole, setSelectedRole] = useState<"admin" | "member" | "viewer">("member");
  const [showConfirmation, setShowConfirmation] = useState(false);

  const { data: sources, isLoading: sourcesLoading } = useInviteSources();
  const { data: users, isLoading: usersLoading } = useProviderUsers(
    selectedProvider,
    searchQuery,
  );
  const inviteMutation = useInviteFromService();

  // Auto-select first provider when sources load
  useEffect(() => {
    if (sources && sources.length > 0 && !selectedProvider) {
      setSelectedProvider(sources[0].provider);
    }
  }, [sources, selectedProvider]);

  // Reset selection when provider changes
  useEffect(() => {
    setSelectedUserIds(new Set());
    setSearchQuery("");
  }, [selectedProvider]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedProvider(null);
      setSelectedUserIds(new Set());
      setSearchQuery("");
      setSelectedRole("member");
      setShowConfirmation(false);
      inviteMutation.reset();
    }
  }, [isOpen]);

  // Filter users based on search
  const filteredUsers = useMemo(() => {
    if (!users) return [];
    if (!searchQuery) return users;

    const query = searchQuery.toLowerCase();
    return users.filter(
      (user) =>
        user.displayName?.toLowerCase().includes(query) ||
        user.email?.toLowerCase().includes(query),
    );
  }, [users, searchQuery]);

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedUserIds.size === filteredUsers.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredUsers.map((u) => u.providerUserId)));
    }
  };

  const handleInvite = async () => {
    if (!selectedProvider || selectedUserIds.size === 0) return;

    try {
      const result = await inviteMutation.mutateAsync({
        provider: selectedProvider,
        providerUserIds: Array.from(selectedUserIds),
        role: selectedRole,
      });

      if (result.summary.invited > 0) {
        onSuccess();
      }

      setShowConfirmation(true);
    } catch {
      // Error handled by mutation
    }
  };

  if (!isOpen) return null;

  const currentSource = sources?.find((s) => s.provider === selectedProvider);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] flex flex-col border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b-4 border-black bg-yellow-300">
          <h2 className="text-xl font-black uppercase tracking-tight">
            Invite from Connected Services
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-black/10 transition-colors"
          >
            <X size={24} strokeWidth={3} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {sourcesLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="animate-spin" size={32} />
            </div>
          ) : sources && sources.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <AlertCircle size={48} className="text-gray-400 mb-4" />
              <h3 className="text-lg font-bold mb-2">No Connected Services</h3>
              <p className="text-gray-600 max-w-sm">
                Connect Slack, Google, or Notion to invite members from those services.
              </p>
            </div>
          ) : showConfirmation && inviteMutation.data ? (
            /* Confirmation View */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 bg-green-500 flex items-center justify-center mb-4">
                <Check size={32} className="text-white" strokeWidth={3} />
              </div>
              <h3 className="text-xl font-black mb-4">Invitations Sent!</h3>
              <div className="space-y-2 text-sm">
                {inviteMutation.data.summary.invited > 0 && (
                  <p className="text-green-600 font-medium">
                    {inviteMutation.data.summary.invited} user
                    {inviteMutation.data.summary.invited !== 1 ? "s" : ""} invited
                  </p>
                )}
                {inviteMutation.data.summary.alreadyMembers > 0 && (
                  <p className="text-yellow-600">
                    {inviteMutation.data.summary.alreadyMembers} already member
                    {inviteMutation.data.summary.alreadyMembers !== 1 ? "s" : ""}
                  </p>
                )}
                {inviteMutation.data.summary.errors > 0 && (
                  <p className="text-red-600">
                    {inviteMutation.data.summary.errors} error
                    {inviteMutation.data.summary.errors !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="mt-6 px-6 py-2 bg-black text-white font-bold uppercase hover:bg-gray-800 transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Provider Tabs */}
              <div className="flex border-b-4 border-black bg-gray-100">
                {sources?.map((source) => (
                  <button
                    key={source.provider}
                    onClick={() => setSelectedProvider(source.provider)}
                    className={`flex-1 px-4 py-3 flex items-center justify-center gap-2 font-bold uppercase text-sm transition-colors ${
                      selectedProvider === source.provider
                        ? "bg-white border-r-4 border-black -mb-1 pb-4"
                        : "hover:bg-gray-200"
                    }`}
                  >
                    <ProviderIcon provider={source.provider} size={18} />
                    <span>{source.provider}</span>
                    <span className="px-2 py-0.5 bg-black text-white text-xs">
                      {source.userCount}
                    </span>
                  </button>
                ))}
              </div>

              {/* Provider Info */}
              {currentSource && (
                <div className="px-6 py-3 bg-gray-50 border-b-2 border-gray-200 text-sm">
                  <span className="text-gray-600">Workspace: </span>
                  <span className="font-medium">
                    {currentSource.workspaceName || currentSource.provider}
                  </span>
                </div>
              )}

              {/* Search */}
              <div className="px-6 py-4 border-b-2 border-gray-200">
                <div className="relative">
                  <Search
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name or email..."
                    className="w-full pl-10 pr-4 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-yellow-300"
                  />
                </div>
              </div>

              {/* User List */}
              <div className="flex-1 overflow-y-auto">
                {usersLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="animate-spin" size={24} />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                    <Users size={40} className="mb-3" />
                    <p className="font-medium">No users found</p>
                    <p className="text-sm">
                      {searchQuery
                        ? "Try a different search term"
                        : "All users are already members"}
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Select All */}
                    <div className="px-6 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
                      <button
                        onClick={toggleAll}
                        className="flex items-center gap-2 text-sm font-medium hover:text-black transition-colors"
                      >
                        <div
                          className={`w-5 h-5 border-2 border-black flex items-center justify-center ${
                            selectedUserIds.size === filteredUsers.length &&
                            filteredUsers.length > 0
                              ? "bg-yellow-300"
                              : "bg-white"
                          }`}
                        >
                          {selectedUserIds.size === filteredUsers.length &&
                            filteredUsers.length > 0 && (
                              <Check size={14} strokeWidth={3} />
                            )}
                        </div>
                        Select All ({filteredUsers.length})
                      </button>
                    </div>

                    {/* User Items */}
                    <div className="divide-y divide-gray-100">
                      {filteredUsers.map((user) => (
                        <button
                          key={user.providerUserId}
                          onClick={() => toggleUser(user.providerUserId)}
                          className="w-full px-6 py-3 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left"
                        >
                          <div
                            className={`w-5 h-5 border-2 border-black flex items-center justify-center flex-shrink-0 ${
                              selectedUserIds.has(user.providerUserId)
                                ? "bg-yellow-300"
                                : "bg-white"
                            }`}
                          >
                            {selectedUserIds.has(user.providerUserId) && (
                              <Check size={14} strokeWidth={3} />
                            )}
                          </div>

                          {user.avatarUrl ? (
                            <img
                              src={user.avatarUrl}
                              alt=""
                              className="w-10 h-10 border-2 border-black"
                            />
                          ) : (
                            <div className="w-10 h-10 border-2 border-black bg-gray-200 flex items-center justify-center font-bold text-gray-600">
                              {(user.displayName || user.email || "?")
                                .charAt(0)
                                .toUpperCase()}
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <p className="font-bold truncate">
                              {user.displayName || user.email || "Unknown User"}
                            </p>
                            {user.email && user.displayName && (
                              <p className="text-sm text-gray-500 truncate">
                                {user.email}
                              </p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t-4 border-black bg-gray-50">
                {inviteMutation.error && (
                  <div className="mb-4 p-3 bg-red-100 border-2 border-red-500 text-red-700 text-sm font-medium">
                    {inviteMutation.error.message}
                  </div>
                )}

                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <label className="text-sm font-bold uppercase">Role:</label>
                    <select
                      value={selectedRole}
                      onChange={(e) =>
                        setSelectedRole(e.target.value as "admin" | "member" | "viewer")
                      }
                      className="px-3 py-2 border-2 border-black font-medium focus:outline-none focus:ring-2 focus:ring-yellow-300"
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-600">
                      {selectedUserIds.size} selected
                    </span>
                    <button
                      onClick={onClose}
                      className="px-4 py-2 border-2 border-black font-bold uppercase hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleInvite}
                      disabled={
                        selectedUserIds.size === 0 || inviteMutation.isPending
                      }
                      className="px-6 py-2 bg-black text-white font-bold uppercase hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                      {inviteMutation.isPending ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Inviting...
                        </>
                      ) : (
                        `Invite ${selectedUserIds.size > 0 ? `(${selectedUserIds.size})` : ""}`
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
