/**
 * ARApprovalsPage
 *
 * Approval request management page with chain visualization.
 */

import { useState } from "react";
import {
  ClipboardDocumentCheckIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowUpCircleIcon,
} from "@heroicons/react/24/outline";
import {
  useARApprovals,
  useApproveRequest,
  useRejectRequest,
  useEscalateRequest,
} from "../../hooks/ar";
import type { ApprovalStatus } from "../../types/ar";

const statusColors: Record<ApprovalStatus, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-gray-100 text-gray-600",
  escalated: "bg-purple-100 text-purple-700",
};

const statusIcons: Record<ApprovalStatus, string> = {
  pending: "🟡",
  approved: "✅",
  rejected: "❌",
  expired: "⏰",
  escalated: "⬆️",
};

const levelLabels: Record<number, string> = {
  1: "Task",
  2: "Process",
  3: "Project",
  4: "Function",
  5: "Objective",
};

export default function ARApprovalsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useARApprovals({
    status: statusFilter === "all" ? undefined : statusFilter,
    requestType: typeFilter === "all" ? undefined : typeFilter,
    level: levelFilter === "all" ? undefined : parseInt(levelFilter),
  });

  const approveMutation = useApproveRequest();
  const rejectMutation = useRejectRequest();
  const escalateMutation = useEscalateRequest();

  const requests = data?.requests ?? [];
  const selectedRequest = requests.find(r => r.id === selectedId);

  const handleApprove = async (id: string) => {
    const note = prompt("Add a note (optional):");
    try {
      await approveMutation.mutateAsync({ id, note: note || undefined });
      refetch();
    } catch (error) {
      console.error("Failed to approve:", error);
    }
  };

  const handleReject = async (id: string) => {
    const note = prompt("Reason for rejection:");
    if (!note) {
      alert("Rejection reason is required");
      return;
    }
    try {
      await rejectMutation.mutateAsync({ id, note });
      refetch();
    } catch (error) {
      console.error("Failed to reject:", error);
    }
  };

  const handleEscalate = async (id: string) => {
    const reason = prompt("Reason for escalation:");
    try {
      await escalateMutation.mutateAsync({ id, reason: reason || undefined });
      refetch();
    } catch (error) {
      console.error("Failed to escalate:", error);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">AR Approvals</h1>
        <p className="text-gray-600">Manage approval requests for agent resources</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="escalated">Escalated</option>
          <option value="expired">Expired</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="all">All Types</option>
          <option value="task">Task</option>
          <option value="budget">Budget</option>
          <option value="assignment">Assignment</option>
          <option value="schedule">Schedule</option>
          <option value="leave">Leave</option>
          <option value="policy">Policy</option>
        </select>
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="all">All Levels</option>
          <option value="1">Level 1 (Task)</option>
          <option value="2">Level 2 (Process)</option>
          <option value="3">Level 3 (Project)</option>
          <option value="4">Level 4 (Function)</option>
          <option value="5">Level 5 (Objective)</option>
        </select>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Requests List */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Request
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type / Level
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Expires
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
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <ClipboardDocumentCheckIcon className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500">No approval requests found</p>
                  </td>
                </tr>
              ) : (
                requests.map(request => (
                  <tr
                    key={request.id}
                    onClick={() => setSelectedId(request.id)}
                    className={`cursor-pointer hover:bg-gray-50 ${selectedId === request.id ? 'bg-indigo-50' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{request.title}</div>
                      <div className="text-sm text-gray-500 truncate max-w-xs">{request.description}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm">
                        <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-700 text-xs">
                          {request.requestType}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Level {request.level} ({levelLabels[request.level]})
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full font-medium ${statusColors[request.status]}`}>
                        {statusIcons[request.status]} {request.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(request.expiresAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {request.status === "pending" && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApprove(request.id);
                            }}
                            className="text-green-600 hover:text-green-900 mr-2"
                            title="Approve"
                          >
                            <CheckCircleIcon className="h-5 w-5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReject(request.id);
                            }}
                            className="text-red-600 hover:text-red-900 mr-2"
                            title="Reject"
                          >
                            <XCircleIcon className="h-5 w-5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEscalate(request.id);
                            }}
                            className="text-purple-600 hover:text-purple-900"
                            title="Escalate"
                          >
                            <ArrowUpCircleIcon className="h-5 w-5" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Request Details */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Details</h2>

          {selectedRequest ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Title</label>
                <p className="text-gray-900 font-medium">{selectedRequest.title}</p>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Description</label>
                <p className="text-gray-700 text-sm">{selectedRequest.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Type</label>
                  <p className="text-gray-700 capitalize">{selectedRequest.requestType}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Level</label>
                  <p className="text-gray-700">{selectedRequest.level} ({levelLabels[selectedRequest.level]})</p>
                </div>
              </div>

              {selectedRequest.impactScope && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Impact Scope</label>
                  <p className="text-gray-700 capitalize">{selectedRequest.impactScope}</p>
                </div>
              )}

              {selectedRequest.estimatedValue && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Estimated Value</label>
                  <p className="text-gray-700">${selectedRequest.estimatedValue.toLocaleString()}</p>
                </div>
              )}

              {/* Approval Chain */}
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 block">
                  Approval Chain
                </label>
                <div className="space-y-2">
                  {selectedRequest.approverChain.map((approver, index) => {
                    const response = selectedRequest.responses.find(r => r.level === approver.level);
                    const isCurrent = approver.level === selectedRequest.currentLevel && selectedRequest.status === "pending";

                    return (
                      <div
                        key={index}
                        className={`flex items-center gap-2 p-2 rounded ${
                          isCurrent ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'
                        }`}
                      >
                        <span className="text-lg">
                          {response?.decision === "approved" ? "✅" :
                           response?.decision === "rejected" ? "❌" :
                           isCurrent ? "🟡" : "⚪"}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm font-medium">Level {approver.level}</p>
                          <p className="text-xs text-gray-500">{approver.roleTitle || approver.approverId}</p>
                        </div>
                        {response && (
                          <span className="text-xs text-gray-400">
                            {formatDate(response.timestamp)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {selectedRequest.status === "pending" && (
                <div className="pt-4 flex gap-2">
                  <button
                    onClick={() => handleApprove(selectedRequest.id)}
                    disabled={approveMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    <CheckCircleIcon className="h-4 w-4" />
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(selectedRequest.id)}
                    disabled={rejectMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    <XCircleIcon className="h-4 w-4" />
                    Reject
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <ClipboardDocumentCheckIcon className="h-12 w-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Select a request to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
