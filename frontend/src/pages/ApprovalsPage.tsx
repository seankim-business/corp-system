/**
 * ApprovalsPage
 *
 * Pending approvals management
 */

import { useEffect, useState } from "react";
import { request } from "../api/client";

interface Approval {
  id: string;
  type: string;
  title: string;
  description?: string;
  requestedBy: string;
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchApprovals = async () => {
    try {
      const data = await request<{ approvals: Approval[] }>({
        url: "/api/approvals",
        method: "GET",
      });
      setApprovals(data.approvals || []);
    } catch (error) {
      console.error("Failed to fetch approvals:", error);
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  const handleApprove = async (id: string) => {
    try {
      await request({
        url: `/api/approvals/${id}/approve`,
        method: "POST",
      });
      fetchApprovals();
    } catch (error) {
      console.error("Failed to approve:", error);
      setError(error instanceof Error ? error.message : "Failed to approve");
    }
  };

  const handleReject = async (id: string) => {
    try {
      await request({
        url: `/api/approvals/${id}/reject`,
        method: "POST",
      });
      fetchApprovals();
    } catch (error) {
      console.error("Failed to reject:", error);
      setError(error instanceof Error ? error.message : "Failed to reject");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading approvals...</p>
        </div>
      </div>
    );
  }

  const pendingApprovals = approvals.filter((a) => a.status === "pending");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Approvals</h1>
        <p className="text-gray-600">Review and manage pending approval requests</p>
      </div>

      {error && <div className="text-red-500 p-4">{error}</div>}

      {pendingApprovals.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              All caught up!
            </h2>
            <p className="text-gray-600">
              No pending approvals at the moment
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingApprovals.map((approval) => (
            <div
              key={approval.id}
              className="bg-white rounded-lg shadow p-6 flex items-center justify-between"
            >
              <div>
                <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 mb-2">
                  {approval.type}
                </span>
                <h3 className="text-lg font-semibold text-gray-900">
                  {approval.title}
                </h3>
                {approval.description && (
                  <p className="text-gray-600 mt-1">{approval.description}</p>
                )}
                <p className="text-sm text-gray-500 mt-2">
                  Requested by {approval.requestedBy} on{" "}
                  {new Date(approval.requestedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleReject(approval.id)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleApprove(approval.id)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
                >
                  Approve
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
