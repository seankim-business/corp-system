/**
 * InterventionPanel Component
 *
 * Provides controls for user intervention in agent sessions.
 * Supports pause, resume, cancel, and send message actions.
 */

import { useState } from "react";

interface InterventionPanelProps {
  sessionId: string;
  sessionStatus: "running" | "paused" | "completed" | "failed" | "cancelled";
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onCancel: () => Promise<void>;
  onSendMessage: (message: string, targetAgentId?: string) => Promise<void>;
  agentIds?: Array<{ id: string; name: string }>;
  disabled?: boolean;
}

export default function InterventionPanel({
  sessionId: _sessionId,
  sessionStatus,
  onPause,
  onResume,
  onCancel,
  onSendMessage,
  agentIds = [],
  disabled = false,
}: InterventionPanelProps) {
  const [message, setMessage] = useState("");
  const [targetAgent, setTargetAgent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);

  const isActive = sessionStatus === "running" || sessionStatus === "paused";
  const canPause = sessionStatus === "running";
  const canResume = sessionStatus === "paused";
  const canCancel = isActive;
  const canSendMessage = isActive;

  const handleAction = async (action: () => Promise<void>) => {
    setIsLoading(true);
    try {
      await action();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setIsLoading(true);
    try {
      await onSendMessage(message.trim(), targetAgent || undefined);
      setMessage("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async () => {
    setIsLoading(true);
    try {
      await onCancel();
      setShowConfirmCancel(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Intervention Controls</h3>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              sessionStatus === "running"
                ? "bg-green-100 text-green-800"
                : sessionStatus === "paused"
                  ? "bg-yellow-100 text-yellow-800"
                  : sessionStatus === "completed"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-red-100 text-red-800"
            }`}
          >
            {sessionStatus === "running" && (
              <span className="w-2 h-2 mr-1.5 bg-green-500 rounded-full animate-pulse" />
            )}
            {sessionStatus.charAt(0).toUpperCase() + sessionStatus.slice(1)}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        {canPause && (
          <button
            onClick={() => handleAction(onPause)}
            disabled={disabled || isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            Pause
          </button>
        )}

        {canResume && (
          <button
            onClick={() => handleAction(onResume)}
            disabled={disabled || isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                clipRule="evenodd"
              />
            </svg>
            Resume
          </button>
        )}

        {canCancel && !showConfirmCancel && (
          <button
            onClick={() => setShowConfirmCancel(true)}
            disabled={disabled || isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            Cancel
          </button>
        )}

        {showConfirmCancel && (
          <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg">
            <span className="text-sm text-red-700">Are you sure?</span>
            <button
              onClick={handleCancel}
              disabled={disabled || isLoading}
              className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition disabled:opacity-50"
            >
              Yes, cancel
            </button>
            <button
              onClick={() => setShowConfirmCancel(false)}
              disabled={isLoading}
              className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition"
            >
              No
            </button>
          </div>
        )}
      </div>

      {/* Send message form */}
      {canSendMessage && (
        <form onSubmit={handleSendMessage} className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Send a message to agents..."
                disabled={disabled || isLoading}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
            {agentIds.length > 0 && (
              <select
                value={targetAgent}
                onChange={(e) => setTargetAgent(e.target.value)}
                disabled={disabled || isLoading}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              >
                <option value="">All agents</option>
                {agentIds.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="submit"
              disabled={disabled || isLoading || !message.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
              Send
            </button>
          </div>
        </form>
      )}

      {/* Session not active message */}
      {!isActive && (
        <div className="text-center py-4 text-gray-500">
          <p>Session is {sessionStatus}. No actions available.</p>
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/50 flex items-center justify-center rounded-lg">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
