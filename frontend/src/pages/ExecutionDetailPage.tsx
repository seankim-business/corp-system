import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ApiError, request } from "../api/client";

interface SopStep {
  id: string;
  name: string;
  description?: string;
  type: "manual" | "automated" | "approval" | "mcp_call";
  skippable?: boolean;
  result?: StepResult;
}

interface StepResult {
  stepIndex: number;
  stepId: string;
  status: "pending" | "running" | "completed" | "skipped" | "failed";
  startedAt?: string;
  completedAt?: string;
  error?: string;
  skippedReason?: string;
  approvedBy?: string;
}

interface SopProgress {
  executionId: string;
  workflowId?: string;
  workflowName?: string;
  totalSteps: number;
  currentStep: number;
  completedSteps: number;
  skippedSteps: number;
  failedSteps: number;
  status: "pending" | "in_progress" | "completed" | "failed" | "paused";
  steps: SopStep[];
}

interface Execution {
  id: string;
  workflowId: string;
  status: string;
  inputData?: Record<string, unknown>;
  outputData?: Record<string, unknown>;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  workflow?: {
    id: string;
    name: string;
    sopEnabled?: boolean;
  };
}

export default function ExecutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [execution, setExecution] = useState<Execution | null>(null);
  const [sopProgress, setSopProgress] = useState<SopProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showInput, setShowInput] = useState(true);
  const [showOutput, setShowOutput] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState("");
  const [showSkipModal, setShowSkipModal] = useState(false);

  const fetchExecution = async () => {
    if (!id) return;
    try {
      const data = await request<{ execution: Execution }>({
        url: `/api/executions/${id}`,
        method: "GET",
      });
      setExecution(data.execution);

      if (data.execution.workflow?.sopEnabled) {
        await fetchSopProgress();
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("Execution not found");
      } else {
        setError("Failed to load execution");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSopProgress = async () => {
    if (!id) return;
    try {
      const data = await request<{ progress: SopProgress }>({
        url: `/api/executions/${id}/sop-progress`,
        method: "GET",
      });
      setSopProgress(data.progress);
    } catch {
      console.error("Failed to load SOP progress");
    }
  };

  useEffect(() => {
    fetchExecution();
  }, [id]);

  const handleRetry = async () => {
    if (!execution?.workflowId || !execution?.inputData) return;
    setIsRetrying(true);
    try {
      await request<{ execution: { id: string } }>({
        url: `/api/workflows/${execution.workflowId}/execute`,
        method: "POST",
        data: { input: execution.inputData },
      });
      fetchExecution();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to retry";
      alert(message);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleApproveStep = async () => {
    if (!id) return;
    setActionLoading("approve");
    try {
      await request({
        url: `/api/executions/${id}/sop/approve`,
        method: "POST",
        data: {},
      });
      await fetchSopProgress();
      await fetchExecution();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to approve step";
      alert(message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSkipStep = async () => {
    if (!id || !skipReason.trim()) return;
    setActionLoading("skip");
    try {
      await request({
        url: `/api/executions/${id}/sop/skip`,
        method: "POST",
        data: { reason: skipReason },
      });
      setShowSkipModal(false);
      setSkipReason("");
      await fetchSopProgress();
      await fetchExecution();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to skip step";
      alert(message);
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "success":
      case "completed":
        return { bg: "bg-green-100", text: "text-green-800", icon: "✓", label: "Success" };
      case "failed":
        return { bg: "bg-red-100", text: "text-red-800", icon: "✗", label: "Failed" };
      case "running":
      case "in_progress":
        return { bg: "bg-blue-100", text: "text-blue-800", icon: "⏳", label: "Running" };
      case "pending":
        return { bg: "bg-yellow-100", text: "text-yellow-800", icon: "○", label: "Pending" };
      case "skipped":
        return { bg: "bg-gray-100", text: "text-gray-600", icon: "⊘", label: "Skipped" };
      case "paused":
        return { bg: "bg-purple-100", text: "text-purple-800", icon: "⏸", label: "Paused" };
      default:
        return { bg: "bg-gray-100", text: "text-gray-800", icon: "•", label: status };
    }
  };

  const getStepStatusConfig = (step: SopStep, index: number, currentStep: number) => {
    if (step.result) {
      return getStatusConfig(step.result.status);
    }
    if (index === currentStep) {
      return { bg: "bg-blue-100", text: "text-blue-800", icon: "→", label: "Current" };
    }
    return { bg: "bg-gray-50", text: "text-gray-400", icon: "○", label: "Pending" };
  };

  const formatDuration = (start?: string, end?: string): string => {
    if (!start) return "-";
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const seconds = Math.round((endTime - startTime) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
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

  if (error || !execution) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">😕</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{error || "Execution not found"}</h2>
        <Link to="/executions" className="text-indigo-600 hover:text-indigo-800">
          ← Back to Executions
        </Link>
      </div>
    );
  }

  const statusConfig = getStatusConfig(execution.status);

  return (
    <div>
      <nav className="mb-4 text-sm">
        <Link to="/executions" className="text-indigo-600 hover:text-indigo-800">
          Executions
        </Link>
        <span className="mx-2 text-gray-400">/</span>
        <span className="text-gray-600">{execution.id.slice(0, 8)}...</span>
      </nav>

      <div className="mb-8 flex justify-between items-start">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <span
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-lg font-semibold ${statusConfig.bg} ${statusConfig.text}`}
            >
              <span className="text-2xl">{statusConfig.icon}</span>
              {statusConfig.label}
            </span>
            {execution.workflow?.sopEnabled && (
              <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium">
                SOP Workflow
              </span>
            )}
          </div>
          {execution.workflow && (
            <p className="text-gray-600">
              Workflow:{" "}
              <Link
                to={`/workflows/${execution.workflow.id}`}
                className="text-indigo-600 hover:text-indigo-800"
              >
                {execution.workflow.name}
              </Link>
            </p>
          )}
        </div>

        {execution.status === "failed" && (
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {isRetrying ? "Retrying..." : "Retry Execution"}
          </button>
        )}
      </div>

      {sopProgress && sopProgress.steps.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">SOP Progress</h2>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>
                {sopProgress.completedSteps} / {sopProgress.totalSteps} completed
              </span>
              {sopProgress.skippedSteps > 0 && (
                <span className="text-gray-400">({sopProgress.skippedSteps} skipped)</span>
              )}
            </div>
          </div>

          <div className="w-full bg-gray-200 rounded-full h-2 mb-6">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{
                width: `${((sopProgress.completedSteps + sopProgress.skippedSteps) / sopProgress.totalSteps) * 100}%`,
              }}
            />
          </div>

          <div className="space-y-3">
            {sopProgress.steps.map((step, index) => {
              const stepConfig = getStepStatusConfig(step, index, sopProgress.currentStep);
              const isCurrentStep =
                index === sopProgress.currentStep &&
                !step.result?.status?.match(/completed|skipped|failed/);

              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-4 p-4 rounded-lg border ${
                    isCurrentStep ? "border-indigo-300 bg-indigo-50" : "border-gray-200"
                  }`}
                >
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${stepConfig.bg} ${stepConfig.text} font-bold`}
                  >
                    {step.result?.status === "completed" || step.result?.status === "skipped"
                      ? stepConfig.icon
                      : index + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900 truncate">{step.name}</h3>
                      <span
                        className={`px-2 py-0.5 text-xs rounded-full ${stepConfig.bg} ${stepConfig.text}`}
                      >
                        {step.type}
                      </span>
                    </div>
                    {step.description && (
                      <p className="text-sm text-gray-500 truncate">{step.description}</p>
                    )}
                    {step.result?.skippedReason && (
                      <p className="text-sm text-gray-500 italic">
                        Skipped: {step.result.skippedReason}
                      </p>
                    )}
                    {step.result?.error && (
                      <p className="text-sm text-red-600">{step.result.error}</p>
                    )}
                  </div>

                  {isCurrentStep && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleApproveStep}
                        disabled={actionLoading !== null}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
                      >
                        {actionLoading === "approve" ? "..." : "Approve"}
                      </button>
                      {step.skippable !== false && (
                        <button
                          onClick={() => setShowSkipModal(true)}
                          disabled={actionLoading !== null}
                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 text-sm font-medium"
                        >
                          Skip
                        </button>
                      )}
                    </div>
                  )}

                  {step.result?.completedAt && (
                    <span className="text-xs text-gray-400">
                      {new Date(step.result.completedAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showSkipModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Skip Step</h3>
            <p className="text-gray-600 mb-4">Please provide a reason for skipping this step:</p>
            <textarea
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-3 mb-4"
              rows={3}
              placeholder="Enter skip reason..."
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowSkipModal(false);
                  setSkipReason("");
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSkipStep}
                disabled={!skipReason.trim() || actionLoading === "skip"}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
              >
                {actionLoading === "skip" ? "Skipping..." : "Skip Step"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-500">Created</p>
            <p className="font-medium">{new Date(execution.createdAt).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Started</p>
            <p className="font-medium">
              {execution.startedAt ? new Date(execution.startedAt).toLocaleString() : "-"}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Completed</p>
            <p className="font-medium">
              {execution.completedAt ? new Date(execution.completedAt).toLocaleString() : "-"}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Duration</p>
            <p className="font-medium">
              {formatDuration(execution.startedAt, execution.completedAt)}
            </p>
          </div>
        </div>
      </div>

      {execution.errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Error</h2>
          <pre className="text-red-700 whitespace-pre-wrap font-mono text-sm">
            {execution.errorMessage}
          </pre>
        </div>
      )}

      <div className="bg-white rounded-lg shadow mb-6">
        <button
          onClick={() => setShowInput(!showInput)}
          className="w-full px-6 py-4 flex justify-between items-center border-b border-gray-200 hover:bg-gray-50"
        >
          <h2 className="text-lg font-semibold text-gray-900">Input Data</h2>
          <span className="text-gray-400">{showInput ? "▼" : "▶"}</span>
        </button>
        {showInput && (
          <div className="p-6">
            {execution.inputData ? (
              <div className="relative">
                <button
                  onClick={() => copyToClipboard(JSON.stringify(execution.inputData, null, 2))}
                  className="absolute top-2 right-2 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                >
                  Copy
                </button>
                <pre className="bg-gray-50 p-4 rounded-lg overflow-auto max-h-96 font-mono text-sm">
                  {JSON.stringify(execution.inputData, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="text-gray-500">No input data</p>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow">
        <button
          onClick={() => setShowOutput(!showOutput)}
          className="w-full px-6 py-4 flex justify-between items-center border-b border-gray-200 hover:bg-gray-50"
        >
          <h2 className="text-lg font-semibold text-gray-900">Output Data</h2>
          <span className="text-gray-400">{showOutput ? "▼" : "▶"}</span>
        </button>
        {showOutput && (
          <div className="p-6">
            {execution.outputData ? (
              <div className="relative">
                <button
                  onClick={() => copyToClipboard(JSON.stringify(execution.outputData, null, 2))}
                  className="absolute top-2 right-2 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                >
                  Copy
                </button>
                <pre className="bg-gray-50 p-4 rounded-lg overflow-auto max-h-96 font-mono text-sm">
                  {JSON.stringify(execution.outputData, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="text-gray-500">No output data</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
