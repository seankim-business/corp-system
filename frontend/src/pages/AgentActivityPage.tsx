import { useState, useCallback, useMemo } from "react";
import { useSSE, SSEEvent } from "../hooks/useSSE";
import AgentTree, { AgentNode } from "../components/agent-activity/AgentTree";
import AccountPoolStatus, {
  ClaudeMaxAccount,
} from "../components/agent-activity/AccountPoolStatus";

interface ActivityEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

const EVENT_TYPES = [
  "all",
  "agent:started",
  "agent:progress",
  "agent:completed",
  "agent:failed",
  "agent_delegated",
  "account_selected",
  "execution:started",
  "execution:completed",
];

export default function AgentActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [agents, setAgents] = useState<Map<string, AgentNode>>(new Map());
  const [accounts, setAccounts] = useState<ClaudeMaxAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>();
  const [selectedSessionId, setSelectedSessionId] = useState<string>();

  const handleEvent = useCallback((event: SSEEvent) => {
    const newEvent: ActivityEvent = {
      id: `${event.timestamp}-${Math.random().toString(36).slice(2)}`,
      type: event.type,
      data: event.data as Record<string, unknown>,
      timestamp: event.timestamp,
    };
    setEvents((prev) => [newEvent, ...prev].slice(0, 100));

    const data = event.data as Record<string, unknown>;

    if (event.type === "agent:started" || event.type === "agent_delegated") {
      const agentNode: AgentNode = {
        id: (data.activityId as string) || (data.id as string) || newEvent.id,
        sessionId: (data.sessionId as string) || "unknown",
        agentType: (data.agentType as string) || "unknown",
        agentName: data.agentName as string,
        category: data.category as string,
        status: "in_progress",
        parentId: data.parentActivityId as string,
        startedAt: new Date(event.timestamp).toISOString(),
      };
      setAgents((prev) => new Map(prev).set(agentNode.id, agentNode));
    }

    if (event.type === "agent:progress") {
      const activityId = data.activityId as string;
      if (activityId) {
        setAgents((prev) => {
          const newMap = new Map(prev);
          const existing = newMap.get(activityId);
          if (existing) {
            newMap.set(activityId, {
              ...existing,
              progress: data.progress as number,
              status: "in_progress",
            });
          }
          return newMap;
        });
      }
    }

    if (event.type === "agent:completed" || event.type === "agent:failed") {
      const activityId = data.activityId as string;
      if (activityId) {
        setAgents((prev) => {
          const newMap = new Map(prev);
          const existing = newMap.get(activityId);
          if (existing) {
            newMap.set(activityId, {
              ...existing,
              status: event.type === "agent:completed" ? "completed" : "failed",
              duration: data.duration as number,
              errorMessage: data.errorMessage as string,
              completedAt: new Date(event.timestamp).toISOString(),
            });
          }
          return newMap;
        });
      }
    }

    if (event.type === "account_selected") {
      setSelectedAccountId(data.accountId as string);
      if (data.accounts) {
        setAccounts(data.accounts as ClaudeMaxAccount[]);
      }
    }
  }, []);

  const { isConnected, error, reconnect } = useSSE({
    url: "/api/events",
    onEvent: handleEvent,
  });

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (filter === "all") return true;
      return e.type === filter || e.type.startsWith(filter.split(":")[0]);
    });
  }, [events, filter]);

  const agentList = useMemo(() => Array.from(agents.values()), [agents]);

  const sessions = useMemo(() => {
    const sessionSet = new Set(agentList.map((a) => a.sessionId));
    return Array.from(sessionSet);
  }, [agentList]);

  const getEventTypeColor = (type: string) => {
    if (type.includes("started")) return "bg-blue-100 text-blue-800";
    if (type.includes("completed")) return "bg-green-100 text-green-800";
    if (type.includes("failed") || type.includes("error")) return "bg-red-100 text-red-800";
    if (type.includes("progress")) return "bg-yellow-100 text-yellow-800";
    if (type.includes("delegated")) return "bg-purple-100 text-purple-800";
    if (type.includes("account")) return "bg-indigo-100 text-indigo-800";
    return "bg-gray-100 text-gray-800";
  };

  const getEventIcon = (type: string) => {
    if (type.includes("started")) return "🚀";
    if (type.includes("completed")) return "✅";
    if (type.includes("failed")) return "❌";
    if (type.includes("progress")) return "⏳";
    if (type.includes("delegated")) return "🔀";
    if (type.includes("account")) return "🎰";
    return "📌";
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Agent Activity</h1>
        <p className="text-gray-600">Real-time monitoring of OMC agent operations</p>
      </div>

      <div className="mb-4 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-3 h-3 rounded-full ${
                isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
              }`}
            />
            <span className="text-sm text-gray-600">{isConnected ? "Live" : "Disconnected"}</span>
          </div>
          {!isConnected && (
            <button onClick={reconnect} className="text-sm text-blue-600 hover:text-blue-800">
              Reconnect
            </button>
          )}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>

        {sessions.length > 0 && (
          <select
            value={selectedSessionId || ""}
            onChange={(e) => setSelectedSessionId(e.target.value || undefined)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Sessions</option>
            {sessions.map((s) => (
              <option key={s} value={s}>
                Session: {s.slice(0, 12)}...
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-3">
          <AgentTree
            agents={agentList}
            selectedSessionId={selectedSessionId}
            onSelectAgent={(agent) => setSelectedSessionId(agent.sessionId)}
          />
        </div>

        <div className="lg:col-span-6">
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">Event Feed</h3>
                <span className="text-sm text-gray-500">{filteredEvents.length} events</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {EVENT_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilter(type)}
                    className={`px-3 py-1 rounded-full text-xs transition ${
                      filter === type
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {type === "all" ? "All" : type.replace(":", " ")}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 max-h-[600px] overflow-y-auto space-y-3">
              {filteredEvents.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <div className="text-4xl mb-4">📡</div>
                  <h2 className="text-lg font-medium">Waiting for events...</h2>
                  <p className="text-sm mt-1">Events appear here in real-time</p>
                </div>
              ) : (
                filteredEvents.map((event) => (
                  <div
                    key={event.id}
                    className="p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xl">{getEventIcon(event.type)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${getEventTypeColor(
                              event.type,
                            )}`}
                          >
                            {event.type}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatTime(event.timestamp)}
                          </span>
                        </div>
                        {Object.keys(event.data).length > 0 && (
                          <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                            <pre className="text-gray-600 overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(event.data, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {events.length > 0 && (
              <div className="p-3 border-t border-gray-200 text-center">
                <button
                  onClick={() => {
                    setEvents([]);
                    setAgents(new Map());
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-3">
          <AccountPoolStatus
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            onRefresh={() => {
              fetch("/api/claude-max-accounts")
                .then((r) => r.json())
                .then((data) => setAccounts(data.accounts || []))
                .catch(console.error);
            }}
          />
        </div>
      </div>
    </div>
  );
}
