/**
 * SOP Drafts Page
 * Review and manage auto-generated SOP drafts from patterns
 */

import { useState, useEffect } from "react";

interface SOPDraftStep {
  id: string;
  name: string;
  type: "automated" | "manual" | "approval";
  description: string;
  agentId?: string;
  toolName?: string;
}

interface SOPDraft {
  id: string;
  name: string;
  description: string;
  function: string;
  status: "draft" | "pending_review" | "approved" | "rejected";
  confidence: number;
  steps: SOPDraftStep[];
  sourcePatternId: string;
  sourceType: "sequence" | "cluster" | "time";
  generatedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

export default function SOPDraftsPage() {
  const [drafts, setDrafts] = useState<SOPDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDraft, setSelectedDraft] = useState<SOPDraft | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);

  useEffect(() => {
    fetchDrafts();
  }, [statusFilter]);

  const fetchDrafts = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      params.set("limit", "50");

      const response = await fetch(`/api/sop-drafts?${params}`, {
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to fetch drafts");

      const data = await response.json();
      setDrafts(data.drafts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const approveDraft = async (draftId: string) => {
    try {
      const response = await fetch(`/api/sop-drafts/${draftId}/approve`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to approve draft");

      // Update local state
      setDrafts(
        drafts.map((d) =>
          d.id === draftId
            ? { ...d, status: "approved" as const, reviewedAt: new Date().toISOString() }
            : d,
        ),
      );
      setSelectedDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve");
    }
  };

  const rejectDraft = async (draftId: string) => {
    try {
      const response = await fetch(`/api/sop-drafts/${draftId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: rejectReason }),
      });

      if (!response.ok) throw new Error("Failed to reject draft");

      setDrafts(
        drafts.map((d) =>
          d.id === draftId
            ? {
                ...d,
                status: "rejected" as const,
                reviewedAt: new Date().toISOString(),
                rejectionReason: rejectReason,
              }
            : d,
        ),
      );
      setShowRejectModal(false);
      setRejectReason("");
      setSelectedDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject");
    }
  };

  const downloadYAML = async (draft: SOPDraft) => {
    try {
      const response = await fetch(`/api/sop-drafts/${draft.id}/yaml`, {
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to download YAML");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${draft.name.replace(/\s+/g, "_")}.yaml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft":
        return "bg-gray-100 text-gray-700";
      case "pending_review":
        return "bg-yellow-100 text-yellow-700";
      case "approved":
        return "bg-green-100 text-green-700";
      case "rejected":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getStepIcon = (type: string) => {
    switch (type) {
      case "automated":
        return "⚡";
      case "manual":
        return "✋";
      case "approval":
        return "✅";
      default:
        return "•";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">SOP Drafts</h1>
            <p className="text-gray-600 mt-1">Review and approve auto-generated SOPs</p>
          </div>
          <a
            href="/patterns"
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            View Patterns
          </a>
        </div>

        {/* Status Filters */}
        <div className="flex gap-2 mb-6">
          {["all", "draft", "pending_review", "approved", "rejected"].map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-4 py-2 rounded-lg ${
                statusFilter === filter
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              {filter === "all"
                ? "All"
                : filter
                    .replace("_", " ")
                    .replace(/\b\w/g, (l) => l.toUpperCase())}
            </button>
          ))}
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Main Content */}
        <div className="flex gap-6">
          {/* Draft List */}
          <div className="w-1/3">
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              </div>
            ) : drafts.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-6 text-center">
                <p className="text-gray-600">No drafts found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {drafts.map((draft) => (
                  <div
                    key={draft.id}
                    onClick={() => setSelectedDraft(draft)}
                    className={`bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow ${
                      selectedDraft?.id === draft.id ? "ring-2 ring-blue-500" : ""
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-medium text-gray-900 truncate">{draft.name}</h3>
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(draft.status)}`}>
                        {draft.status.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 truncate">{draft.description}</p>
                    <div className="flex gap-2 mt-2 text-xs text-gray-500">
                      <span>{draft.function}</span>
                      <span>•</span>
                      <span>{draft.steps.length} steps</span>
                      <span>•</span>
                      <span>{Math.round(draft.confidence * 100)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Draft Detail */}
          <div className="flex-1">
            {selectedDraft ? (
              <div className="bg-white rounded-lg shadow">
                {/* Draft Header */}
                <div className="p-6 border-b">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{selectedDraft.name}</h2>
                      <p className="text-gray-600 mt-1">{selectedDraft.description}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full ${getStatusColor(selectedDraft.status)}`}>
                      {selectedDraft.status.replace("_", " ")}
                    </span>
                  </div>

                  <div className="flex gap-4 mt-4 text-sm text-gray-500">
                    <span>Function: {selectedDraft.function}</span>
                    <span>•</span>
                    <span>Source: {selectedDraft.sourceType}</span>
                    <span>•</span>
                    <span>Confidence: {Math.round(selectedDraft.confidence * 100)}%</span>
                  </div>
                </div>

                {/* Steps */}
                <div className="p-6">
                  <h3 className="font-medium text-gray-900 mb-4">Workflow Steps</h3>
                  <div className="space-y-3">
                    {selectedDraft.steps.map((step, index) => (
                      <div key={step.id} className="flex gap-3 items-start">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span>{getStepIcon(step.type)}</span>
                            <span className="font-medium">{step.name}</span>
                            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                              {step.type}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">{step.description}</p>
                          {step.agentId && (
                            <p className="text-xs text-gray-400 mt-1">Agent: {step.agentId}</p>
                          )}
                          {step.toolName && (
                            <p className="text-xs text-gray-400 mt-1">Tool: {step.toolName}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rejection Reason */}
                {selectedDraft.status === "rejected" && selectedDraft.rejectionReason && (
                  <div className="px-6 pb-6">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <h4 className="font-medium text-red-700 mb-1">Rejection Reason</h4>
                      <p className="text-red-600">{selectedDraft.rejectionReason}</p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                {(selectedDraft.status === "draft" || selectedDraft.status === "pending_review") && (
                  <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
                    <button
                      onClick={() => downloadYAML(selectedDraft)}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-white"
                    >
                      Download YAML
                    </button>
                    <button
                      onClick={() => {
                        setShowRejectModal(true);
                      }}
                      className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => approveDraft(selectedDraft.id)}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      Approve
                    </button>
                  </div>
                )}

                {selectedDraft.status === "approved" && (
                  <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
                    <button
                      onClick={() => downloadYAML(selectedDraft)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Download YAML
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <div className="text-gray-400 text-5xl mb-4">📋</div>
                <p className="text-gray-600">Select a draft to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && selectedDraft && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Reject Draft</h3>
            <p className="text-gray-600 mb-4">Please provide a reason for rejecting this draft:</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter rejection reason..."
              className="w-full border border-gray-300 rounded-lg p-3 mb-4 h-32"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason("");
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => rejectDraft(selectedDraft.id)}
                disabled={!rejectReason.trim()}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
