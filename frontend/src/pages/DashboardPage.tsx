import { useState, useEffect } from "react";
import { useAuthStore } from "../stores/authStore";

interface DashboardStats {
  totalWorkflows: number;
  recentExecutions: number;
  successRate: number;
  activeIntegrations: string[];
  pendingApprovals: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuthStore();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/dashboard/stats", {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("Failed to fetch dashboard stats");
        }
        const data = await response.json();
        setStats(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const formatSuccessRate = (rate: number) => {
    if (rate === 0) return "-";
    return `${rate}%`;
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
        <p className="text-gray-600">
          Welcome back, {user?.name || "User"}! Here's your workflow overview.
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Total Workflows</h3>
          {loading ? (
            <div className="h-9 bg-gray-200 animate-pulse rounded" />
          ) : (
            <>
              <p className="text-3xl font-bold text-indigo-600">{stats?.totalWorkflows ?? 0}</p>
              <p className="text-sm text-gray-500 mt-2">
                {stats?.totalWorkflows === 0 ? "No workflows yet" : "Active workflows"}
              </p>
            </>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Recent Executions</h3>
          {loading ? (
            <div className="h-9 bg-gray-200 animate-pulse rounded" />
          ) : (
            <>
              <p className="text-3xl font-bold text-indigo-600">{stats?.recentExecutions ?? 0}</p>
              <p className="text-sm text-gray-500 mt-2">Last 24 hours</p>
            </>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Success Rate</h3>
          {loading ? (
            <div className="h-9 bg-gray-200 animate-pulse rounded" />
          ) : (
            <>
              <p className="text-3xl font-bold text-green-600">
                {formatSuccessRate(stats?.successRate ?? 0)}
              </p>
              <p className="text-sm text-gray-500 mt-2">Last 24 hours</p>
            </>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Pending Approvals</h3>
          {loading ? (
            <div className="h-9 bg-gray-200 animate-pulse rounded" />
          ) : (
            <>
              <p className="text-3xl font-bold text-orange-600">{stats?.pendingApprovals ?? 0}</p>
              <p className="text-sm text-gray-500 mt-2">
                {stats?.pendingApprovals === 0 ? "All caught up!" : "Awaiting response"}
              </p>
            </>
          )}
        </div>
      </div>

      {stats?.activeIntegrations && stats.activeIntegrations.length > 0 && (
        <div className="mt-6 bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Active Integrations</h3>
          <div className="flex flex-wrap gap-2">
            {stats.activeIntegrations.map((integration) => (
              <span
                key={integration}
                className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm font-medium capitalize"
              >
                {integration}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">Getting Started</h3>
        <p className="text-blue-800 mb-4">Start automating your workflows in 3 easy steps:</p>
        <ol className="list-decimal list-inside space-y-2 text-blue-800">
          <li>Create your first workflow</li>
          <li>Configure your integrations (Notion, Slack, etc.)</li>
          <li>Run and monitor your automation</li>
        </ol>
      </div>
    </div>
  );
}
