/**
 * SkillFormModal Component
 *
 * Modal form for creating/editing skills.
 */

import { useState, useEffect } from "react";
import { ApiError, request } from "../../api/client";

interface Agent {
  id: string;
  name: string;
}

interface Tool {
  id: string;
  name: string;
  description: string;
}

interface SkillParameter {
  name: string;
  type: string;
  description: string;
  required?: boolean;
  default?: unknown;
}

interface SkillOutput {
  name: string;
  type: string;
  description: string;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  triggers: string[];
  parameters?: SkillParameter[];
  outputs?: SkillOutput[];
  tools_required: string[];
}

interface SkillFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  skill?: Skill | null;
  availableAgents: Agent[]; // Reserved for future use
  availableTools: Tool[];
}

const CATEGORY_OPTIONS = [
  { value: "operations", label: "Operations" },
  { value: "marketing", label: "Marketing" },
  { value: "hr", label: "Human Resources" },
  { value: "finance", label: "Finance" },
  { value: "customer", label: "Customer Success" },
  { value: "product", label: "Product" },
];

const PARAM_TYPE_OPTIONS = ["string", "number", "boolean", "object", "array"];

export default function SkillFormModal({
  isOpen,
  onClose,
  onSuccess,
  skill,
  availableAgents: _availableAgents,
  availableTools,
}: SkillFormModalProps) {
  const isEditing = !!skill;

  const [formData, setFormData] = useState({
    id: "",
    name: "",
    description: "",
    category: "operations",
    triggers: [] as string[],
    parameters: [] as SkillParameter[],
    outputs: [] as SkillOutput[],
    tools_required: [] as string[],
  });

  const [triggerInput, setTriggerInput] = useState("");
  const [paramInput, setParamInput] = useState({ name: "", type: "string", description: "", required: false, default: "" });
  const [outputInput, setOutputInput] = useState({ name: "", type: "string", description: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (skill) {
      setFormData({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        category: skill.category,
        triggers: [...skill.triggers],
        parameters: skill.parameters ? [...skill.parameters] : [],
        outputs: skill.outputs ? [...skill.outputs] : [],
        tools_required: [...skill.tools_required],
      });
    } else {
      setFormData({
        id: "",
        name: "",
        description: "",
        category: "operations",
        triggers: [],
        parameters: [],
        outputs: [],
        tools_required: [],
      });
    }
    setError(null);
  }, [skill, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (isEditing) {
        await request({
          url: `/api/admin/skills/${formData.id}`,
          method: "PUT",
          data: {
            name: formData.name,
            description: formData.description,
            category: formData.category,
            triggers: formData.triggers,
            parameters: formData.parameters,
            outputs: formData.outputs,
            tools_required: formData.tools_required,
          },
        });
      } else {
        await request({
          url: "/api/admin/skills",
          method: "POST",
          data: formData,
        });
      }
      onSuccess();
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to save skill";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addTrigger = () => {
    if (triggerInput.trim() && !formData.triggers.includes(triggerInput.trim())) {
      setFormData({
        ...formData,
        triggers: [...formData.triggers, triggerInput.trim()],
      });
      setTriggerInput("");
    }
  };

  const removeTrigger = (idx: number) => {
    setFormData({
      ...formData,
      triggers: formData.triggers.filter((_, i) => i !== idx),
    });
  };

  const addParameter = () => {
    if (paramInput.name.trim() && paramInput.description.trim()) {
      const newParam: SkillParameter = {
        name: paramInput.name.trim(),
        type: paramInput.type,
        description: paramInput.description.trim(),
        required: paramInput.required,
      };
      if (paramInput.default.trim()) {
        try {
          newParam.default = JSON.parse(paramInput.default);
        } catch {
          newParam.default = paramInput.default;
        }
      }
      setFormData({
        ...formData,
        parameters: [...formData.parameters, newParam],
      });
      setParamInput({ name: "", type: "string", description: "", required: false, default: "" });
    }
  };

  const removeParameter = (idx: number) => {
    setFormData({
      ...formData,
      parameters: formData.parameters.filter((_, i) => i !== idx),
    });
  };

  const addOutput = () => {
    if (outputInput.name.trim() && outputInput.description.trim()) {
      setFormData({
        ...formData,
        outputs: [...formData.outputs, { ...outputInput, name: outputInput.name.trim(), description: outputInput.description.trim() }],
      });
      setOutputInput({ name: "", type: "string", description: "" });
    }
  };

  const removeOutput = (idx: number) => {
    setFormData({
      ...formData,
      outputs: formData.outputs.filter((_, i) => i !== idx),
    });
  };

  const toggleTool = (toolId: string) => {
    const newTools = formData.tools_required.includes(toolId)
      ? formData.tools_required.filter((t) => t !== toolId)
      : [...formData.tools_required, toolId];
    setFormData({ ...formData, tools_required: newTools });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {isEditing ? "Edit Skill" : "Create Skill"}
            </h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              {/* ID */}
              <div>
                <label htmlFor="id" className="block text-sm font-medium text-gray-700 mb-1">
                  ID (slug) *
                </label>
                <input
                  id="id"
                  type="text"
                  value={formData.id}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
                    })
                  }
                  placeholder="resource-planning"
                  disabled={isEditing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-100"
                />
              </div>

              {/* Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Resource Planning"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              {/* Description */}
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description *
                </label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Skill description..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              {/* Category */}
              <div>
                <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
                  Category *
                </label>
                <select
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Triggers */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Triggers</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={triggerInput}
                    onChange={(e) => setTriggerInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTrigger())}
                    placeholder="Add trigger keyword..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                  <button
                    type="button"
                    onClick={addTrigger}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.triggers.map((trigger, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full"
                    >
                      {trigger}
                      <button
                        type="button"
                        onClick={() => removeTrigger(idx)}
                        className="text-green-600 hover:text-green-800"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Required Tools */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Required Tools</label>
                <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg max-h-32 overflow-y-auto">
                  {availableTools.map((tool) => (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => toggleTool(tool.id)}
                      className={`px-3 py-1 text-sm rounded-full transition-colors ${
                        formData.tools_required.includes(tool.id)
                          ? "bg-blue-600 text-white"
                          : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-100"
                      }`}
                      title={tool.description}
                    >
                      {tool.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Parameters */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Parameters</label>
                <div className="space-y-2 mb-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={paramInput.name}
                      onChange={(e) => setParamInput({ ...paramInput, name: e.target.value })}
                      placeholder="Name"
                      className="w-1/4 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <select
                      value={paramInput.type}
                      onChange={(e) => setParamInput({ ...paramInput, type: e.target.value })}
                      className="w-1/6 px-2 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      {PARAM_TYPE_OPTIONS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={paramInput.description}
                      onChange={(e) => setParamInput({ ...paramInput, description: e.target.value })}
                      placeholder="Description"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <button
                      type="button"
                      onClick={addParameter}
                      className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex gap-2 items-center pl-2">
                    <label className="flex items-center gap-1 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={paramInput.required}
                        onChange={(e) => setParamInput({ ...paramInput, required: e.target.checked })}
                        className="w-3 h-3"
                      />
                      Required
                    </label>
                    <input
                      type="text"
                      value={paramInput.default}
                      onChange={(e) => setParamInput({ ...paramInput, default: e.target.value })}
                      placeholder="Default value (optional)"
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
                    />
                  </div>
                </div>
                {formData.parameters.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-2 space-y-1">
                    {formData.parameters.map((param, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm bg-white px-2 py-1 rounded">
                        <span>
                          <span className="font-medium">{param.name}</span>
                          <span className="text-gray-400 mx-1">({param.type})</span>
                          {param.required && <span className="text-red-500">*</span>}
                          <span className="text-gray-500 text-xs ml-2">{param.description}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeParameter(idx)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Outputs */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Outputs</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={outputInput.name}
                    onChange={(e) => setOutputInput({ ...outputInput, name: e.target.value })}
                    placeholder="Name"
                    className="w-1/4 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <select
                    value={outputInput.type}
                    onChange={(e) => setOutputInput({ ...outputInput, type: e.target.value })}
                    className="w-1/6 px-2 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    {PARAM_TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={outputInput.description}
                    onChange={(e) => setOutputInput({ ...outputInput, description: e.target.value })}
                    placeholder="Description"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <button
                    type="button"
                    onClick={addOutput}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                  >
                    +
                  </button>
                </div>
                {formData.outputs.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-2 space-y-1">
                    {formData.outputs.map((output, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm bg-white px-2 py-1 rounded">
                        <span>
                          <span className="font-medium">{output.name}</span>
                          <span className="text-gray-400 mx-1">({output.type})</span>
                          <span className="text-gray-500 text-xs ml-2">{output.description}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeOutput(idx)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center rounded-b-lg">
            <p className="text-sm text-gray-500">Changes will create a GitHub PR for review</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !formData.id || !formData.name || !formData.description}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Creating PR..." : isEditing ? "Update Skill" : "Create Skill"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
