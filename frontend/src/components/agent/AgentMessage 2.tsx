/**
 * AgentMessage Component
 *
 * Displays a single agent message or event in the activity feed.
 * Supports various event types with appropriate styling.
 */

export type AgentEventType =
  | "agent_started"
  | "agent_completed"
  | "agent_message"
  | "tool_called"
  | "tool_completed"
  | "approval_requested"
  | "approval_granted"
  | "approval_denied"
  | "workflow_step"
  | "session_paused"
  | "session_resumed"
  | "session_cancelled"
  | "error";

export interface AgentMessageData {
  id: string;
  type: AgentEventType;
  agentId: string;
  agentName: string;
  sessionId: string;
  timestamp: Date;
  data: {
    message?: string;
    toolName?: string;
    toolArgs?: unknown;
    toolResult?: unknown;
    targetAgent?: string;
    progress?: number;
    stepIndex?: number;
    totalSteps?: number;
    status?: string;
    error?: string;
    approvalId?: string;
    approvalType?: string;
  };
}

interface AgentMessageProps {
  message: AgentMessageData;
  onApprove?: (approvalId: string) => void;
  onDeny?: (approvalId: string) => void;
}

const EVENT_ICONS: Record<AgentEventType, string> = {
  agent_started: "🚀",
  agent_completed: "✅",
  agent_message: "💬",
  tool_called: "🛠️",
  tool_completed: "✨",
  approval_requested: "🔔",
  approval_granted: "👍",
  approval_denied: "👎",
  workflow_step: "📍",
  session_paused: "⏸️",
  session_resumed: "▶️",
  session_cancelled: "❌",
  error: "⚠️",
};

const EVENT_COLORS: Record<AgentEventType, { bg: string; border: string }> = {
  agent_started: { bg: "bg-blue-50", border: "border-l-blue-500" },
  agent_completed: { bg: "bg-green-50", border: "border-l-green-500" },
  agent_message: { bg: "bg-purple-50", border: "border-l-purple-500" },
  tool_called: { bg: "bg-yellow-50", border: "border-l-yellow-500" },
  tool_completed: { bg: "bg-emerald-50", border: "border-l-emerald-500" },
  approval_requested: { bg: "bg-orange-50", border: "border-l-orange-500" },
  approval_granted: { bg: "bg-green-50", border: "border-l-green-500" },
  approval_denied: { bg: "bg-red-50", border: "border-l-red-500" },
  workflow_step: { bg: "bg-indigo-50", border: "border-l-indigo-500" },
  session_paused: { bg: "bg-amber-50", border: "border-l-amber-500" },
  session_resumed: { bg: "bg-teal-50", border: "border-l-teal-500" },
  session_cancelled: { bg: "bg-red-50", border: "border-l-red-500" },
  error: { bg: "bg-red-50", border: "border-l-red-500" },
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatEventType(type: AgentEventType): string {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function AgentMessage({ message, onApprove, onDeny }: AgentMessageProps) {
  const icon = EVENT_ICONS[message.type] || "📌";
  const colors = EVENT_COLORS[message.type] || { bg: "bg-gray-50", border: "border-l-gray-500" };

  const renderContent = () => {
    switch (message.type) {
      case "agent_message":
        return (
          <div>
            <p className="text-gray-700">{message.data.message}</p>
            {message.data.targetAgent && (
              <p className="text-sm text-gray-500 mt-1">
                <span className="font-medium">{message.agentName}</span>
                <span className="mx-2">→</span>
                <span className="font-medium">{message.data.targetAgent}</span>
              </p>
            )}
          </div>
        );

      case "tool_called":
        return (
          <div>
            <p className="text-gray-700">
              Calling <code className="bg-gray-100 px-1 rounded">{message.data.toolName}</code>
            </p>
            {message.data.toolArgs != null && (
              <details className="mt-2">
                <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
                  View arguments
                </summary>
                <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                  {JSON.stringify(message.data.toolArgs as object, null, 2)}
                </pre>
              </details>
            )}
          </div>
        );

      case "tool_completed":
        return (
          <div>
            <p className="text-gray-700">
              <code className="bg-gray-100 px-1 rounded">{message.data.toolName}</code> completed
            </p>
            {message.data.toolResult != null && (
              <details className="mt-2">
                <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
                  View result
                </summary>
                <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto max-h-40">
                  {JSON.stringify(message.data.toolResult as object, null, 2)}
                </pre>
              </details>
            )}
          </div>
        );

      case "approval_requested":
        return (
          <div>
            <p className="text-gray-700">{message.data.message}</p>
            {message.data.approvalType && (
              <span className="inline-block mt-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">
                {message.data.approvalType}
              </span>
            )}
            {message.data.approvalId && onApprove && onDeny && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => onApprove(message.data.approvalId!)}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition"
                >
                  Approve
                </button>
                <button
                  onClick={() => onDeny(message.data.approvalId!)}
                  className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition"
                >
                  Deny
                </button>
              </div>
            )}
          </div>
        );

      case "workflow_step":
        return (
          <div>
            <p className="text-gray-700">{message.data.message}</p>
            {message.data.stepIndex !== undefined && message.data.totalSteps !== undefined && (
              <div className="mt-2">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>
                    Step {message.data.stepIndex + 1} of {message.data.totalSteps}
                  </span>
                  <span className="text-gray-300">|</span>
                  <span>{message.data.progress}%</span>
                </div>
                <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-300"
                    style={{ width: `${message.data.progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        );

      case "error":
        return (
          <div>
            <p className="text-red-700">{message.data.message || message.data.error}</p>
            {message.data.error && message.data.message && (
              <pre className="mt-2 p-2 bg-red-100 rounded text-xs text-red-800 overflow-x-auto">
                {message.data.error}
              </pre>
            )}
          </div>
        );

      default:
        return <p className="text-gray-700">{message.data.message || formatEventType(message.type)}</p>;
    }
  };

  return (
    <div className={`${colors.bg} ${colors.border} border-l-4 rounded-r-lg p-4 transition-all`}>
      <div className="flex items-start gap-3">
        <span className="text-xl flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900">{message.agentName}</span>
            <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full">
              {formatEventType(message.type)}
            </span>
            <span className="text-xs text-gray-400">{formatTime(message.timestamp)}</span>
          </div>
          <div className="mt-2">{renderContent()}</div>
        </div>
      </div>
    </div>
  );
}
