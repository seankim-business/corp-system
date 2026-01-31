/**
 * AgentActivityFeed Component
 *
 * Real-time feed of agent actions and events.
 * Displays a scrollable list of agent messages with filtering.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import AgentMessage, { AgentMessageData, AgentEventType } from "./AgentMessage";

interface AgentActivityFeedProps {
  events: AgentMessageData[];
  maxEvents?: number;
  onApprove?: (approvalId: string) => void;
  onDeny?: (approvalId: string) => void;
  autoScroll?: boolean;
}

const EVENT_FILTERS: { label: string; types: AgentEventType[] | null }[] = [
  { label: "All", types: null },
  {
    label: "Agents",
    types: ["agent_started", "agent_completed", "agent_message"],
  },
  { label: "Tools", types: ["tool_called", "tool_completed"] },
  {
    label: "Approvals",
    types: ["approval_requested", "approval_granted", "approval_denied"],
  },
  {
    label: "Session",
    types: ["session_paused", "session_resumed", "session_cancelled", "workflow_step"],
  },
  { label: "Errors", types: ["error"] },
];

export default function AgentActivityFeed({
  events,
  maxEvents = 100,
  onApprove,
  onDeny,
  autoScroll = true,
}: AgentActivityFeedProps) {
  const [filter, setFilter] = useState<AgentEventType[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const feedRef = useRef<HTMLDivElement>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);

  // Filter events
  const filteredEvents = useMemo(() => {
    let filtered = events;

    // Apply type filter
    if (filter !== null) {
      filtered = filtered.filter((e) => filter.includes(e.type));
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.agentName.toLowerCase().includes(query) ||
          e.data.message?.toLowerCase().includes(query) ||
          e.data.toolName?.toLowerCase().includes(query) ||
          e.data.targetAgent?.toLowerCase().includes(query)
      );
    }

    // Limit to maxEvents
    return filtered.slice(0, maxEvents);
  }, [events, filter, searchQuery, maxEvents]);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (autoScroll && !isUserScrolling && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events, autoScroll, isUserScrolling]);

  // Detect user scrolling
  const handleScroll = () => {
    if (!feedRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = feedRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsUserScrolling(!isAtBottom);
  };

  const scrollToBottom = () => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
      setIsUserScrolling(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow flex flex-col h-full">
      {/* Header with filters */}
      <div className="p-4 border-b border-gray-200 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Activity Feed</h3>
          <span className="text-sm text-gray-500">
            {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search events..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <svg
            className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Filter buttons */}
        <div className="flex gap-2 flex-wrap">
          {EVENT_FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setFilter(f.types)}
              className={`px-3 py-1 text-xs rounded-full transition ${
                filter === f.types || (filter === null && f.types === null)
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Event list */}
      <div
        ref={feedRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[500px]"
      >
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 py-12">
            <div className="text-4xl mb-4">📡</div>
            <p className="font-medium">No events yet</p>
            <p className="text-sm mt-1">Events will appear here in real-time</p>
          </div>
        ) : (
          filteredEvents.map((event) => (
            <AgentMessage
              key={event.id}
              message={event}
              onApprove={onApprove}
              onDeny={onDeny}
            />
          ))
        )}
      </div>

      {/* Scroll to bottom button */}
      {isUserScrolling && events.length > 0 && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2">
          <button
            onClick={scrollToBottom}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-full shadow-lg hover:bg-blue-700 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
            New events
          </button>
        </div>
      )}
    </div>
  );
}
