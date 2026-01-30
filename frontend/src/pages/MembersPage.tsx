import { useCallback, useEffect, useState } from "react";
import { ApiError, request } from "../api/client";
import { useAuthStore } from "../stores/authStore";
import { useMemberIdentities, type MemberIdentity } from "../hooks/useMemberIdentities";
import { MessageSquare, Mail, FileText, Link as LinkIcon, Users } from "lucide-react";
import InviteFromServicesModal from "../components/InviteFromServicesModal";

interface Member {
  id: string;
  userId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: string;
  invitedAt: string;
  joinedAt: string | null;
  status: "active" | "pending";
}

type ProviderFilter = "all" | "slack" | "google" | "notion";
type LinkFilter = "all" | "linked" | "unlinked";

interface InviteMemberModalProps {
  organizationId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function InviteMemberModal({ organizationId, isOpen, onClose, onSuccess }: InviteMemberModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member");
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInvite = async () => {
    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    setIsInviting(true);
    setError(null);

    try {
      await request({
        url: `/api/organizations/${organizationId}/members/invite`,
        method: "POST",
        data: { email: email.trim(), role },
      });
      onSuccess();
      onClose();
      setEmail("");
      setRole("member");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to invite member";
      setError(message);
    } finally {
      setIsInviting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Invite Member</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email Address *
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as "admin" | "member" | "viewer")}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="admin">Admin - Full access</option>
                <option value="member">Member - Can execute workflows</option>
                <option value="viewer">Viewer - Read only</option>
              </select>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={handleInvite}
              disabled={isInviting}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isInviting ? "Inviting..." : "Send Invitation"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface RoleSelectProps {
  userId: string;
  currentRole: string;
  organizationId: string;
  currentUserId: string;
  onSuccess: () => void;
}

function RoleSelect({
  userId,
  currentRole,
  organizationId,
  currentUserId,
  onSuccess,
}: RoleSelectProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const isSelf = userId === currentUserId;

  const handleRoleChange = async (newRole: string) => {
    if (newRole === currentRole) return;

    setIsUpdating(true);
    try {
      await request({
        url: `/api/organizations/${organizationId}/members/${userId}/role`,
        method: "PUT",
        data: { role: newRole },
      });
      onSuccess();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to update role";
      alert(message);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <select
      value={currentRole}
      onChange={(e) => handleRoleChange(e.target.value)}
      disabled={isUpdating || isSelf}
      className={`px-2 py-1 text-sm border border-gray-300 rounded ${
        isSelf ? "bg-gray-100 cursor-not-allowed" : "hover:border-gray-400"
      } ${isUpdating ? "opacity-50" : ""}`}
    >
      <option value="owner">Owner</option>
      <option value="admin">Admin</option>
      <option value="member">Member</option>
      <option value="viewer">Viewer</option>
    </select>
  );
}

// Provider icon mapping
const PROVIDER_ICONS = {
  slack: MessageSquare,
  google: Mail,
  notion: FileText,
};

const PROVIDER_COLORS = {
  slack: "bg-purple-100 text-purple-600",
  google: "bg-blue-100 text-blue-600",
  notion: "bg-gray-100 text-gray-600",
};

const PROVIDER_LABELS = {
  slack: "Slack",
  google: "Google",
  notion: "Notion",
};

interface IdentityBadgeProps {
  identity: MemberIdentity;
}

function IdentityBadge({ identity }: IdentityBadgeProps) {
  const Icon = PROVIDER_ICONS[identity.provider];
  const colorClass = PROVIDER_COLORS[identity.provider];
  const label = PROVIDER_LABELS[identity.provider];

  const tooltipText = identity.email || identity.displayName || `${label} Account`;

  return (
    <div className="relative group">
      <div
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md ${colorClass} transition-all hover:shadow-sm`}
        title={tooltipText}
      >
        <Icon className="w-3 h-3" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-10">
        {tooltipText}
      </div>
    </div>
  );
}

interface LinkedAccountsProps {
  identities: MemberIdentity[];
  allProviders: ("slack" | "google" | "notion")[];
}

function LinkedAccounts({ identities, allProviders }: LinkedAccountsProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {allProviders.map((provider) => {
        const identity = identities.find((i) => i.provider === provider);
        const Icon = PROVIDER_ICONS[provider];

        if (identity) {
          return <IdentityBadge key={provider} identity={identity} />;
        }

        // Show greyed out icon if not linked
        return (
          <div
            key={provider}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-50 text-gray-300 border border-gray-200"
            title={`No ${PROVIDER_LABELS[provider]} account linked`}
          >
            <Icon className="w-3 h-3" />
            <span className="text-xs font-medium">{PROVIDER_LABELS[provider]}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function MembersPage() {
  const { currentOrganization, user } = useAuthStore();
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isInviteFromServicesModalOpen, setIsInviteFromServicesModalOpen] = useState(false);
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("all");

  const organizationId = currentOrganization?.id;
  const currentUserId = user?.id;

  const { data: identitiesMap, isLoading: identitiesLoading } = useMemberIdentities();

  const fetchMembers = useCallback(async () => {
    if (!organizationId) return;

    try {
      const data = await request<{ members: Member[] }>({
        url: `/api/organizations/${organizationId}/members`,
        method: "GET",
      });
      setMembers(data.members);
    } catch (error) {
      console.error("Failed to fetch members:", error);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleRemoveMember = async (userId: string, memberName: string) => {
    if (!confirm(`Are you sure you want to remove ${memberName} from this organization?`)) {
      return;
    }

    try {
      await request({
        url: `/api/organizations/${organizationId}/members/${userId}`,
        method: "DELETE",
      });
      fetchMembers();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to remove member";
      alert(message);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Filter members based on identity links
  const filteredMembers = members.filter((member) => {
    const memberIdentities = identitiesMap?.get(member.userId) || [];

    // Filter by provider
    if (providerFilter !== "all") {
      const hasProvider = memberIdentities.some((i) => i.provider === providerFilter);
      if (!hasProvider) return false;
    }

    // Filter by link status
    if (linkFilter === "linked") {
      if (memberIdentities.length === 0) return false;
    } else if (linkFilter === "unlinked") {
      if (memberIdentities.length > 0) return false;
    }

    return true;
  });

  // Calculate statistics
  const memberStats = {
    total: members.length,
    withSlack: members.filter((m) =>
      (identitiesMap?.get(m.userId) || []).some((i) => i.provider === "slack"),
    ).length,
    withGoogle: members.filter((m) =>
      (identitiesMap?.get(m.userId) || []).some((i) => i.provider === "google"),
    ).length,
    withNotion: members.filter((m) =>
      (identitiesMap?.get(m.userId) || []).some((i) => i.provider === "notion"),
    ).length,
    fullyLinked: members.filter(
      (m) => (identitiesMap?.get(m.userId) || []).length === 3,
    ).length,
    noLinks: members.filter((m) => (identitiesMap?.get(m.userId) || []).length === 0)
      .length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading members...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl">
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Members</h1>
          <p className="text-gray-600">Manage your organization members and their linked accounts</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsInviteFromServicesModalOpen(true)}
            className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <Users size={18} />
            Invite from Services
          </button>
          <button
            onClick={() => setIsInviteModalOpen(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
          >
            <span className="text-lg">+</span>
            Invite by Email
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      {!identitiesLoading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-gray-900">{memberStats.total}</div>
            <div className="text-sm text-gray-600">Total Members</div>
          </div>
          <div className="bg-purple-50 rounded-lg shadow p-4">
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare className="w-4 h-4 text-purple-600" />
              <div className="text-2xl font-bold text-purple-900">{memberStats.withSlack}</div>
            </div>
            <div className="text-sm text-purple-700">Slack Linked</div>
          </div>
          <div className="bg-blue-50 rounded-lg shadow p-4">
            <div className="flex items-center gap-2 mb-1">
              <Mail className="w-4 h-4 text-blue-600" />
              <div className="text-2xl font-bold text-blue-900">{memberStats.withGoogle}</div>
            </div>
            <div className="text-sm text-blue-700">Google Linked</div>
          </div>
          <div className="bg-gray-50 rounded-lg shadow p-4">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-gray-600" />
              <div className="text-2xl font-bold text-gray-900">{memberStats.withNotion}</div>
            </div>
            <div className="text-sm text-gray-700">Notion Linked</div>
          </div>
          <div className="bg-green-50 rounded-lg shadow p-4">
            <div className="flex items-center gap-2 mb-1">
              <LinkIcon className="w-4 h-4 text-green-600" />
              <div className="text-2xl font-bold text-green-900">{memberStats.fullyLinked}</div>
            </div>
            <div className="text-sm text-green-700">Fully Linked</div>
          </div>
          <div className="bg-orange-50 rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-orange-900">{memberStats.noLinks}</div>
            <div className="text-sm text-orange-700">No Links</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Provider:</label>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value as ProviderFilter)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">All Providers</option>
              <option value="slack">Slack Only</option>
              <option value="google">Google Only</option>
              <option value="notion">Notion Only</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Link Status:</label>
            <select
              value={linkFilter}
              onChange={(e) => setLinkFilter(e.target.value as LinkFilter)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">All Members</option>
              <option value="linked">Has Linked Accounts</option>
              <option value="unlinked">No Linked Accounts</option>
            </select>
          </div>

          <div className="ml-auto text-sm text-gray-600">
            Showing {filteredMembers.length} of {members.length} members
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Member
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Linked Accounts
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Joined
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredMembers.map((member) => {
              const memberIdentities = identitiesMap?.get(member.userId) || [];
              return (
                <tr key={member.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        {member.avatarUrl ? (
                          <img
                            className="h-10 w-10 rounded-full"
                            src={member.avatarUrl}
                            alt={member.name}
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-indigo-600 flex items-center justify-center">
                            <span className="text-white text-sm font-medium">
                              {member.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {member.name}
                          {member.userId === currentUserId && (
                            <span className="ml-2 text-xs text-gray-500">(you)</span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">{member.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {identitiesLoading ? (
                      <div className="text-sm text-gray-400">Loading...</div>
                    ) : memberIdentities.length > 0 ? (
                      <LinkedAccounts
                        identities={memberIdentities}
                        allProviders={["slack", "google", "notion"]}
                      />
                    ) : (
                      <div className="text-sm text-gray-400 italic">No linked accounts</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {organizationId && currentUserId && (
                      <RoleSelect
                        userId={member.userId}
                        currentRole={member.role}
                        organizationId={organizationId}
                        currentUserId={currentUserId}
                        onSuccess={fetchMembers}
                      />
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        member.status === "active"
                          ? "bg-green-100 text-green-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {member.status === "active" ? "Active" : "Pending"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(member.joinedAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {member.userId !== currentUserId && (
                      <button
                        onClick={() => handleRemoveMember(member.userId, member.name)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredMembers.length === 0 && members.length > 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🔍</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No members match filters</h2>
            <p className="text-gray-600">Try adjusting your filter criteria</p>
          </div>
        )}

        {members.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">👥</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No members yet</h2>
            <p className="text-gray-600">Invite team members to collaborate</p>
          </div>
        )}
      </div>

      {organizationId && (
        <InviteMemberModal
          organizationId={organizationId}
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          onSuccess={fetchMembers}
        />
      )}

      <InviteFromServicesModal
        isOpen={isInviteFromServicesModalOpen}
        onClose={() => setIsInviteFromServicesModalOpen(false)}
        onSuccess={fetchMembers}
      />
    </div>
  );
}
