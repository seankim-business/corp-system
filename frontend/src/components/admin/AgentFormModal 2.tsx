/**
 * AgentFormModal Component
 *
 * Modal form for creating/editing agents.
 */

import { useState, useEffect } from "react";
import { ApiError, request } from "../../api/client";

interface Skill {
  id: string;
  name: string;
}

interface Tool {
  id: string;
  name: string;
  description: string;
}

interface Agent {
  id: string;
  name: string;
  function: string;
  description: string;
  skills: string[];
  tools: string[];
  routing_keywords: string[];
  permissions: {
    read: string[];
    write: string[];
  };
}

interface AgentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  agent?: Agent | null;
  availableSkills: Skill[];
  availableTools: Tool[];
}

const FUNCTION_OPTIONS = [
  { value: "ops", label: "Operations" },
  { value: "brand", label: "Brand/Marketing" },
  { value: "hr", label: "Human Resources" },
  { value: "finance", label: "Finance" },
  { value: "cs", label: "Customer Success" },
  { value: "product", label: "Product" },
];

export default function AgentFormModal({
  isOpen,
  onClose,
  onSuccess,
  agent,
  availableSkills,
  availableTools,
}: AgentFormModalProps) {
  const isEditing = !!agent;

  const [formData, setFormData] = useState({
    id: "",
    name: "",
    function: "ops",
    description: "",
    skills: [] as string[],
    tools: [] as string[],
    routing_keywords: [] as string[],
    permissions: {
      read: [] as string[],
      write: [] as string[],
    },
  });

  const [keywordInput, setKeywordInput] = useState("");
  const [readPathInput, setReadPathInput] = useState("");
  const [writePathInput, setWritePathInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (agent) {
      setFormData({
        id: agent.id,
        name: agent.name,
        function: agent.function,
        description: agent.description,
        skills: [...agent.skills],
        tools: [...agent.tools],
        routing_keywords: [...agent.routing_keywords],
        permissions: {
          read: [...agent.permissions.read],
          write: [...agent.permissions.write],
        },
      });
    } else {
      setFormData({
        id: "",
        name: "",
        function: "ops",
        description: "",
        skills: [],
        tools: [],
        routing_keywords: [],
        permissions: { read: [], write: [] },
      });
    }
    setError(null);
  }, [agent, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (isEditing) {
        await request({
          url: `/api/admin/agents/${formData.id}`,
          method: "PUT",
          data: {
            name: formData.name,
            function: formData.function,
            description: formData.description,
            skills: formData.skills,
            tools: formData.tools,
            routing_keywords: formData.routing_keywords,
            permissions: formData.permissions,
          },
        });
      } else {
        await request({
          url: "/api/admin/agents",
          method: "POST",
          data: formData,
        });
      }
      onSuccess();
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to save agent";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addKeyword = () => {
    if (keywordInput.trim() && !formData.routing_keywords.includes(keywordInput.trim())) {
      setFormData({
        ...formData,
        routing_keywords: [...formData.routing_keywords, keywordInput.trim()],
      });
      setKeywordInput("");
    }
  };

  const removeKeyword = (keyword: string) => {
    setFormData({
      ...formData,
      routing_keywords: formData.routing_keywords.filter((k) => k !== keyword),
    });
  };

  const addReadPath = () => {
    if (readPathInput.trim() && !formData.permissions.read.includes(readPathInput.trim())) {
      setFormData({
        ...formData,
        permissions: {
          ...formData.permissions,
          read: [...formData.permissions.read, readPathInput.trim()],
        },
      });
      setReadPathInput("");
    }
  };

  const removeReadPath = (path: string) => {
    setFormData({
      ...formData,
      permissions: {
        ...formData.permissions,
        read: formData.permissions.read.filter((p) => p !== path),
      },
    });
  };

  const addWritePath = () => {
    if (writePathInput.trim() && !formData.permissions.write.includes(writePathInput.trim())) {
      setFormData({
        ...formData,
        permissions: {
          ...formData.permissions,
          write: [...formData.permissions.write, writePathInput.trim()],
        },
      });
      setWritePathInput("");
    }
  };

  const removeWritePath = (path: string) => {
    setFormData({
      ...formData,
      permissions: {
        ...formData.permissions,
        write: formData.permissions.write.filter((p) => p !== path),
      },
    });
  };

  const toggleSkill = (skillId: string) => {
    const newSkills = formData.skills.includes(skillId)
      ? formData.skills.filter((s) => s !== skillId)
      : [...formData.skills, skillId];
    setFormData({ ...formData, skills: newSkills });
  };

  const toggleTool = (toolId: string) => {
    const newTools = formData.tools.includes(toolId)
      ? formData.tools.filter((t) => t !== toolId)
      : [...formData.tools, toolId];
    setFormData({ ...formData, tools: newTools });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {isEditing ? "Edit Agent" : "Create Agent"}
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
                  onChange={(e) => setFormData({ ...formData, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
                  placeholder="brand-agent"
                  disabled={isEditing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
                />
                <p className="mt-1 text-xs text-gray-500">Lowercase letters, numbers, and hyphens only</p>
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
                  placeholder="Brand Agent"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {/* Function */}
              <div>
                <label htmlFor="function" className="block text-sm font-medium text-gray-700 mb-1">
                  Function *
                </label>
                <select
                  id="function"
                  value={formData.function}
                  onChange={(e) => setFormData({ ...formData, function: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {FUNCTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
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
                  placeholder="Agent description..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {/* Skills */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Skills</label>
                <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg max-h-32 overflow-y-auto">
                  {availableSkills.map((skill) => (
                    <button
                      key={skill.id}
                      type="button"
                      onClick={() => toggleSkill(skill.id)}
                      className={`px-3 py-1 text-sm rounded-full transition-colors ${
                        formData.skills.includes(skill.id)
                          ? "bg-indigo-600 text-white"
                          : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      {skill.name}
                    </button>
                  ))}
                  {availableSkills.length === 0 && (
                    <span className="text-sm text-gray-500">No skills available</span>
                  )}
                </div>
              </div>

              {/* Tools */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tools</label>
                <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg max-h-32 overflow-y-auto">
                  {availableTools.map((tool) => (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => toggleTool(tool.id)}
                      className={`px-3 py-1 text-sm rounded-full transition-colors ${
                        formData.tools.includes(tool.id)
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

              {/* Routing Keywords */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Routing Keywords</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                    placeholder="Add keyword..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={addKeyword}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.routing_keywords.map((keyword) => (
                    <span
                      key={keyword}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-800 text-sm rounded-full"
                    >
                      {keyword}
                      <button
                        type="button"
                        onClick={() => removeKeyword(keyword)}
                        className="text-orange-600 hover:text-orange-800"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Permissions */}
              <div className="grid grid-cols-2 gap-4">
                {/* Read Paths */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Read Paths</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={readPathInput}
                      onChange={(e) => setReadPathInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addReadPath())}
                      placeholder="/sops/*"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    />
                    <button
                      type="button"
                      onClick={addReadPath}
                      className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                    >
                      +
                    </button>
                  </div>
                  <ul className="space-y-1 max-h-24 overflow-y-auto">
                    {formData.permissions.read.map((path) => (
                      <li key={path} className="flex items-center justify-between text-sm bg-green-50 px-2 py-1 rounded">
                        <span className="font-mono text-green-700">{path}</span>
                        <button
                          type="button"
                          onClick={() => removeReadPath(path)}
                          className="text-green-600 hover:text-green-800"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Write Paths */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Write Paths</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={writePathInput}
                      onChange={(e) => setWritePathInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addWritePath())}
                      placeholder="/sops/*"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    />
                    <button
                      type="button"
                      onClick={addWritePath}
                      className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                    >
                      +
                    </button>
                  </div>
                  <ul className="space-y-1 max-h-24 overflow-y-auto">
                    {formData.permissions.write.map((path) => (
                      <li key={path} className="flex items-center justify-between text-sm bg-yellow-50 px-2 py-1 rounded">
                        <span className="font-mono text-yellow-700">{path}</span>
                        <button
                          type="button"
                          onClick={() => removeWritePath(path)}
                          className="text-yellow-600 hover:text-yellow-800"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center rounded-b-lg">
            <p className="text-sm text-gray-500">
              Changes will create a GitHub PR for review
            </p>
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
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Creating PR..." : isEditing ? "Update Agent" : "Create Agent"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
