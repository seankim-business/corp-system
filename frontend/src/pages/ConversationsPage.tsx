/**
 * ConversationsPage
 *
 * Conversations and chat history
 */

import { useEffect, useState } from "react";
import { request } from "../api/client";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface Conversation {
  id: string;
  title?: string;
  channel?: string;
  participantCount: number;
  messageCount: number;
  lastMessageAt: string;
  messages?: Message[];
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] =
    useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const data = await request<{ conversations: Conversation[] }>({
          url: "/api/conversations",
          method: "GET",
        });
        setConversations(data.conversations || []);
      } catch (error) {
        console.error("Failed to fetch conversations:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchConversations();
  }, []);

  const handleSelectConversation = async (conversation: Conversation) => {
    try {
      const data = await request<{ conversation: Conversation }>({
        url: `/api/conversations/${conversation.id}`,
        method: "GET",
      });
      setSelectedConversation(data.conversation);
    } catch (error) {
      console.error("Failed to fetch conversation details:", error);
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
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Conversations</h1>
        <p className="text-gray-600">View conversation history and chat logs</p>
      </div>

      {conversations.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="text-6xl mb-4">💬</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              No conversations yet
            </h2>
            <p className="text-gray-600">
              Conversations with agents will appear here
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white rounded-lg shadow overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h2 className="font-medium text-gray-900">Recent Conversations</h2>
            </div>
            <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => handleSelectConversation(conversation)}
                  className={`w-full px-4 py-3 text-left hover:bg-gray-50 ${
                    selectedConversation?.id === conversation.id
                      ? "bg-indigo-50"
                      : ""
                  }`}
                >
                  <div className="font-medium text-gray-900 truncate">
                    {conversation.title || `Conversation ${conversation.id.slice(0, 8)}`}
                  </div>
                  {conversation.channel && (
                    <div className="text-sm text-gray-500">
                      #{conversation.channel}
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">
                    {conversation.messageCount} messages ·{" "}
                    {new Date(conversation.lastMessageAt).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-lg shadow overflow-hidden">
            {selectedConversation ? (
              <>
                <div className="px-4 py-3 border-b bg-gray-50">
                  <h2 className="font-medium text-gray-900">
                    {selectedConversation.title ||
                      `Conversation ${selectedConversation.id.slice(0, 8)}`}
                  </h2>
                </div>
                <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
                  {selectedConversation.messages?.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg px-4 py-2 ${
                          message.role === "user"
                            ? "bg-indigo-600 text-white"
                            : "bg-gray-100 text-gray-900"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">
                          {message.content}
                        </p>
                        <p
                          className={`text-xs mt-1 ${
                            message.role === "user"
                              ? "text-indigo-200"
                              : "text-gray-500"
                          }`}
                        >
                          {new Date(message.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  )) || (
                    <p className="text-center text-gray-500">
                      Loading messages...
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-[400px] text-gray-500">
                Select a conversation to view messages
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
