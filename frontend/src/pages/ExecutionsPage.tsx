/**
 * ExecutionsPage
 * 
 * 기획:
 * - 워크플로우 실행 이력 페이지
 * - 전체 실행 이력을 테이블로 표시
 * - 상태별 필터링 (All, Success, Failed, Running)
 * - 클릭 시 상세 페이지 이동 (추후)
 * 
 * 구조:
 * ExecutionsPage
 * ├── PageHeader
 * ├── FilterTabs
 * └── ExecutionTable
 *     └── ExecutionRow[]
 */

import { useEffect, useState } from "react";
import { request } from "../api/client";

interface Execution {
  id: string;
  workflowId: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  workflow?: {
    name: string;
  };
}

export default function ExecutionsPage() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'success' | 'failed' | 'running'>('all');

  useEffect(() => {
    const fetchExecutions = async () => {
      try {
        const data = await request<{ executions: Execution[] }>({
          url: "/api/executions",
          method: "GET",
        });
        setExecutions(data.executions || []);
      } catch (error) {
        console.error("Failed to fetch executions:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchExecutions();
  }, []);

  const filteredExecutions = executions.filter((exec) => {
    if (filter === 'all') return true;
    return exec.status === filter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'running':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return '✓';
      case 'failed':
        return '✗';
      case 'running':
        return '⏳';
      default:
        return '•';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading executions...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Executions</h1>
        <p className="text-gray-600">View workflow execution history</p>
      </div>

      <div className="mb-6 flex gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg font-medium ${
            filter === 'all'
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('success')}
          className={`px-4 py-2 rounded-lg font-medium ${
            filter === 'success'
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          Success
        </button>
        <button
          onClick={() => setFilter('failed')}
          className={`px-4 py-2 rounded-lg font-medium ${
            filter === 'failed'
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          Failed
        </button>
        <button
          onClick={() => setFilter('running')}
          className={`px-4 py-2 rounded-lg font-medium ${
            filter === 'running'
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          Running
        </button>
      </div>

      {filteredExecutions.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="text-6xl mb-4">⏱️</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              No executions yet
            </h2>
            <p className="text-gray-600">
              Execute workflows to see their history here
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Workflow
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
              {filteredExecutions.map((execution) => {
                const duration = execution.startedAt && execution.completedAt
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
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                          execution.status
                        )}`}
                      >
                        {getStatusIcon(execution.status)} {execution.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {execution.workflow?.name || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {execution.startedAt
                        ? new Date(execution.startedAt).toLocaleString()
                        : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {duration !== null ? `${duration}s` : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
