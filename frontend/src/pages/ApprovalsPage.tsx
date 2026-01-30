import { useCallback, useEffect, useState } from "react";
import { ApiError, request } from "../api/client";

interface Approval {
  id: string;
  requesterId: string;
  approverId: string;
  fallbackApproverId?: string | null;
  type: "budget" | "deployment" | "content";
  title: string;
  description: string;
  context?: Record<string, unknown> | null;
  status: "pending" | "approved" | "rejected" | "expired";
  responseNote?: string | null;
  expiresAt: string;
  respondedAt?: string | null;
  createdAt: string;
}

interface PaginatedResponse {
  approvals: Approval[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

type StatusFilter = "pending" | "approved" | "rejected" | "expired" | "all";
type TypeFilter = "budget" | "deployment" | "content" | "all";

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  const fetchApprovals = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await request<PaginatedResponse>({
        url: "/api/approvals",
        method: "GET",
        params: {
          status: statusFilter,
          type: typeFilter,
          page: pagination.page,
          limit: 20,
        },
      });
      setApprovals(data.approvals);
      setPagination({
        page: data.pagination.page,
        total: data.pagination.total,
        totalPages: data.pagination.totalPages,
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to fetch approvals";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, typeFilter, pagination.page]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const handleRespond = async (approvalId: string, action: "approved" | "rejected") => {
    setRespondingTo(approvalId);

    try {
      await request({
        url: `/api/approvals/${approvalId}/respond`,
        method: "PUT",
        data: { action },
      });
      fetchApprovals();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to respond to approval";
      setError(message);
    } finally {
      setRespondingTo(null);
    }
  };

  const getStatusBadge = (status: Approval["status"]) => {
    const styles: Record<Approval["status"], string> = {
      pending: "bg-yellow-100 text-yellow-800",
      approved: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
      expired: "bg-gray-100 text-gray-800",
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status]}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getTypeBadge = (type: Approval["type"]) => {
    const styles: Record<Approval["type"], { bg: string; emoji: string }> = {
      budget: { bg: "bg-blue-100 text-blue-800", emoji: "money" },
      deployment: { bg: "bg-purple-100 text-purple-800", emoji: "rocket" },
      content: { bg: "bg-orange-100 text-orange-800", emoji: "document" },
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[type].bg}`}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  if (isLoading && approvals.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading approvals...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Approvals</h1>
        <p className="text-gray-600">Review and respond to approval requests</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StatusFilter);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="expired">Expired</option>
            <option value="all">All</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as TypeFilter);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Types</option>
            <option value="budget">Budget</option>
            <option value="deployment">Deployment</option>
            <option value="content">Content</option>
          </select>
        </div>
      </div>

      {approvals.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="text-6xl mb-4">
              {statusFilter === "pending" ? "📥" : "✅"}
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {statusFilter === "pending" ? "No pending approvals" : "No approvals found"}
            </h2>
            <p className="text-gray-600">
              {statusFilter === "pending"
                ? "You're all caught up!"
                : "Try changing the filters to see more approvals."}
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Expires
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {approvals.map((approval) => (
                <tr key={approval.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{approval.title}</div>
                    <div className="text-sm text-gray-500 truncate max-w-xs">
                      {approval.description}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">{getTypeBadge(approval.type)}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(approval.status)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {isExpired(approval.expiresAt) ? (
                      <span className="text-red-600">Expired</span>
                    ) : (
                      formatDate(approval.expiresAt)
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {approval.status === "pending" && !isExpired(approval.expiresAt) ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRespond(approval.id, "approved")}
                          disabled={respondingTo === approval.id}
                          className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          {respondingTo === approval.id ? "..." : "Approve"}
                        </button>
                        <button
                          onClick={() => handleRespond(approval.id, "rejected")}
                          disabled={respondingTo === approval.id}
                          className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                        >
                          {respondingTo === approval.id ? "..." : "Reject"}
                        </button>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">
                        {approval.respondedAt ? formatDate(approval.respondedAt) : "-"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {pagination.totalPages > 1 && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                  disabled={pagination.page <= 1}
                  className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                  disabled={pagination.page >= pagination.totalPages}
                  className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
