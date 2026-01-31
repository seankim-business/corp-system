import { useState, useEffect } from "react";
import { SOPStepData } from "./StepNode";

interface StepConfigPanelProps {
  step: SOPStepData | null;
  onUpdate: (step: SOPStepData) => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function StepConfigPanel({
  step,
  onUpdate,
  onDelete,
  onClose,
}: StepConfigPanelProps) {
  const [localStep, setLocalStep] = useState<SOPStepData | null>(step);
  const [checklistInput, setChecklistInput] = useState("");

  useEffect(() => {
    setLocalStep(step);
  }, [step]);

  if (!localStep) {
    return (
      <div className="w-80 border-l border-gray-200 bg-gray-50 p-4">
        <p className="text-gray-500 text-sm">Select a step to configure</p>
      </div>
    );
  }

  const handleChange = (
    field: keyof SOPStepData,
    value: string | boolean | string[] | Record<string, unknown> | undefined,
  ) => {
    const updated = { ...localStep, [field]: value };
    setLocalStep(updated);
    onUpdate(updated);
  };

  const handleConditionalChange = (value: string) => {
    const updated: SOPStepData = {
      ...localStep,
      conditional: { when: value },
    };
    setLocalStep(updated);
    onUpdate(updated);
  };

  const addChecklistItem = () => {
    if (!checklistInput.trim()) return;
    const newChecklist = [...(localStep.checklist || []), checklistInput.trim()];
    handleChange("checklist", newChecklist);
    setChecklistInput("");
  };

  const removeChecklistItem = (index: number) => {
    const newChecklist = localStep.checklist?.filter((_, i) => i !== index) || [];
    handleChange("checklist", newChecklist.length > 0 ? newChecklist : undefined);
  };

  return (
    <div className="w-80 border-l border-gray-200 bg-white overflow-y-auto">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Step Configuration</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">
          &times;
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Step Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select
            value={localStep.type}
            onChange={(e) =>
              handleChange("type", e.target.value as SOPStepData["type"])
            }
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="automated">🤖 Automated</option>
            <option value="manual">👤 Manual</option>
            <option value="approval_required">✅ Approval Required</option>
          </select>
        </div>

        {/* Step ID */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ID</label>
          <input
            type="text"
            value={localStep.id}
            onChange={(e) =>
              handleChange(
                "id",
                e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
              )
            }
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="step-id"
          />
        </div>

        {/* Step Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            type="text"
            value={localStep.name}
            onChange={(e) => handleChange("name", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Step name"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            value={localStep.description || ""}
            onChange={(e) =>
              handleChange("description", e.target.value || undefined)
            }
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            rows={2}
            placeholder="Optional description"
          />
        </div>

        {/* Automated step fields */}
        {localStep.type === "automated" && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Agent
              </label>
              <input
                type="text"
                value={localStep.agent || ""}
                onChange={(e) => handleChange("agent", e.target.value || undefined)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="e.g., cs-agent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tool
              </label>
              <input
                type="text"
                value={localStep.tool || ""}
                onChange={(e) => handleChange("tool", e.target.value || undefined)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="e.g., send_email"
              />
            </div>
          </>
        )}

        {/* Manual step fields */}
        {localStep.type === "manual" && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assignee
              </label>
              <input
                type="text"
                value={localStep.assignee || ""}
                onChange={(e) => handleChange("assignee", e.target.value || undefined)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="e.g., cs-manager"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={localStep.requires_approval || false}
                  onChange={(e) => handleChange("requires_approval", e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-gray-700">Requires Approval</span>
              </label>
            </div>
          </>
        )}

        {/* Approval step fields */}
        {localStep.type === "approval_required" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Approver
            </label>
            <input
              type="text"
              value={localStep.approver || ""}
              onChange={(e) => handleChange("approver", e.target.value || undefined)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="e.g., team-lead"
            />
          </div>
        )}

        {/* Timeout */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Timeout</label>
          <select
            value={localStep.timeout || ""}
            onChange={(e) => handleChange("timeout", e.target.value || undefined)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">No timeout</option>
            <option value="5m">5 minutes</option>
            <option value="15m">15 minutes</option>
            <option value="30m">30 minutes</option>
            <option value="1h">1 hour</option>
            <option value="2h">2 hours</option>
            <option value="4h">4 hours</option>
            <option value="8h">8 hours</option>
            <option value="24h">24 hours</option>
            <option value="48h">48 hours</option>
            <option value="72h">72 hours</option>
          </select>
        </div>

        {/* Conditional */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Conditional (when)
          </label>
          <input
            type="text"
            value={localStep.conditional?.when || ""}
            onChange={(e) =>
              e.target.value
                ? handleConditionalChange(e.target.value)
                : handleChange("conditional", undefined)
            }
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder='e.g., {{risk_score}} >= 7'
          />
          <p className="text-xs text-gray-500 mt-1">
            Use {'{{variable}}'} syntax for template variables
          </p>
        </div>

        {/* Checklist (for manual steps) */}
        {(localStep.type === "manual" || localStep.type === "approval_required") && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Checklist
            </label>
            <div className="space-y-2">
              {localStep.checklist?.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-gray-600 bg-gray-50 px-2 py-1 rounded">
                    {item}
                  </span>
                  <button
                    onClick={() => removeChecklistItem(index)}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    &times;
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={checklistInput}
                  onChange={(e) => setChecklistInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addChecklistItem()}
                  className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                  placeholder="Add checklist item"
                />
                <button
                  onClick={addChecklistItem}
                  className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-sm hover:bg-indigo-200"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete button */}
        <div className="pt-4 border-t border-gray-200">
          <button
            onClick={onDelete}
            className="w-full px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 text-sm font-medium"
          >
            Delete Step
          </button>
        </div>
      </div>
    </div>
  );
}
