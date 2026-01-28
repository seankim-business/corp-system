/**
 * SearchPage
 *
 * Global search interface
 */

import { useState } from "react";
import { request } from "../api/client";
import { Link } from "react-router-dom";

interface SearchResult {
  id: string;
  type: "workflow" | "execution" | "agent" | "conversation" | "member";
  title: string;
  description?: string;
  url: string;
  createdAt?: string;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setHasSearched(true);
    try {
      const data = await request<{ results: SearchResult[] }>({
        url: `/api/search?q=${encodeURIComponent(query)}`,
        method: "GET",
      });
      setResults(data.results || []);
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "workflow":
        return "📋";
      case "execution":
        return "▶️";
      case "agent":
        return "🤖";
      case "conversation":
        return "💬";
      case "member":
        return "👤";
      default:
        return "📄";
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "workflow":
        return "bg-blue-100 text-blue-800";
      case "execution":
        return "bg-green-100 text-green-800";
      case "agent":
        return "bg-purple-100 text-purple-800";
      case "conversation":
        return "bg-yellow-100 text-yellow-800";
      case "member":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Search</h1>
        <p className="text-gray-600">
          Search across workflows, executions, agents, and more
        </p>
      </div>

      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for workflows, agents, conversations..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-lg"
            />
            {isLoading && (
              <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-indigo-600"></div>
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50"
          >
            Search
          </button>
        </div>
      </form>

      {hasSearched && results.length === 0 && !isLoading && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="text-6xl mb-4">🔍</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              No results found
            </h2>
            <p className="text-gray-600">
              Try searching with different keywords
            </p>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="bg-white rounded-lg shadow divide-y divide-gray-200">
          {results.map((result) => (
            <Link
              key={`${result.type}-${result.id}`}
              to={result.url}
              className="block px-6 py-4 hover:bg-gray-50"
            >
              <div className="flex items-start gap-4">
                <span className="text-2xl">{getTypeIcon(result.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-medium text-gray-900 truncate">
                      {result.title}
                    </h3>
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getTypeBadge(
                        result.type
                      )}`}
                    >
                      {result.type}
                    </span>
                  </div>
                  {result.description && (
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {result.description}
                    </p>
                  )}
                  {result.createdAt && (
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(result.createdAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!hasSearched && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            to="/workflows"
            className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
          >
            <span className="text-3xl mb-2 block">📋</span>
            <h3 className="font-medium text-gray-900">Workflows</h3>
            <p className="text-sm text-gray-500">Browse all workflows</p>
          </Link>
          <Link
            to="/executions"
            className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
          >
            <span className="text-3xl mb-2 block">▶️</span>
            <h3 className="font-medium text-gray-900">Executions</h3>
            <p className="text-sm text-gray-500">View execution history</p>
          </Link>
          <Link
            to="/admin/agents"
            className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
          >
            <span className="text-3xl mb-2 block">🤖</span>
            <h3 className="font-medium text-gray-900">Agents</h3>
            <p className="text-sm text-gray-500">Manage agents</p>
          </Link>
          <Link
            to="/conversations"
            className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
          >
            <span className="text-3xl mb-2 block">💬</span>
            <h3 className="font-medium text-gray-900">Conversations</h3>
            <p className="text-sm text-gray-500">View chat history</p>
          </Link>
        </div>
      )}
    </div>
  );
}
