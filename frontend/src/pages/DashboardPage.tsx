/**
 * DashboardPage
 *
 * 기획:
 * - 로그인 후 첫 랜딩 페이지
 * - 현재는 단순 환영 메시지
 * - 향후: 최근 워크플로우 실행 현황, 통계 등
 *
 * 구조:
 * DashboardPage
 * ├── WelcomeSection
 * │   ├── 제목
 * │   └── 설명
 * └── QuickStats (추후 구현)
 *     ├── TotalWorkflows
 *     ├── RecentExecutions
 *     └── SuccessRate
 */

import { useState } from 'react';
import { StatCard } from '../components/dashboard/StatCard';
import { QuickActions } from '../components/dashboard/QuickActions';
import { ActivityFeed } from '../components/dashboard/ActivityFeed';
import { SkeletonStat } from '../components/ui/Skeleton';
import { ChartBarIcon, UsersIcon, CurrencyDollarIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export default function DashboardPage() {
  const [isLoading] = useState(false);
  const [checklist, setChecklist] = useState({
    account: true,
    slack: false,
    workflow: false,
  });

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
        ) : (
          <>
            <StatCard
              title="Total Runs"
              value="0"
              icon={<ChartBarIcon className="h-5 w-5" />}
              trend="neutral"
              change={0}
            />
            <StatCard
              title="Active Users"
              value="1"
              icon={<UsersIcon className="h-5 w-5" />}
              trend="neutral"
              change={0}
            />
            <StatCard
              title="Total Cost"
              value="$0.00"
              icon={<CurrencyDollarIcon className="h-5 w-5" />}
              trend="neutral"
              change={0}
            />
            <StatCard
              title="Errors"
              value="0"
              icon={<ExclamationTriangleIcon className="h-5 w-5" />}
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
