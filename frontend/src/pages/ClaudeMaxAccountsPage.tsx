import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  Trash2,
  Edit2,
  RotateCcw,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
  Link,
  ExternalLink,
} from "lucide-react";
import { api } from "../api/client";

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

interface EditAccountFormData {
  nickname: string;
  priority: number;
}

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

function EditAccountModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: EditAccountFormData) => Promise<void>;
  initialData: ClaudeMaxAccount;
}) {
  const [formData, setFormData] = useState<EditAccountFormData>({
    nickname: initialData.nickname,
    priority: initialData.priority,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFormData({
      nickname: initialData.nickname,
      priority: initialData.priority,
    });
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
        <h2 className="text-xl font-semibold mb-4">Edit Account</h2>

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
              value={initialData.email}
              disabled
              className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-gray-500"
            />
            <p className="text-xs text-gray-400 mt-1">Email is set when connecting the account</p>
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
            <div className="flex items-center gap-2 text-sm">
              <span
                className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                  initialData.hasCredentials
                    ? "bg-green-100 text-green-800"
                    : "bg-yellow-100 text-yellow-800"
                }`}
              >
                {initialData.hasCredentials ? "Credentials saved" : "No credentials"}
              </span>
              {!initialData.hasCredentials && (
                <span className="text-gray-500">
                  Use "Connect Account" to add credentials
                </span>
              )}
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
              {loading ? "Saving..." : "Update"}
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
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ClaudeMaxAccount | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const { data } = await api.get<{ accounts: ClaudeMaxAccount[]; summary: PoolSummary }>(
        "/api/claude-max-accounts",
      );
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

  // Listen for messages from connect popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "claude-connect-success") {
        fetchAccounts();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [fetchAccounts]);

  const handleConnectAccount = () => {
    // Open in a popup window
    const width = 700;
    const height = 800;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;
    window.open(
      "/claude-connect",
      "claude-connect",
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
    );
  };

  const handleUpdate = async (data: EditAccountFormData) => {
    if (!editingAccount) return;
    await api.patch(`/api/claude-max-accounts/${editingAccount.id}`, {
      nickname: data.nickname,
      priority: data.priority,
    });
    await fetchAccounts();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this account?")) return;
    await api.delete(`/api/claude-max-accounts/${id}`);
    await fetchAccounts();
  };

  const handleResetStatus = async (id: string) => {
    await api.post(`/api/claude-max-accounts/${id}/reset-status`);
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
            onClick={handleConnectAccount}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center gap-2"
          >
            <Link className="w-4 h-4" />
            Connect Claude Account
          </button>
        </div>
      </div>

      {/* Quick Connect Banner */}
      {accounts.length === 0 && (
        <div className="mb-6 p-6 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg text-white">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-white/20 rounded-lg">
              <ExternalLink className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-1">Get Started with Claude Max</h3>
              <p className="text-indigo-100 mb-4">
                Connect your Claude Max subscription to enable AI-powered workflows. The connection
                process takes less than a minute.
              </p>
              <button
                onClick={handleConnectAccount}
                className="px-4 py-2 bg-white text-indigo-600 rounded-md hover:bg-indigo-50 font-medium"
              >
                Connect Your First Account
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
          {error}
        </div>
      )}

      {summary && accounts.length > 0 && (
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

      {accounts.length > 0 && (
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
              {accounts.map((account) => (
                <tr key={account.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{account.nickname}</div>
                    <div className="text-sm text-gray-500">{account.email}</div>
                    {account.hasCredentials && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 mt-1">
                        Connected
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
                          setEditModalOpen(true);
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingAccount && (
        <EditAccountModal
          isOpen={editModalOpen}
          onClose={() => {
            setEditModalOpen(false);
            setEditingAccount(null);
          }}
          onSubmit={handleUpdate}
          initialData={editingAccount}
        />
      )}
    </div>
  );
}
