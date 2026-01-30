/**
 * ARAnalyticsPage
 *
 * Analytics dashboard for AR performance metrics.
 */

import { useState } from "react";
import {
  ChartBarIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { ARStatCard } from "../../components/ar/ARStatCard";
import { AgentHealthBadge } from "../../components/ar/AgentHealthIndicator";
import { WorkloadBar } from "../../components/ar/WorkloadBar";
import { SkeletonStat } from "../../components/ui/Skeleton";
import {
  useARAnalyticsReport,
  useARHealthCheck,
  useARCoachingNeeds,
} from "../../hooks/ar";

export default function ARAnalyticsPage() {
  const [periodDays, setPeriodDays] = useState(30);

  const { data: reportData, isLoading: reportLoading } = useARAnalyticsReport(periodDays);
  const { data: healthData, isLoading: healthLoading } = useARHealthCheck();
  const { data: coachingData, isLoading: coachingLoading } = useARCoachingNeeds();

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">AR Analytics</h1>
          <p className="text-gray-600">Performance metrics and insights</p>
        </div>
        <select
          value={periodDays}
          onChange={(e) => setPeriodDays(parseInt(e.target.value))}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {reportLoading ? (
          <>
            <SkeletonStat />
            <SkeletonStat />
            <SkeletonStat />
            <SkeletonStat />
          </>
        ) : (
          <>
            <ARStatCard
              title="Tasks Completed"
              value={reportData?.metrics?.completedTasks ?? 0}
              icon={<CheckCircleIcon className="h-6 w-6" />}
              color="green"
              trend={reportData?.trends?.completion && reportData.trends.completion > 0 ? "up" : "down"}
              change={reportData?.trends?.completion ?? 0}
            />
            <ARStatCard
              title="Avg Performance"
              value={`${Math.round(reportData?.metrics?.avgPerformance ?? 0)}%`}
              icon={<ChartBarIcon className="h-6 w-6" />}
              color="blue"
              trend={reportData?.trends?.performance && reportData.trends.performance > 0 ? "up" : "down"}
              change={reportData?.trends?.performance ?? 0}
            />
            <ARStatCard
              title="Total Cost"
              value={`$${(reportData?.metrics?.totalCost ?? 0).toLocaleString()}`}
              icon={<CurrencyDollarIcon className="h-6 w-6" />}
              color="purple"
              trend={reportData?.trends?.cost && reportData.trends.cost < 0 ? "up" : "down"}
              change={reportData?.trends?.cost ?? 0}
            />
            <ARStatCard
              title="Cost/Task"
              value={`$${(reportData?.metrics?.costPerTask ?? 0).toFixed(2)}`}
              icon={<UserGroupIcon className="h-6 w-6" />}
              color="gray"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Agent Health Status */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Agent Health Status</h2>

          {healthLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="animate-pulse flex items-center gap-4">
                  <div className="h-10 w-10 bg-gray-200 rounded-full" />
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                    <div className="h-2 bg-gray-100 rounded w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : healthData?.agents?.length ? (
            <div className="space-y-4">
              {healthData.agents.map((agent) => (
                <div key={agent.agentId} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                    <span className="text-indigo-600 font-medium">
                      {agent.agentName[0]}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900">{agent.agentName}</span>
                      <AgentHealthBadge status={agent.status} size="sm" />
                    </div>
                    <WorkloadBar workload={agent.workload} size="sm" showPercentage />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">No health data available</p>
          )}
        </div>

        {/* Coaching Needs */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Coaching Needs</h2>

          {coachingLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse bg-gray-100 rounded-lg p-4">
                  <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-full" />
                </div>
              ))}
            </div>
          ) : coachingData?.agents?.length ? (
            <div className="space-y-3">
              {coachingData.agents.map((agent) => (
                <div
                  key={agent.agentId}
                  className={`p-4 rounded-lg border ${
                    agent.priority === 'high' ? 'bg-red-50 border-red-200' :
                    agent.priority === 'medium' ? 'bg-yellow-50 border-yellow-200' :
                    'bg-blue-50 border-blue-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">{agent.agentName}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      agent.priority === 'high' ? 'bg-red-100 text-red-700' :
                      agent.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {agent.priority}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {agent.needs.map((need, index) => (
                      <li key={index} className="text-sm text-gray-600 flex items-start gap-2">
                        <span className="text-gray-400">•</span>
                        {need}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <CheckCircleIcon className="h-12 w-12 text-green-400 mx-auto mb-2" />
              <p className="text-gray-500">All agents performing well</p>
              <p className="text-xs text-gray-400">No coaching needs identified</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
