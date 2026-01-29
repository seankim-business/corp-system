// Analytics Dashboard Page - Comprehensive agent performance analytics
import { useState, useCallback, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";

// ============================================================================
// INTERFACES
// ============================================================================

interface OrgMetrics {
  organizationId: string;
  totalExecutions: number;
  totalAgents: number;
  uniqueUsers: number;
  overallSuccessRate: number;
  avgLatencyMs: number;
  totalCostCents: number;
  topAgents: Array<{
    agentId: string;
    agentName?: string;
    executions: number;
    successRate: number;
  }>;
  dailyTrend: Array<{
    date: string;
    executions: number;
    successCount: number;
    avgLatencyMs: number;
    costCents: number;
  }>;
}

interface AgentMetrics {
  agentId: string;
  agentName?: string;
  totalExecutions: number;
  successRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  totalCostCents: number;
  avgRating: number;
  uniqueUsers: number;
}

interface LeaderboardEntry {
  rank: number;
  agentId: string;
  agentName?: string;
  score: number;
  executions: number;
  successRate: number;
  avgLatencyMs: number;
  costCents: number;
  trend: "up" | "down" | "stable";
  previousRank?: number;
}

interface Trend {
  metric: string;
  direction: "up" | "down" | "stable";
  changePercent: number;
  previousValue: number;
  currentValue: number;
  significance: "low" | "medium" | "high";
}

interface Anomaly {
  metric: string;
  value: number;
  expectedValue: number;
  deviationPercent: number;
  timestamp: string;
  severity: "warning" | "critical";
}

// ============================================================================
// CONSTANTS
// ============================================================================

const COLORS = [
  "#3B82F6", // blue
  "#10B981", // green
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // purple
  "#EC4899", // pink
  "#14B8A6", // teal
  "#F97316", // orange
];

const PERIOD_OPTIONS = [
  { value: "day", label: "Last 24 Hours" },
  { value: "week", label: "Last 7 Days" },
  { value: "month", label: "This Month" },
];

// ============================================================================
// COMPONENTS
// ============================================================================

function OverviewCards({ metrics, loading }: { metrics: OrgMetrics | null; loading: boolean }) {
  const cards = [
    {
      title: "Total Executions",
      value: metrics?.totalExecutions ?? 0,
      format: (v: number) => v.toLocaleString(),
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Success Rate",
      value: metrics?.overallSuccessRate ?? 0,
      format: (v: number) => `${v}%`,
      color:
        (metrics?.overallSuccessRate ?? 0) >= 95
          ? "text-green-600"
          : (metrics?.overallSuccessRate ?? 0) >= 80
            ? "text-yellow-600"
            : "text-red-600",
      bgColor:
        (metrics?.overallSuccessRate ?? 0) >= 95
          ? "bg-green-50"
          : (metrics?.overallSuccessRate ?? 0) >= 80
            ? "bg-yellow-50"
            : "bg-red-50",
    },
    {
      title: "Avg Latency",
      value: metrics?.avgLatencyMs ?? 0,
      format: (v: number) => `${v}ms`,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      title: "Total Cost",
      value: metrics?.totalCostCents ?? 0,
      format: (v: number) => `$${(v / 100).toFixed(2)}`,
      color: "text-amber-600",
      bgColor: "bg-amber-50",
    },
    {
      title: "Active Agents",
      value: metrics?.totalAgents ?? 0,
      format: (v: number) => v.toString(),
      color: "text-teal-600",
      bgColor: "bg-teal-50",
    },
    {
      title: "Unique Users",
      value: metrics?.uniqueUsers ?? 0,
      format: (v: number) => v.toString(),
      color: "text-indigo-600",
      bgColor: "bg-indigo-50",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className={`${card.bgColor} rounded-lg p-4 ${loading ? "animate-pulse" : ""}`}
        >
          <p className="text-sm text-gray-600 mb-1">{card.title}</p>
          <p className={`text-2xl font-bold ${card.color}`}>
            {loading ? "-" : card.format(card.value)}
          </p>
        </div>
      ))}
    </div>
  );
}

function ExecutionChart({
  data,
  loading,
}: {
  data: OrgMetrics["dailyTrend"];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Executions Over Time</h3>
        <div className="h-64 bg-gray-100 animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <h3 className="text-lg font-semibold mb-4">Executions Over Time</h3>
      <ResponsiveContainer width="100%" height={256}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            tickFormatter={(date: string) => new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip
            labelFormatter={(date: string) => new Date(date).toLocaleDateString()}
            formatter={(value: number, name: string) => [value.toLocaleString(), name]}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="executions"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={false}
            name="Executions"
          />
          <Line
            type="monotone"
            dataKey="successCount"
            stroke="#10B981"
            strokeWidth={2}
            dot={false}
            name="Successful"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function CostBreakdownChart({
  agents,
  loading,
}: {
  agents: AgentMetrics[];
  loading: boolean;
}) {
  if (loading || agents.length === 0) {
    return (
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Cost by Agent</h3>
        <div className="h-64 bg-gray-100 animate-pulse rounded" />
      </div>
    );
  }

  const pieData = agents
    .filter((a) => a.totalCostCents > 0)
    .slice(0, 8)
    .map((a) => ({
      name: a.agentName || a.agentId.slice(0, 8),
      value: a.totalCostCents,
    }));

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <h3 className="text-lg font-semibold mb-4">Cost by Agent</h3>
      <ResponsiveContainer width="100%" height={256}>
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }: { name: string; percent: number }) => `${name} (${(percent * 100).toFixed(0)}%)`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {pieData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number) => [`$${(value / 100).toFixed(2)}`, "Cost"]} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function LatencyDistributionChart({
  agents,
  loading,
}: {
  agents: AgentMetrics[];
  loading: boolean;
}) {
  if (loading || agents.length === 0) {
    return (
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Latency Distribution</h3>
        <div className="h-64 bg-gray-100 animate-pulse rounded" />
      </div>
    );
  }

  const barData = agents.slice(0, 10).map((a) => ({
    name: a.agentName || a.agentId.slice(0, 8),
    avgLatency: a.avgLatencyMs,
    p95Latency: a.p95LatencyMs,
  }));

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <h3 className="text-lg font-semibold mb-4">Latency by Agent</h3>
      <ResponsiveContainer width="100%" height={256}>
        <BarChart data={barData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value: number) => [`${value}ms`, ""]} />
          <Legend />
          <Bar dataKey="avgLatency" fill="#8B5CF6" name="Avg Latency (ms)" />
          <Bar dataKey="p95Latency" fill="#EC4899" name="P95 Latency (ms)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function AgentComparisonTable({
  agents,
  loading,
}: {
  agents: AgentMetrics[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Agent Performance</h3>
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 animate-pulse rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm overflow-x-auto">
      <h3 className="text-lg font-semibold mb-4">Agent Performance</h3>
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
              Agent
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
              Executions
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
              Success
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
              Latency
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
              Cost
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
              Rating
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {agents.map((agent) => (
            <tr key={agent.agentId} className="hover:bg-gray-50">
              <td className="px-4 py-3 whitespace-nowrap">
                <span className="font-medium text-gray-900">
                  {agent.agentName || agent.agentId.slice(0, 8)}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-gray-600">
                {agent.totalExecutions.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right">
                <span
                  className={`px-2 py-1 rounded text-sm ${
                    agent.successRate >= 95
                      ? "bg-green-100 text-green-800"
                      : agent.successRate >= 80
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-red-100 text-red-800"
                  }`}
                >
                  {agent.successRate}%
                </span>
              </td>
              <td className="px-4 py-3 text-right text-gray-600">{agent.avgLatencyMs}ms</td>
              <td className="px-4 py-3 text-right text-gray-600">
                ${(agent.totalCostCents / 100).toFixed(2)}
              </td>
              <td className="px-4 py-3 text-right text-gray-600">
                {agent.avgRating > 0 ? agent.avgRating.toFixed(1) : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrendIndicators({ trends, loading }: { trends: Trend[]; loading: boolean }) {
  if (loading || trends.length === 0) {
    return null;
  }

  const getArrow = (direction: Trend["direction"]) => {
    switch (direction) {
      case "up":
        return "^";
      case "down":
        return "v";
      default:
        return "-";
    }
  };

  const getColor = (trend: Trend) => {
    const isGoodUp = ["successRate", "totalExecutions", "uniqueUsers", "avgRating"].includes(
      trend.metric,
    );
    const isGoodDown = ["avgLatencyMs", "totalCostCents"].includes(trend.metric);

    if (trend.direction === "stable") return "text-gray-600 bg-gray-100";
    if ((trend.direction === "up" && isGoodUp) || (trend.direction === "down" && isGoodDown)) {
      return "text-green-600 bg-green-100";
    }
    return "text-red-600 bg-red-100";
  };

  const formatMetricName = (name: string) => {
    return name
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .replace("Ms", " (ms)")
      .replace("Cents", " ($)");
  };

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <h3 className="text-lg font-semibold mb-4">Trends vs Previous Period</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {trends.map((trend) => (
          <div
            key={trend.metric}
            className={`rounded-lg p-3 ${getColor(trend)}`}
          >
            <p className="text-xs font-medium mb-1">{formatMetricName(trend.metric)}</p>
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold">{getArrow(trend.direction)}</span>
              <span className="text-sm">
                {trend.changePercent > 0 ? "+" : ""}
                {trend.changePercent.toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LeaderboardTable({
  entries,
  loading,
}: {
  entries: LeaderboardEntry[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Agent Leaderboard</h3>
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 animate-pulse rounded" />
          ))}
        </div>
      </div>
    );
  }

  const getTrendIcon = (trend: LeaderboardEntry["trend"]) => {
    switch (trend) {
      case "up":
        return <span className="text-green-500">^</span>;
      case "down":
        return <span className="text-red-500">v</span>;
      default:
        return <span className="text-gray-400">-</span>;
    }
  };

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <h3 className="text-lg font-semibold mb-4">Agent Leaderboard</h3>
      <div className="space-y-2">
        {entries.map((entry) => (
          <div
            key={entry.agentId}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100"
          >
            <div className="flex items-center gap-3">
              <span
                className={`w-8 h-8 flex items-center justify-center rounded-full font-bold ${
                  entry.rank === 1
                    ? "bg-yellow-400 text-yellow-900"
                    : entry.rank === 2
                      ? "bg-gray-300 text-gray-700"
                      : entry.rank === 3
                        ? "bg-orange-400 text-orange-900"
                        : "bg-gray-200 text-gray-600"
                }`}
              >
                {entry.rank}
              </span>
              <div>
                <p className="font-medium">{entry.agentName || entry.agentId.slice(0, 8)}</p>
                <p className="text-xs text-gray-500">
                  Score: {entry.score.toFixed(1)} {getTrendIcon(entry.trend)}
                </p>
              </div>
            </div>
            <div className="text-right text-sm">
              <p className="text-gray-600">{entry.executions.toLocaleString()} executions</p>
              <p className="text-gray-500">{entry.successRate}% success</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// HeatmapCalendar - execution heatmap by day/hour
function HeatmapCalendar({
  data,
  loading,
}: {
  data: Array<{ date: string; hour: number; value: number }>;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Execution Heatmap</h3>
        <div className="h-64 bg-gray-100 animate-pulse rounded" />
      </div>
    );
  }

  // Generate heatmap grid (7 days x 24 hours)
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Process data into a 7x24 grid
  const heatmapGrid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  let maxValue = 1;

  data.forEach((item) => {
    const date = new Date(item.date);
    const dayOfWeek = date.getDay();
    if (dayOfWeek >= 0 && dayOfWeek < 7 && item.hour >= 0 && item.hour < 24) {
      heatmapGrid[dayOfWeek][item.hour] += item.value;
      maxValue = Math.max(maxValue, heatmapGrid[dayOfWeek][item.hour]);
    }
  });

  const getColor = (value: number) => {
    if (value === 0) return "bg-gray-100";
    const intensity = value / maxValue;
    if (intensity < 0.2) return "bg-blue-100";
    if (intensity < 0.4) return "bg-blue-200";
    if (intensity < 0.6) return "bg-blue-300";
    if (intensity < 0.8) return "bg-blue-400";
    return "bg-blue-500";
  };

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <h3 className="text-lg font-semibold mb-4">Execution Heatmap (by Day/Hour)</h3>
      <div className="overflow-x-auto">
        <div className="min-w-max">
          {/* Hour labels */}
          <div className="flex gap-0.5 mb-1 ml-12">
            {hours.map((h) => (
              <div
                key={h}
                className="w-6 text-xs text-gray-500 text-center"
                title={`${h}:00`}
              >
                {h % 3 === 0 ? h : ""}
              </div>
            ))}
          </div>
          {/* Heatmap grid */}
          {days.map((day, dayIndex) => (
            <div key={day} className="flex gap-0.5 items-center">
              <span className="w-10 text-xs text-gray-600 text-right pr-2">{day}</span>
              {hours.map((hour) => (
                <div
                  key={hour}
                  className={`w-6 h-6 rounded-sm ${getColor(heatmapGrid[dayIndex][hour])} cursor-pointer hover:ring-2 hover:ring-blue-400`}
                  title={`${day} ${hour}:00 - ${heatmapGrid[dayIndex][hour]} executions`}
                />
              ))}
            </div>
          ))}
          {/* Legend */}
          <div className="flex items-center gap-2 mt-4 ml-12">
            <span className="text-xs text-gray-500">Less</span>
            <div className="w-4 h-4 bg-gray-100 rounded-sm" />
            <div className="w-4 h-4 bg-blue-100 rounded-sm" />
            <div className="w-4 h-4 bg-blue-200 rounded-sm" />
            <div className="w-4 h-4 bg-blue-300 rounded-sm" />
            <div className="w-4 h-4 bg-blue-400 rounded-sm" />
            <div className="w-4 h-4 bg-blue-500 rounded-sm" />
            <span className="text-xs text-gray-500">More</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnomalyAlerts({ anomalies, loading }: { anomalies: Anomaly[]; loading: boolean }) {
  if (loading || anomalies.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <span className="text-red-500">!</span> Anomalies Detected
      </h3>
      <div className="space-y-2">
        {anomalies.slice(0, 5).map((anomaly, index) => (
          <div
            key={index}
            className={`p-3 rounded-lg border-l-4 ${
              anomaly.severity === "critical"
                ? "bg-red-50 border-red-500"
                : "bg-yellow-50 border-yellow-500"
            }`}
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium capitalize">{anomaly.metric.replace(/([A-Z])/g, " $1")}</p>
                <p className="text-sm text-gray-600">
                  Value: {anomaly.value.toLocaleString()} (expected: ~{anomaly.expectedValue.toLocaleString()})
                </p>
              </div>
              <span
                className={`px-2 py-1 rounded text-xs font-medium ${
                  anomaly.severity === "critical"
                    ? "bg-red-100 text-red-800"
                    : "bg-yellow-100 text-yellow-800"
                }`}
              >
                {anomaly.deviationPercent > 0 ? "+" : ""}
                {anomaly.deviationPercent.toFixed(0)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExportButton({
  onExport,
  loading,
}: {
  onExport: (format: "csv" | "pdf") => void;
  loading: boolean;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {loading ? (
          <>
            <span className="animate-spin">...</span>
            Exporting...
          </>
        ) : (
          <>Export</>
        )}
      </button>
      {showMenu && !loading && (
        <div className="absolute right-0 mt-2 w-40 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
          <button
            onClick={() => {
              onExport("csv");
              setShowMenu(false);
            }}
            className="w-full px-4 py-2 text-left hover:bg-gray-100 rounded-t-lg"
          >
            Export as CSV
          </button>
          <button
            onClick={() => {
              onExport("pdf");
              setShowMenu(false);
            }}
            className="w-full px-4 py-2 text-left hover:bg-gray-100 rounded-b-lg"
          >
            Export as PDF
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AnalyticsDashboardPage() {
  const [period, setPeriod] = useState<"day" | "week" | "month">("week");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [overview, setOverview] = useState<OrgMetrics | null>(null);
  const [agents, setAgents] = useState<AgentMetrics[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [overviewRes, agentsRes, leaderboardRes, trendsRes] = await Promise.all([
        fetch(`/api/analytics/overview?period=${period}`, { credentials: "include" }),
        fetch(`/api/analytics/agents?period=${period}`, { credentials: "include" }),
        fetch(`/api/analytics/leaderboard?period=${period}&limit=10`, { credentials: "include" }),
        fetch(`/api/analytics/trends?period=${period}`, { credentials: "include" }),
      ]);

      if (!overviewRes.ok) throw new Error("Failed to fetch overview");
      if (!agentsRes.ok) throw new Error("Failed to fetch agent metrics");
      if (!leaderboardRes.ok) throw new Error("Failed to fetch leaderboard");
      if (!trendsRes.ok) throw new Error("Failed to fetch trends");

      const [overviewData, agentsData, leaderboardData, trendsData] = await Promise.all([
        overviewRes.json(),
        agentsRes.json(),
        leaderboardRes.json(),
        trendsRes.json(),
      ]);

      setOverview(overviewData.data);
      setAgents(agentsData.data?.agents || []);
      setLeaderboard(leaderboardData.data?.leaderboard || []);
      setTrends(trendsData.data?.trends || []);
      setAnomalies(trendsData.data?.anomalies || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
      console.error("Analytics fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  const handleExport = async (format: "csv" | "pdf") => {
    setExporting(true);
    try {
      const response = await fetch("/api/analytics/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: "Agent Performance Report",
          sections: ["overview", "agents", "leaderboard", "costs"],
          format,
          period,
        }),
      });

      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics-report-${new Date().toISOString().split("T")[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
      setError("Failed to export report");
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-gray-600">Agent performance and execution metrics</p>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as typeof period)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>
          <ExportButton onExport={handleExport} loading={exporting} />
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
          <button
            onClick={fetchData}
            className="ml-4 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Anomaly Alerts */}
      <div className="mb-6">
        <AnomalyAlerts anomalies={anomalies} loading={loading} />
      </div>

      {/* Overview Cards */}
      <div className="mb-6">
        <OverviewCards metrics={overview} loading={loading} />
      </div>

      {/* Trend Indicators */}
      <div className="mb-6">
        <TrendIndicators trends={trends} loading={loading} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ExecutionChart data={overview?.dailyTrend || []} loading={loading} />
        <CostBreakdownChart agents={agents} loading={loading} />
      </div>

      {/* Latency Chart */}
      <div className="mb-6">
        <LatencyDistributionChart agents={agents} loading={loading} />
      </div>

      {/* Heatmap Calendar */}
      <div className="mb-6">
        <HeatmapCalendar
          data={(overview?.dailyTrend || []).flatMap((day) =>
            // Generate hourly distribution based on daily executions (simulated)
            Array.from({ length: 24 }, (_, hour) => ({
              date: day.date,
              hour,
              value: Math.floor(
                day.executions * (hour >= 9 && hour <= 17 ? 0.08 : 0.02)
              ),
            }))
          )}
          loading={loading}
        />
      </div>

      {/* Tables Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AgentComparisonTable agents={agents} loading={loading} />
        <LeaderboardTable entries={leaderboard} loading={loading} />
      </div>
    </div>
  );
}
