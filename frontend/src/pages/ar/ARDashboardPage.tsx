/**
 * ARDashboardPage
 *
 * Main dashboard for AR (Agent Resource) Management System.
 * Displays overview statistics, workload distribution, issues, and recommendations.
 */

import { Link } from "react-router-dom";
import {
  BuildingOfficeIcon,
  BriefcaseIcon,
  UserGroupIcon,
  ClipboardDocumentCheckIcon,
  ExclamationTriangleIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import { ARStatCard } from "../../components/ar/ARStatCard";
import { WorkloadBar } from "../../components/ar/WorkloadBar";
import { IssueAlert } from "../../components/ar/IssueAlert";
import { RecommendationCard } from "../../components/ar/RecommendationCard";
import { SkeletonStat } from "../../components/ui/Skeleton";
import {
  useARDepartments,
  useARPositions,
  useARAssignments,
  usePendingApprovals,
  useARWorkload,
  useARIssues,
  useARRecommendations,
} from "../../hooks/ar";

export default function ARDashboardPage() {
  const { data: departmentsData, isLoading: deptLoading } = useARDepartments({ status: "active" });
  const { data: positionsData, isLoading: posLoading } = useARPositions({ status: "active" });
  const { data: assignmentsData, isLoading: assignLoading } = useARAssignments({ status: "active" });
  const { data: approvalsData, isLoading: approvalsLoading } = usePendingApprovals();
  const { data: workloadData, isLoading: workloadLoading } = useARWorkload();
  const { data: issuesData, isLoading: issuesLoading } = useARIssues();
  const { data: recommendationsData, isLoading: recsLoading } = useARRecommendations();

  const isStatsLoading = deptLoading || posLoading || assignLoading || approvalsLoading;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          AR Dashboard
        </h1>
        <p className="text-gray-600">
          Agent Resource Management Overview
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {isStatsLoading ? (
          <>
            <SkeletonStat />
            <SkeletonStat />
            <SkeletonStat />
            <SkeletonStat />
          </>
        ) : (
          <>
            <Link to="/ar/departments">
              <ARStatCard
                title="Departments"
                value={departmentsData?.departments?.length ?? 0}
                icon={<BuildingOfficeIcon className="h-6 w-6" />}
                color="blue"
                description="Active departments"
              />
            </Link>
            <Link to="/ar/positions">
              <ARStatCard
                title="Positions"
                value={positionsData?.positions?.length ?? 0}
                icon={<BriefcaseIcon className="h-6 w-6" />}
                color="green"
                description="Total positions"
              />
            </Link>
            <Link to="/ar/assignments">
              <ARStatCard
                title="Assignments"
                value={assignmentsData?.assignments?.length ?? 0}
                icon={<UserGroupIcon className="h-6 w-6" />}
                color="purple"
                description="Active assignments"
              />
            </Link>
            <Link to="/ar/approvals">
              <ARStatCard
                title="Pending Approvals"
                value={approvalsData?.requests?.length ?? 0}
                icon={<ClipboardDocumentCheckIcon className="h-6 w-6" />}
                color={approvalsData?.requests?.length ? "yellow" : "gray"}
                description="Awaiting action"
              />
            </Link>
          </>
        )}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Workload Distribution */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Workload Distribution</h2>
            <Link
              to="/ar/workload"
              className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              View All <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>

          {workloadLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                  <div className="h-2.5 bg-gray-100 rounded w-full" />
                </div>
              ))}
            </div>
          ) : workloadData?.snapshots?.length ? (
            <div className="space-y-4">
              {workloadData.snapshots.slice(0, 6).map((agent) => (
                <div key={agent.agentId}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">{agent.agentName}</span>
                    <span className={`text-xs font-medium ${
                      agent.status === 'overloaded' ? 'text-red-600' :
                      agent.status === 'underutilized' ? 'text-yellow-600' : 'text-green-600'
                    }`}>
                      {agent.status}
                    </span>
                  </div>
                  <WorkloadBar workload={agent.currentWorkload} showPercentage />
                </div>
              ))}

              {workloadData.stats && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {Math.round(workloadData.stats.avgWorkload * 100)}%
                      </p>
                      <p className="text-xs text-gray-500">Avg Workload</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-red-600">
                        {workloadData.stats.overloaded}
                      </p>
                      <p className="text-xs text-gray-500">Overloaded</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-yellow-600">
                        {workloadData.stats.underutilized}
                      </p>
                      <p className="text-xs text-gray-500">Underutilized</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No workload data available</p>
          )}
        </div>

        {/* Recent Issues */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">Recent Issues</h2>
              {(issuesData?.summary?.total ?? 0) > 0 && (
                <span className="bg-red-100 text-red-700 text-xs font-medium px-2 py-0.5 rounded-full">
                  {issuesData?.summary?.total}
                </span>
              )}
            </div>
          </div>

          {issuesLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse bg-gray-100 rounded-lg p-4">
                  <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-full" />
                </div>
              ))}
            </div>
          ) : issuesData?.issues?.length ? (
            <div className="space-y-3">
              {issuesData.issues.slice(0, 4).map((issue) => (
                <IssueAlert key={issue.id} issue={issue} compact />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <ExclamationTriangleIcon className="h-12 w-12 text-green-400 mx-auto mb-2" />
              <p className="text-gray-500">No issues detected</p>
              <p className="text-xs text-gray-400">All systems operating normally</p>
            </div>
          )}
        </div>
      </div>

      {/* Recommendations Section */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Recommendations</h2>
        </div>

        {recsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse bg-gray-100 rounded-lg p-4">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-full mb-1" />
                <div className="h-3 bg-gray-200 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : recommendationsData?.recommendations?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recommendationsData.recommendations.slice(0, 4).map((rec) => (
              <RecommendationCard
                key={rec.id}
                recommendation={rec}
                onAction={(action, params) => {
                  console.log('Action triggered:', action, params);
                  // TODO: Handle recommendation actions
                }}
              />
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm text-center py-4">
            No recommendations at this time
          </p>
        )}
      </div>
    </div>
  );
}
