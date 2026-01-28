/**
 * WorkflowDetailPage
 *
 * Workflow detail view with execution history
 */

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { request } from "../api/client";

interface Workflow {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt?: string;
  config?: Record<string, unknown>;
}

interface Execution {
  id: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
}

export default function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchWorkflow = async () => {
      if (!id) return;
      try {
        const [workflowData, executionsData] = await Promise.all([
          request<{ workflow: Workflow }>({
            url: `/api/workflows/${id}`,
            method: "GET",
          }),
          request<{ executions: Execution[] }>({
            url: `/api/workflows/${id}/executions`,
            method: "GET",
          }),
        ]);
        setWorkflow(workflowData.workflow);
        setExecutions(executionsData.executions || []);
      } catch (error) {
        console.error("Failed to fetch workflow:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorkflow();
  }, [id]);

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

  if (!workflow) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900">Workflow not found</h2>
        <Link to="/workflows" className="text-indigo-600 hover:underline mt-4 inline-block">
          Back to workflows
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <Link
          to="/workflows"
          className="text-indigo-600 hover:underline text-sm mb-2 inline-block"
        >
          &larr; Back to workflows
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {workflow.name}
            </h1>
            {workflow.description && (
              <p className="text-gray-600">{workflow.description}</p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span
              className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${
                workflow.enabled
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {workflow.enabled ? "Enabled" : "Disabled"}
            </span>
            <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">
              Execute
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
            Created
          </h3>
          <p className="mt-2 text-lg text-gray-900">
            {new Date(workflow.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
            Last Updated
          </h3>
          <p className="mt-2 text-lg text-gray-900">
            {workflow.updatedAt
              ? new Date(workflow.updatedAt).toLocaleDateString()
              : "-"}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
            Total Executions
          </h3>
          <p className="mt-2 text-lg text-gray-900">{executions.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            Recent Executions
          </h2>
        </div>
        {executions.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-500">No executions yet</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Started
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {executions.slice(0, 10).map((execution) => {
                const duration =
                  execution.startedAt && execution.completedAt
                    ? Math.round(
                        (new Date(execution.completedAt).getTime() -
                          new Date(execution.startedAt).getTime()) /
                          1000
                      )
                    : null;

                return (
                  <tr key={execution.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                          execution.status
                        )}`}
                      >
                        {execution.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {execution.startedAt
                        ? new Date(execution.startedAt).toLocaleString()
                        : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {duration !== null ? `${duration}s` : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
