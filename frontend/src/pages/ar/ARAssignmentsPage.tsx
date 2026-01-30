/**
 * ARAssignmentsPage
 *
 * Assignment management page for agent-position relationships.
 */

import { useState } from "react";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
  ArrowPathIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { WorkloadBar } from "../../components/ar/WorkloadBar";
import { AgentHealthBadge } from "../../components/ar/AgentHealthIndicator";
import {
  useARAssignments,
  useARPositions,
  useUpdateAssignmentStatus,
  useTerminateAssignment,
} from "../../hooks/ar";
import type { AssignmentStatus } from "../../types/ar";

const statusColors: Record<AssignmentStatus, string> = {
  active: "bg-green-100 text-green-700",
  on_leave: "bg-yellow-100 text-yellow-700",
  suspended: "bg-orange-100 text-orange-700",
  terminated: "bg-red-100 text-red-700",
};

const typeLabels: Record<string, string> = {
  permanent: "Permanent",
  temporary: "Temporary",
  acting: "Acting",
};

export default function ARAssignmentsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const { data: positionsData } = useARPositions({ status: "active" });
  const { data, isLoading, refetch } = useARAssignments({
    status: statusFilter === "all" ? undefined : statusFilter,
    search: searchQuery || undefined,
  });

  const updateStatusMutation = useUpdateAssignmentStatus();
  const terminateMutation = useTerminateAssignment();

  const assignments = data?.assignments ?? [];
  const positions = positionsData?.positions ?? [];
  const selectedAssignment = assignments.find(a => a.id === selectedId);

  const getPositionTitle = (posId: string) => {
    return positions.find(p => p.id === posId)?.title ?? "Unknown Position";
  };

  const handleStatusChange = async (id: string, status: AssignmentStatus) => {
    try {
      await updateStatusMutation.mutateAsync({ id, status });
      refetch();
    } catch (error) {
      console.error("Failed to update status:", error);
    }
  };

  const handleTerminate = async (id: string) => {
    const reason = prompt("Reason for termination (optional):");
    try {
      await terminateMutation.mutateAsync({ id, reason: reason || undefined });
      if (selectedId === id) setSelectedId(null);
      refetch();
    } catch (error) {
      console.error("Failed to terminate:", error);
    }
  };

  const getHealthStatus = (workload: number) => {
    if (workload >= 0.9) return "critical";
    if (workload >= 0.8) return "warning";
    return "healthy";
  };

  // Filter by type if needed
  const filteredAssignments = typeFilter === "all"
    ? assignments
    : assignments.filter(a => a.assignmentType === typeFilter);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Assignments</h1>
          <p className="text-gray-600">Manage agent-position relationships</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <PlusIcon className="h-5 w-5" />
          Add Assignment
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="on_leave">On Leave</option>
          <option value="suspended">Suspended</option>
          <option value="terminated">Terminated</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="all">All Types</option>
          <option value="permanent">Permanent</option>
          <option value="temporary">Temporary</option>
          <option value="acting">Acting</option>
        </select>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Assignments Table */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Agent
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Position
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Workload
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="px-6 py-4">
                      <div className="animate-pulse h-4 bg-gray-200 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : filteredAssignments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <UserGroupIcon className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500">No assignments found</p>
                  </td>
                </tr>
              ) : (
                filteredAssignments.map(assignment => (
                  <tr
                    key={assignment.id}
                    onClick={() => setSelectedId(assignment.id)}
                    className={`cursor-pointer hover:bg-gray-50 ${selectedId === assignment.id ? 'bg-indigo-50' : ''}`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                          <span className="text-indigo-600 text-sm font-medium">
                            {assignment.agent?.name?.[0] ?? "A"}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">
                            {assignment.agent?.name ?? assignment.agentId}
                          </div>
                          <div className="text-xs text-gray-500">
                            {typeLabels[assignment.assignmentType]}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {getPositionTitle(assignment.positionId)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="w-24">
                        <WorkloadBar workload={assignment.workload} size="sm" showPercentage />
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full font-medium ${statusColors[assignment.status]}`}>
                        {assignment.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // TODO: Open reassign modal
                          alert("Reassign modal coming soon");
                        }}
                        className="text-indigo-600 hover:text-indigo-900 mr-3"
                        title="Reassign"
                      >
                        <ArrowPathIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Terminate this assignment?")) {
                            handleTerminate(assignment.id);
                          }
                        }}
                        className="text-red-600 hover:text-red-900"
                        title="Terminate"
                      >
                        <XCircleIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Assignment Details */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Details</h2>

          {selectedAssignment ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</label>
                <p className="text-gray-900 font-medium">
                  {selectedAssignment.agent?.name ?? selectedAssignment.agentId}
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Position</label>
                <p className="text-gray-700">{getPositionTitle(selectedAssignment.positionId)}</p>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Type</label>
                <p className="text-gray-700">{typeLabels[selectedAssignment.assignmentType]}</p>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Workload</label>
                <div className="mt-1">
                  <WorkloadBar workload={selectedAssignment.workload} showPercentage showStatus />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Health</label>
                <div className="mt-1">
                  <AgentHealthBadge status={getHealthStatus(selectedAssignment.workload)} />
                </div>
              </div>

              {selectedAssignment.performanceScore !== null && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Performance</label>
                  <p className="text-gray-900 font-medium">{selectedAssignment.performanceScore}/100</p>
                </div>
              )}

              {selectedAssignment.humanSupervisor && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Supervisor</label>
                  <p className="text-gray-700">{selectedAssignment.humanSupervisor}</p>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Start Date</label>
                <p className="text-gray-700 text-sm">
                  {selectedAssignment.startDate
                    ? new Date(selectedAssignment.startDate).toLocaleDateString()
                    : "Not set"}
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Status</label>
                <div className="mt-1">
                  <select
                    value={selectedAssignment.status}
                    onChange={(e) => handleStatusChange(selectedAssignment.id, e.target.value as AssignmentStatus)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="active">Active</option>
                    <option value="on_leave">On Leave</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div className="pt-4">
                <button
                  onClick={() => {
                    if (confirm("Terminate this assignment?")) {
                      handleTerminate(selectedAssignment.id);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                >
                  <XCircleIcon className="h-4 w-4" />
                  Terminate Assignment
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <UserGroupIcon className="h-12 w-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Select an assignment to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal Placeholder */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-lg font-semibold mb-4">Create Assignment</h2>
            <p className="text-gray-500 text-sm mb-4">Assignment creation modal coming soon.</p>
            <button
              onClick={() => setIsCreateModalOpen(false)}
              className="w-full px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
