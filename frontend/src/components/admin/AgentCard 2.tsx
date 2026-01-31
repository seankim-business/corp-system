/**
 * AgentCard Component
 *
 * Displays an agent card with its details, skills, and actions.
 */

import { useState } from "react";

interface Skill {
  id: string;
  name: string;
}

interface Agent {
  id: string;
  name: string;
  function: string;
  description: string;
  skills: string[];
  skillDetails?: Skill[];
  tools: string[];
  routing_keywords: string[];
  permissions: {
    read: string[];
    write: string[];
  };
  enabled?: boolean;
}

interface AgentCardProps {
  agent: Agent;
  onEdit: (agent: Agent) => void;
  onDelete: (agent: Agent) => void;
  onViewActivity?: (agent: Agent) => void;
  onToggleEnabled?: (agent: Agent, enabled: boolean) => void;
}

export default function AgentCard({ agent, onEdit, onDelete, onViewActivity, onToggleEnabled }: AgentCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  const handleToggle = async () => {
    if (!onToggleEnabled || isToggling) return;
    setIsToggling(true);
    try {
      await onToggleEnabled(agent, !agent.enabled);
    } finally {
      setIsToggling(false);
    }
  };

  const getFunctionColor = (func: string) => {
    const colors: Record<string, string> = {
      ops: "bg-blue-100 text-blue-800",
      brand: "bg-purple-100 text-purple-800",
      hr: "bg-green-100 text-green-800",
      finance: "bg-yellow-100 text-yellow-800",
      cs: "bg-pink-100 text-pink-800",
      product: "bg-indigo-100 text-indigo-800",
    };
    return colors[func] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-2xl text-white">
                {agent.function === "ops" && "🔧"}
                {agent.function === "brand" && "🎨"}
                {agent.function === "hr" && "👥"}
                {agent.function === "finance" && "💰"}
                {agent.function === "cs" && "💬"}
                {agent.function === "product" && "📦"}
                {!["ops", "brand", "hr", "finance", "cs", "product"].includes(agent.function) && "🤖"}
              </span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{agent.name}</h3>
              <p className="text-sm text-gray-500">{agent.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getFunctionColor(agent.function)}`}>
              {agent.function}
            </span>
            {/* Enable/Disable Toggle */}
            {onToggleEnabled && (
              <button
                onClick={handleToggle}
                disabled={isToggling}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                  agent.enabled !== false ? "bg-green-500" : "bg-gray-300"
                } ${isToggling ? "opacity-50" : ""}`}
                title={agent.enabled !== false ? "Enabled - Click to disable" : "Disabled - Click to enable"}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    agent.enabled !== false ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            )}
          </div>
        </div>

        <p className="mt-4 text-gray-600 text-sm">{agent.description}</p>

        {/* Skills */}
        <div className="mt-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Skills</h4>
          <div className="flex flex-wrap gap-2">
            {(agent.skillDetails || agent.skills.map((s) => ({ id: s, name: s }))).map((skill) => (
              <span
                key={skill.id}
                className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
              >
                {skill.name}
              </span>
            ))}
            {agent.skills.length === 0 && (
              <span className="text-xs text-gray-400">No skills assigned</span>
            )}
          </div>
        </div>

        {/* Expandable Details */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-4 text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
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
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tools</h4>
              <div className="flex flex-wrap gap-2">
                {agent.tools.map((tool) => (
                  <span
                    key={tool}
                    className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full"
                  >
                    {tool}
                  </span>
                ))}
                {agent.tools.length === 0 && (
                  <span className="text-xs text-gray-400">No tools configured</span>
                )}
              </div>
            </div>

            {/* Routing Keywords */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Routing Keywords
              </h4>
              <div className="flex flex-wrap gap-2">
                {agent.routing_keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="px-2 py-1 bg-orange-50 text-orange-700 text-xs rounded-full"
                  >
                    {keyword}
                  </span>
                ))}
                {agent.routing_keywords.length === 0 && (
                  <span className="text-xs text-gray-400">No keywords configured</span>
                )}
              </div>
            </div>

            {/* Permissions */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Permissions
              </h4>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-gray-500">Read:</span>
                  <ul className="mt-1 space-y-1">
                    {agent.permissions.read.map((path) => (
                      <li key={path} className="text-green-700 font-mono">
                        {path}
                      </li>
                    ))}
                    {agent.permissions.read.length === 0 && (
                      <li className="text-gray-400">None</li>
                    )}
                  </ul>
                </div>
                <div>
                  <span className="text-gray-500">Write:</span>
                  <ul className="mt-1 space-y-1">
                    {agent.permissions.write.map((path) => (
                      <li key={path} className="text-yellow-700 font-mono">
                        {path}
                      </li>
                    ))}
                    {agent.permissions.write.length === 0 && (
                      <li className="text-gray-400">None</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center rounded-b-lg">
        <button
          onClick={() => onViewActivity?.(agent)}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          View Activity
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => onEdit(agent)}
            className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(agent)}
            className="px-3 py-1.5 text-sm text-red-600 bg-white border border-red-300 rounded-md hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
