/**
 * AccountPoolStatus Component
 *
 * Displays Claude Max account pool with usage bars, cooldown status,
 * and real-time updates when accounts are selected.
 */

import { useState, useEffect } from "react";

export interface ClaudeMaxAccount {
  id: string;
  nickname: string;
  email: string;
  status: "active" | "rate_limited" | "exhausted" | "cooldown";
  estimatedUsagePercent: number;
  cooldownUntil: string | null;
  priority: number;
  lastActiveAt: string | null;
  isSelected?: boolean;
}

interface AccountPoolStatusProps {
  accounts: ClaudeMaxAccount[];
  selectedAccountId?: string;
  onRefresh?: () => void;
}

export default function AccountPoolStatus({
  accounts,
  selectedAccountId,
  onRefresh,
}: AccountPoolStatusProps) {
  const [now, setNow] = useState(Date.now());

  // Update "now" every minute for cooldown countdowns
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const getStatusEmoji = (status: string) => {
    switch (status) {
      case "active":
        return "🟢";
      case "rate_limited":
        return "🟡";
      case "exhausted":
        return "🔴";
      case "cooldown":
        return "🟠";
      default:
        return "⚪";
    }
  };

  const getUsageBarColor = (percent: number) => {
    if (percent < 50) return "bg-green-500";
    if (percent < 75) return "bg-yellow-500";
    if (percent < 90) return "bg-orange-500";
    return "bg-red-500";
  };

  const formatCooldown = (cooldownUntil: string | null) => {
    if (!cooldownUntil) return null;
    const cooldownTime = new Date(cooldownUntil).getTime();
    const remaining = cooldownTime - now;
    if (remaining <= 0) return null;

    const minutes = Math.floor(remaining / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  const sortedAccounts = [...accounts].sort((a, b) => {
    // Selected account first
    if (a.id === selectedAccountId) return -1;
    if (b.id === selectedAccountId) return 1;
    // Then by priority
    return b.priority - a.priority;
  });

  const activeCount = accounts.filter((a) => a.status === "active").length;
  const avgUsage =
    accounts.length > 0
      ? Math.round(accounts.reduce((sum, a) => sum + a.estimatedUsagePercent, 0) / accounts.length)
      : 0;

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <span>🎰</span>
              <span>Claude Max Pool</span>
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {activeCount}/{accounts.length} active • {avgUsage}% avg usage
            </p>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
              title="Refresh"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Account List */}
      <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
        {sortedAccounts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-3xl mb-2">📭</div>
            <p>No accounts configured</p>
          </div>
        ) : (
          sortedAccounts.map((account) => {
            const cooldownRemaining = formatCooldown(account.cooldownUntil);
            const isSelected = account.id === selectedAccountId;

            return (
              <div
                key={account.id}
                className={`p-3 rounded-lg border-2 transition ${
                  isSelected
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getStatusEmoji(account.status)}</span>
                    <div>
                      <span className="font-medium text-gray-900">{account.nickname}</span>
                      {isSelected && (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-blue-500 text-white rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-medium text-gray-900">
                      {account.estimatedUsagePercent.toFixed(1)}%
                    </span>
                    {cooldownRemaining && (
                      <div className="text-xs text-orange-600">⏳ {cooldownRemaining}</div>
                    )}
                  </div>
                </div>

                {/* Usage Bar */}
                <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${getUsageBarColor(
                      account.estimatedUsagePercent,
                    )}`}
                    style={{ width: `${Math.min(account.estimatedUsagePercent, 100)}%` }}
                  />
                </div>

                {/* Footer Info */}
                <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                  <span className="truncate max-w-[150px]" title={account.email}>
                    {account.email}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full ${
                      account.status === "active"
                        ? "bg-green-100 text-green-700"
                        : account.status === "rate_limited"
                          ? "bg-yellow-100 text-yellow-700"
                          : account.status === "exhausted"
                            ? "bg-red-100 text-red-700"
                            : "bg-orange-100 text-orange-700"
                    }`}
                  >
                    {account.status.replace("_", " ")}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
