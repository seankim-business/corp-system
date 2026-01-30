import { useEffect, useState, useCallback } from "react";
import {
  useN8nStore,
  N8nWorkflow,
  CreateWorkflowInput,
  UpdateWorkflowInput,
} from "../stores/n8nStore";

interface WorkflowFormData {
  name: string;
  description: string;
  category: string;
  tags: string;
  workflowJson: string;
  isActive: boolean;
}

const defaultWorkflowJson = JSON.stringify(
  {
    name: "New Workflow",
    nodes: [],
    connections: {},
    settings: {},
  },
  null,
  2,
);

function validateJson(jsonString: string): { valid: boolean; error?: string } {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed.name || typeof parsed.name !== "string") {
      return { valid: false, error: "Workflow JSON must have a 'name' field" };
    }
    if (!Array.isArray(parsed.nodes)) {
      return { valid: false, error: "Workflow JSON must have a 'nodes' array" };
    }
    if (typeof parsed.connections !== "object") {
      return { valid: false, error: "Workflow JSON must have a 'connections' object" };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid JSON format" };
  }
}

function WorkflowCard({
  workflow,
  onView,
  onEdit,
  onDelete,
  onExecute,
  onToggleActive,
}: {
  workflow: N8nWorkflow;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onExecute: () => void;
  onToggleActive: () => void;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 truncate">{workflow.name}</h3>
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
            {workflow.description || "No description"}
          </p>
        </div>
        <div className="ml-3 flex-shrink-0">
          <button
            onClick={onToggleActive}
            className={`px-2 py-1 text-xs font-medium rounded-full ${
              workflow.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
            }`}
          >
            {workflow.isActive ? "Active" : "Inactive"}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className="px-2 py-1 text-xs bg-indigo-100 text-indigo-800 rounded">
          {workflow.category}
        </span>
        {workflow.isSkill && (
          <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded">Skill</span>
        )}
      </div>

      {workflow.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {workflow.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
              {tag}
            </span>
          ))}
          {workflow.tags.length > 3 && (
            <span className="px-2 py-0.5 text-xs text-gray-500">+{workflow.tags.length - 3}</span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <div className="text-xs text-gray-500">{workflow._count?.executions ?? 0} executions</div>
        <div className="flex items-center gap-2">
          <button onClick={onView} className="text-gray-600 hover:text-gray-900 text-sm">
            View
          </button>
          <button onClick={onEdit} className="text-indigo-600 hover:text-indigo-800 text-sm">
            Edit
          </button>
          <button
            onClick={onExecute}
            className="px-3 py-1 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
          >
            Run
          </button>
          <button onClick={onDelete} className="text-red-600 hover:text-red-800 text-sm">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkflowListItem({
  workflow,
  onView,
  onEdit,
  onDelete,
  onExecute,
  onToggleActive,
}: {
  workflow: N8nWorkflow;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onExecute: () => void;
  onToggleActive: () => void;
}) {
  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3 hover:bg-gray-50 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-gray-900 truncate">{workflow.name}</h3>
          <span className="px-2 py-0.5 text-xs bg-indigo-100 text-indigo-800 rounded">
            {workflow.category}
          </span>
          {workflow.isSkill && (
            <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded">Skill</span>
          )}
        </div>
        <p className="text-sm text-gray-500 truncate mt-0.5">
          {workflow.description || "No description"}
        </p>
      </div>
      <div className="text-sm text-gray-500">{workflow._count?.executions ?? 0} runs</div>
      <button
        onClick={onToggleActive}
        className={`px-2 py-1 text-xs font-medium rounded-full ${
          workflow.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
        }`}
      >
        {workflow.isActive ? "Active" : "Inactive"}
      </button>
      <div className="flex items-center gap-2">
        <button onClick={onView} className="text-gray-600 hover:text-gray-900 text-sm">
          View
        </button>
        <button onClick={onEdit} className="text-indigo-600 hover:text-indigo-800 text-sm">
          Edit
        </button>
        <button
          onClick={onExecute}
          className="px-3 py-1 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
        >
          Run
        </button>
        <button onClick={onDelete} className="text-red-600 hover:text-red-800 text-sm">
          Delete
        </button>
      </div>
    </div>
  );
}

function WorkflowModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  title,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: WorkflowFormData) => void;
  initialData?: N8nWorkflow;
  title: string;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState<WorkflowFormData>({
    name: "",
    description: "",
    category: "uncategorized",
    tags: "",
    workflowJson: defaultWorkflowJson,
    isActive: false,
  });
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name,
        description: initialData.description || "",
        category: initialData.category,
        tags: initialData.tags.join(", "),
        workflowJson: JSON.stringify(initialData.workflowJson, null, 2),
        isActive: initialData.isActive,
      });
    } else {
      setFormData({
        name: "",
        description: "",
        category: "uncategorized",
        tags: "",
        workflowJson: defaultWorkflowJson,
        isActive: false,
      });
    }
    setJsonError(null);
  }, [initialData, isOpen]);

  const handleJsonChange = (value: string) => {
    setFormData((prev) => ({ ...prev, workflowJson: value }));
    const validation = validateJson(value);
    setJsonError(validation.valid ? null : (validation.error ?? null));
  };

  const handleSubmit = () => {
    const validation = validateJson(formData.workflowJson);
    if (!validation.valid) {
      setJsonError(validation.error ?? "Invalid JSON");
      return;
    }
    onSubmit(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="My Workflow"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Describe what this workflow does..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="uncategorized"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={formData.tags}
                onChange={(e) => setFormData((prev) => ({ ...prev, tags: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="slack, notifications"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
              className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <label htmlFor="isActive" className="text-sm text-gray-700">
              Active (workflow can be triggered)
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Workflow JSON *</label>
            <textarea
              value={formData.workflowJson}
              onChange={(e) => handleJsonChange(e.target.value)}
              rows={12}
              className={`w-full px-3 py-2 border rounded-lg font-mono text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                jsonError ? "border-red-300 bg-red-50" : "border-gray-300"
              }`}
              placeholder="Enter workflow JSON..."
            />
            {jsonError && <p className="mt-1 text-sm text-red-600">{jsonError}</p>}
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !formData.name || !!jsonError}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Saving..." : initialData ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExecuteModal({
  isOpen,
  onClose,
  onExecute,
  workflowName,
  isExecuting,
}: {
  isOpen: boolean;
  onClose: () => void;
  onExecute: (inputData: Record<string, unknown>) => void;
  workflowName: string;
  isExecuting: boolean;
}) {
  const [inputJson, setInputJson] = useState("{}");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleInputChange = (value: string) => {
    setInputJson(value);
    try {
      JSON.parse(value);
      setJsonError(null);
    } catch {
      setJsonError("Invalid JSON");
    }
  };

  const handleExecute = () => {
    try {
      const inputData = JSON.parse(inputJson);
      onExecute(inputData);
    } catch {
      setJsonError("Invalid JSON");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Execute: {workflowName}</h2>
        </div>

        <div className="p-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Input Data (JSON)</label>
          <textarea
            value={inputJson}
            onChange={(e) => handleInputChange(e.target.value)}
            rows={6}
            className={`w-full px-3 py-2 border rounded-lg font-mono text-sm focus:ring-2 focus:ring-indigo-500 ${
              jsonError ? "border-red-300 bg-red-50" : "border-gray-300"
            }`}
            placeholder="{}"
          />
          {jsonError && <p className="mt-1 text-sm text-red-600">{jsonError}</p>}
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleExecute}
            disabled={isExecuting || !!jsonError}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExecuting ? "Executing..." : "Execute"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  workflowName,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  workflowName: string;
  isLoading: boolean;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Delete Workflow</h2>
          <p className="text-gray-600">
            Are you sure you want to delete <strong>{workflowName}</strong>? This action cannot be
            undone.
          </p>
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {isLoading ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExecutionHistoryPanel({
  workflow,
  executions,
  onClose,
}: {
  workflow: N8nWorkflow;
  executions: { id: string; status: string; startedAt: string; completedAt?: string }[];
  onClose: () => void;
}) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "bg-green-100 text-green-800";
      case "error":
        return "bg-red-100 text-red-800";
      case "running":
        return "bg-blue-100 text-blue-800";
      case "waiting":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl z-40 flex flex-col">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Execution History</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
          Close
        </button>
      </div>
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <h3 className="font-medium text-gray-900">{workflow.name}</h3>
        <p className="text-sm text-gray-500">{workflow.category}</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {executions.length === 0 ? (
          <div className="p-4 text-center text-gray-500">No executions yet</div>
        ) : (
          <div className="divide-y divide-gray-200">
            {executions.slice(0, 10).map((exec) => (
              <div key={exec.id} className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(exec.status)}`}
                  >
                    {exec.status}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(exec.startedAt).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-gray-500">ID: {exec.id.slice(0, 8)}...</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function N8nWorkflowsPage() {
  const {
    workflows,
    categories,
    executions,
    isLoading,
    isExecuting,
    error,
    viewMode,
    filters,
    pagination,
    fetchWorkflows,
    fetchCategories,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    executeWorkflow,
    activateWorkflow,
    deactivateWorkflow,
    setFilters,
    setViewMode,
    setSelectedWorkflow,
    setPage,
    clearError,
  } = useN8nStore();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<N8nWorkflow | null>(null);
  const [executingWorkflow, setExecutingWorkflow] = useState<N8nWorkflow | null>(null);
  const [deletingWorkflow, setDeletingWorkflow] = useState<N8nWorkflow | null>(null);
  const [viewingWorkflow, setViewingWorkflow] = useState<N8nWorkflow | null>(null);

  useEffect(() => {
    fetchWorkflows();
    fetchCategories();
  }, [fetchWorkflows, fetchCategories]);

  const handleCreate = useCallback(
    async (formData: WorkflowFormData) => {
      const input: CreateWorkflowInput = {
        name: formData.name,
        description: formData.description || undefined,
        category: formData.category,
        tags: formData.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        workflowJson: JSON.parse(formData.workflowJson),
        isActive: formData.isActive,
      };
      await createWorkflow(input);
      setIsCreateModalOpen(false);
    },
    [createWorkflow],
  );

  const handleUpdate = useCallback(
    async (formData: WorkflowFormData) => {
      if (!editingWorkflow) return;
      const input: UpdateWorkflowInput = {
        name: formData.name,
        description: formData.description || undefined,
        category: formData.category,
        tags: formData.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        workflowJson: JSON.parse(formData.workflowJson),
        isActive: formData.isActive,
      };
      await updateWorkflow(editingWorkflow.id, input);
      setEditingWorkflow(null);
    },
    [editingWorkflow, updateWorkflow],
  );

  const handleDelete = useCallback(async () => {
    if (!deletingWorkflow) return;
    await deleteWorkflow(deletingWorkflow.id);
    setDeletingWorkflow(null);
  }, [deletingWorkflow, deleteWorkflow]);

  const handleExecute = useCallback(
    async (inputData: Record<string, unknown>) => {
      if (!executingWorkflow) return;
      await executeWorkflow(executingWorkflow.id, inputData);
      setExecutingWorkflow(null);
    },
    [executingWorkflow, executeWorkflow],
  );

  const handleToggleActive = useCallback(
    async (workflow: N8nWorkflow) => {
      if (workflow.isActive) {
        await deactivateWorkflow(workflow.id);
      } else {
        await activateWorkflow(workflow.id);
      }
    },
    [activateWorkflow, deactivateWorkflow],
  );

  const handleViewWorkflow = useCallback(
    (workflow: N8nWorkflow) => {
      setSelectedWorkflow(workflow);
      setViewingWorkflow(workflow);
    },
    [setSelectedWorkflow],
  );

  const totalPages = Math.ceil(pagination.total / pagination.limit);
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;

  return (
    <div className="relative">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">n8n Workflows</h1>
          <p className="text-gray-600 mt-1">Manage your n8n automation workflows</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
        >
          <span className="text-lg">+</span>
          Create Workflow
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={clearError} className="text-red-600 hover:text-red-800">
            Dismiss
          </button>
        </div>
      )}

      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <input
          type="text"
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
          placeholder="Search workflows..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
        <select
          value={filters.category}
          onChange={(e) => setFilters({ category: e.target.value })}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat.name} value={cat.name}>
              {cat.name} ({cat.count})
            </option>
          ))}
        </select>
        <select
          value={filters.isActive === null ? "" : String(filters.isActive)}
          onChange={(e) =>
            setFilters({
              isActive: e.target.value === "" ? null : e.target.value === "true",
            })
          }
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <div className="flex border border-gray-300 rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode("grid")}
            className={`px-3 py-2 ${viewMode === "grid" ? "bg-indigo-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
          >
            Grid
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`px-3 py-2 ${viewMode === "list" ? "bg-indigo-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
          >
            List
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600"></div>
            <p className="mt-4 text-gray-600">Loading workflows...</p>
          </div>
        </div>
      ) : workflows.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="text-6xl mb-4">&#9881;</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">No workflows found</h2>
            <p className="text-gray-600 mb-4">
              {filters.search || filters.category || filters.isActive !== null
                ? "Try adjusting your filters"
                : "Create your first n8n workflow to get started"}
            </p>
            {!filters.search && !filters.category && filters.isActive === null && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Create Workflow
              </button>
            )}
          </div>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflows.map((workflow) => (
            <WorkflowCard
              key={workflow.id}
              workflow={workflow}
              onView={() => handleViewWorkflow(workflow)}
              onEdit={() => setEditingWorkflow(workflow)}
              onDelete={() => setDeletingWorkflow(workflow)}
              onExecute={() => setExecutingWorkflow(workflow)}
              onToggleActive={() => handleToggleActive(workflow)}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {workflows.map((workflow) => (
            <WorkflowListItem
              key={workflow.id}
              workflow={workflow}
              onView={() => handleViewWorkflow(workflow)}
              onEdit={() => setEditingWorkflow(workflow)}
              onDelete={() => setDeletingWorkflow(workflow)}
              onExecute={() => setExecutingWorkflow(workflow)}
              onToggleActive={() => handleToggleActive(workflow)}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing {pagination.offset + 1}-
            {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(0, pagination.offset - pagination.limit))}
              disabled={pagination.offset === 0}
              className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="px-3 py-1 text-gray-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setPage(pagination.offset + pagination.limit)}
              disabled={currentPage >= totalPages}
              className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <WorkflowModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreate}
        title="Create Workflow"
        isLoading={isLoading}
      />

      <WorkflowModal
        isOpen={!!editingWorkflow}
        onClose={() => setEditingWorkflow(null)}
        onSubmit={handleUpdate}
        initialData={editingWorkflow ?? undefined}
        title="Edit Workflow"
        isLoading={isLoading}
      />

      <ExecuteModal
        isOpen={!!executingWorkflow}
        onClose={() => setExecutingWorkflow(null)}
        onExecute={handleExecute}
        workflowName={executingWorkflow?.name ?? ""}
        isExecuting={isExecuting}
      />

      <DeleteConfirmModal
        isOpen={!!deletingWorkflow}
        onClose={() => setDeletingWorkflow(null)}
        onConfirm={handleDelete}
        workflowName={deletingWorkflow?.name ?? ""}
        isLoading={isLoading}
      />

      {viewingWorkflow && (
        <ExecutionHistoryPanel
          workflow={viewingWorkflow}
          executions={executions}
          onClose={() => {
            setViewingWorkflow(null);
            setSelectedWorkflow(null);
          }}
        />
      )}
    </div>
  );
}
