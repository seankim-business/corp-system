/**
 * AgentsPage
 *
 * Displays agent hierarchy and details with two views:
 * - List View: Grid of agent cards
 * - Organization Chart View: Hierarchical tree structure
 */

import { useEffect, useState } from "react";
import { request } from "../api/client";

interface Agent {
  id: string;
  name: string;
  function: string;
  description: string;
  skills: string[];
  tools: string[];
  routing_keywords: string[];
  permissions: { read: string[]; write: string[] };
  skillDetails?: { id: string; name: string }[];
}

type ViewMode = "list" | "chart";

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const fetchAgents = async () => {
    try {
      setIsLoading(true);
      const data = await request<{ agents: Agent[] }>({
        url: "/api/admin/agents",
        method: "GET",
      });
      setAgents(data.agents);
    } catch (error) {
      console.error("Failed to fetch agents:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const filteredAgents = agents.filter(
    (agent) =>
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.function.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const organizationHierarchy = () => {
    const meta = agents.find((a) => a.function === "system");
    const orchestrator = agents.find((a) => a.function === "orchestrator");
    const functions = agents.filter(
      (a) => a.function !== "system" && a.function !== "orchestrator"
    );

    return { meta, orchestrator, functions };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 border-2 border-slate-200 rounded-sm"></div>
            <div className="absolute inset-0 border-2 border-slate-900 rounded-sm animate-ping"></div>
            <div className="absolute inset-2 border-2 border-slate-600 rounded-sm animate-spin"></div>
          </div>
          <p className="text-slate-600 font-mono text-sm tracking-wider">
            LOADING AGENT REGISTRY
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      {/* Background pattern */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.015]">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `
              linear-gradient(to right, #000 1px, transparent 1px),
              linear-gradient(to bottom, #000 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
          }}
        ></div>
      </div>

      <div className="relative">
        {/* Header */}
        <div className="mb-12 border-b-2 border-slate-900 pb-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-baseline gap-4 mb-3">
                <h1 className="text-5xl font-bold text-slate-900 tracking-tight">
                  AGENT REGISTRY
                </h1>
                <span className="font-mono text-sm text-slate-500 tracking-widest">
                  v{agents.length.toString().padStart(3, "0")}
                </span>
              </div>
              <p className="text-slate-600 text-lg max-w-2xl leading-relaxed">
                Autonomous intelligence distribution layer
              </p>
            </div>
            <button
              onClick={fetchAgents}
              className="group relative px-6 py-3 border-2 border-slate-900 bg-white hover:bg-slate-900 transition-colors duration-200"
            >
              <span className="font-mono text-xs tracking-widest text-slate-900 group-hover:text-white">
                REFRESH
              </span>
            </button>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Search by name or function..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-6 py-4 border-2 border-slate-900 bg-white font-mono text-sm tracking-wide focus:outline-none focus:ring-4 focus:ring-slate-200 transition-shadow"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-xs text-slate-400">
                {filteredAgents.length}/{agents.length}
              </div>
            </div>

            {/* View toggle */}
            <div className="flex border-2 border-slate-900 divide-x-2 divide-slate-900">
              <button
                onClick={() => setViewMode("list")}
                className={`px-8 py-4 font-mono text-xs tracking-widest transition-colors ${
                  viewMode === "list"
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-900 hover:bg-slate-100"
                }`}
              >
                LIST
              </button>
              <button
                onClick={() => setViewMode("chart")}
                className={`px-8 py-4 font-mono text-xs tracking-widest transition-colors ${
                  viewMode === "chart"
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-900 hover:bg-slate-100"
                }`}
              >
                CHART
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        {filteredAgents.length === 0 ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center space-y-4 max-w-md">
              <div className="w-24 h-24 mx-auto border-2 border-dashed border-slate-300 flex items-center justify-center">
                <span className="text-4xl text-slate-300">∅</span>
              </div>
              <p className="font-mono text-sm text-slate-600 tracking-wide">
                NO AGENTS FOUND
              </p>
              <p className="text-slate-500 text-sm">
                {searchQuery
                  ? "Try adjusting your search query"
                  : "No agents registered in the system"}
              </p>
            </div>
          </div>
        ) : viewMode === "list" ? (
          <ListView
            agents={filteredAgents}
            selectedAgent={selectedAgent}
            onSelectAgent={setSelectedAgent}
          />
        ) : (
          <ChartView
            hierarchy={organizationHierarchy()}
            selectedAgent={selectedAgent}
            onSelectAgent={setSelectedAgent}
          />
        )}
      </div>

      {/* Detail Panel */}
      {selectedAgent && (
        <DetailPanel agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
      )}
    </div>
  );
}

// List View Component
function ListView({
  agents,
  selectedAgent,
  onSelectAgent,
}: {
  agents: Agent[];
  selectedAgent: Agent | null;
  onSelectAgent: (agent: Agent) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {agents.map((agent, index) => (
        <button
          key={agent.id}
          onClick={() => onSelectAgent(agent)}
          className={`group relative text-left border-2 transition-all duration-200 ${
            selectedAgent?.id === agent.id
              ? "border-slate-900 bg-slate-900 shadow-lg scale-[1.02]"
              : "border-slate-900 bg-white hover:shadow-lg hover:scale-[1.02]"
          }`}
          style={{
            animationDelay: `${index * 50}ms`,
            animation: "slideUp 0.4s ease-out",
          }}
        >
          {/* Card header */}
          <div
            className={`border-b-2 px-6 py-4 ${
              selectedAgent?.id === agent.id
                ? "border-slate-700"
                : "border-slate-900"
            }`}
          >
            <div className="flex items-start justify-between gap-4 mb-2">
              <h3
                className={`font-bold text-lg tracking-tight ${
                  selectedAgent?.id === agent.id ? "text-white" : "text-slate-900"
                }`}
              >
                {agent.name}
              </h3>
              <span
                className={`font-mono text-[10px] tracking-widest px-2 py-1 border ${
                  selectedAgent?.id === agent.id
                    ? "border-slate-700 text-slate-300"
                    : "border-slate-900 text-slate-600"
                }`}
              >
                {agent.function.toUpperCase()}
              </span>
            </div>
            <p
              className={`font-mono text-xs ${
                selectedAgent?.id === agent.id ? "text-slate-400" : "text-slate-500"
              }`}
            >
              {agent.id}
            </p>
          </div>

          {/* Card body */}
          <div className="px-6 py-5 space-y-4">
            <p
              className={`text-sm leading-relaxed ${
                selectedAgent?.id === agent.id ? "text-slate-200" : "text-slate-700"
              }`}
            >
              {agent.description}
            </p>

            {/* Stats */}
            <div className="flex items-center gap-6 pt-2">
              <div>
                <div
                  className={`font-mono text-xs mb-1 ${
                    selectedAgent?.id === agent.id
                      ? "text-slate-500"
                      : "text-slate-500"
                  }`}
                >
                  SKILLS
                </div>
                <div
                  className={`text-2xl font-bold ${
                    selectedAgent?.id === agent.id ? "text-white" : "text-slate-900"
                  }`}
                >
                  {agent.skills.length}
                </div>
              </div>
              <div>
                <div
                  className={`font-mono text-xs mb-1 ${
                    selectedAgent?.id === agent.id
                      ? "text-slate-500"
                      : "text-slate-500"
                  }`}
                >
                  TOOLS
                </div>
                <div
                  className={`text-2xl font-bold ${
                    selectedAgent?.id === agent.id ? "text-white" : "text-slate-900"
                  }`}
                >
                  {agent.tools.length}
                </div>
              </div>
              <div>
                <div
                  className={`font-mono text-xs mb-1 ${
                    selectedAgent?.id === agent.id
                      ? "text-slate-500"
                      : "text-slate-500"
                  }`}
                >
                  KEYWORDS
                </div>
                <div
                  className={`text-2xl font-bold ${
                    selectedAgent?.id === agent.id ? "text-white" : "text-slate-900"
                  }`}
                >
                  {agent.routing_keywords.length}
                </div>
              </div>
            </div>
          </div>

          {/* Hover indicator */}
          <div
            className={`absolute bottom-0 left-0 right-0 h-1 transition-all ${
              selectedAgent?.id === agent.id ? "bg-white" : "bg-slate-900"
            }`}
          ></div>
        </button>
      ))}
    </div>
  );
}

// Chart View Component
function ChartView({
  hierarchy,
  selectedAgent,
  onSelectAgent,
}: {
  hierarchy: {
    meta: Agent | undefined;
    orchestrator: Agent | undefined;
    functions: Agent[];
  };
  selectedAgent: Agent | null;
  onSelectAgent: (agent: Agent) => void;
}) {
  const { meta, orchestrator, functions } = hierarchy;

  return (
    <div className="space-y-16">
      {/* Meta Agent */}
      {meta && (
        <div className="flex flex-col items-center">
          <AgentNode
            agent={meta}
            level="meta"
            isSelected={selectedAgent?.id === meta.id}
            onClick={onSelectAgent}
          />
          {/* Connection line to orchestrator */}
          {orchestrator && (
            <div className="w-0.5 h-12 bg-slate-900 relative">
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45"></div>
            </div>
          )}
        </div>
      )}

      {/* Orchestrator Agent */}
      {orchestrator && (
        <div className="flex flex-col items-center">
          <AgentNode
            agent={orchestrator}
            level="orchestrator"
            isSelected={selectedAgent?.id === orchestrator.id}
            onClick={onSelectAgent}
          />
          {/* Connection lines to function agents */}
          {functions.length > 0 && (
            <div className="relative w-full h-12">
              {/* Vertical line down */}
              <div className="absolute left-1/2 -translate-x-1/2 w-0.5 h-6 bg-slate-900"></div>
              {/* Horizontal line */}
              <div className="absolute left-0 right-0 top-6 h-0.5 bg-slate-900"></div>
              {/* Individual drops to each function agent */}
              <div className="absolute inset-0 flex justify-around">
                {functions.map((_, idx) => (
                  <div key={idx} className="flex flex-col items-center">
                    <div className="w-0.5 h-6 bg-slate-900 mt-6"></div>
                    <div className="w-2 h-2 bg-slate-900 rotate-45"></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Function Agents */}
      {functions.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
          {functions.map((agent) => (
            <div key={agent.id} className="flex justify-center">
              <AgentNode
                agent={agent}
                level="function"
                isSelected={selectedAgent?.id === agent.id}
                onClick={onSelectAgent}
              />
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="border-t-2 border-slate-900 pt-8 flex items-center justify-center gap-8">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-slate-900"></div>
          <span className="font-mono text-xs text-slate-600">META</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-slate-900 bg-slate-800"></div>
          <span className="font-mono text-xs text-slate-600">ORCHESTRATOR</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-slate-900 bg-white"></div>
          <span className="font-mono text-xs text-slate-600">FUNCTION</span>
        </div>
      </div>
    </div>
  );
}

// Agent Node Component
function AgentNode({
  agent,
  level,
  isSelected,
  onClick,
}: {
  agent: Agent;
  level: "meta" | "orchestrator" | "function";
  isSelected: boolean;
  onClick: (agent: Agent) => void;
}) {
  const sizeClasses =
    level === "meta"
      ? "w-64 h-64"
      : level === "orchestrator"
      ? "w-56 h-56"
      : "w-48 h-48";

  const bgClass =
    level === "meta"
      ? "bg-slate-900"
      : level === "orchestrator"
      ? "bg-slate-800 border-2 border-slate-900"
      : "bg-white border-2 border-slate-900";

  const textClass =
    level === "meta" || level === "orchestrator" ? "text-white" : "text-slate-900";

  return (
    <button
      onClick={() => onClick(agent)}
      className={`relative group ${sizeClasses} ${bgClass} transition-all duration-300 ${
        isSelected ? "ring-4 ring-slate-400 scale-105" : "hover:scale-105"
      }`}
    >
      {/* Corner decorations */}
      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-slate-400"></div>
      <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-slate-400"></div>
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-slate-400"></div>
      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-slate-400"></div>

      <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
        <div
          className={`font-mono text-[10px] tracking-widest mb-3 ${
            level === "meta" || level === "orchestrator"
              ? "text-slate-500"
              : "text-slate-500"
          }`}
        >
          {level.toUpperCase()}
        </div>
        <h3 className={`font-bold text-lg mb-2 ${textClass}`}>{agent.name}</h3>
        <p
          className={`font-mono text-xs mb-4 ${
            level === "meta" || level === "orchestrator"
              ? "text-slate-400"
              : "text-slate-500"
          }`}
        >
          {agent.function}
        </p>
        <div className="flex items-center gap-4 text-xs">
          <div>
            <div
              className={`${
                level === "meta" || level === "orchestrator"
                  ? "text-slate-400"
                  : "text-slate-500"
              } font-mono mb-1`}
            >
              SKILLS
            </div>
            <div className={`font-bold ${textClass}`}>{agent.skills.length}</div>
          </div>
          <div>
            <div
              className={`${
                level === "meta" || level === "orchestrator"
                  ? "text-slate-400"
                  : "text-slate-500"
              } font-mono mb-1`}
            >
              TOOLS
            </div>
            <div className={`font-bold ${textClass}`}>{agent.tools.length}</div>
          </div>
        </div>
      </div>
    </button>
  );
}

// Detail Panel Component
function DetailPanel({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40"
        onClick={onClose}
      ></div>

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white border-l-4 border-slate-900 shadow-2xl z-50 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 text-white border-b-4 border-slate-700 px-8 py-6 flex items-start justify-between">
          <div>
            <div className="flex items-baseline gap-4 mb-2">
              <h2 className="text-3xl font-bold tracking-tight">{agent.name}</h2>
              <span className="font-mono text-xs tracking-widest text-slate-400">
                {agent.function.toUpperCase()}
              </span>
            </div>
            <p className="font-mono text-xs text-slate-400">{agent.id}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 transition-colors border-2 border-slate-700"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="square"
                strokeLinejoin="miter"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8">
          {/* Description */}
          <section>
            <h3 className="font-mono text-xs tracking-widest text-slate-500 mb-3">
              DESCRIPTION
            </h3>
            <p className="text-slate-700 leading-relaxed">{agent.description}</p>
          </section>

          {/* Skills */}
          <section>
            <h3 className="font-mono text-xs tracking-widest text-slate-500 mb-3">
              SKILLS ({agent.skills.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {agent.skills.map((skill, idx) => (
                <span
                  key={idx}
                  className="px-4 py-2 bg-slate-100 border border-slate-300 font-mono text-xs text-slate-700"
                >
                  {skill}
                </span>
              ))}
            </div>
          </section>

          {/* Tools */}
          <section>
            <h3 className="font-mono text-xs tracking-widest text-slate-500 mb-3">
              TOOLS ({agent.tools.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {agent.tools.map((tool, idx) => (
                <span
                  key={idx}
                  className="px-4 py-2 bg-slate-900 text-white font-mono text-xs"
                >
                  {tool}
                </span>
              ))}
            </div>
          </section>

          {/* Routing Keywords */}
          <section>
            <h3 className="font-mono text-xs tracking-widest text-slate-500 mb-3">
              ROUTING KEYWORDS ({agent.routing_keywords.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {agent.routing_keywords.map((keyword, idx) => (
                <span
                  key={idx}
                  className="px-4 py-2 border-2 border-slate-900 bg-white font-mono text-xs text-slate-900"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </section>

          {/* Permissions */}
          <section>
            <h3 className="font-mono text-xs tracking-widest text-slate-500 mb-4">
              PERMISSIONS
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="border-2 border-slate-900 p-4">
                <div className="font-mono text-xs tracking-widest text-slate-500 mb-3">
                  READ
                </div>
                <div className="space-y-2">
                  {agent.permissions.read.map((perm, idx) => (
                    <div key={idx} className="text-sm text-slate-700 font-mono">
                      → {perm}
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-2 border-slate-900 p-4 bg-slate-50">
                <div className="font-mono text-xs tracking-widest text-slate-500 mb-3">
                  WRITE
                </div>
                <div className="space-y-2">
                  {agent.permissions.write.map((perm, idx) => (
                    <div key={idx} className="text-sm text-slate-700 font-mono">
                      → {perm}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

// Animation keyframes
const style = document.createElement("style");
style.textContent = `
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;
document.head.appendChild(style);
