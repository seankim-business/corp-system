import { useEffect, useState } from "react";
import { request } from "../api/client";

interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

interface ConversationListItem {
  id: string;
  source: string | null;
  createdAt: string;
  lastUsedAt: string;
  messageCount: number;
  preview: string | null;
  userId: string;
  userName: string | null;
}

interface ConversationDetail {
  id: string;
  source: string | null;
  createdAt: string;
  lastUsedAt: string;
  userId: string;
  userName: string | null;
  history: ConversationMessage[];
  state: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

type SourceFilter = "all" | "slack" | "web" | "terminal" | "api";

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [selectedConversation, setSelectedConversation] = useState<ConversationDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchConversations();
  }, [filter]);

  const fetchConversations = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") {
        params.set("source", filter);
      }
      const data = await request<{
        conversations: ConversationListItem[];
        total: number;
      }>({
        url: `/api/conversations${params.toString() ? `?${params.toString()}` : ""}`,
        method: "GET",
      });
      setConversations(data.conversations || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchConversationDetail = async (id: string) => {
    setIsLoadingDetail(true);
    try {
      const data = await request<{ conversation: ConversationDetail }>({
        url: `/api/conversations/${id}`,
        method: "GET",
      });
      setSelectedConversation(data.conversation);
    } catch (error) {
      console.error("Failed to fetch conversation detail:", error);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const getSourceIcon = (source: string | null) => {
    switch (source) {
      case "slack":
        return "💬";
      case "web":
        return "🌐";
      case "terminal":
        return "💻";
      case "api":
        return "🔌";
      default:
        return "📝";
    }
  };

  const getSourceColor = (source: string | null) => {
    switch (source) {
      case "slack":
        return "bg-purple-100 text-purple-800";
      case "web":
        return "bg-blue-100 text-blue-800";
      case "terminal":
        return "bg-gray-100 text-gray-800";
      case "api":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) {
      return "Just now";
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading conversations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className={`${selectedConversation ? "w-1/2" : "w-full"} transition-all duration-300`}>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Conversations</h1>
          <p className="text-gray-600">
            View AI conversation history from Slack and other sources ({total} total)
          </p>
        </div>

        <div className="mb-6 flex gap-2 flex-wrap">
          {(["all", "slack", "web", "terminal", "api"] as SourceFilter[]).map((src) => (
            <button
              key={src}
              onClick={() => setFilter(src)}
              className={`px-4 py-2 rounded-lg font-medium capitalize ${
                filter === src
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              {src === "all" ? "All Sources" : src}
            </button>
          ))}
        </div>

        {conversations.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="text-6xl mb-4">💬</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">No conversations yet</h2>
              <p className="text-gray-600">
                Start chatting with the AI via Slack or web to see conversation history here
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="divide-y divide-gray-200">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => fetchConversationDetail(conversation.id)}
                  className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                    selectedConversation?.id === conversation.id ? "bg-indigo-50" : ""
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getSourceColor(
                            conversation.source,
                          )}`}
                        >
                          {getSourceIcon(conversation.source)} {conversation.source || "unknown"}
                        </span>
                        <span className="text-xs text-gray-500">
                          {conversation.messageCount} messages
                        </span>
                      </div>
                      <p className="text-sm text-gray-900 truncate">
                        {conversation.preview || "No preview available"}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500">{conversation.userName}</span>
                        <span className="text-xs text-gray-400">•</span>
                        <span className="text-xs text-gray-500">
                          {formatDate(conversation.lastUsedAt)}
                        </span>
                      </div>
                    </div>
                    <div className="ml-4 flex-shrink-0">
                      <svg
                        className="h-5 w-5 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedConversation && (
        <div className="w-1/2 pl-6 border-l border-gray-200">
          <div className="sticky top-0 bg-gray-50 -mx-6 px-6 pt-0">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getSourceColor(
                      selectedConversation.source,
                    )}`}
                  >
                    {getSourceIcon(selectedConversation.source)}{" "}
                    {selectedConversation.source || "unknown"}
                  </span>
                  <h2 className="text-lg font-semibold text-gray-900">Conversation Detail</h2>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedConversation.userName} •{" "}
                  {new Date(selectedConversation.createdAt).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => setSelectedConversation(null)}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <svg
                  className="h-5 w-5 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          {isLoadingDetail ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600"></div>
            </div>
          ) : (
            <div className="space-y-4 pb-8 max-h-[calc(100vh-200px)] overflow-y-auto">
              {selectedConversation.history.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-4 py-2 ${
                      message.role === "user"
                        ? "bg-indigo-600 text-white"
                        : message.role === "system"
                          ? "bg-yellow-100 text-yellow-800 border border-yellow-200"
                          : "bg-gray-100 text-gray-900"
                    }`}
                  >
                    {message.role === "system" && (
                      <span className="text-xs font-medium block mb-1">System</span>
                    )}
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    {message.timestamp && (
                      <p
                        className={`text-xs mt-1 ${
                          message.role === "user" ? "text-indigo-200" : "text-gray-400"
                        }`}
                      >
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {selectedConversation.history.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No messages in this conversation
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
