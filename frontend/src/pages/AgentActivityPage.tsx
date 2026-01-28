/**
 * AgentActivityPage
 *
 * Real-time agent activity visualization using SSE
 */

import { useState, useCallback } from "react";
import { useSSE, SSEEvent } from "../hooks/useSSE";

interface ActivityEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export default function AgentActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [filter, setFilter] = useState<string>("all");

  const handleEvent = useCallback((event: SSEEvent) => {
    const newEvent: ActivityEvent = {
      id: `${event.timestamp}-${Math.random().toString(36).slice(2)}`,
      type: event.type,
      data: event.data as Record<string, unknown>,
      timestamp: event.timestamp,
    };
    setEvents((prev) => [newEvent, ...prev].slice(0, 100)); // Keep last 100
  }, []);

  const { isConnected, error, reconnect } = useSSE({
    url: "/api/events",
    onEvent: handleEvent,
  });

  const filteredEvents = events.filter((e) => {
    if (filter === "all") return true;
    return e.type === filter;
  });

  const getEventTypeColor = (type: string) => {
    if (type.includes("started")) return "bg-blue-100 text-blue-800";
    if (type.includes("completed")) return "bg-green-100 text-green-800";
    if (type.includes("failed") || type.includes("error")) return "bg-red-100 text-red-800";
    if (type.includes("progress")) return "bg-yellow-100 text-yellow-800";
    return "bg-gray-100 text-gray-800";
  };

  const getEventIcon = (type: string) => {
    if (type.includes("started")) return "🚀";
    if (type.includes("completed")) return "✅";
    if (type.includes("failed")) return "❌";
    if (type.includes("progress")) return "⏳";
    if (type.includes("notification")) return "🔔";
    return "📌";
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const eventTypes = [
    "all",
    "execution:started",
    "execution:progress",
    "execution:completed",
    "execution:failed",
    "workflow:updated",
    "notification",
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Agent Activity</h1>
        <p className="text-gray-600">Real-time monitoring of agent operations</p>
      </div>

      <div className="mb-4 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-3 h-3 rounded-full ${
              isConnected ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span className="text-sm text-gray-600">
            {isConnected ? "Connected" : "Disconnected"}
          </span>
        </div>
        {!isConnected && (
          <button onClick={reconnect} className="text-sm text-blue-600 hover:text-blue-800">
            Reconnect
          </button>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      <div className="mb-6 flex gap-2 flex-wrap">
        {eventTypes.map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`px-3 py-1 rounded-full text-sm ${
              filter === type
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {type === "all" ? "All Events" : type.replace(":", ": ")}
          </button>
        ))}
      </div>

      <div className="mb-4 text-sm text-gray-500">
        Showing {filteredEvents.length} events
        {filter !== "all" && ` (filtered by ${filter})`}
      </div>

      {filteredEvents.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <div className="text-4xl mb-4">📡</div>
          <h2 className="text-xl font-semibold text-gray-700">Waiting for events...</h2>
          <p className="text-gray-500 mt-2">
            Events will appear here in real-time as agents execute workflows
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEvents.map((event) => (
            <div
              key={event.id}
              className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getEventIcon(event.type)}</span>
                  <div>
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-medium ${getEventTypeColor(
                        event.type,
                      )}`}
                    >
                      {event.type}
                    </span>
                    <p className="text-sm text-gray-500 mt-1">{formatTime(event.timestamp)}</p>
                  </div>
                </div>
              </div>

              {Object.keys(event.data).length > 0 && (
                <div className="mt-3 p-3 bg-gray-50 rounded text-sm">
                  <pre className="text-gray-700 overflow-x-auto">
                    {JSON.stringify(event.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {events.length > 0 && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setEvents([])}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear all events
          </button>
        </div>
      )}
    </div>
  );
}
