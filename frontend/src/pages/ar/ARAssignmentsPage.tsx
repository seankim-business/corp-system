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
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { WorkloadBar } from "../../components/ar/WorkloadBar";
import { AgentHealthBadge } from "../../components/ar/AgentHealthIndicator";
import {
  useARAssignments,
  useARPositions,
  useUpdateAssignmentStatus,
  useTerminateAssignment,
  useCreateAssignment,
} from "../../hooks/ar";
import { useAgents } from "../../hooks/useAgents";
import type { AssignmentStatus, AssignmentType, CreateAssignmentInput } from "../../types/ar";

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
  const { data: agentsData } = useAgents();
  const { data, isLoading, refetch } = useARAssignments({
    status: statusFilter === "all" ? undefined : statusFilter,
    search: searchQuery || undefined,
  });

  const updateStatusMutation = useUpdateAssignmentStatus();
  const terminateMutation = useTerminateAssignment();
  const createMutation = useCreateAssignment();

  // Form state
  const [formData, setFormData] = useState<CreateAssignmentInput>({
    agentId: "",
    positionId: "",
    humanSupervisor: "",
    assignmentType: "permanent",
    workload: 0,
    status: "active",
  });
  const [formError, setFormError] = useState<string | null>(null);

  const assignments = data?.assignments ?? [];
  const positions = positionsData?.positions ?? [];
  const agents = agentsData?.agents ?? [];
  const selectedAssignment = assignments.find(a => a.id === selectedId);

  const resetForm = () => {
    setFormData({
      agentId: "",
      positionId: "",
      humanSupervisor: "",
      assignmentType: "permanent",
      workload: 0,
      status: "active",
    });
    setFormError(null);
  };

  const openCreateModal = () => {
    resetForm();
    setIsCreateModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.agentId) {
      setFormError("Please select an agent");
      return;
    }
    if (!formData.positionId) {
      setFormError("Please select a position");
      return;
    }

    try {
      await createMutation.mutateAsync(formData);
      setIsCreateModalOpen(false);
      resetForm();
      refetch();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to create assignment");
    }
  };

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
          onClick={openCreateModal}
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

      {/* Create Assignment Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Create Assignment</h2>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {formError}
                </div>
              )}

              {/* Agent Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Agent <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.agentId}
                  onChange={(e) => setFormData({ ...formData, agentId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                >
                  <option value="">Select an agent...</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.displayName || agent.name} ({agent.type})
                    </option>
                  ))}
                </select>
                {agents.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">No agents available. Create agents first.</p>
                )}
              </div>

              {/* Position Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Position <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.positionId}
                  onChange={(e) => setFormData({ ...formData, positionId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                >
                  <option value="">Select a position...</option>
                  {positions.map((pos) => (
                    <option key={pos.id} value={pos.id}>
                      {pos.title}
                    </option>
                  ))}
                </select>
                {positions.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">No positions available. Create positions first.</p>
                )}
              </div>

              {/* Assignment Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Assignment Type
                </label>
                <select
                  value={formData.assignmentType}
                  onChange={(e) => setFormData({ ...formData, assignmentType: e.target.value as AssignmentType })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="permanent">Permanent</option>
                  <option value="temporary">Temporary</option>
                  <option value="acting">Acting</option>
                </select>
              </div>

              {/* Human Supervisor */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Human Supervisor (optional)
                </label>
                <input
                  type="text"
                  value={formData.humanSupervisor || ""}
                  onChange={(e) => setFormData({ ...formData, humanSupervisor: e.target.value })}
                  placeholder="Enter supervisor name or ID"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {/* Initial Workload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Initial Workload: {Math.round((formData.workload || 0) * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={(formData.workload || 0) * 100}
                  onChange={(e) => setFormData({ ...formData, workload: parseInt(e.target.value) / 100 })}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date (optional)
                </label>
                <input
                  type="date"
                  value={formData.startDate || ""}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {/* End Date (for temporary/acting) */}
              {formData.assignmentType !== "permanent" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={formData.endDate || ""}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              )}

              {/* Initial Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Initial Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as AssignmentStatus })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="active">Active</option>
                  <option value="on_leave">On Leave</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>

              {/* Form Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createMutation.isPending ? "Creating..." : "Create Assignment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
