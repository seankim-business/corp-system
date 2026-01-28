/**
 * MetaAgentDashboardPage
 *
 * System health monitoring dashboard for meta-agent infrastructure
 * Industrial aesthetic with real-time metrics and status indicators
 *
 * API Endpoints:
 * - GET /api/meta-agent/health
 * - GET /api/meta-agent/agents/metrics
 * - GET /api/meta-agent/alerts
 * - GET /api/meta-agent/knowledge-gaps
 */

import { useEffect, useState } from "react";
import { request } from "../api/client";

interface HealthData {
  score: number;
  totalAgents: number;
  activeSessions: number;
  errorRate: number;
  status: "healthy" | "degraded" | "critical";
}

interface AgentMetrics {
  agentId: string;
  agentName: string;
  function: string;
  executionCount: number;
  successRate: number;
  avgResponseTime: number;
  status: "online" | "idle" | "error";
}

interface Alert {
  id: string;
  timestamp: string;
  agentId: string;
  agentName: string;
  severity: "error" | "warning" | "info";
  message: string;
}

interface KnowledgeGap {
  id: string;
  area: string;
  description: string;
  suggestedAction: string;
  priority: "high" | "medium" | "low";
}

export default function MetaAgentDashboardPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [metrics, setMetrics] = useState<AgentMetrics[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [knowledgeGaps, setKnowledgeGaps] = useState<KnowledgeGap[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchAllData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [healthData, metricsData, alertsData, gapsData] = await Promise.all([
        request<HealthData>({ url: "/api/meta-agent/health", method: "GET" }),
        request<{ metrics: AgentMetrics[] }>({
          url: "/api/meta-agent/agents/metrics",
          method: "GET",
        }),
        request<{ alerts: Alert[] }>({
          url: "/api/meta-agent/alerts",
          method: "GET",
        }),
        request<{ gaps: KnowledgeGap[] }>({
          url: "/api/meta-agent/knowledge-gaps",
          method: "GET",
        }),
      ]);

      setHealth(healthData);
      setMetrics(metricsData.metrics);
      setAlerts(alertsData.alerts);
      setKnowledgeGaps(gapsData.gaps);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Failed to fetch meta-agent data:", err);
      setError(err instanceof Error ? err.message : "Failed to load system data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchAllData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRunHealthCheck = async () => {
    await fetchAllData();
  };

  const handleGenerateReport = () => {
    // TODO: Implement report generation
    console.log("Generate report clicked");
  };

  if (isLoading && !health) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="text-center space-y-6">
          <div className="relative w-24 h-24 mx-auto">
            {/* Concentric scanning rings */}
            <div className="absolute inset-0 border-4 border-slate-200"></div>
            <div className="absolute inset-0 border-4 border-slate-900 animate-ping"></div>
            <div className="absolute inset-3 border-4 border-slate-600 animate-spin"></div>
            <div className="absolute inset-6 border-4 border-slate-900"></div>
          </div>
          <div className="space-y-2">
            <p className="text-slate-900 font-bold text-xl tracking-tight">
              INITIALIZING SYSTEM SCAN
            </p>
            <p className="text-slate-500 font-mono text-xs tracking-widest">
              FETCHING TELEMETRY DATA...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !health) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="max-w-lg border-4 border-red-600 bg-white p-12">
          <div className="text-center space-y-4">
            <div className="text-6xl font-bold text-red-600">!</div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              SYSTEM ERROR
            </h2>
            <p className="text-slate-600 font-mono text-sm">{error}</p>
            <button
              onClick={fetchAllData}
              className="mt-6 px-8 py-4 bg-slate-900 text-white font-mono text-xs tracking-widest hover:bg-slate-700 transition-colors"
            >
              RETRY
            </button>
          </div>
        </div>
      </div>
    );
  }

  const getHealthColor = (score: number) => {
    if (score >= 80) return { bg: "bg-green-500", text: "text-green-500", border: "border-green-500" };
    if (score >= 50) return { bg: "bg-amber-500", text: "text-amber-500", border: "border-amber-500" };
    return { bg: "bg-red-600", text: "text-red-600", border: "border-red-600" };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":
        return "bg-green-500";
      case "idle":
        return "bg-amber-500";
      case "error":
        return "bg-red-600";
      default:
        return "bg-slate-400";
    }
  };

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case "error":
        return { border: "border-red-600", bg: "bg-red-50", text: "text-red-900", indicator: "bg-red-600" };
      case "warning":
        return { border: "border-amber-500", bg: "bg-amber-50", text: "text-amber-900", indicator: "bg-amber-500" };
      case "info":
        return { border: "border-blue-500", bg: "bg-blue-50", text: "text-blue-900", indicator: "bg-blue-500" };
      default:
        return { border: "border-slate-300", bg: "bg-slate-50", text: "text-slate-900", indicator: "bg-slate-500" };
    }
  };

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case "high":
        return { border: "border-red-600", indicator: "bg-red-600" };
      case "medium":
        return { border: "border-amber-500", indicator: "bg-amber-500" };
      case "low":
        return { border: "border-slate-400", indicator: "bg-slate-400" };
      default:
        return { border: "border-slate-300", indicator: "bg-slate-300" };
    }
  };

  const healthColor = health ? getHealthColor(health.score) : { bg: "bg-slate-400", text: "text-slate-400", border: "border-slate-400" };

  return (
    <div className="relative min-h-screen pb-12">
      {/* Grid background */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.02]">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `
              linear-gradient(to right, #000 1px, transparent 1px),
              linear-gradient(to bottom, #000 1px, transparent 1px)
            `,
            backgroundSize: "24px 24px",
          }}
        ></div>
      </div>

      <div className="relative">
        {/* Header */}
        <div className="mb-10 border-b-4 border-slate-900 pb-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-baseline gap-6 mb-3">
                <h1 className="text-6xl font-bold text-slate-900 tracking-tighter">
                  SYSTEM MONITOR
                </h1>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${healthColor.bg} animate-pulse`}></div>
                  <span className="font-mono text-sm text-slate-500 tracking-widest">
                    LIVE
                  </span>
                </div>
              </div>
              <p className="text-slate-600 text-lg leading-relaxed">
                Meta-agent infrastructure telemetry and diagnostics
              </p>
            </div>

            {/* Last refresh indicator */}
            <div className="text-right space-y-2">
              <div className="font-mono text-xs text-slate-400 tracking-wide">
                LAST REFRESH
              </div>
              <div className="font-mono text-sm text-slate-700">
                {lastRefresh.toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>

        {/* Health Overview - Dominant cards */}
        <div className="grid grid-cols-4 gap-4 mb-10">
          {/* Health Score - Extra prominent */}
          <div
            className={`col-span-2 border-4 ${healthColor.border} bg-white p-8 relative overflow-hidden group hover:shadow-2xl transition-all duration-300`}
            style={{ animation: "slideUp 0.5s ease-out" }}
          >
            {/* Animated background pulse */}
            <div className={`absolute inset-0 ${healthColor.bg} opacity-0 group-hover:opacity-5 transition-opacity duration-500`}></div>

            <div className="relative z-10">
              <div className="flex items-start justify-between mb-6">
                <div className="font-mono text-xs tracking-widest text-slate-500">
                  SYSTEM HEALTH
                </div>
                <div className={`px-3 py-1 border-2 ${healthColor.border} font-mono text-[10px] tracking-widest ${healthColor.text}`}>
                  {health?.status.toUpperCase()}
                </div>
              </div>
              <div className={`text-8xl font-bold ${healthColor.text} mb-4 tracking-tighter`}>
                {health?.score ?? "--"}
              </div>
              <div className="h-3 bg-slate-100 border-2 border-slate-900 relative overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 ${healthColor.bg} transition-all duration-1000 ease-out`}
                  style={{ width: `${health?.score ?? 0}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Total Agents */}
          <div
            className="border-4 border-slate-900 bg-white p-6 hover:bg-slate-50 transition-all duration-200 hover:shadow-xl"
            style={{ animation: "slideUp 0.5s ease-out 0.1s backwards" }}
          >
            <div className="font-mono text-xs tracking-widest text-slate-500 mb-4">
              TOTAL AGENTS
            </div>
            <div className="text-6xl font-bold text-slate-900 mb-2 tracking-tighter">
              {health?.totalAgents ?? 0}
            </div>
            <div className="font-mono text-xs text-slate-400">REGISTERED</div>
          </div>

          {/* Active Sessions */}
          <div
            className="border-4 border-slate-900 bg-slate-900 text-white p-6 hover:border-slate-700 transition-all duration-200 hover:shadow-xl"
            style={{ animation: "slideUp 0.5s ease-out 0.15s backwards" }}
          >
            <div className="font-mono text-xs tracking-widest text-slate-500 mb-4">
              ACTIVE SESSIONS
            </div>
            <div className="text-6xl font-bold mb-2 tracking-tighter">
              {health?.activeSessions ?? 0}
            </div>
            <div className="font-mono text-xs text-slate-500">CONCURRENT</div>
          </div>
        </div>

        {/* Error Rate - Full width alert banner */}
        <div
          className={`mb-10 border-4 ${
            (health?.errorRate ?? 0) > 10 ? "border-red-600 bg-red-50" :
            (health?.errorRate ?? 0) > 5 ? "border-amber-500 bg-amber-50" :
            "border-slate-900 bg-white"
          } p-6`}
          style={{ animation: "slideUp 0.5s ease-out 0.2s backwards" }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-xs tracking-widest text-slate-500 mb-2">
                ERROR RATE (24H)
              </div>
              <div className={`text-5xl font-bold tracking-tighter ${
                (health?.errorRate ?? 0) > 10 ? "text-red-600" :
                (health?.errorRate ?? 0) > 5 ? "text-amber-600" :
                "text-slate-900"
              }`}>
                {health?.errorRate.toFixed(2) ?? "--"}%
              </div>
            </div>
            <div className="text-right">
              <div className={`w-32 h-32 border-4 ${
                (health?.errorRate ?? 0) > 10 ? "border-red-600" :
                (health?.errorRate ?? 0) > 5 ? "border-amber-500" :
                "border-slate-900"
              } relative`}>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className={`text-4xl font-bold ${
                    (health?.errorRate ?? 0) > 10 ? "text-red-600" :
                    (health?.errorRate ?? 0) > 5 ? "text-amber-600" :
                    "text-slate-900"
                  }`}>
                    {(health?.errorRate ?? 0) > 10 ? "!" : (health?.errorRate ?? 0) > 5 ? "△" : "✓"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Agent Performance Table */}
        <div className="mb-10">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
              AGENT PERFORMANCE
            </h2>
            <span className="font-mono text-xs text-slate-500 tracking-widest">
              LAST 24 HOURS
            </span>
          </div>

          <div className="border-4 border-slate-900 bg-white overflow-hidden">
            {/* Table header */}
            <div className="bg-slate-900 text-white grid grid-cols-12 gap-4 px-6 py-4 font-mono text-xs tracking-widest">
              <div className="col-span-3">AGENT</div>
              <div className="col-span-2">FUNCTION</div>
              <div className="col-span-2 text-right">EXECUTIONS</div>
              <div className="col-span-2 text-right">SUCCESS RATE</div>
              <div className="col-span-2 text-right">AVG TIME</div>
              <div className="col-span-1 text-center">STATUS</div>
            </div>

            {/* Table body */}
            <div className="divide-y-2 divide-slate-900">
              {metrics.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="font-mono text-sm text-slate-500 tracking-wide">
                    NO METRICS AVAILABLE
                  </p>
                </div>
              ) : (
                metrics.map((metric, index) => (
                  <div
                    key={metric.agentId}
                    className="grid grid-cols-12 gap-4 px-6 py-5 hover:bg-slate-50 transition-colors group"
                    style={{
                      animation: "slideUp 0.4s ease-out",
                      animationDelay: `${0.3 + index * 0.05}s`,
                      animationFillMode: "backwards",
                    }}
                  >
                    <div className="col-span-3">
                      <div className="font-bold text-slate-900 mb-1">
                        {metric.agentName}
                      </div>
                      <div className="font-mono text-xs text-slate-400">
                        {metric.agentId}
                      </div>
                    </div>
                    <div className="col-span-2 flex items-center">
                      <span className="px-3 py-1 border border-slate-900 bg-slate-100 font-mono text-xs text-slate-700">
                        {metric.function}
                      </span>
                    </div>
                    <div className="col-span-2 text-right font-mono text-2xl font-bold text-slate-900">
                      {metric.executionCount.toLocaleString()}
                    </div>
                    <div className="col-span-2 text-right">
                      <div className="inline-block">
                        <div className="text-2xl font-bold text-slate-900 mb-1">
                          {metric.successRate.toFixed(1)}%
                        </div>
                        <div className="h-1 bg-slate-200 w-24 ml-auto relative overflow-hidden">
                          <div
                            className={`absolute inset-y-0 left-0 ${
                              metric.successRate >= 95 ? "bg-green-500" :
                              metric.successRate >= 80 ? "bg-amber-500" :
                              "bg-red-600"
                            } transition-all duration-500`}
                            style={{ width: `${metric.successRate}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                    <div className="col-span-2 text-right font-mono text-lg font-bold text-slate-900">
                      {metric.avgResponseTime.toFixed(0)}ms
                    </div>
                    <div className="col-span-1 flex justify-center items-center">
                      <div className={`w-4 h-4 ${getStatusColor(metric.status)} border-2 border-slate-900 ${
                        metric.status === "online" ? "animate-pulse" : ""
                      }`}></div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Two column layout for alerts and gaps */}
        <div className="grid grid-cols-2 gap-6 mb-10">
          {/* Recent Alerts */}
          <div
            className="border-4 border-slate-900 bg-white"
            style={{ animation: "slideUp 0.5s ease-out 0.4s backwards" }}
          >
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b-4 border-slate-700">
              <h2 className="text-xl font-bold tracking-tight">RECENT ALERTS</h2>
              <span className="font-mono text-xs tracking-widest text-slate-400">
                {alerts.length}
              </span>
            </div>

            <div className="divide-y-2 divide-slate-200 max-h-96 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <div className="w-16 h-16 mx-auto border-2 border-slate-200 flex items-center justify-center mb-4">
                    <span className="text-3xl text-slate-200">✓</span>
                  </div>
                  <p className="font-mono text-xs text-slate-500 tracking-wide">
                    NO RECENT ALERTS
                  </p>
                </div>
              ) : (
                alerts.map((alert, index) => {
                  const severityStyle = getSeverityStyle(alert.severity);
                  return (
                    <div
                      key={alert.id}
                      className={`px-6 py-4 ${severityStyle.bg} border-l-4 ${severityStyle.border} hover:shadow-inner transition-shadow`}
                      style={{
                        animation: "slideRight 0.4s ease-out",
                        animationDelay: `${0.5 + index * 0.05}s`,
                        animationFillMode: "backwards",
                      }}
                    >
                      <div className="flex items-start gap-3 mb-2">
                        <div className={`w-2 h-2 ${severityStyle.indicator} mt-1.5 flex-shrink-0`}></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-3 mb-1">
                            <span className="font-mono text-xs text-slate-500">
                              {new Date(alert.timestamp).toLocaleTimeString()}
                            </span>
                            <span className="font-mono text-xs text-slate-700 font-bold">
                              {alert.agentName}
                            </span>
                          </div>
                          <p className={`text-sm ${severityStyle.text} leading-relaxed`}>
                            {alert.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Knowledge Gaps */}
          <div
            className="border-4 border-slate-900 bg-white"
            style={{ animation: "slideUp 0.5s ease-out 0.45s backwards" }}
          >
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b-4 border-slate-700">
              <h2 className="text-xl font-bold tracking-tight">KNOWLEDGE GAPS</h2>
              <span className="font-mono text-xs tracking-widest text-slate-400">
                {knowledgeGaps.length}
              </span>
            </div>

            <div className="divide-y-2 divide-slate-200 max-h-96 overflow-y-auto">
              {knowledgeGaps.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <div className="w-16 h-16 mx-auto border-2 border-slate-200 flex items-center justify-center mb-4">
                    <span className="text-3xl text-slate-200">◉</span>
                  </div>
                  <p className="font-mono text-xs text-slate-500 tracking-wide">
                    COMPLETE KNOWLEDGE COVERAGE
                  </p>
                </div>
              ) : (
                knowledgeGaps.map((gap, index) => {
                  const priorityStyle = getPriorityStyle(gap.priority);
                  return (
                    <div
                      key={gap.id}
                      className={`px-6 py-4 border-l-4 ${priorityStyle.border} hover:bg-slate-50 transition-colors`}
                      style={{
                        animation: "slideRight 0.4s ease-out",
                        animationDelay: `${0.55 + index * 0.05}s`,
                        animationFillMode: "backwards",
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-2 h-2 ${priorityStyle.indicator} mt-1.5 flex-shrink-0`}></div>
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-baseline gap-2">
                            <h4 className="font-bold text-slate-900">{gap.area}</h4>
                            <span className="font-mono text-[10px] tracking-widest text-slate-400">
                              {gap.priority.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 leading-relaxed">
                            {gap.description}
                          </p>
                          <div className="pt-2 border-t border-slate-200">
                            <div className="font-mono text-xs text-slate-500 mb-1">
                              SUGGESTED:
                            </div>
                            <p className="text-sm text-slate-700">
                              {gap.suggestedAction}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div
          className="border-4 border-slate-900 bg-slate-900 p-8"
          style={{ animation: "slideUp 0.5s ease-out 0.5s backwards" }}
        >
          <h2 className="text-2xl font-bold text-white tracking-tight mb-6">
            QUICK ACTIONS
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <button
              onClick={handleRunHealthCheck}
              disabled={isLoading}
              className="group relative border-4 border-white bg-white hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 p-6 overflow-hidden"
            >
              <div className="absolute inset-0 bg-slate-900 transform -translate-x-full group-hover:translate-x-0 transition-transform duration-300"></div>
              <div className="relative z-10 space-y-2">
                <div className="text-3xl font-bold text-slate-900 group-hover:text-white transition-colors">
                  {isLoading ? "..." : "▶"}
                </div>
                <div className="font-mono text-xs tracking-widest text-slate-900 group-hover:text-white transition-colors">
                  RUN HEALTH CHECK
                </div>
              </div>
            </button>

            <button
              onClick={handleGenerateReport}
              className="group relative border-4 border-white bg-white hover:bg-slate-900 transition-all duration-200 p-6 overflow-hidden"
            >
              <div className="absolute inset-0 bg-slate-900 transform -translate-x-full group-hover:translate-x-0 transition-transform duration-300"></div>
              <div className="relative z-10 space-y-2">
                <div className="text-3xl font-bold text-slate-900 group-hover:text-white transition-colors">
                  ≡
                </div>
                <div className="font-mono text-xs tracking-widest text-slate-900 group-hover:text-white transition-colors">
                  GENERATE REPORT
                </div>
              </div>
            </button>

            <button
              onClick={fetchAllData}
              disabled={isLoading}
              className="group relative border-4 border-white bg-white hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 p-6 overflow-hidden"
            >
              <div className="absolute inset-0 bg-slate-900 transform -translate-x-full group-hover:translate-x-0 transition-transform duration-300"></div>
              <div className="relative z-10 space-y-2">
                <div className={`text-3xl font-bold text-slate-900 group-hover:text-white transition-colors ${
                  isLoading ? "animate-spin" : ""
                }`}>
                  ↻
                </div>
                <div className="font-mono text-xs tracking-widest text-slate-900 group-hover:text-white transition-colors">
                  REFRESH METRICS
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
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

  @keyframes slideRight {
    from {
      opacity: 0;
      transform: translateX(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
`;
document.head.appendChild(style);
