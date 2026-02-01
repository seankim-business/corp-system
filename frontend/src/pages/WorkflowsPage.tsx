/**
 * WorkflowsPage
 *
 * 기획:
 * - 워크플로우 목록 페이지
 * - GET /api/workflows로 목록 fetch
 * - 카드 그리드 형태로 표시
 * - Execute 버튼 클릭 → 모달 열림
 *
 * 구조:
 * WorkflowsPage
 * ├── PageHeader
 * ├── LoadingState | EmptyState | WorkflowGrid
 * │   └── WorkflowCard[]
 * └── ExecuteWorkflowModal
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import WorkflowCard from "../components/WorkflowCard";
import ExecuteWorkflowModal from "../components/ExecuteWorkflowModal";
import { ApiError, request } from "../api/client";

interface Workflow {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  createdAt: string;
}

interface CreateWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function CreateWorkflowModal({ isOpen, onClose, onSuccess }: CreateWorkflowModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Workflow name is required");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      await request<{ workflow: Workflow }>({
        url: "/api/workflows",
        method: "POST",
        data: {
          name: name.trim(),
          description: description.trim() || undefined,
          enabled: true,
          config: {},
        },
      });
      onSuccess();
      onClose();
      setName("");
      setDescription("");
    } catch (err) {
      let message = "Failed to create workflow";
      if (err instanceof ApiError) {
        if (err.status === 403) {
          message =
            "You don't have permission to create workflows. Please contact your organization admin to get elevated permissions.";
        } else {
          message = err.message;
        }
      }
      setError(message);
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Create Workflow</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Workflow"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this workflow does..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={isCreating}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorkflowsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const fetchWorkflows = async () => {
    try {
      setError(null);
      const data = await request<{ workflows: Workflow[] }>({
        url: "/api/workflows",
        method: "GET",
      });
      setWorkflows(data.workflows);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to fetch workflows";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
  }, []);

  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setIsCreateModalOpen(true);
      searchParams.delete('create');
      setSearchParams(searchParams);
    }
  }, [searchParams, setSearchParams]);

  const handleExecute = (workflowId: string) => {
    const workflow = workflows.find((w) => w.id === workflowId);
    if (workflow) {
      setSelectedWorkflow(workflow);
    }
  };

  const handleCloseModal = () => {
    setSelectedWorkflow(null);
  };

  const handleExecutionSuccess = () => {
    fetchWorkflows();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading workflows...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Workflows</h1>
          <p className="text-gray-600">Manage and execute automation workflows</p>
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
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {workflows.length === 0 && !error ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No workflows yet</h2>
            <p className="text-gray-600">
              Create your first workflow to get started with automation
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workflows.map((workflow) => (
            <WorkflowCard key={workflow.id} workflow={workflow} onExecute={handleExecute} />
          ))}
        </div>
      )}

      {selectedWorkflow && (
        <ExecuteWorkflowModal
          workflowId={selectedWorkflow.id}
          workflowName={selectedWorkflow.name}
          isOpen={true}
          onClose={handleCloseModal}
          onSuccess={handleExecutionSuccess}
        />
      )}

      <CreateWorkflowModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={fetchWorkflows}
      />
    </div>
  );
}
