/**
 * SkillCard Component
 *
 * Displays a skill card with its details, triggers, tools, and agent bindings.
 */

import { useState } from "react";

interface Agent {
  id: string;
  name: string;
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
  agentDetails?: Agent[];
}

interface SkillCardProps {
  skill: Skill;
  onEdit: (skill: Skill) => void;
  onDelete: (skill: Skill) => void;
}

export default function SkillCard({ skill, onEdit, onDelete }: SkillCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      operations: "bg-blue-100 text-blue-800",
      marketing: "bg-purple-100 text-purple-800",
      hr: "bg-green-100 text-green-800",
      finance: "bg-yellow-100 text-yellow-800",
      customer: "bg-pink-100 text-pink-800",
      product: "bg-indigo-100 text-indigo-800",
    };
    return colors[category] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-2xl text-white">⚡</span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{skill.name}</h3>
              <p className="text-sm text-gray-500">{skill.id}</p>
            </div>
          </div>
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getCategoryColor(skill.category)}`}>
            {skill.category}
          </span>
        </div>

        <p className="mt-4 text-gray-600 text-sm">{skill.description}</p>

        {/* Triggers */}
        <div className="mt-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Triggers
          </h4>
          <div className="flex flex-wrap gap-2">
            {skill.triggers.map((trigger, idx) => (
              <span
                key={idx}
                className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800"
              >
                {trigger}
              </span>
            ))}
            {skill.triggers.length === 0 && (
              <span className="text-xs text-gray-400">No triggers configured</span>
            )}
          </div>
        </div>

        {/* Agent Bindings */}
        <div className="mt-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Used by Agents
          </h4>
          <div className="flex flex-wrap gap-2">
            {skill.agentDetails?.map((agent) => (
              <span
                key={agent.id}
                className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs rounded-full"
              >
                {agent.name}
              </span>
            )) || <span className="text-xs text-gray-400">Not bound to any agent</span>}
          </div>
        </div>

        {/* Expandable Details */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-4 text-sm text-purple-600 hover:text-purple-800 flex items-center gap-1"
        >
          {isExpanded ? "Hide details" : "Show details"}
          <svg
            className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
            {/* Tools */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Required Tools
              </h4>
              <div className="flex flex-wrap gap-2">
                {skill.tools_required.map((tool) => (
                  <span
                    key={tool}
                    className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full"
                  >
                    {tool}
                  </span>
                ))}
                {skill.tools_required.length === 0 && (
                  <span className="text-xs text-gray-400">No tools required</span>
                )}
              </div>
            </div>

            {/* Parameters */}
            {skill.parameters && skill.parameters.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Parameters
                </h4>
                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  {skill.parameters.map((param) => (
                    <div key={param.name} className="text-sm">
                      <span className="font-medium text-gray-700">{param.name}</span>
                      <span className="text-gray-400 mx-1">({param.type})</span>
                      {param.required && <span className="text-red-500 text-xs">*</span>}
                      <p className="text-gray-500 text-xs">{param.description}</p>
                      {param.default !== undefined && (
                        <span className="text-xs text-blue-600">Default: {JSON.stringify(param.default)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Outputs */}
            {skill.outputs && skill.outputs.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Outputs
                </h4>
                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  {skill.outputs.map((output) => (
                    <div key={output.name} className="text-sm">
                      <span className="font-medium text-gray-700">{output.name}</span>
                      <span className="text-gray-400 mx-1">({output.type})</span>
                      <p className="text-gray-500 text-xs">{output.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end items-center gap-2 rounded-b-lg">
        <button
          onClick={() => onEdit(skill)}
          className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(skill)}
          className="px-3 py-1.5 text-sm text-red-600 bg-white border border-red-300 rounded-md hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
