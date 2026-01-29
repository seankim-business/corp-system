import { useState } from "react";
import { request, ApiError } from "../../api/client";

interface SimulationStep {
  index: number;
  id: string;
  name: string;
  description?: string;
  type: string;
  willExecute: boolean;
  skipReason?: string;
  estimatedDuration: number;
  resolvedInput?: Record<string, unknown>;
  agent?: string;
  tool?: string;
  approver?: string;
  assignee?: string;
  checklist?: string[];
}

interface Simulation {
  sopId: string;
  sopName: string;
  inputData: Record<string, unknown>;
  steps: SimulationStep[];
  totalSteps: number;
  estimatedTotalDuration: number;
  exceptionHandlers: Array<{
    condition: string;
    action: string;
    target?: string;
    message?: string;
  }>;
}

interface SOPPreviewProps {
  sopId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function SOPPreview({ sopId, isOpen, onClose }: SOPPreviewProps) {
  const [inputJson, setInputJson] = useState("{}");
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<number>(0);

  const handleSimulate = async () => {
    if (!sopId) return;

    setIsLoading(true);
    setError(null);

    try {
      const inputData = JSON.parse(inputJson);
      const result = await request<{ simulation: Simulation }>({
        url: `/api/sops/${sopId}/simulate`,
        method: "POST",
        data: { input: inputData },
      });
      setSimulation(result.simulation);
      setActiveStep(0);
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError("Invalid JSON in input data");
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to simulate SOP");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  };

  const getStepTypeConfig = (type: string) => {
    switch (type) {
      case "automated":
        return { icon: "🤖", color: "bg-blue-100 text-blue-700" };
      case "manual":
        return { icon: "👤", color: "bg-amber-100 text-amber-700" };
      case "approval_required":
        return { icon: "✅", color: "bg-green-100 text-green-700" };
      default:
        return { icon: "📋", color: "bg-gray-100 text-gray-700" };
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Preview Execution</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {/* Input Data Section */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Input Data (JSON)
            </label>
            <textarea
              value={inputJson}
              onChange={(e) => setInputJson(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-sm h-32 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder='{"customer": {"email": "test@example.com", "company_name": "Acme Inc"}}'
            />
            <button
              onClick={handleSimulate}
              disabled={isLoading || !sopId}
              className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
            >
              {isLoading ? "Simulating..." : "Run Simulation"}
            </button>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Simulation Results */}
          {simulation && (
            <div>
              {/* Summary */}
              <div className="mb-6 p-4 bg-indigo-50 rounded-lg">
                <h3 className="font-medium text-indigo-900 mb-2">{simulation.sopName}</h3>
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="text-indigo-600">Total Steps:</span>{" "}
                    <span className="font-medium">{simulation.totalSteps}</span>
                  </div>
                  <div>
                    <span className="text-indigo-600">Est. Duration:</span>{" "}
                    <span className="font-medium">
                      {formatDuration(simulation.estimatedTotalDuration)}
                    </span>
                  </div>
                  <div>
                    <span className="text-indigo-600">Will Execute:</span>{" "}
                    <span className="font-medium">
                      {simulation.steps.filter((s) => s.willExecute).length} steps
                    </span>
                  </div>
                </div>
              </div>

              {/* Step Timeline */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Execution Flow</h4>
                <div className="space-y-3">
                  {simulation.steps.map((step, index) => {
                    const config = getStepTypeConfig(step.type);
                    const isActive = index === activeStep;

                    return (
                      <div
                        key={step.id}
                        onClick={() => setActiveStep(index)}
                        className={`
                          p-4 rounded-lg border-2 cursor-pointer transition-all
                          ${isActive ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-gray-300"}
                          ${!step.willExecute ? "opacity-50" : ""}
                        `}
                      >
                        <div className="flex items-start gap-3">
                          {/* Step number */}
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                              step.willExecute
                                ? "bg-gray-700 text-white"
                                : "bg-gray-300 text-gray-600"
                            }`}
                          >
                            {index + 1}
                          </div>

                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-2 py-0.5 rounded text-xs ${config.color}`}>
                                {config.icon} {step.type.replace("_", " ")}
                              </span>
                              {!step.willExecute && (
                                <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded text-xs">
                                  Will Skip
                                </span>
                              )}
                            </div>
                            <h5 className="font-medium text-gray-900">{step.name}</h5>
                            {step.description && (
                              <p className="text-sm text-gray-500 mt-1">{step.description}</p>
                            )}
                            {step.skipReason && (
                              <p className="text-sm text-amber-600 mt-1">
                                Reason: {step.skipReason}
                              </p>
                            )}

                            {/* Expanded details when active */}
                            {isActive && (
                              <div className="mt-3 pt-3 border-t border-gray-200 space-y-2 text-sm">
                                {step.agent && (
                                  <div>
                                    <span className="text-gray-500">Agent:</span>{" "}
                                    <span className="font-mono">{step.agent}</span>
                                  </div>
                                )}
                                {step.tool && (
                                  <div>
                                    <span className="text-gray-500">Tool:</span>{" "}
                                    <span className="font-mono">{step.tool}</span>
                                  </div>
                                )}
                                {step.assignee && (
                                  <div>
                                    <span className="text-gray-500">Assignee:</span>{" "}
                                    <span>{step.assignee}</span>
                                  </div>
                                )}
                                {step.approver && (
                                  <div>
                                    <span className="text-gray-500">Approver:</span>{" "}
                                    <span>{step.approver}</span>
                                  </div>
                                )}
                                <div>
                                  <span className="text-gray-500">Est. Duration:</span>{" "}
                                  <span>{formatDuration(step.estimatedDuration)}</span>
                                </div>
                                {step.checklist && step.checklist.length > 0 && (
                                  <div>
                                    <span className="text-gray-500">Checklist:</span>
                                    <ul className="mt-1 ml-4 list-disc">
                                      {step.checklist.map((item, i) => (
                                        <li key={i} className="text-gray-600">
                                          {item}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {step.resolvedInput &&
                                  Object.keys(step.resolvedInput).length > 0 && (
                                    <div>
                                      <span className="text-gray-500">Resolved Input:</span>
                                      <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-auto">
                                        {JSON.stringify(step.resolvedInput, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                              </div>
                            )}
                          </div>

                          {/* Duration badge */}
                          <div className="text-xs text-gray-500">
                            {formatDuration(step.estimatedDuration)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Exception Handlers */}
              {simulation.exceptionHandlers.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">
                    Exception Handlers
                  </h4>
                  <div className="space-y-2">
                    {simulation.exceptionHandlers.map((handler, index) => (
                      <div
                        key={index}
                        className="p-3 bg-gray-50 rounded-lg text-sm flex items-center gap-3"
                      >
                        <span className="text-amber-500">⚠️</span>
                        <div>
                          <span className="font-medium">{handler.condition}</span>
                          <span className="text-gray-400 mx-2">→</span>
                          <span className="text-indigo-600">{handler.action}</span>
                          {handler.target && (
                            <span className="text-gray-500"> (target: {handler.target})</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
