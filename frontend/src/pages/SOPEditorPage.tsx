import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { request, ApiError } from "../api/client";
import SOPCanvas from "../components/sop/SOPCanvas";
import StepConfigPanel from "../components/sop/StepConfigPanel";
import SOPPreview from "../components/sop/SOPPreview";
import { SOPStepData } from "../components/sop/StepNode";

interface SOPMetadata {
  id: string;
  name: string;
  function: string;
  owner: string;
  version: string;
}

interface SOPTrigger {
  pattern: string;
}

interface ExceptionHandler {
  condition: string;
  action: string;
  target?: string;
  step?: string;
  message?: string;
  notify?: string;
  when?: string;
  max_retries?: number;
}

interface SOPDefinition {
  schema_version: string;
  kind: "SOP";
  metadata: SOPMetadata;
  triggers: SOPTrigger[];
  steps: SOPStepData[];
  exception_handling?: ExceptionHandler[];
}

interface SOPListItem {
  id: string;
  name: string;
  function: string;
  owner: string;
  version: string;
  stepCount: number;
  triggerCount: number;
}

const FUNCTION_OPTIONS = [
  { value: "brand", label: "Brand" },
  { value: "finance", label: "Finance" },
  { value: "ops", label: "Operations" },
  { value: "cs", label: "Customer Success" },
  { value: "hr", label: "HR" },
  { value: "engineering", label: "Engineering" },
  { value: "product", label: "Product" },
  { value: "sales", label: "Sales" },
];

export default function SOPEditorPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isEditMode = Boolean(id);

  // SOP List state (for sidebar)
  const [sopList, setSopList] = useState<SOPListItem[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);

  // Editor state
  const [metadata, setMetadata] = useState<SOPMetadata>({
    id: "",
    name: "",
    function: "ops",
    owner: "",
    version: "1.0.0",
  });
  const [triggers, setTriggers] = useState<SOPTrigger[]>([{ pattern: "" }]);
  const [steps, setSteps] = useState<SOPStepData[]>([]);
  const [exceptionHandlers, setExceptionHandlers] = useState<ExceptionHandler[]>([]);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showYaml, setShowYaml] = useState(false);
  const [yamlContent, setYamlContent] = useState("");
  const [activeTab, setActiveTab] = useState<"editor" | "triggers" | "exceptions">("editor");

  // Fetch SOP list
  const fetchSOPList = useCallback(async () => {
    try {
      const result = await request<{ sops: SOPListItem[] }>({
        url: "/api/sops",
        method: "GET",
      });
      setSopList(result.sops);
    } catch (err) {
      console.error("Failed to fetch SOP list:", err);
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  // Fetch single SOP for editing
  const fetchSOP = useCallback(async (sopId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await request<{ sop: SOPDefinition }>({
        url: `/api/sops/${sopId}`,
        method: "GET",
      });
      const sop = result.sop;
      setMetadata(sop.metadata);
      setTriggers(sop.triggers);
      setSteps(sop.steps);
      setExceptionHandlers(sop.exception_handling || []);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load SOP");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch YAML content
  const fetchYaml = useCallback(async () => {
    if (!id) return;
    try {
      const response = await fetch(`/api/sops/${id}/yaml`, {
        credentials: "include",
      });
      if (response.ok) {
        const text = await response.text();
        setYamlContent(text);
      }
    } catch (err) {
      console.error("Failed to fetch YAML:", err);
    }
  }, [id]);

  useEffect(() => {
    fetchSOPList();
  }, [fetchSOPList]);

  useEffect(() => {
    if (id) {
      fetchSOP(id);
    } else {
      // Reset for new SOP
      setMetadata({
        id: "",
        name: "",
        function: "ops",
        owner: "",
        version: "1.0.0",
      });
      setTriggers([{ pattern: "" }]);
      setSteps([]);
      setExceptionHandlers([]);
      setSelectedStepIndex(null);
    }
  }, [id, fetchSOP]);

  useEffect(() => {
    if (showYaml && id) {
      fetchYaml();
    }
  }, [showYaml, id, fetchYaml]);

  // Step management
  const handleAddStep = (type: SOPStepData["type"]) => {
    const newStep: SOPStepData = {
      id: `step-${Date.now()}`,
      name: `New ${type === "automated" ? "Automated" : type === "manual" ? "Manual" : "Approval"} Step`,
      type,
    };
    setSteps([...steps, newStep]);
    setSelectedStepIndex(steps.length);
  };

  const handleUpdateStep = (updatedStep: SOPStepData) => {
    if (selectedStepIndex === null) return;
    const newSteps = [...steps];
    newSteps[selectedStepIndex] = updatedStep;
    setSteps(newSteps);
  };

  const handleDeleteStep = () => {
    if (selectedStepIndex === null) return;
    const newSteps = steps.filter((_, i) => i !== selectedStepIndex);
    setSteps(newSteps);
    setSelectedStepIndex(null);
  };

  const handleReorderSteps = (fromIndex: number, toIndex: number) => {
    const newSteps = [...steps];
    const [removed] = newSteps.splice(fromIndex, 1);
    newSteps.splice(toIndex, 0, removed);
    setSteps(newSteps);
    if (selectedStepIndex === fromIndex) {
      setSelectedStepIndex(toIndex);
    }
  };

  // Trigger management
  const handleAddTrigger = () => {
    setTriggers([...triggers, { pattern: "" }]);
  };

  const handleUpdateTrigger = (index: number, pattern: string) => {
    const newTriggers = [...triggers];
    newTriggers[index] = { pattern };
    setTriggers(newTriggers);
  };

  const handleRemoveTrigger = (index: number) => {
    if (triggers.length <= 1) return;
    setTriggers(triggers.filter((_, i) => i !== index));
  };

  // Exception handler management
  const handleAddExceptionHandler = () => {
    setExceptionHandlers([
      ...exceptionHandlers,
      { condition: "", action: "notify_owner" },
    ]);
  };

  const handleUpdateExceptionHandler = (
    index: number,
    field: keyof ExceptionHandler,
    value: string | number,
  ) => {
    const newHandlers = [...exceptionHandlers];
    newHandlers[index] = { ...newHandlers[index], [field]: value };
    setExceptionHandlers(newHandlers);
  };

  const handleRemoveExceptionHandler = (index: number) => {
    setExceptionHandlers(exceptionHandlers.filter((_, i) => i !== index));
  };

  // Save SOP
  const handleSave = async () => {
    // Validation
    if (!metadata.id.trim()) {
      setError("SOP ID is required");
      return;
    }
    if (!metadata.name.trim()) {
      setError("SOP name is required");
      return;
    }
    if (!metadata.owner.trim()) {
      setError("Owner is required");
      return;
    }
    if (triggers.every((t) => !t.pattern.trim())) {
      setError("At least one trigger pattern is required");
      return;
    }
    if (steps.length === 0) {
      setError("At least one step is required");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    const sopData = {
      metadata,
      triggers: triggers.filter((t) => t.pattern.trim()),
      steps,
      exception_handling: exceptionHandlers.filter((h) => h.condition.trim()),
    };

    try {
      if (isEditMode) {
        await request({
          url: `/api/sops/${id}`,
          method: "PUT",
          data: sopData,
        });
        setSuccessMessage("SOP updated successfully");
      } else {
        await request({
          url: "/api/sops",
          method: "POST",
          data: sopData,
        });
        setSuccessMessage("SOP created successfully");
        navigate(`/sops/${metadata.id}`);
      }
      fetchSOPList();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to save SOP");
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Delete SOP
  const handleDelete = async () => {
    if (!id || !confirm("Are you sure you want to delete this SOP?")) return;

    try {
      await request({
        url: `/api/sops/${id}`,
        method: "DELETE",
      });
      navigate("/sops");
      fetchSOPList();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to delete SOP");
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading SOP...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <nav className="text-sm mb-1">
              <Link to="/sops" className="text-indigo-600 hover:text-indigo-800">
                SOPs
              </Link>
              <span className="mx-2 text-gray-400">/</span>
              <span className="text-gray-600">
                {isEditMode ? metadata.name || id : "New SOP"}
              </span>
            </nav>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEditMode ? "Edit SOP" : "Create New SOP"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {isEditMode && (
              <>
                <button
                  onClick={() => setShowYaml(!showYaml)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm font-medium"
                >
                  {showYaml ? "Hide YAML" : "View YAML"}
                </button>
                <button
                  onClick={() => setShowPreview(true)}
                  className="px-4 py-2 text-indigo-700 bg-indigo-100 rounded-lg hover:bg-indigo-200 text-sm font-medium"
                >
                  Preview
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 text-red-700 bg-red-50 rounded-lg hover:bg-red-100 text-sm font-medium"
                >
                  Delete
                </button>
              </>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
            >
              {isSaving ? "Saving..." : isEditMode ? "Update SOP" : "Create SOP"}
            </button>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            {successMessage}
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - SOP List */}
        <div className="w-56 border-r border-gray-200 bg-gray-50 overflow-y-auto">
          <div className="p-4">
            <Link
              to="/sops/new"
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
            >
              <span>+</span>
              <span>New SOP</span>
            </Link>
          </div>
          <nav className="px-2 pb-4">
            {isLoadingList ? (
              <p className="text-sm text-gray-500 px-2">Loading...</p>
            ) : sopList.length === 0 ? (
              <p className="text-sm text-gray-500 px-2">No SOPs yet</p>
            ) : (
              sopList.map((sop) => (
                <Link
                  key={sop.id}
                  to={`/sops/${sop.id}`}
                  className={`block px-3 py-2 rounded-lg text-sm mb-1 transition-colors ${
                    id === sop.id
                      ? "bg-indigo-100 text-indigo-700"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <div className="font-medium truncate">{sop.name}</div>
                  <div className="text-xs text-gray-500">
                    {sop.function} • {sop.stepCount} steps
                  </div>
                </Link>
              ))
            )}
          </nav>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="bg-white border-b border-gray-200 px-6">
            <div className="flex gap-6">
              {(["editor", "triggers", "exceptions"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab === "editor" && "Step Editor"}
                  {tab === "triggers" && "Triggers & Metadata"}
                  {tab === "exceptions" && "Exception Handlers"}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === "editor" && (
            <div className="flex-1 flex overflow-hidden">
              <SOPCanvas
                steps={steps}
                selectedStepIndex={selectedStepIndex}
                onSelectStep={setSelectedStepIndex}
                onReorderSteps={handleReorderSteps}
                onAddStep={handleAddStep}
              />
              <StepConfigPanel
                step={selectedStepIndex !== null ? steps[selectedStepIndex] : null}
                onUpdate={handleUpdateStep}
                onDelete={handleDeleteStep}
                onClose={() => setSelectedStepIndex(null)}
              />
            </div>
          )}

          {activeTab === "triggers" && (
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
              <div className="max-w-2xl mx-auto space-y-6">
                {/* Metadata Section */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    SOP Metadata
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        SOP ID *
                      </label>
                      <input
                        type="text"
                        value={metadata.id}
                        onChange={(e) =>
                          setMetadata({
                            ...metadata,
                            id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
                          })
                        }
                        disabled={isEditMode}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100"
                        placeholder="e.g., customer-onboarding"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Name *
                      </label>
                      <input
                        type="text"
                        value={metadata.name}
                        onChange={(e) =>
                          setMetadata({ ...metadata, name: e.target.value })
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        placeholder="e.g., Customer Onboarding"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Function *
                      </label>
                      <select
                        value={metadata.function}
                        onChange={(e) =>
                          setMetadata({ ...metadata, function: e.target.value })
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      >
                        {FUNCTION_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Owner *
                      </label>
                      <input
                        type="text"
                        value={metadata.owner}
                        onChange={(e) =>
                          setMetadata({ ...metadata, owner: e.target.value })
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        placeholder="e.g., cs-team-lead"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Version
                      </label>
                      <input
                        type="text"
                        value={metadata.version}
                        onChange={(e) =>
                          setMetadata({ ...metadata, version: e.target.value })
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        placeholder="1.0.0"
                      />
                    </div>
                  </div>
                </div>

                {/* Triggers Section */}
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Triggers</h3>
                    <button
                      onClick={handleAddTrigger}
                      className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded text-sm hover:bg-indigo-200"
                    >
                      + Add Trigger
                    </button>
                  </div>
                  <p className="text-sm text-gray-500 mb-4">
                    Triggers determine when this SOP is automatically invoked. Add patterns
                    that match user messages or events.
                  </p>
                  <div className="space-y-3">
                    {triggers.map((trigger, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={trigger.pattern}
                          onChange={(e) => handleUpdateTrigger(index, e.target.value)}
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                          placeholder='e.g., "신규 고객 온보딩" or "new customer onboarding"'
                        />
                        {triggers.length > 1 && (
                          <button
                            onClick={() => handleRemoveTrigger(index)}
                            className="px-3 py-2 text-red-500 hover:text-red-700"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "exceptions" && (
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
              <div className="max-w-3xl mx-auto">
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Exception Handlers
                    </h3>
                    <button
                      onClick={handleAddExceptionHandler}
                      className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded text-sm hover:bg-indigo-200"
                    >
                      + Add Handler
                    </button>
                  </div>
                  <p className="text-sm text-gray-500 mb-4">
                    Define how the SOP should respond to errors, timeouts, and other
                    exceptional conditions.
                  </p>

                  {exceptionHandlers.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <p>No exception handlers defined</p>
                      <p className="text-sm">Click "Add Handler" to create one</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {exceptionHandlers.map((handler, index) => (
                        <div
                          key={index}
                          className="p-4 border border-gray-200 rounded-lg bg-gray-50"
                        >
                          <div className="flex items-start gap-4">
                            <div className="flex-1 grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Condition
                                </label>
                                <select
                                  value={handler.condition}
                                  onChange={(e) =>
                                    handleUpdateExceptionHandler(
                                      index,
                                      "condition",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                                >
                                  <option value="">Select condition...</option>
                                  <option value="step.failed">Step Failed</option>
                                  <option value="step.timeout">Step Timeout</option>
                                  <option value="approval.rejected">Approval Rejected</option>
                                  <option value="approval.timeout">Approval Timeout</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Action
                                </label>
                                <select
                                  value={handler.action}
                                  onChange={(e) =>
                                    handleUpdateExceptionHandler(
                                      index,
                                      "action",
                                      e.target.value,
                                    )
                                  }
                                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                                >
                                  <option value="notify_owner">Notify Owner</option>
                                  <option value="escalate">Escalate</option>
                                  <option value="retry_with_modification">
                                    Retry with Modification
                                  </option>
                                  <option value="halt_and_escalate">Halt and Escalate</option>
                                  <option value="return_to_step">Return to Step</option>
                                  <option value="send_reminder">Send Reminder</option>
                                  <option value="request_revision">Request Revision</option>
                                  <option value="page_executive">Page Executive</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Target
                                </label>
                                <input
                                  type="text"
                                  value={handler.target || ""}
                                  onChange={(e) =>
                                    handleUpdateExceptionHandler(index, "target", e.target.value)
                                  }
                                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                                  placeholder="e.g., team-lead"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Message Template
                                </label>
                                <input
                                  type="text"
                                  value={handler.message || ""}
                                  onChange={(e) =>
                                    handleUpdateExceptionHandler(index, "message", e.target.value)
                                  }
                                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                                  placeholder="e.g., SOP failed: {{step.name}}"
                                />
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveExceptionHandler(index)}
                              className="text-red-500 hover:text-red-700 text-lg"
                            >
                              &times;
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* YAML Viewer Modal */}
      {showYaml && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">YAML Configuration</h3>
              <button
                onClick={() => setShowYaml(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="bg-gray-50 p-4 rounded-lg text-sm font-mono whitespace-pre-wrap">
                {yamlContent || "Loading..."}
              </pre>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(yamlContent);
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
              >
                Copy to Clipboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      <SOPPreview
        sopId={id || null}
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
      />
    </div>
  );
}
