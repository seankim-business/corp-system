import { useEffect, useState } from "react";
import { ApiError, request } from "../api/client";
import { useAuthStore } from "../stores/authStore";

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

export default function MembersPage() {
  const { currentOrganization, user } = useAuthStore();
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  const organizationId = currentOrganization?.id;
  const currentUserId = user?.id;

  const fetchMembers = async () => {
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
  };

  useEffect(() => {
    fetchMembers();
  }, [organizationId]);

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
    <div className="max-w-6xl">
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Members</h1>
          <p className="text-gray-600">Manage your organization members and their roles</p>
        </div>
        <button
          onClick={() => setIsInviteModalOpen(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
        >
          <span className="text-lg">+</span>
          Invite Member
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Member
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
            {members.map((member) => (
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
            ))}
          </tbody>
        </table>

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
    </div>
  );
}
