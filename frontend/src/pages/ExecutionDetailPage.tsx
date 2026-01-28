/**
 * ExecutionDetailPage
 *
 * Execution detail view with logs and status
 */

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { request } from "../api/client";

interface ExecutionStep {
  id: string;
  name: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  output?: string;
  error?: string;
}

interface Execution {
  id: string;
  workflowId: string;
  workflowName?: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  steps?: ExecutionStep[];
}

export default function ExecutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [execution, setExecution] = useState<Execution | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchExecution = async () => {
      if (!id) return;
      try {
        const data = await request<{ execution: Execution }>({
          url: `/api/executions/${id}`,
          method: "GET",
        });
        setExecution(data.execution);
      } catch (error) {
        console.error("Failed to fetch execution:", error);
        setError(error instanceof Error ? error.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    fetchExecution();
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return "✓";
      case "failed":
        return "✗";
      case "running":
        return "⏳";
      default:
        return "•";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading execution...</p>
        </div>
      </div>
    );
  }

  if (!execution) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900">Execution not found</h2>
        <Link
          to="/executions"
          className="text-indigo-600 hover:underline mt-4 inline-block"
        >
          Back to executions
        </Link>
      </div>
    );
  }

  const duration =
    execution.startedAt && execution.completedAt
      ? Math.round(
          (new Date(execution.completedAt).getTime() -
            new Date(execution.startedAt).getTime()) /
            1000
        )
      : null;

  return (
    <div>
      <div className="mb-8">
        <Link
          to="/executions"
          className="text-indigo-600 hover:underline text-sm mb-2 inline-block"
        >
          &larr; Back to executions
        </Link>

        {error && <div className="text-red-500 p-4 mb-4">{error}</div>}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Execution Details
            </h1>
            {execution.workflowName && (
              <p className="text-gray-600">Workflow: {execution.workflowName}</p>
            )}
          </div>
          <span
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
              execution.status
            )}`}
          >
            {getStatusIcon(execution.status)} {execution.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
            Started
          </h3>
          <p className="mt-2 text-lg text-gray-900">
            {execution.startedAt
              ? new Date(execution.startedAt).toLocaleString()
              : "-"}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
            Completed
          </h3>
          <p className="mt-2 text-lg text-gray-900">
            {execution.completedAt
              ? new Date(execution.completedAt).toLocaleString()
              : "-"}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
            Duration
          </h3>
          <p className="mt-2 text-lg text-gray-900">
            {duration !== null ? `${duration}s` : "-"}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
            Execution ID
          </h3>
          <p className="mt-2 text-sm text-gray-900 font-mono truncate">
            {execution.id}
          </p>
        </div>
      </div>

      {execution.errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
          <h3 className="text-sm font-medium text-red-800 mb-2">Error</h3>
          <pre className="text-sm text-red-700 whitespace-pre-wrap font-mono">
            {execution.errorMessage}
          </pre>
        </div>
      )}

      {execution.steps && execution.steps.length > 0 && (
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">
              Execution Steps
            </h2>
          </div>
          <div className="divide-y divide-gray-200">
            {execution.steps.map((step, index) => (
              <div key={step.id} className="px-6 py-4">
                <div className="flex items-center gap-4">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-sm font-medium text-gray-600">
                    {index + 1}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {step.name}
                      </span>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                          step.status
                        )}`}
                      >
                        {step.status}
                      </span>
                    </div>
                    {step.error && (
                      <p className="text-sm text-red-600 mt-1">{step.error}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(execution.input || execution.output) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {execution.input && (
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold text-gray-900">Input</h2>
              </div>
              <pre className="p-6 text-sm text-gray-700 overflow-auto">
                {JSON.stringify(execution.input, null, 2)}
              </pre>
            </div>
          )}
          {execution.output && (
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold text-gray-900">Output</h2>
              </div>
              <pre className="p-6 text-sm text-gray-700 overflow-auto">
                {JSON.stringify(execution.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
