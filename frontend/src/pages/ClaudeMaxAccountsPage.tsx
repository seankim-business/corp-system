import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  RefreshCw,
  Trash2,
  Edit2,
  RotateCcw,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
} from "lucide-react";

interface ClaudeMaxAccount {
  id: string;
  nickname: string;
  email: string;
  status: string;
  estimatedUsagePercent: number;
  lastUsageUpdateAt: string | null;
  estimatedResetAt: string | null;
  lastActiveAt: string | null;
  consecutiveRateLimits: number;
  cooldownUntil: string | null;
  priority: number;
  hasCredentials: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PoolSummary {
  total: number;
  active: number;
  rateLimited: number;
  exhausted: number;
  cooldown: number;
  averageUsage: number;
}

interface AccountFormData {
  nickname: string;
  email: string;
  priority: number;
  sessionToken?: string;
  cookieData?: string;
}

const API_BASE = import.meta.env.VITE_API_URL || "https://auth.nubabel.com";

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    active: {
      color: "bg-green-100 text-green-800",
      icon: <CheckCircle className="w-3 h-3" />,
      label: "Active",
    },
    rate_limited: {
      color: "bg-yellow-100 text-yellow-800",
      icon: <AlertCircle className="w-3 h-3" />,
      label: "Rate Limited",
    },
    exhausted: {
      color: "bg-red-100 text-red-800",
      icon: <AlertCircle className="w-3 h-3" />,
      label: "Exhausted",
    },
    cooldown: {
      color: "bg-blue-100 text-blue-800",
      icon: <Clock className="w-3 h-3" />,
      label: "Cooldown",
    },
  };
  const { color, icon, label } = config[status] || {
    color: "bg-gray-100 text-gray-800",
    icon: null,
    label: status,
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${color}`}
    >
      {icon}
      {label}
    </span>
  );
}

function UsageBar({ percent }: { percent: number }) {
  const color = percent >= 90 ? "bg-red-500" : percent >= 70 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div
        className={`h-2 rounded-full ${color}`}
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  );
}

function AccountModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isEditing,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: AccountFormData) => Promise<void>;
  initialData?: ClaudeMaxAccount;
  isEditing: boolean;
}) {
  const [formData, setFormData] = useState<AccountFormData>({
    nickname: initialData?.nickname || "",
    email: initialData?.email || "",
    priority: initialData?.priority || 100,
    sessionToken: "",
    cookieData: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setFormData({
        nickname: initialData.nickname,
        email: initialData.email,
        priority: initialData.priority,
        sessionToken: "",
        cookieData: "",
      });
    } else {
      setFormData({ nickname: "", email: "", priority: 100, sessionToken: "", cookieData: "" });
    }
    setError(null);
  }, [initialData, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onSubmit(formData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save account");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-xl font-semibold mb-4">
          {isEditing ? "Edit Account" : "Add Claude Max Account"}
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nickname</label>
            <input
              type="text"
              value={formData.nickname}
              onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g., work, personal, backup-1"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="claude-account@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Priority (higher = preferred)
            </label>
            <input
              type="number"
              value={formData.priority}
              onChange={(e) =>
                setFormData({ ...formData, priority: parseInt(e.target.value) || 100 })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              min={1}
              max={1000}
            />
          </div>

          <div className="border-t pt-4">
            <p className="text-sm text-gray-500 mb-3">
              Credentials (optional - for automated login)
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Session Token
                </label>
                <input
                  type="password"
                  value={formData.sessionToken}
                  onChange={(e) => setFormData({ ...formData, sessionToken: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Leave empty to keep existing"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cookie Data</label>
                <textarea
                  value={formData.cookieData}
                  onChange={(e) => setFormData({ ...formData, cookieData: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Leave empty to keep existing"
                  rows={2}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? "Saving..." : isEditing ? "Update" : "Add Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ClaudeMaxAccountsPage() {
  const [accounts, setAccounts] = useState<ClaudeMaxAccount[]>([]);
  const [summary, setSummary] = useState<PoolSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ClaudeMaxAccount | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/claude-max-accounts`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch accounts");
      const data = await res.json();
      setAccounts(data.accounts);
      setSummary(data.summary);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
    const interval = setInterval(fetchAccounts, 30000);
    return () => clearInterval(interval);
  }, [fetchAccounts]);

  const handleCreate = async (data: AccountFormData) => {
    const res = await fetch(`${API_BASE}/api/claude-max-accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        nickname: data.nickname,
        email: data.email,
        priority: data.priority,
        credentials:
          data.sessionToken || data.cookieData
            ? {
                sessionToken: data.sessionToken || undefined,
                cookieData: data.cookieData || undefined,
              }
            : undefined,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to create account");
    }
    await fetchAccounts();
  };

  const handleUpdate = async (data: AccountFormData) => {
    if (!editingAccount) return;
    const res = await fetch(`${API_BASE}/api/claude-max-accounts/${editingAccount.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        nickname: data.nickname,
        email: data.email,
        priority: data.priority,
        credentials:
          data.sessionToken || data.cookieData
            ? {
                sessionToken: data.sessionToken || undefined,
                cookieData: data.cookieData || undefined,
              }
            : undefined,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to update account");
    }
    await fetchAccounts();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this account?")) return;
    const res = await fetch(`${API_BASE}/api/claude-max-accounts/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to delete account");
    await fetchAccounts();
  };

  const handleResetStatus = async (id: string) => {
    const res = await fetch(`${API_BASE}/api/claude-max-accounts/${id}/reset-status`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to reset status");
    await fetchAccounts();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Claude Max Accounts</h1>
          <p className="text-gray-600">
            Manage your Claude Max subscription accounts for AI execution
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchAccounts}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => {
              setEditingAccount(null);
              setModalOpen(true);
            }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Account
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
          {error}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="text-sm text-gray-500">Total Accounts</div>
            <div className="text-2xl font-bold text-gray-900">{summary.total}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="text-sm text-gray-500 flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-green-500" /> Active
            </div>
            <div className="text-2xl font-bold text-green-600">{summary.active}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="text-sm text-gray-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-yellow-500" /> Rate Limited
            </div>
            <div className="text-2xl font-bold text-yellow-600">{summary.rateLimited}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="text-sm text-gray-500 flex items-center gap-1">
              <Zap className="w-3 h-3 text-red-500" /> Exhausted
            </div>
            <div className="text-2xl font-bold text-red-600">{summary.exhausted}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border">
            <div className="text-sm text-gray-500">Avg Usage</div>
            <div className="text-2xl font-bold text-gray-900">
              {summary.averageUsage.toFixed(1)}%
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow border overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Account
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Usage
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Priority
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Active
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  No accounts configured. Add your first Claude Max account to get started.
                </td>
              </tr>
            ) : (
              accounts.map((account) => (
                <tr key={account.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{account.nickname}</div>
                    <div className="text-sm text-gray-500">{account.email}</div>
                    {account.hasCredentials && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 mt-1">
                        Credentials saved
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={account.status} />
                    {account.cooldownUntil && new Date(account.cooldownUntil) > new Date() && (
                      <div className="text-xs text-gray-500 mt-1">
                        Until {new Date(account.cooldownUntil).toLocaleTimeString()}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 w-40">
                    <div className="flex items-center gap-2">
                      <UsageBar percent={account.estimatedUsagePercent} />
                      <span className="text-sm text-gray-600 w-12">
                        {account.estimatedUsagePercent.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-900">{account.priority}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {account.lastActiveAt
                      ? new Date(account.lastActiveAt).toLocaleString()
                      : "Never"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {account.status !== "active" && (
                        <button
                          onClick={() => handleResetStatus(account.id)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                          title="Reset Status"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setEditingAccount(account);
                          setModalOpen(true);
                        }}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(account.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AccountModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingAccount(null);
        }}
        onSubmit={editingAccount ? handleUpdate : handleCreate}
        initialData={editingAccount || undefined}
        isEditing={!!editingAccount}
      />
    </div>
  );
}
