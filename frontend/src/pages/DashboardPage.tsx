/**
 * DashboardPage
 * 
 * 기획:
 * - 로그인 후 첫 랜딩 페이지
 * - 현재는 단순 환영 메시지
 * - 향후: 최근 워크플로우 실행 현황, 통계 등
 * 
 * 구조:
 * DashboardPage
 * ├── WelcomeSection
 * │   ├── 제목
 * │   └── 설명
 * └── QuickStats (추후 구현)
 *     ├── TotalWorkflows
 *     ├── RecentExecutions
 *     └── SuccessRate
 */

export default function DashboardPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Dashboard
        </h1>
        <p className="text-gray-600">
          Welcome to Nubabel - AI-Powered Workflow Automation Platform
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Total Workflows
          </h3>
          <p className="text-3xl font-bold text-indigo-600">0</p>
          <p className="text-sm text-gray-500 mt-2">No workflows yet</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Recent Executions
          </h3>
          <p className="text-3xl font-bold text-indigo-600">0</p>
          <p className="text-sm text-gray-500 mt-2">No executions yet</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Success Rate
          </h3>
          <p className="text-3xl font-bold text-indigo-600">-</p>
          <p className="text-sm text-gray-500 mt-2">No data available</p>
        </div>
      </div>

      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">
          🚀 Getting Started
        </h3>
        <p className="text-blue-800 mb-4">
          Start automating your workflows in 3 easy steps:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-blue-800">
          <li>Create your first workflow</li>
          <li>Configure your integrations (Notion, Slack, etc.)</li>
          <li>Run and monitor your automation</li>
        </ol>
      </div>
    </div>
  );
}
