/**
 * WorkflowCard Component
 * 
 * 기획:
 * - 워크플로우 카드 (그리드 아이템)
 * - 이름, 설명, 상태 표시
 * - 실행 버튼
 * - 클릭 시 상세 페이지 이동 (추후)
 * 
 * 구조:
 * WorkflowCard
 * ├── Header
 * │   ├── Name
 * │   └── StatusBadge (Enabled/Disabled)
 * ├── Description
 * └── Footer
 *     └── ExecuteButton
 */

interface Workflow {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  createdAt: string;
}

interface WorkflowCardProps {
  workflow: Workflow;
  onExecute: (workflowId: string) => void;
}

export default function WorkflowCard({ workflow, onExecute }: WorkflowCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900">{workflow.name}</h3>
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${
            workflow.enabled
              ? 'bg-green-100 text-green-800'
              : 'bg-gray-100 text-gray-800'
          }`}
        >
          {workflow.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      <p className="text-sm text-gray-600 mb-4 line-clamp-2">
        {workflow.description || 'No description'}
      </p>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          Created {new Date(workflow.createdAt).toLocaleDateString()}
        </span>
        <button
          onClick={() => onExecute(workflow.id)}
          disabled={!workflow.enabled}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Execute
        </button>
      </div>
    </div>
  );
}
