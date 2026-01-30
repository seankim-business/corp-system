/**
 * System Health Dashboard Page
 *
 * Displays overall system health, agent status, and recommendations.
 * - Overall health score gauge
 * - Agent health cards grid
 * - Error trend chart (7 days)
 * - Knowledge gap list
 * - Recommendation cards
 * - Recent reports list
 */

import { useState, useEffect, useCallback } from "react";
import { isNotAvailableResponse } from "../utils/fetch-helpers";
import FeatureComingSoon from "../components/FeatureComingSoon";

// ============================================================================
// Types
// ============================================================================

interface AgentHealth {
  agentId: string;
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  metrics: {
    totalExecutions: number;
    successRate: number;
    avgLatencyMs: number;
    errorRate: number;
    activeSessions: number;
  };
  trends: {
    executionsTrend: "up" | "down" | "stable";
    latencyTrend: "up" | "down" | "stable";
  };
  lastError?: {
    message: string;
    timestamp: string;
  };
}

interface Anomaly {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  affectedEntity: string;
  detectedAt: string;
}

interface SystemHealth {
  timestamp: string;
  overallScore: number;
  status: "healthy" | "degraded" | "unhealthy" | "critical";
  agents: AgentHealth[];
  anomalies: Anomaly[];
  summary: {
    totalAgents: number;
    healthyAgents: number;
    degradedAgents: number;
    unhealthyAgents: number;
    totalExecutionsLast24h: number;
    overallSuccessRate: number;
  };
}

interface KnowledgeGap {
  type: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  suggestedAction: string;
}

interface Recommendation {
  id: string;
  type: string;
  priority: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  suggestedAction: string;
  impact: string;
}

interface SystemReport {
  id: string;
  type: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getHealthColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  if (score >= 40) return "text-orange-600";
  return "text-red-600";
}

function getHealthBgColor(score: number): string {
  if (score >= 80) return "bg-green-100";
  if (score >= 60) return "bg-yellow-100";
  if (score >= 40) return "bg-orange-100";
  return "bg-red-100";
}

function getStatusBadgeColor(status: string): string {
  switch (status) {
    case "healthy":
      return "bg-green-100 text-green-800";
    case "degraded":
      return "bg-yellow-100 text-yellow-800";
    case "unhealthy":
      return "bg-orange-100 text-orange-800";
    case "critical":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case "critical":
      return "text-red-600";
    case "high":
      return "text-orange-600";
    case "medium":
      return "text-yellow-600";
    default:
      return "text-blue-600";
  }
}

function getPriorityBadgeColor(priority: string): string {
  switch (priority) {
    case "critical":
      return "bg-red-100 text-red-800";
    case "high":
      return "bg-orange-100 text-orange-800";
    case "medium":
      return "bg-yellow-100 text-yellow-800";
    default:
      return "bg-blue-100 text-blue-800";
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

function getTrendIcon(trend: string): string {
  switch (trend) {
    case "up":
      return "↑";
    case "down":
      return "↓";
    default:
      return "→";
  }
}

// ============================================================================
// Components
// ============================================================================

function HealthScoreGauge({ score, status }: { score: number; status: string }) {
  return (
    <div className={`rounded-lg p-6 ${getHealthBgColor(score)} text-center`}>
      <div className={`text-6xl font-bold ${getHealthColor(score)}`}>
        {score}
      </div>
      <div className="text-lg font-medium text-gray-700 mt-2">
        Health Score
      </div>
      <div className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeColor(status)}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </div>
    </div>
  );
}

function SummaryCard({ title, value, subtitle }: { title: string; value: string | number; subtitle?: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {subtitle && <div className="text-xs text-gray-400 mt-1">{subtitle}</div>}
    </div>
  );
}

function AgentHealthCard({ agent }: { agent: AgentHealth }) {
  return (
    <div className={`bg-white rounded-lg shadow p-4 border-l-4 ${
      agent.status === "healthy" ? "border-green-500" :
      agent.status === "degraded" ? "border-yellow-500" : "border-red-500"
    }`}>
      <div className="flex justify-between items-start">
        <div>
          <h4 className="font-medium text-gray-900">{agent.name}</h4>
          <p className="text-sm text-gray-500">{agent.agentId}</p>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadgeColor(agent.status)}`}>
          {agent.status}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-gray-500">Executions:</span>{" "}
          <span className="font-medium">{agent.metrics.totalExecutions}</span>
          <span className="ml-1 text-gray-400">{getTrendIcon(agent.trends.executionsTrend)}</span>
        </div>
        <div>
          <span className="text-gray-500">Success:</span>{" "}
          <span className={`font-medium ${agent.metrics.successRate >= 90 ? "text-green-600" : agent.metrics.successRate >= 70 ? "text-yellow-600" : "text-red-600"}`}>
            {agent.metrics.successRate.toFixed(1)}%
          </span>
        </div>
        <div>
          <span className="text-gray-500">Latency:</span>{" "}
          <span className="font-medium">{agent.metrics.avgLatencyMs}ms</span>
          <span className="ml-1 text-gray-400">{getTrendIcon(agent.trends.latencyTrend)}</span>
        </div>
        <div>
          <span className="text-gray-500">Errors:</span>{" "}
          <span className={`font-medium ${agent.metrics.errorRate <= 5 ? "text-green-600" : agent.metrics.errorRate <= 15 ? "text-yellow-600" : "text-red-600"}`}>
            {agent.metrics.errorRate.toFixed(1)}%
          </span>
        </div>
      </div>
      {agent.lastError && (
        <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-700 truncate">
          {agent.lastError.message}
        </div>
      )}
    </div>
  );
}

function AnomalyCard({ anomaly }: { anomaly: Anomaly }) {
  return (
    <div className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-500">
      <div className="flex justify-between items-start">
        <div className={`text-sm font-medium ${getSeverityColor(anomaly.severity)}`}>
          {anomaly.type.replace(/_/g, " ").toUpperCase()}
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${getPriorityBadgeColor(anomaly.severity)}`}>
          {anomaly.severity}
        </span>
      </div>
      <p className="text-gray-700 text-sm mt-2">{anomaly.description}</p>
      <div className="text-xs text-gray-400 mt-2">
        Detected: {formatDateTime(anomaly.detectedAt)}
      </div>
    </div>
  );
}

function KnowledgeGapCard({ gap }: { gap: KnowledgeGap }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex justify-between items-start">
        <h4 className="font-medium text-gray-900">{gap.title}</h4>
        <span className={`px-2 py-1 rounded text-xs font-medium ${getPriorityBadgeColor(gap.severity)}`}>
          {gap.severity}
        </span>
      </div>
      <p className="text-gray-600 text-sm mt-2">{gap.description}</p>
      <div className="mt-2 p-2 bg-blue-50 rounded text-sm text-blue-700">
        <span className="font-medium">Action:</span> {gap.suggestedAction}
      </div>
    </div>
  );
}

function RecommendationCard({
  recommendation,
  onAccept,
  onReject,
}: {
  recommendation: Recommendation;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex justify-between items-start">
        <h4 className="font-medium text-gray-900">{recommendation.title}</h4>
        <span className={`px-2 py-1 rounded text-xs font-medium ${getPriorityBadgeColor(recommendation.priority)}`}>
          {recommendation.priority}
        </span>
      </div>
      <p className="text-gray-600 text-sm mt-2">{recommendation.description}</p>
      <div className="mt-2 text-sm">
        <span className="text-gray-500">Impact:</span>{" "}
        <span className="text-gray-700">{recommendation.impact}</span>
      </div>
      <div className="mt-2 p-2 bg-green-50 rounded text-sm text-green-700">
        <span className="font-medium">Action:</span> {recommendation.suggestedAction}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onAccept(recommendation.id)}
          className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
        >
          Accept
        </button>
        <button
          onClick={() => onReject(recommendation.id)}
          className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function SystemHealthPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [knowledgeGaps, setKnowledgeGaps] = useState<KnowledgeGap[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [reports, setReports] = useState<SystemReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notAvailable, setNotAvailable] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState<"agents" | "gaps" | "recommendations" | "reports">("agents");

  const fetchData = useCallback(async () => {
    try {
      const [healthRes, gapsRes, recsRes, reportsRes] = await Promise.all([
        fetch("/api/meta-agent/health", { credentials: "include" }),
        fetch("/api/meta-agent/knowledge/gaps", { credentials: "include" }),
        fetch("/api/meta-agent/recommendations", { credentials: "include" }),
        fetch("/api/meta-agent/reports?limit=5", { credentials: "include" }),
      ]);

      if (isNotAvailableResponse(healthRes)) {
        setNotAvailable(true);
        setLoading(false);
        return;
      }

      if (!healthRes.ok) throw new Error("Failed to fetch health data");

      const healthData = await healthRes.json();
      setHealth(healthData.data);

      if (gapsRes.ok) {
        const gapsData = await gapsRes.json();
        setKnowledgeGaps(gapsData.data || []);
      }

      if (recsRes.ok) {
        const recsData = await recsRes.json();
        setRecommendations(recsData.data || []);
      }

      if (reportsRes.ok) {
        const reportsData = await reportsRes.json();
        setReports(reportsData.data || []);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 60000); // 1 minute
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const handleAcceptRecommendation = async (id: string) => {
    try {
      const res = await fetch(`/api/meta-agent/recommendations/${id}/accept`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setRecommendations((prev) => prev.filter((r) => r.id !== id));
      }
    } catch (err) {
      console.error("Failed to accept recommendation", err);
    }
  };

  const handleRejectRecommendation = async (id: string) => {
    try {
      const res = await fetch(`/api/meta-agent/recommendations/${id}/reject`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setRecommendations((prev) => prev.filter((r) => r.id !== id));
      }
    } catch (err) {
      console.error("Failed to reject recommendation", err);
    }
  };

  const handleGenerateReport = async () => {
    try {
      const res = await fetch("/api/meta-agent/reports/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "daily" }),
      });
      if (res.ok) {
        fetchData(); // Refresh to show new report
      }
    } catch (err) {
      console.error("Failed to generate report", err);
    }
  };

  const handleRunSystemCheck = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/meta-agent/system-check", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error("Failed to run system check", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !health) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (notAvailable) {
    return (
      <FeatureComingSoon
        title="System Health Monitoring"
        description="System health monitoring is currently being set up. This feature will display agent status, health scores, and recommendations once the backend service is activated."
        onRetry={fetchData}
      />
    );
  }

  if (error && !health) {
    return (
      <div className="bg-red-50 p-4 rounded-lg text-red-700">
        <h3 className="font-medium">Error loading system health</h3>
        <p>{error}</p>
        <button
          onClick={fetchData}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Health</h1>
          <p className="text-gray-500">
            Last updated: {health ? formatDateTime(health.timestamp) : "N/A"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRunSystemCheck}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Run System Check
          </button>
          <button
            onClick={handleGenerateReport}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Generate Report
          </button>
          <label className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-700">Auto-refresh</span>
          </label>
        </div>
      </div>

      {/* Health Overview */}
      {health && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <HealthScoreGauge score={health.overallScore} status={health.status} />
          <SummaryCard
            title="Total Agents"
            value={health.summary.totalAgents}
            subtitle={`${health.summary.healthyAgents} healthy, ${health.summary.degradedAgents} degraded, ${health.summary.unhealthyAgents} unhealthy`}
          />
          <SummaryCard
            title="Executions (24h)"
            value={health.summary.totalExecutionsLast24h.toLocaleString()}
            subtitle={`${health.summary.overallSuccessRate.toFixed(1)}% success rate`}
          />
          <SummaryCard
            title="Active Issues"
            value={health.anomalies.length}
            subtitle={`${health.anomalies.filter((a) => a.severity === "critical" || a.severity === "high").length} critical/high`}
          />
        </div>
      )}

      {/* Anomalies Alert */}
      {health && health.anomalies.filter((a) => a.severity === "critical").length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h3 className="font-medium text-red-800">Critical Issues Detected</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {health.anomalies
              .filter((a) => a.severity === "critical")
              .map((anomaly, idx) => (
                <AnomalyCard key={idx} anomaly={anomaly} />
              ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-4">
          {(["agents", "gaps", "recommendations", "reports"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-2 px-4 border-b-2 font-medium text-sm ${
                activeTab === tab
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "agents" && `Agents (${health?.agents.length || 0})`}
              {tab === "gaps" && `Knowledge Gaps (${knowledgeGaps.length})`}
              {tab === "recommendations" && `Recommendations (${recommendations.length})`}
              {tab === "reports" && `Reports (${reports.length})`}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "agents" && health && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {health.agents.map((agent) => (
            <AgentHealthCard key={agent.agentId} agent={agent} />
          ))}
        </div>
      )}

      {activeTab === "gaps" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {knowledgeGaps.length === 0 ? (
            <p className="text-gray-500 col-span-2">No knowledge gaps detected.</p>
          ) : (
            knowledgeGaps.slice(0, 10).map((gap, idx) => (
              <KnowledgeGapCard key={idx} gap={gap} />
            ))
          )}
        </div>
      )}

      {activeTab === "recommendations" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {recommendations.length === 0 ? (
            <p className="text-gray-500 col-span-2">No pending recommendations.</p>
          ) : (
            recommendations.map((rec) => (
              <RecommendationCard
                key={rec.id}
                recommendation={rec}
                onAccept={handleAcceptRecommendation}
                onReject={handleRejectRecommendation}
              />
            ))
          )}
        </div>
      )}

      {activeTab === "reports" && (
        <div className="space-y-4">
          {reports.length === 0 ? (
            <p className="text-gray-500">No reports generated yet.</p>
          ) : (
            reports.map((report) => (
              <div
                key={report.id}
                className="bg-white rounded-lg shadow p-4 flex justify-between items-center"
              >
                <div>
                  <h4 className="font-medium text-gray-900">
                    {report.type.charAt(0).toUpperCase() + report.type.slice(1)} Report
                  </h4>
                  <p className="text-sm text-gray-500">
                    {formatDate(report.periodStart)} - {formatDate(report.periodEnd)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <a
                    href={`/api/meta-agent/reports/${report.id}?format=html`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded hover:bg-blue-200"
                  >
                    View HTML
                  </a>
                  <a
                    href={`/api/meta-agent/reports/${report.id}?format=markdown`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200"
                  >
                    Markdown
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
