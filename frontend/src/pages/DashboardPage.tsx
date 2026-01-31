/**
 * DashboardPage
 *
 * 기획:
 * - 로그인 후 첫 랜딩 페이지
 * - 최근 워크플로우 실행 현황, 통계 표시
 *
 * 구조:
 * DashboardPage
 * ├── WelcomeSection
 * │   ├── 제목
 * │   └── 설명
 * └── QuickStats
 *     ├── TotalWorkflows
 *     ├── RecentExecutions
 *     ├── SuccessRate
 *     └── ActiveIntegrations
 */

import { useState, useEffect } from 'react';
import { StatCard } from '../components/dashboard/StatCard';
import { QuickActions } from '../components/dashboard/QuickActions';
import { ActivityFeed } from '../components/dashboard/ActivityFeed';
import { SkeletonStat } from '../components/ui/Skeleton';
import { ChartBarIcon, UsersIcon, CurrencyDollarIcon, LinkIcon } from '@heroicons/react/24/outline';
import { api } from '../api/client';

interface DashboardStats {
  totalWorkflows: number;
  recentExecutions: number;
  successRate: number;
  activeIntegrations: string[];
  pendingApprovals: number;
}

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState({
    account: true,
    slack: false,
    workflow: false,
  });

  useEffect(() => {
    async function fetchStats() {
      try {
        setIsLoading(true);
        const response = await api.get('/dashboard/stats');
        setStats(response.data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch dashboard stats:', err);
        setError('Failed to load stats');
      } finally {
        setIsLoading(false);
      }
    }
    fetchStats();
  }, []);

  const handleChecklistToggle = (key: keyof typeof checklist) => {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Dashboard
        </h1>
        <p className="text-gray-600">
          Welcome to Nubabel - AI-Powered Workflow Automation Platform
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {isLoading ? (
          <>
            <SkeletonStat />
            <SkeletonStat />
            <SkeletonStat />
            <SkeletonStat />
          </>
        ) : error ? (
          <div className="col-span-4 text-center py-4 text-gray-500">
            {error}
          </div>
        ) : (
          <>
            <StatCard
              title="Total Workflows"
              value={String(stats?.totalWorkflows ?? 0)}
              icon={<ChartBarIcon className="h-5 w-5" />}
              trend="neutral"
              change={0}
            />
            <StatCard
              title="Recent Executions"
              value={String(stats?.recentExecutions ?? 0)}
              icon={<UsersIcon className="h-5 w-5" />}
              trend="neutral"
              change={0}
            />
            <StatCard
              title="Success Rate"
              value={`${stats?.successRate ?? 0}%`}
              icon={<CurrencyDollarIcon className="h-5 w-5" />}
              trend="neutral"
              change={0}
            />
            <StatCard
              title="Active Integrations"
              value={String(stats?.activeIntegrations?.length ?? 0)}
              icon={<LinkIcon className="h-5 w-5" />}
              trend="neutral"
              change={0}
            />
          </>
        )}
      </div>

      {/* Two-column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <QuickActions />
        <ActivityFeed />
      </div>

      {/* Getting Started Checklist */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">
          🚀 Getting Started
        </h3>
        <p className="text-blue-800 mb-4">
          Complete these steps to start automating your workflows:
        </p>
        <div className="space-y-3">
          <label className="flex items-center space-x-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={checklist.account}
              onChange={() => handleChecklistToggle('account')}
              className="h-5 w-5 rounded border-blue-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span className={`text-blue-800 group-hover:text-blue-900 ${checklist.account ? 'line-through opacity-75' : ''}`}>
              Set up your account
            </span>
          </label>
          <label className="flex items-center space-x-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={checklist.slack}
              onChange={() => handleChecklistToggle('slack')}
              className="h-5 w-5 rounded border-blue-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span className={`text-blue-800 group-hover:text-blue-900 ${checklist.slack ? 'line-through opacity-75' : ''}`}>
              Configure your integrations (Slack, Notion, etc.)
            </span>
          </label>
          <label className="flex items-center space-x-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={checklist.workflow}
              onChange={() => handleChecklistToggle('workflow')}
              className="h-5 w-5 rounded border-blue-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span className={`text-blue-800 group-hover:text-blue-900 ${checklist.workflow ? 'line-through opacity-75' : ''}`}>
              Create and run your first workflow
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
