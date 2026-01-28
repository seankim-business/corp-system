/**
 * WorkflowDetailPage
 *
 * Shows details of a single workflow with edit capability
 * Route: /workflows/:id
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ApiError, request } from "../api/client";
import ExecuteWorkflowModal from "../components/ExecuteWorkflowModal";

interface Execution {
  id: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
}

interface SOPStep {
  id: string;
  title: string;
  description: string;
  expectedDuration: number;
  approvalRequired: boolean;
  order: number;
}

interface Workflow {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  executions?: Execution[];
}

export default function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showExecuteModal, setShowExecuteModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSOPModal, setShowSOPModal] = useState(false);
  const [isGeneratingSOP, setIsGeneratingSOP] = useState(false);
  const [generatedSOP, setGeneratedSOP] = useState<{ steps: SOPStep[] } | null>(null);
  const [sopError, setSOPError] = useState<string | null>(null);
  const [editingSteps, setEditingSteps] = useState<SOPStep[]>([]);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editEnabled, setEditEnabled] = useState(true);

  const fetchWorkflow = async () => {
    if (!id) return;
    try {
      const data = await request<{ workflow: Workflow }>({
        url: `/api/workflows/${id}`,
        method: "GET",
      });
      setWorkflow(data.workflow);
      setEditName(data.workflow.name);
      setEditDescription(data.workflow.description || "");
      setEditEnabled(data.workflow.enabled);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("Workflow not found");
      } else {
        setError("Failed to load workflow");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflow();
  }, [id]);

  const handleSave = async () => {
    if (!id || !editName.trim()) return;
    setIsSaving(true);
    try {
      const data = await request<{ workflow: Workflow }>({
        url: `/api/workflows/${id}`,
        method: "PUT",
        data: {
          name: editName.trim(),
          description: editDescription.trim() || null,
          enabled: editEnabled,
        },
      });
      setWorkflow(data.workflow);
      setIsEditing(false);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to save";
      alert(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      await request<{ success: boolean }>({
        url: `/api/workflows/${id}`,
        method: "DELETE",
      });
      navigate("/workflows");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to delete";
      alert(message);
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleGenerateSOP = async () => {
    if (!id) return;
    setIsGeneratingSOP(true);
    setSOPError(null);
    try {
      const data = await request<{ sop: { steps: SOPStep[] } }>({
        url: `/api/workflows/${id}/generate-sop`,
        method: "POST",
      });
      setGeneratedSOP(data.sop);
      setEditingSteps(data.sop.steps);
      setShowSOPModal(true);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to generate SOP";
      setSOPError(message);
    } finally {
      setIsGeneratingSOP(false);
    }
  };

  const handleSaveSOP = () => {
    if (!generatedSOP) return;
    alert(
      `SOP saved with ${editingSteps.length} steps. (This would save to database in production)`,
    );
    setShowSOPModal(false);
  };

  const handleUpdateStep = (index: number, field: keyof SOPStep, value: unknown) => {
    const updated = [...editingSteps];
    updated[index] = { ...updated[index], [field]: value };
    setEditingSteps(updated);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "running":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading workflow...</p>
        </div>
      </div>
    );
  }

  if (error || !workflow) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">😕</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{error || "Workflow not found"}</h2>
        <Link to="/workflows" className="text-indigo-600 hover:text-indigo-800">
          ← Back to Workflows
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm">
        <Link to="/workflows" className="text-indigo-600 hover:text-indigo-800">
          Workflows
        </Link>
        <span className="mx-2 text-gray-400">/</span>
        <span className="text-gray-600">{workflow.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-8 flex justify-between items-start">
        <div className="flex-1">
          {isEditing ? (
            <div className="space-y-4 max-w-xl">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-3xl font-bold w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="Workflow name"
              />
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="Description (optional)"
              />
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editEnabled}
                  onChange={(e) => setEditEnabled(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded"
                />
                <span className="text-sm text-gray-700">Enabled</span>
              </label>
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
                {workflow.name}
                <span
                  className={`text-sm px-2 py-1 rounded-full ${
                    workflow.enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {workflow.enabled ? "Enabled" : "Disabled"}
                </span>
              </h1>
              <p className="text-gray-600">{workflow.description || "No description"}</p>
            </>
          )}
        </div>

        <div className="flex gap-2">
          {isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Edit
              </button>
              <button
                onClick={handleGenerateSOP}
                disabled={isGeneratingSOP}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {isGeneratingSOP ? "Generating..." : "Generate SOP"}
              </button>
              <button
                onClick={() => setShowExecuteModal(true)}
                disabled={!workflow.enabled}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Execute
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Created</h3>
          <p className="text-lg font-semibold text-gray-900">
            {new Date(workflow.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Last Updated</h3>
          <p className="text-lg font-semibold text-gray-900">
            {new Date(workflow.updatedAt).toLocaleDateString()}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Total Executions</h3>
          <p className="text-lg font-semibold text-gray-900">{workflow.executions?.length || 0}</p>
        </div>
      </div>

      {/* Recent Executions */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Executions</h2>
        </div>
        {workflow.executions && workflow.executions.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Started
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {workflow.executions.map((exec) => {
                const duration =
                  exec.startedAt && exec.completedAt
                    ? Math.round(
                        (new Date(exec.completedAt).getTime() -
                          new Date(exec.startedAt).getTime()) /
                          1000,
                      )
                    : null;
                return (
                  <tr key={exec.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                          exec.status,
                        )}`}
                      >
                        {exec.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {exec.startedAt ? new Date(exec.startedAt).toLocaleString() : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {duration !== null ? `${duration}s` : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <Link
                        to={`/executions/${exec.id}`}
                        className="text-indigo-600 hover:text-indigo-800"
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="px-6 py-12 text-center text-gray-500">
            No executions yet. Click "Execute" to run this workflow.
          </div>
        )}
      </div>

      {/* Execute Modal */}
      {showExecuteModal && (
        <ExecuteWorkflowModal
          workflowId={workflow.id}
          workflowName={workflow.name}
          isOpen={true}
          onClose={() => setShowExecuteModal(false)}
          onSuccess={() => {
            setShowExecuteModal(false);
            fetchWorkflow();
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Delete Workflow?</h2>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete "{workflow.name}"? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SOP Generation Modal */}
      {showSOPModal && generatedSOP && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 my-8 p-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Generated SOP</h2>

            {sopError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                {sopError}
              </div>
            )}

            <div className="space-y-4 max-h-96 overflow-y-auto mb-6">
              {editingSteps.map((step, index) => (
                <div key={step.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Step {index + 1}: Title
                      </label>
                      <input
                        type="text"
                        value={step.title}
                        onChange={(e) => handleUpdateStep(index, "title", e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Duration (minutes)
                      </label>
                      <input
                        type="number"
                        value={step.expectedDuration}
                        onChange={(e) =>
                          handleUpdateStep(index, "expectedDuration", parseInt(e.target.value))
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={step.description}
                      onChange={(e) => handleUpdateStep(index, "description", e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={step.approvalRequired}
                      onChange={(e) =>
                        handleUpdateStep(index, "approvalRequired", e.target.checked)
                      }
                      className="w-4 h-4 text-purple-600 rounded"
                    />
                    <span className="text-sm text-gray-700">Requires Approval</span>
                  </label>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowSOPModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSOP}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                Save SOP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
