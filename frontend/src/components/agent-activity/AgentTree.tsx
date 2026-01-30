import { useMemo } from "react";

export interface AgentNode {
  id: string;
  sessionId: string;
  agentType: string;
  agentName?: string;
  category?: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
  progress?: number;
  parentId?: string;
  duration?: number;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
}

interface AgentTreeProps {
  agents: AgentNode[];
  selectedSessionId?: string;
  onSelectAgent?: (agent: AgentNode) => void;
}

const AGENT_EMOJI: Record<string, string> = {
  sisyphus: "🏔️",
  oracle: "🔮",
  explore: "🔍",
  librarian: "📚",
  executor: "⚡",
  "executor-high": "🚀",
  architect: "🏗️",
  designer: "🎨",
  qa_tester: "🧪",
  build_fixer: "🔧",
  writer: "✍️",
  default: "🤖",
};

function getAgentEmoji(agentType: string): string {
  const normalized = agentType.toLowerCase().replace(/-/g, "_");
  return AGENT_EMOJI[normalized] || AGENT_EMOJI.default;
}

function getStatusBadge(status: string, progress?: number) {
  switch (status) {
    case "pending":
      return (
        <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">pending</span>
      );
    case "in_progress":
      return (
        <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full flex items-center gap-1">
          <span className="animate-pulse">●</span>
          {progress !== undefined ? `${progress}%` : "running"}
        </span>
      );
    case "completed":
      return (
        <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">✓ done</span>
      );
    case "failed":
      return (
        <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">✗ failed</span>
      );
    case "cancelled":
      return (
        <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded-full">
          cancelled
        </span>
      );
    default:
      return null;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

interface TreeNodeProps {
  agent: AgentNode;
  children: AgentNode[];
  allAgents: AgentNode[];
  depth: number;
  onSelectAgent?: (agent: AgentNode) => void;
}

function TreeNode({ agent, children, allAgents, depth, onSelectAgent }: TreeNodeProps) {
  const childAgents = children.filter((a) => a.parentId === agent.id);

  return (
    <div className={`${depth > 0 ? "ml-6 border-l-2 border-gray-200 pl-4" : ""}`}>
      <div
        className={`flex items-center gap-3 py-2 px-3 rounded-lg cursor-pointer transition hover:bg-gray-50 ${
          agent.status === "in_progress" ? "bg-blue-50" : ""
        }`}
        onClick={() => onSelectAgent?.(agent)}
      >
        <span className="text-xl">{getAgentEmoji(agent.agentType)}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 truncate">
              {agent.agentName || agent.agentType}
            </span>
            {getStatusBadge(agent.status, agent.progress)}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
            {agent.category && (
              <span className="bg-gray-100 px-1.5 py-0.5 rounded">{agent.category}</span>
            )}
            {agent.duration !== undefined && <span>⏱️ {formatDuration(agent.duration)}</span>}
          </div>
        </div>

        {agent.status === "in_progress" && agent.progress !== undefined && (
          <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${agent.progress}%` }}
            />
          </div>
        )}
      </div>

      {agent.status === "failed" && agent.errorMessage && (
        <div className="ml-9 mt-1 p-2 bg-red-50 text-red-700 text-xs rounded border border-red-200">
          {agent.errorMessage}
        </div>
      )}

      {childAgents.length > 0 && (
        <div className="mt-1">
          {childAgents.map((child) => (
            <TreeNode
              key={child.id}
              agent={child}
              children={allAgents}
              allAgents={allAgents}
              depth={depth + 1}
              onSelectAgent={onSelectAgent}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AgentTree({ agents, selectedSessionId, onSelectAgent }: AgentTreeProps) {
  const filteredAgents = useMemo(() => {
    if (!selectedSessionId) return agents;
    return agents.filter((a) => a.sessionId === selectedSessionId);
  }, [agents, selectedSessionId]);

  const rootAgents = useMemo(() => {
    return filteredAgents.filter((a) => !a.parentId);
  }, [filteredAgents]);

  const stats = useMemo(() => {
    const total = filteredAgents.length;
    const completed = filteredAgents.filter((a) => a.status === "completed").length;
    const failed = filteredAgents.filter((a) => a.status === "failed").length;
    const inProgress = filteredAgents.filter((a) => a.status === "in_progress").length;
    return { total, completed, failed, inProgress };
  }, [filteredAgents]);

  if (filteredAgents.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span>🌳</span>
          <span>Agent Hierarchy</span>
        </h3>
        <div className="text-center py-8 text-gray-500">
          <div className="text-3xl mb-2">🤖</div>
          <p>No active agents</p>
          <p className="text-sm mt-1">Agent delegation hierarchy will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <span>🌳</span>
          <span>Agent Hierarchy</span>
        </h3>
        <div className="flex gap-4 mt-2 text-sm">
          <span className="text-gray-600">Total: {stats.total}</span>
          {stats.inProgress > 0 && (
            <span className="text-blue-600">● {stats.inProgress} running</span>
          )}
          {stats.completed > 0 && <span className="text-green-600">✓ {stats.completed} done</span>}
          {stats.failed > 0 && <span className="text-red-600">✗ {stats.failed} failed</span>}
        </div>
      </div>

      <div className="p-4 max-h-[500px] overflow-y-auto">
        {rootAgents.map((agent) => (
          <TreeNode
            key={agent.id}
            agent={agent}
            children={filteredAgents}
            allAgents={filteredAgents}
            depth={0}
            onSelectAgent={onSelectAgent}
          />
        ))}
      </div>
    </div>
  );
}
