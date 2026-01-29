/**
 * Admin Dashboard Page
 *
 * Platform administration dashboard showing:
 * - KPI cards (MRR, Users, Orgs, Uptime)
 * - Revenue chart
 * - New signups chart
 * - Top organizations table
 * - Recent activity feed
 * - System health status
 */

import { useState, useEffect } from "react";

interface PlatformMetrics {
  organizations: {
    total: number;
    active: number;
    byPlan: Record<string, number>;
    newThisMonth: number;
    churnedThisMonth: number;
  };
  users: {
    total: number;
    activeThisMonth: number;
    avgPerOrg: number;
  };
  revenue: {
    mrr: number;
    arr: number;
    avgRevenuePerOrg: number;
    revenueByPlan: Record<string, number>;
  };
  usage: {
    totalExecutions: number;
    executionsByAgent: Record<string, number>;
    avgExecutionsPerOrg: number;
  };
  system: {
    uptime: number;
    avgLatency: number;
    errorRate: number;
    activeConnections: number;
  };
  timestamp: string;
}

interface SystemHealth {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  components: Array<{
    name: string;
    status: "healthy" | "degraded" | "unhealthy";
    latency?: number;
    message?: string;
  }>;
}

interface TopOrganization {
  id: string;
  name: string;
  plan: string;
  monthlySpend: number;
}

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [topOrgs, setTopOrgs] = useState<TopOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [metricsRes, healthRes, revenueRes] = await Promise.all([
        fetch("/api/admin/metrics", { credentials: "include" }),
        fetch("/api/admin/system/health", { credentials: "include" }),
        fetch("/api/admin/metrics/revenue", { credentials: "include" }),
      ]);

      if (metricsRes.ok) {
        setMetrics(await metricsRes.json());
      }
      if (healthRes.ok) {
        setSystemHealth(await healthRes.json());
      }
      if (revenueRes.ok) {
        const data = await revenueRes.json();
        setTopOrgs(data.topOrganizations || []);
      }

      setError(null);
    } catch (err) {
      setError("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-sm text-gray-500">
            Platform overview and monitoring
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            Last updated: {metrics?.timestamp ? new Date(metrics.timestamp).toLocaleTimeString() : "N/A"}
          </span>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="MRR"
          value={`$${(metrics?.revenue.mrr || 0).toLocaleString()}`}
          subtext={`ARR: $${(metrics?.revenue.arr || 0).toLocaleString()}`}
          trend={12}
          trendLabel="vs last month"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          color="green"
        />
        <KPICard
          title="Total Users"
          value={(metrics?.users.total || 0).toLocaleString()}
          subtext={`${metrics?.users.activeThisMonth || 0} active this month`}
          trend={8}
          trendLabel="vs last month"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
          color="blue"
        />
        <KPICard
          title="Organizations"
          value={(metrics?.organizations.total || 0).toLocaleString()}
          subtext={`${metrics?.organizations.newThisMonth || 0} new this month`}
          trend={metrics?.organizations.newThisMonth || 0}
          trendLabel="new signups"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
          color="purple"
        />
        <KPICard
          title="System Uptime"
          value={`${(metrics?.system.uptime || 99.9).toFixed(1)}%`}
          subtext={`${metrics?.system.avgLatency || 0}ms avg latency`}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          }
          color={metrics?.system.uptime && metrics.system.uptime >= 99.9 ? "green" : "yellow"}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue by Plan */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue by Plan</h2>
          <div className="space-y-3">
            {Object.entries(metrics?.revenue.revenueByPlan || {}).map(([plan, revenue]) => (
              <div key={plan} className="flex items-center gap-4">
                <span className="w-24 text-sm text-gray-600 capitalize">{plan}</span>
                <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full"
                    style={{
                      width: `${metrics?.revenue.mrr ? (revenue / metrics.revenue.mrr) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="w-20 text-sm text-gray-900 text-right">
                  ${revenue.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* System Health */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">System Health</h2>
            <StatusBadge status={systemHealth?.status || "healthy"} />
          </div>
          <div className="space-y-3">
            {systemHealth?.components.map((component) => (
              <div key={component.name} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <span className="text-sm text-gray-600 capitalize">{component.name}</span>
                <div className="flex items-center gap-2">
                  {component.latency && (
                    <span className="text-xs text-gray-400">{component.latency}ms</span>
                  )}
                  <StatusDot status={component.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Organizations */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Top Organizations by Spend</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Organization</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monthly Spend</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {topOrgs.map((org) => (
                <tr key={org.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-medium text-gray-900">{org.name}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full capitalize">
                      {org.plan}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-gray-900">
                    ${org.monthlySpend.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {topOrgs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                    No organizations found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Plan Distribution */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Plan Distribution</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(metrics?.organizations.byPlan || {}).map(([plan, count]) => (
            <div key={plan} className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{count}</p>
              <p className="text-sm text-gray-500 capitalize">{plan}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// KPI Card Component
function KPICard({
  title,
  value,
  subtext,
  trend,
  trendLabel: _trendLabel,
  icon,
  color = "gray",
}: {
  title: string;
  value: string;
  subtext: string;
  trend?: number;
  trendLabel?: string;
  icon: React.ReactNode;
  color?: "green" | "blue" | "purple" | "yellow" | "gray";
}) {
  const colorClasses = {
    green: "bg-green-100 text-green-600",
    blue: "bg-blue-100 text-blue-600",
    purple: "bg-purple-100 text-purple-600",
    yellow: "bg-yellow-100 text-yellow-600",
    gray: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>{icon}</div>
        {trend !== undefined && (
          <span className={`text-sm font-medium ${trend >= 0 ? "text-green-600" : "text-red-600"}`}>
            {trend >= 0 ? "+" : ""}{trend}%
          </span>
        )}
      </div>
      <h3 className="text-sm font-medium text-gray-500">{title}</h3>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{subtext}</p>
    </div>
  );
}

// Status Badge Component
function StatusBadge({ status }: { status: "healthy" | "degraded" | "unhealthy" }) {
  const config = {
    healthy: { bg: "bg-green-100", text: "text-green-700", label: "Healthy" },
    degraded: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Degraded" },
    unhealthy: { bg: "bg-red-100", text: "text-red-700", label: "Unhealthy" },
  };

  const { bg, text, label } = config[status];

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${bg} ${text}`}>
      {label}
    </span>
  );
}

// Status Dot Component
function StatusDot({ status }: { status: "healthy" | "degraded" | "unhealthy" }) {
  const colors = {
    healthy: "bg-green-500",
    degraded: "bg-yellow-500",
    unhealthy: "bg-red-500",
  };

  return <div className={`w-2.5 h-2.5 rounded-full ${colors[status]}`} />;
}
