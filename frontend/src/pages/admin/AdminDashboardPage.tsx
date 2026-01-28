/**
 * AdminDashboardPage
 *
 * Admin dashboard with system overview
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { request } from "../../api/client";

interface AdminStats {
  totalOrganizations: number;
  totalUsers: number;
  totalWorkflows: number;
  totalExecutions: number;
  activeAgents: number;
  systemHealth: "healthy" | "degraded" | "critical";
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await request<AdminStats>({
          url: "/api/admin/stats",
          method: "GET",
        });
        setStats(data);
      } catch (error) {
        console.error("Failed to fetch admin stats:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  const getHealthBadge = (health: string) => {
    switch (health) {
      case "healthy":
        return "bg-green-100 text-green-800";
      case "degraded":
        return "bg-yellow-100 text-yellow-800";
      case "critical":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
        <p className="text-gray-600">System overview and administration</p>
      </div>

      {/* System Health */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">System Status</h2>
            <p className="text-sm text-gray-500">Overall system health</p>
          </div>
          <span
            className={`inline-flex px-4 py-2 rounded-full text-sm font-medium capitalize ${getHealthBadge(
              stats?.systemHealth || "healthy"
            )}`}
          >
            {stats?.systemHealth || "healthy"}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
            Organizations
          </h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {stats?.totalOrganizations || 0}
          </p>
          <Link
            to="/admin/organizations"
            className="text-sm text-indigo-600 hover:underline mt-2 inline-block"
          >
            View all &rarr;
          </Link>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
            Total Users
          </h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {stats?.totalUsers || 0}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
            Active Agents
          </h3>
          <p className="mt-2 text-3xl font-bold text-indigo-600">
            {stats?.activeAgents || 0}
          </p>
          <Link
            to="/admin/agents"
            className="text-sm text-indigo-600 hover:underline mt-2 inline-block"
          >
            Manage agents &rarr;
          </Link>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
            Total Workflows
          </h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {stats?.totalWorkflows || 0}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
            Total Executions
          </h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {stats?.totalExecutions || 0}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
            Skills
          </h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">-</p>
          <Link
            to="/admin/skills"
            className="text-sm text-indigo-600 hover:underline mt-2 inline-block"
          >
            Manage skills &rarr;
          </Link>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            to="/admin/organizations"
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
          >
            <span className="text-2xl">🏢</span>
            <span className="font-medium text-gray-900">Manage Organizations</span>
          </Link>
          <Link
            to="/admin/agents"
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
          >
            <span className="text-2xl">🤖</span>
            <span className="font-medium text-gray-900">Manage Agents</span>
          </Link>
          <Link
            to="/admin/skills"
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
          >
            <span className="text-2xl">🛠️</span>
            <span className="font-medium text-gray-900">Manage Skills</span>
          </Link>
          <Link
            to="/settings"
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
          >
            <span className="text-2xl">⚙️</span>
            <span className="font-medium text-gray-900">System Settings</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
