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
import WorkflowCard from "../components/WorkflowCard";
import ExecuteWorkflowModal from "../components/ExecuteWorkflowModal";
import { request } from "../api/client";

interface Workflow {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  createdAt: string;
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);

  const fetchWorkflows = async () => {
    try {
      const data = await request<{ workflows: Workflow[] }>({
        url: "/api/workflows",
        method: "GET",
      });
      setWorkflows(data.workflows);
    } catch (error) {
      console.error("Failed to fetch workflows:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
  }, []);

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
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Workflows</h1>
        <p className="text-gray-600">Manage and execute automation workflows</p>
      </div>

      {workflows.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              No workflows yet
            </h2>
            <p className="text-gray-600">
              Create your first workflow to get started with automation
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workflows.map((workflow) => (
            <WorkflowCard
              key={workflow.id}
              workflow={workflow}
              onExecute={handleExecute}
            />
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
    </div>
  );
}
