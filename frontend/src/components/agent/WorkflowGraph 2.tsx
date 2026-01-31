/**
 * WorkflowGraph Component
 *
 * Visual workflow graph showing agent execution states and relationships.
 * Displays nodes for each agent with their current status and progress.
 */

import { useMemo } from "react";

export interface WorkflowNode {
  agentId: string;
  agentName: string;
  status: "pending" | "active" | "completed" | "failed" | "paused";
  startedAt?: string;
  completedAt?: string;
  progress?: number;
}

export interface WorkflowEdge {
  from: string;
  to: string;
}

interface WorkflowGraphProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  currentAgentId?: string;
}

const STATUS_COLORS: Record<WorkflowNode["status"], { bg: string; border: string; text: string }> =
  {
    pending: { bg: "bg-gray-100", border: "border-gray-300", text: "text-gray-600" },
    active: { bg: "bg-blue-100", border: "border-blue-500", text: "text-blue-700" },
    completed: { bg: "bg-green-100", border: "border-green-500", text: "text-green-700" },
    failed: { bg: "bg-red-100", border: "border-red-500", text: "text-red-700" },
    paused: { bg: "bg-yellow-100", border: "border-yellow-500", text: "text-yellow-700" },
  };

const STATUS_ICONS: Record<WorkflowNode["status"], string> = {
  pending: "⏳",
  active: "🔄",
  completed: "✅",
  failed: "❌",
  paused: "⏸️",
};

export default function WorkflowGraph({ nodes, edges, currentAgentId }: WorkflowGraphProps) {
  // Calculate node positions for a simple left-to-right layout
  const nodePositions = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    const nodeWidth = 140;
    const horizontalGap = 40;

    // Simple linear layout - could be enhanced with proper graph layout algorithm
    nodes.forEach((node, index) => {
      positions.set(node.agentId, {
        x: index * (nodeWidth + horizontalGap),
        y: 0,
      });
    });

    return positions;
  }, [nodes]);

  // Calculate SVG dimensions
  const svgWidth = useMemo(() => {
    if (nodes.length === 0) return 400;
    return Math.max(400, nodes.length * 180 + 40);
  }, [nodes]);

  if (nodes.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center">
        <div className="text-4xl mb-2">🔗</div>
        <p className="text-gray-500">No workflow graph available</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 overflow-x-auto">
      <div className="min-w-fit">
        <svg width={svgWidth} height={120} className="mx-auto">
          {/* Draw edges */}
          {edges.map((edge, index) => {
            const fromPos = nodePositions.get(edge.from);
            const toPos = nodePositions.get(edge.to);
            if (!fromPos || !toPos) return null;

            const fromX = fromPos.x + 140;
            const fromY = fromPos.y + 40;
            const toX = toPos.x;
            const toY = toPos.y + 40;

            return (
              <g key={`edge-${index}`}>
                <line
                  x1={fromX}
                  y1={fromY}
                  x2={toX}
                  y2={toY}
                  stroke="#94a3b8"
                  strokeWidth={2}
                  markerEnd="url(#arrowhead)"
                />
              </g>
            );
          })}

          {/* Arrowhead marker definition */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
            </marker>
          </defs>
        </svg>

        {/* Draw nodes as HTML elements for better styling */}
        <div className="flex items-center gap-10 justify-center -mt-16">
          {nodes.map((node) => {
            const colors = STATUS_COLORS[node.status];
            const icon = STATUS_ICONS[node.status];
            const isCurrent = node.agentId === currentAgentId;

            return (
              <div
                key={node.agentId}
                className={`
                  relative flex flex-col items-center justify-center
                  w-[140px] h-[80px] rounded-lg border-2
                  ${colors.bg} ${colors.border} ${colors.text}
                  ${isCurrent ? "ring-2 ring-offset-2 ring-blue-400" : ""}
                  transition-all duration-300
                `}
              >
                <div className="flex items-center gap-2 font-medium">
                  <span>{icon}</span>
                  <span className="truncate max-w-[90px] text-sm">{node.agentName}</span>
                </div>

                <div className="text-xs mt-1 capitalize opacity-75">{node.status}</div>

                {/* Progress bar for active nodes */}
                {node.status === "active" && node.progress !== undefined && (
                  <div className="absolute bottom-1 left-2 right-2 h-1 bg-blue-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${node.progress}%` }}
                    />
                  </div>
                )}

                {/* Pulse animation for active nodes */}
                {node.status === "active" && (
                  <div className="absolute -top-1 -right-1">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Edge arrows between nodes */}
        <div className="flex items-center justify-center mt-2">
          {nodes.slice(0, -1).map((_, index) => (
            <div key={`arrow-${index}`} className="w-[180px] flex items-center justify-center">
              <svg width="40" height="20" className="text-gray-400">
                <line x1="0" y1="10" x2="30" y2="10" stroke="currentColor" strokeWidth="2" />
                <polygon points="30,5 40,10 30,15" fill="currentColor" />
              </svg>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
