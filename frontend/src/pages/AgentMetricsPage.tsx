/**
 * Agent Metrics Dashboard Page
 *
 * Displays agent performance metrics, tool usage, and error rates.
 * - Agent performance cards
 * - Execution timeline (placeholder for future chart)
 * - Tool usage breakdown
 * - Error rate trend
 * - Active sessions gauge
 */

import { useState, useEffect, useCallback } from "react";

interface AgentMetrics {
  agentId: string;
  name: string;
  description: string;
  totalExecutions: number;
  successRate: number;
  avgDuration: number;
  p95Duration: number;
  topTools: { name: string; count: number }[];
  errorRate: number;
  activeSessions: number;
  lastError?: { message: string; timestamp: string };
}

interface ToolMetrics {
  toolName: string;
  totalCalls: number;
  successRate: number;
  agentUsage: { agentId: string; callCount: number }[];
}

interface DelegationMetrics {
  fromAgent: string;
  totalDelegations: number;
  successRate: number;
  targets: { toAgent: string; count: number; successRate: number }[];
}

interface MetricsResponse {
  agents?: AgentMetrics[];
  tools?: ToolMetrics[];
  delegations?: DelegationMetrics[];
  totalToolCalls?: number;
  totalDelegations?: number;
  timestamp: string;
}

const AGENT_EMOJI_MAP: Record<string, string> = {
  orchestrator: "🧠",
  data: "📊",
  report: "📝",
  comms: "📤",
  search: "🔍",
  task: "✅",
  approval: "🔐",
  analytics: "📈",
};

function formatDuration(seconds: number): string {
  if (seconds < 1) {
    return `${Math.round(seconds * 1000)}ms`;
  }
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function getStatusColor(successRate: number): string {
  if (successRate >= 95) return "text-green-600";
  if (successRate >= 80) return "text-yellow-600";
  return "text-red-600";
}

function getStatusBgColor(successRate: number): string {
  if (successRate >= 95) return "bg-green-100";
  if (successRate >= 80) return "bg-yellow-100";
  return "bg-red-100";
}

export default function AgentMetricsPage() {
  const [agentMetrics, setAgentMetrics] = useState<AgentMetrics[]>([]);
  const [toolMetrics, setToolMetrics] = useState<ToolMetrics[]>([]);
  const [delegationMetrics, setDelegationMetrics] = useState<DelegationMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const [agentsRes, toolsRes, delegationsRes] = await Promise.all([
        fetch("/api/metrics/agents", { credentials: "include" }),
        fetch("/api/metrics/tools", { credentials: "include" }),
        fetch("/api/metrics/delegations", { credentials: "include" }),
      ]);

      if (!agentsRes.ok || !toolsRes.ok || !delegationsRes.ok) {
        throw new Error("Failed to fetch metrics");
      }

      const agentsData: MetricsResponse = await agentsRes.json();
      const toolsData: MetricsResponse = await toolsRes.json();
      const delegationsData: MetricsResponse = await delegationsRes.json();

      setAgentMetrics(agentsData.agents || []);
      setToolMetrics(toolsData.tools || []);
      setDelegationMetrics(delegationsData.delegations || []);
      setLastUpdated(agentsData.timestamp);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchMetrics, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, [autoRefresh, fetchMetrics]);

  const totalActiveSessions = agentMetrics.reduce((sum, a) => sum + a.activeSessions, 0);
  const totalExecutions = agentMetrics.reduce((sum, a) => sum + a.totalExecutions, 0);
  const avgSuccessRate =
    agentMetrics.length > 0
      ? agentMetrics.reduce((sum, a) => sum + a.successRate, 0) / agentMetrics.length
      : 0;

  const selectedAgentData = selectedAgent
    ? agentMetrics.find((a) => a.agentId === selectedAgent)
    : null;

  return (
    <div>
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Agent Metrics</h1>
          <p className="text-gray-600">
            Multi-agent workflow monitoring and performance observability.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300"
            />
            Auto-refresh
          </label>
          <button
            onClick={fetchMetrics}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Active Sessions</h3>
          {loading ? (
            <div className="h-9 bg-gray-200 animate-pulse rounded" />
          ) : (
            <>
              <p className="text-3xl font-bold text-indigo-600">{totalActiveSessions}</p>
              <p className="text-sm text-gray-500 mt-2">
                {totalActiveSessions === 0 ? "No active agents" : "Currently running"}
              </p>
            </>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Total Executions</h3>
          {loading ? (
            <div className="h-9 bg-gray-200 animate-pulse rounded" />
          ) : (
            <>
              <p className="text-3xl font-bold text-indigo-600">{totalExecutions}</p>
              <p className="text-sm text-gray-500 mt-2">All time</p>
            </>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Avg Success Rate</h3>
          {loading ? (
            <div className="h-9 bg-gray-200 animate-pulse rounded" />
          ) : (
            <>
              <p className={`text-3xl font-bold ${getStatusColor(avgSuccessRate)}`}>
                {avgSuccessRate.toFixed(1)}%
              </p>
              <p className="text-sm text-gray-500 mt-2">Across all agents</p>
            </>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Tool Calls</h3>
          {loading ? (
            <div className="h-9 bg-gray-200 animate-pulse rounded" />
          ) : (
            <>
              <p className="text-3xl font-bold text-indigo-600">
                {toolMetrics.reduce((sum, t) => sum + t.totalCalls, 0)}
              </p>
              <p className="text-sm text-gray-500 mt-2">Total invocations</p>
            </>
          )}
        </div>
      </div>

      {/* Agent Performance Cards */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Agent Performance</h2>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white p-4 rounded-lg shadow animate-pulse">
                <div className="h-6 bg-gray-200 rounded mb-2" />
                <div className="h-4 bg-gray-200 rounded w-3/4" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agentMetrics.map((agent) => (
              <div
                key={agent.agentId}
                onClick={() => setSelectedAgent(agent.agentId)}
                className={`bg-white p-4 rounded-lg shadow cursor-pointer hover:shadow-md transition-shadow ${
                  selectedAgent === agent.agentId ? "ring-2 ring-indigo-500" : ""
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{AGENT_EMOJI_MAP[agent.agentId] || "🤖"}</span>
                  <div>
                    <h3 className="font-semibold text-gray-900">{agent.name}</h3>
                    <p className="text-sm text-gray-500">{agent.description}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-500">Executions</p>
                    <p className="font-semibold">{agent.totalExecutions}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Success Rate</p>
                    <p className={`font-semibold ${getStatusColor(agent.successRate)}`}>
                      {agent.successRate.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Avg Duration</p>
                    <p className="font-semibold">{formatDuration(agent.avgDuration)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">P95 Duration</p>
                    <p className="font-semibold">{formatDuration(agent.p95Duration)}</p>
                  </div>
                </div>

                {agent.activeSessions > 0 && (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-sm text-green-600">
                      {agent.activeSessions} active session{agent.activeSessions > 1 ? "s" : ""}
                    </span>
                  </div>
                )}

                {agent.lastError && (
                  <div className="mt-3 p-2 bg-red-50 rounded text-sm">
                    <p className="text-red-600 truncate">Error: {agent.lastError.message}</p>
                    <p className="text-red-400 text-xs">
                      {formatTimestamp(agent.lastError.timestamp)}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected Agent Details */}
      {selectedAgentData && (
        <div className="mb-8 bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              {AGENT_EMOJI_MAP[selectedAgentData.agentId] || "🤖"} {selectedAgentData.name} Details
            </h2>
            <button
              onClick={() => setSelectedAgent(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className={`p-3 rounded-lg ${getStatusBgColor(selectedAgentData.successRate)}`}>
              <p className="text-sm text-gray-600">Success Rate</p>
              <p className={`text-2xl font-bold ${getStatusColor(selectedAgentData.successRate)}`}>
                {selectedAgentData.successRate.toFixed(1)}%
              </p>
            </div>
            <div className="p-3 bg-gray-100 rounded-lg">
              <p className="text-sm text-gray-600">Error Rate</p>
              <p className="text-2xl font-bold text-gray-900">
                {selectedAgentData.errorRate.toFixed(1)}%
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <p className="text-sm text-gray-600">Avg Duration</p>
              <p className="text-2xl font-bold text-blue-600">
                {formatDuration(selectedAgentData.avgDuration)}
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <p className="text-sm text-gray-600">P95 Duration</p>
              <p className="text-2xl font-bold text-purple-600">
                {formatDuration(selectedAgentData.p95Duration)}
              </p>
            </div>
          </div>

          {selectedAgentData.topTools.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Top Tools Used</h3>
              <div className="flex flex-wrap gap-2">
                {selectedAgentData.topTools.map((tool) => (
                  <span
                    key={tool.name}
                    className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm"
                  >
                    {tool.name} ({tool.count})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tool Usage Breakdown */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Tool Usage</h2>
        {loading ? (
          <div className="bg-white p-6 rounded-lg shadow animate-pulse">
            <div className="h-40 bg-gray-200 rounded" />
          </div>
        ) : toolMetrics.length === 0 ? (
          <div className="bg-white p-6 rounded-lg shadow text-center text-gray-500">
            No tool usage data available yet.
          </div>
        ) : (
          <div className="bg-white p-6 rounded-lg shadow overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">Tool Name</th>
                  <th className="text-right py-2 px-3">Total Calls</th>
                  <th className="text-right py-2 px-3">Success Rate</th>
                  <th className="text-left py-2 px-3">Top Agents</th>
                </tr>
              </thead>
              <tbody>
                {toolMetrics.slice(0, 10).map((tool) => (
                  <tr key={tool.toolName} className="border-b last:border-0">
                    <td className="py-2 px-3 font-medium">{tool.toolName}</td>
                    <td className="text-right py-2 px-3">{tool.totalCalls}</td>
                    <td className={`text-right py-2 px-3 ${getStatusColor(tool.successRate)}`}>
                      {tool.successRate.toFixed(1)}%
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex gap-1">
                        {tool.agentUsage.slice(0, 3).map((usage) => (
                          <span
                            key={usage.agentId}
                            className="text-xs px-2 py-1 bg-gray-100 rounded"
                            title={`${usage.callCount} calls`}
                          >
                            {AGENT_EMOJI_MAP[usage.agentId] || "🤖"} {usage.callCount}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delegation Flow */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Agent Delegations</h2>
        {loading ? (
          <div className="bg-white p-6 rounded-lg shadow animate-pulse">
            <div className="h-32 bg-gray-200 rounded" />
          </div>
        ) : delegationMetrics.length === 0 ? (
          <div className="bg-white p-6 rounded-lg shadow text-center text-gray-500">
            No delegation data available yet.
          </div>
        ) : (
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="space-y-4">
              {delegationMetrics.map((delegation) => (
                <div key={delegation.fromAgent} className="border-b pb-4 last:border-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">
                      {AGENT_EMOJI_MAP[delegation.fromAgent] || "🤖"}
                    </span>
                    <span className="font-semibold capitalize">{delegation.fromAgent}</span>
                    <span className="text-gray-400">→</span>
                    <span className="text-sm text-gray-500">
                      {delegation.totalDelegations} delegations ({delegation.successRate.toFixed(1)}%
                      success)
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 ml-8">
                    {delegation.targets.map((target) => (
                      <div
                        key={target.toAgent}
                        className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-sm"
                      >
                        <span>{AGENT_EMOJI_MAP[target.toAgent] || "🤖"}</span>
                        <span className="capitalize">{target.toAgent}</span>
                        <span className="text-gray-400">({target.count})</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Last Updated */}
      {lastUpdated && (
        <div className="text-center text-sm text-gray-500">
          Last updated: {formatTimestamp(lastUpdated)}
        </div>
      )}
    </div>
  );
}
