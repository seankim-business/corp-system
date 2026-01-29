import { useState, useEffect } from "react";
import { useAuthStore } from "../stores/authStore";

interface AgentCost {
  agentId: string;
  agentName?: string;
  totalCostCents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  requestCount: number;
}

interface CostSummary {
  organizationId: string;
  totalCostCents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  requestCount: number;
  budgetCents: number | null;
  budgetUsedPercent: number;
  byAgent: AgentCost[];
  byModel: Record<string, { costCents: number; requests: number }>;
}

interface DailyTrend {
  date: string;
  totalCostCents: number;
  requestCount: number;
}

interface BudgetStatus {
  organizationId: string;
  budgetCents: number | null;
  spentCents: number;
  remainingCents: number;
  usedPercent: number;
  status: "ok" | "warning" | "critical" | "exceeded";
}

export default function CostDashboardPage() {
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [dailyTrend, setDailyTrend] = useState<DailyTrend[]>([]);
  const [budgetStatus, setBudgetStatus] = useState<BudgetStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<"day" | "week" | "month">("month");
  const [newBudget, setNewBudget] = useState<string>("");
  const [savingBudget, setSavingBudget] = useState(false);
  const { user: _user } = useAuthStore();

  useEffect(() => {
    fetchCostData();
  }, [period]);

  const fetchCostData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [summaryRes, trendRes, budgetRes] = await Promise.all([
        fetch(`/api/costs/summary?period=${period}`, { credentials: "include" }),
        fetch("/api/costs/daily?days=30", { credentials: "include" }),
        fetch("/api/costs/budget", { credentials: "include" }),
      ]);

      if (!summaryRes.ok || !trendRes.ok || !budgetRes.ok) {
        throw new Error("Failed to fetch cost data");
      }

      const [summaryData, trendData, budgetData] = await Promise.all([
        summaryRes.json(),
        trendRes.json(),
        budgetRes.json(),
      ]);

      setSummary(summaryData.data);
      setDailyTrend(trendData.data.trend);
      setBudgetStatus(budgetData.data);

      if (budgetData.data.budgetCents) {
        setNewBudget((budgetData.data.budgetCents / 100).toString());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBudget = async () => {
    try {
      setSavingBudget(true);
      const budgetCents = newBudget ? Math.round(parseFloat(newBudget) * 100) : null;

      const res = await fetch("/api/costs/budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ budgetCents }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to update budget");
      }

      await fetchCostData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update budget");
    } finally {
      setSavingBudget(false);
    }
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  const getStatusColor = (status: BudgetStatus["status"]) => {
    switch (status) {
      case "exceeded":
        return "bg-red-500";
      case "critical":
        return "bg-orange-500";
      case "warning":
        return "bg-yellow-500";
      default:
        return "bg-green-500";
    }
  };

  const getStatusBgColor = (status: BudgetStatus["status"]) => {
    switch (status) {
      case "exceeded":
        return "bg-red-100 text-red-800";
      case "critical":
        return "bg-orange-100 text-orange-800";
      case "warning":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-green-100 text-green-800";
    }
  };

  const getMaxDailyCost = () => {
    return Math.max(...dailyTrend.map((d) => d.totalCostCents), 1);
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Cost Dashboard</h1>
        <p className="text-gray-600">Monitor and manage your AI agent spending.</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Budget Overview Card */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Monthly Budget</h2>
          {budgetStatus && (
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBgColor(budgetStatus.status)}`}
            >
              {budgetStatus.status === "exceeded"
                ? "Budget Exceeded"
                : budgetStatus.status === "critical"
                  ? "Critical"
                  : budgetStatus.status === "warning"
                    ? "Warning"
                    : "On Track"}
            </span>
          )}
        </div>

        {loading ? (
          <div className="h-20 bg-gray-200 animate-pulse rounded" />
        ) : budgetStatus ? (
          <>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-bold text-gray-900">
                {formatCurrency(budgetStatus.spentCents)}
              </span>
              {budgetStatus.budgetCents && (
                <span className="text-xl text-gray-500">
                  / {formatCurrency(budgetStatus.budgetCents)}
                </span>
              )}
              <span className="text-lg text-gray-500">({budgetStatus.usedPercent}%)</span>
            </div>

            {/* Progress Bar */}
            {budgetStatus.budgetCents && (
              <div className="w-full bg-gray-200 rounded-full h-4 mb-4">
                <div
                  className={`h-4 rounded-full transition-all ${getStatusColor(budgetStatus.status)}`}
                  style={{ width: `${Math.min(budgetStatus.usedPercent, 100)}%` }}
                />
              </div>
            )}

            <p className="text-gray-600">
              {budgetStatus.budgetCents
                ? `${formatCurrency(budgetStatus.remainingCents)} remaining this month`
                : "No budget limit set"}
            </p>
          </>
        ) : (
          <p className="text-gray-500">No budget data available</p>
        )}

        {/* Budget Settings */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Set Monthly Budget (USD)
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                type="number"
                value={newBudget}
                onChange={(e) => setNewBudget(e.target.value)}
                placeholder="500.00"
                className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <button
              onClick={handleSaveBudget}
              disabled={savingBudget}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {savingBudget ? "Saving..." : "Save"}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Leave empty to remove budget limit. Alerts at 80%, 90%, and 100%.
          </p>
        </div>
      </div>

      {/* Period Selector */}
      <div className="mb-6 flex gap-2">
        {(["day", "week", "month"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              period === p
                ? "bg-indigo-600 text-white"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            {p === "day" ? "Today" : p === "week" ? "This Week" : "This Month"}
          </button>
        ))}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Total Cost</h3>
          {loading ? (
            <div className="h-8 bg-gray-200 animate-pulse rounded" />
          ) : (
            <p className="text-2xl font-bold text-indigo-600">
              {formatCurrency(summary?.totalCostCents ?? 0)}
            </p>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Total Requests</h3>
          {loading ? (
            <div className="h-8 bg-gray-200 animate-pulse rounded" />
          ) : (
            <p className="text-2xl font-bold text-indigo-600">
              {formatNumber(summary?.requestCount ?? 0)}
            </p>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Input Tokens</h3>
          {loading ? (
            <div className="h-8 bg-gray-200 animate-pulse rounded" />
          ) : (
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(summary?.totalInputTokens ?? 0)}
            </p>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Output Tokens</h3>
          {loading ? (
            <div className="h-8 bg-gray-200 animate-pulse rounded" />
          ) : (
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(summary?.totalOutputTokens ?? 0)}
            </p>
          )}
        </div>
      </div>

      {/* Agent Cost Breakdown */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Cost by Agent</h2>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-gray-200 animate-pulse rounded" />
            ))}
          </div>
        ) : summary?.byAgent && summary.byAgent.length > 0 ? (
          <div className="space-y-4">
            {summary.byAgent.map((agent) => {
              const percent =
                summary.totalCostCents > 0
                  ? Math.round((agent.totalCostCents / summary.totalCostCents) * 100)
                  : 0;
              return (
                <div key={agent.agentId} className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                    <span className="text-sm">🤖</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-medium text-gray-900">
                        {agent.agentName || agent.agentId.slice(0, 8)}
                      </span>
                      <span className="text-sm text-gray-600">
                        {formatCurrency(agent.totalCostCents)} ({percent}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="h-2 bg-indigo-600 rounded-full transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatNumber(agent.requestCount)} requests
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-gray-500">No agent cost data available</p>
        )}
      </div>

      {/* Daily Trend Chart */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Daily Cost Trend (Last 30 Days)</h2>

        {loading ? (
          <div className="h-48 bg-gray-200 animate-pulse rounded" />
        ) : dailyTrend.length > 0 ? (
          <div className="h-48 flex items-end gap-1">
            {dailyTrend.slice(-30).map((day) => {
              const height =
                day.totalCostCents > 0
                  ? Math.max((day.totalCostCents / getMaxDailyCost()) * 100, 4)
                  : 2;
              return (
                <div
                  key={day.date}
                  className="flex-1 group relative"
                  title={`${day.date}: ${formatCurrency(day.totalCostCents)}`}
                >
                  <div
                    className="bg-indigo-500 hover:bg-indigo-600 rounded-t transition-all cursor-pointer"
                    style={{ height: `${height}%` }}
                  />
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <div className="bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap">
                      {day.date}: {formatCurrency(day.totalCostCents)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-gray-500">No trend data available</p>
        )}
      </div>

      {/* Model Breakdown */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Cost by Model</h2>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-gray-200 animate-pulse rounded" />
            ))}
          </div>
        ) : summary?.byModel && Object.keys(summary.byModel).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Model
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    Cost
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    Requests
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    Avg/Request
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {Object.entries(summary.byModel)
                  .sort(([, a], [, b]) => b.costCents - a.costCents)
                  .map(([model, data]) => (
                    <tr key={model}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{model}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600">
                        {formatCurrency(data.costCents)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600">
                        {formatNumber(data.requests)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600">
                        {formatCurrency(data.requests > 0 ? Math.round(data.costCents / data.requests) : 0)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500">No model cost data available</p>
        )}
      </div>
    </div>
  );
}
