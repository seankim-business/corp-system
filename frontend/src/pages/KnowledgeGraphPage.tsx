import { useState, useEffect, useRef, useCallback } from "react";
import { isNotAvailableResponse } from "../utils/fetch-helpers";

// Types
interface GraphNode {
  id: string;
  label: string;
  group: string;
  title?: string;
  color?: string;
  size?: number;
  shape?: string;
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  title?: string;
  color?: string;
  width?: number;
  dashes?: boolean;
}

interface VisualizationData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  density: number;
  averageDegree: number;
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
}

interface RelatedNode {
  node: {
    id: string;
    type: string;
    label: string;
    properties: Record<string, unknown>;
  };
  edge: {
    id: string;
    type: string;
    weight: number;
  };
  depth: number;
}

// Node type colors (matching backend)
const NODE_COLORS: Record<string, string> = {
  person: "#4CAF50",
  agent: "#2196F3",
  team: "#9C27B0",
  project: "#FF9800",
  task: "#FFEB3B",
  document: "#795548",
  goal: "#E91E63",
  workflow: "#00BCD4",
};

const NODE_LABELS: Record<string, string> = {
  person: "People",
  agent: "Agents",
  team: "Teams",
  project: "Projects",
  task: "Tasks",
  document: "Documents",
  goal: "Goals",
  workflow: "Workflows",
};

export default function KnowledgeGraphPage() {
  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notAvailable, setNotAvailable] = useState(false);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [graphData, setGraphData] = useState<VisualizationData | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [relatedNodes, setRelatedNodes] = useState<RelatedNode[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<GraphNode[]>([]);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [building, setBuilding] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const networkRef = useRef<unknown>(null);

  // Fetch graph stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch("/api/knowledge-graph/stats", {
        credentials: "include",
      });
      if (isNotAvailableResponse(response)) {
        setNotAvailable(true);
        return;
      }
      if (!response.ok) throw new Error("Failed to fetch stats");
      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  }, []);

  // Fetch visualization data
  const fetchVisualization = useCallback(async (nodeTypes?: string[]) => {
    setLoading(true);
    setError(null);

    try {
      let url = "/api/knowledge-graph/visualization";
      if (nodeTypes && nodeTypes.length > 0) {
        url = `/api/knowledge-graph/visualization/filtered?nodeTypes=${nodeTypes.join(",")}`;
      }

      const response = await fetch(url, {
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to fetch graph");

      const data = await response.json();
      setGraphData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Build graph
  const handleBuildGraph = async () => {
    setBuilding(true);
    setError(null);

    try {
      const response = await fetch("/api/knowledge-graph/build", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to build graph");

      const data = await response.json();
      alert(`Graph built: ${data.nodeCount} nodes, ${data.edgeCount} edges`);

      // Refresh data
      await Promise.all([fetchStats(), fetchVisualization(activeFilters)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build graph");
    } finally {
      setBuilding(false);
    }
  };

  // Search nodes
  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const response = await fetch(
        `/api/knowledge-graph/search?q=${encodeURIComponent(searchTerm)}&limit=10`,
        { credentials: "include" }
      );

      if (!response.ok) throw new Error("Search failed");

      const data = await response.json();
      setSearchResults(data.nodes || []);
    } catch (err) {
      console.error("Search error:", err);
    }
  };

  // Get related nodes
  const fetchRelatedNodes = async (nodeId: string) => {
    try {
      const response = await fetch(
        `/api/knowledge-graph/related/${nodeId}?depth=2&limit=20`,
        { credentials: "include" }
      );

      if (!response.ok) throw new Error("Failed to fetch related nodes");

      const data = await response.json();
      setRelatedNodes(data.related || []);
    } catch (err) {
      console.error("Error fetching related:", err);
    }
  };

  // Handle node selection
  const handleNodeSelect = async (node: GraphNode) => {
    setSelectedNode(node);
    await fetchRelatedNodes(node.id);
  };

  // Toggle filter
  const toggleFilter = (type: string) => {
    setActiveFilters((prev) => {
      const newFilters = prev.includes(type)
        ? prev.filter((f) => f !== type)
        : [...prev, type];
      return newFilters;
    });
  };

  // Apply filters
  useEffect(() => {
    fetchVisualization(activeFilters);
  }, [activeFilters, fetchVisualization]);

  // Initial load
  useEffect(() => {
    fetchStats();
    fetchVisualization();
  }, [fetchStats, fetchVisualization]);

  // Simple canvas-based graph rendering
  useEffect(() => {
    if (!graphData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    // Clear canvas
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Simple force-directed layout simulation
    const nodes = graphData.nodes.map((node) => ({
      ...node,
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: 0,
      vy: 0,
    }));

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    // Simple simulation
    for (let i = 0; i < 100; i++) {
      // Repulsion between nodes
      for (let j = 0; j < nodes.length; j++) {
        for (let k = j + 1; k < nodes.length; k++) {
          const dx = nodes[k].x - nodes[j].x;
          const dy = nodes[k].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 1000 / (dist * dist);
          nodes[j].vx -= (dx / dist) * force;
          nodes[j].vy -= (dy / dist) * force;
          nodes[k].vx += (dx / dist) * force;
          nodes[k].vy += (dy / dist) * force;
        }
      }

      // Attraction along edges
      for (const edge of graphData.edges) {
        const source = nodeMap.get(edge.from);
        const target = nodeMap.get(edge.to);
        if (source && target) {
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = dist * 0.01;
          source.vx += (dx / dist) * force;
          source.vy += (dy / dist) * force;
          target.vx -= (dx / dist) * force;
          target.vy -= (dy / dist) * force;
        }
      }

      // Center gravity
      for (const node of nodes) {
        node.vx += (canvas.width / 2 - node.x) * 0.001;
        node.vy += (canvas.height / 2 - node.y) * 0.001;
      }

      // Apply velocity with damping
      for (const node of nodes) {
        node.x += node.vx * 0.1;
        node.y += node.vy * 0.1;
        node.vx *= 0.9;
        node.vy *= 0.9;

        // Keep in bounds
        node.x = Math.max(50, Math.min(canvas.width - 50, node.x));
        node.y = Math.max(50, Math.min(canvas.height - 50, node.y));
      }
    }

    // Draw edges
    ctx.strokeStyle = "#4a4a6a";
    ctx.lineWidth = 1;
    for (const edge of graphData.edges) {
      const source = nodeMap.get(edge.from);
      const target = nodeMap.get(edge.to);
      if (source && target) {
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
      }
    }

    // Draw nodes
    for (const node of nodes) {
      const color = NODE_COLORS[node.group] || "#9E9E9E";
      const size = node.size || 15;

      ctx.beginPath();
      ctx.arc(node.x, node.y, size, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = selectedNode?.id === node.id ? "#ffffff" : "#000000";
      ctx.lineWidth = selectedNode?.id === node.id ? 3 : 1;
      ctx.stroke();

      // Draw label
      ctx.fillStyle = "#ffffff";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(node.label.slice(0, 15), node.x, node.y + size + 12);
    }

    // Store node positions for click handling
    networkRef.current = nodes;

    // Click handler
    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      for (const node of nodes) {
        const dist = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2);
        if (dist <= (node.size || 15)) {
          handleNodeSelect(node);
          return;
        }
      }
      setSelectedNode(null);
      setRelatedNodes([]);
    };

    canvas.addEventListener("click", handleClick);
    return () => canvas.removeEventListener("click", handleClick);
  }, [graphData, selectedNode]);

  if (notAvailable) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="border-b border-gray-800 px-6 py-4">
          <h1 className="text-2xl font-bold">Knowledge Graph</h1>
          <p className="text-gray-400 text-sm">Explore relationships between entities in your organization</p>
        </div>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-12 text-center max-w-lg">
            <svg className="w-12 h-12 mx-auto text-blue-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.42 15.17l-5.28-3.3a.5.5 0 010-.84l5.28-3.3a.5.5 0 01.76.42v6.6a.5.5 0 01-.76.42zM20 7l-8 5 8 5V7z" />
            </svg>
            <h3 className="text-lg font-semibold text-blue-300 mb-2">Knowledge Graph</h3>
            <p className="text-gray-400 text-sm">The knowledge graph is currently being set up. This feature will visualize entity relationships once the backend service is activated.</p>
            <button
              onClick={() => { setNotAvailable(false); fetchStats(); fetchVisualization(); }}
              className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Knowledge Graph</h1>
            <p className="text-gray-400 text-sm">
              Explore relationships between entities in your organization
            </p>
          </div>
          <button
            onClick={handleBuildGraph}
            disabled={building}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {building ? "Building..." : "Rebuild Graph"}
          </button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Sidebar */}
        <div className="w-80 border-r border-gray-800 p-4 overflow-y-auto">
          {/* Stats */}
          {stats && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-400 mb-3">Statistics</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-gray-800 p-3 rounded">
                  <div className="text-2xl font-bold">{stats.nodeCount}</div>
                  <div className="text-gray-400">Nodes</div>
                </div>
                <div className="bg-gray-800 p-3 rounded">
                  <div className="text-2xl font-bold">{stats.edgeCount}</div>
                  <div className="text-gray-400">Edges</div>
                </div>
                <div className="bg-gray-800 p-3 rounded">
                  <div className="text-2xl font-bold">{stats.density.toFixed(3)}</div>
                  <div className="text-gray-400">Density</div>
                </div>
                <div className="bg-gray-800 p-3 rounded">
                  <div className="text-2xl font-bold">{stats.averageDegree.toFixed(1)}</div>
                  <div className="text-gray-400">Avg Degree</div>
                </div>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-400 mb-3">Search</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search nodes..."
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleSearch}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded"
              >
                Search
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="mt-2 bg-gray-800 rounded max-h-40 overflow-y-auto">
                {searchResults.map((node) => (
                  <button
                    key={node.id}
                    onClick={() => handleNodeSelect(node)}
                    className="w-full px-3 py-2 text-left hover:bg-gray-700 text-sm flex items-center gap-2"
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: NODE_COLORS[node.group] || "#9E9E9E" }}
                    />
                    {node.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-400 mb-3">Filter by Type</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(NODE_LABELS).map(([type, label]) => (
                <button
                  key={type}
                  onClick={() => toggleFilter(type)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    activeFilters.includes(type)
                      ? "opacity-100"
                      : activeFilters.length > 0
                        ? "opacity-40"
                        : "opacity-100"
                  }`}
                  style={{
                    backgroundColor:
                      activeFilters.includes(type) || activeFilters.length === 0
                        ? NODE_COLORS[type]
                        : "#4a4a6a",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {activeFilters.length > 0 && (
              <button
                onClick={() => setActiveFilters([])}
                className="mt-2 text-xs text-blue-400 hover:text-blue-300"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Selected Node Details */}
          {selectedNode && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-400 mb-3">Selected Node</h3>
              <div className="bg-gray-800 p-4 rounded">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: NODE_COLORS[selectedNode.group] || "#9E9E9E" }}
                  />
                  <span className="font-semibold">{selectedNode.label}</span>
                </div>
                <div className="text-xs text-gray-400 mb-3">
                  Type: {NODE_LABELS[selectedNode.group] || selectedNode.group}
                </div>

                {relatedNodes.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-400 mb-2">
                      Related ({relatedNodes.length})
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {relatedNodes.map((related) => (
                        <div
                          key={related.node.id}
                          className="flex items-center gap-2 text-xs p-1 hover:bg-gray-700 rounded cursor-pointer"
                          onClick={() =>
                            handleNodeSelect({
                              id: related.node.id,
                              label: related.node.label,
                              group: related.node.type,
                            })
                          }
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{
                              backgroundColor: NODE_COLORS[related.node.type] || "#9E9E9E",
                            }}
                          />
                          <span className="flex-1 truncate">{related.node.label}</span>
                          <span className="text-gray-500">{related.edge.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Legend */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-3">Legend</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(NODE_LABELS).map(([type, label]) => (
                <div key={type} className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: NODE_COLORS[type] }}
                  />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Graph Canvas */}
        <div className="flex-1 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-10">
              <div className="text-center">
                <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
                <div className="text-gray-400">Loading graph...</div>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-red-400">
                <div className="text-lg mb-2">Error loading graph</div>
                <div className="text-sm">{error}</div>
                <button
                  onClick={() => fetchVisualization(activeFilters)}
                  className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {!loading && !error && graphData && graphData.nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <div className="text-lg mb-2">No graph data</div>
                <div className="text-sm mb-4">
                  Build the graph to visualize entity relationships
                </div>
                <button
                  onClick={handleBuildGraph}
                  disabled={building}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
                >
                  {building ? "Building..." : "Build Graph"}
                </button>
              </div>
            </div>
          )}

          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-pointer"
            style={{ display: loading || error ? "none" : "block" }}
          />
        </div>
      </div>
    </div>
  );
}
