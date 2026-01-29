/**
 * SearchPage Component
 *
 * Unified search page with AI-powered summaries and related questions.
 *
 * Features:
 * - Search across Notion, Drive, GitHub, Slack
 * - AI-generated direct answer at top
 * - AI summaries for each result
 * - Related question suggestions
 * - Source filters
 * - Search analytics tracking
 */

import { useState, useCallback, useEffect } from "react";
import SearchResultCard, {
  SearchResult,
} from "../components/search/SearchResultCard";

type SearchSource = "notion" | "drive" | "github" | "slack";

interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  sources: {
    source: SearchSource;
    count: number;
    connected: boolean;
  }[];
  aiAnswer?: string;
  relatedQuestions?: string[];
  responseTimeMs?: number;
}

const SOURCE_LABELS: Record<SearchSource, string> = {
  notion: "Notion",
  drive: "Google Drive",
  github: "GitHub",
  slack: "Slack",
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSources, setSelectedSources] = useState<SearchSource[]>([]);
  const [analyticsId, setAnalyticsId] = useState<string | null>(null);

  // Debounced search
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          query: searchQuery,
          sources: selectedSources.length > 0 ? selectedSources : undefined,
          limit: 20,
          includeAiSummary: true,
        }),
      });

      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data: SearchResponse = await response.json();
      setResults(data);

      // Track analytics if available
      if (data.results.length > 0) {
        // Analytics ID would be returned from backend in a real implementation
        setAnalyticsId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [selectedSources]);

  useEffect(() => {
    if (debouncedQuery) {
      performSearch(debouncedQuery);
    }
  }, [debouncedQuery, performSearch]);

  const handleResultClick = async (result: SearchResult) => {
    // Track click analytics
    if (analyticsId) {
      try {
        await fetch("/api/search/analytics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            analyticsId,
            clickedResult: result.url,
            clickedSource: result.source,
          }),
        });
      } catch {
        // Ignore analytics errors
      }
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  };

  const handleRelatedQuestionClick = (question: string) => {
    setQuery(question);
  };

  const handleAiAnswerFeedback = async (useful: boolean) => {
    if (analyticsId) {
      try {
        await fetch("/api/search/analytics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            analyticsId,
            aiAnswerUseful: useful,
          }),
        });
      } catch {
        // Ignore analytics errors
      }
    }
  };

  const toggleSource = (source: SearchSource) => {
    setSelectedSources((prev) =>
      prev.includes(source)
        ? prev.filter((s) => s !== source)
        : [...prev, source]
    );
  };

  const connectedSources =
    results?.sources.filter((s) => s.connected).map((s) => s.source) || [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Search Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Unified Search
        </h1>
        <p className="text-gray-600">
          Search across all your connected integrations
        </p>
      </div>

      {/* Search Input */}
      <div className="mb-6">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg
              className="w-5 h-5 text-gray-400"
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
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents, messages, issues..."
            className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-lg"
          />
          {loading && (
            <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Source Filters */}
      {connectedSources.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <span className="text-sm text-gray-500 py-1">Filter by:</span>
          {connectedSources.map((source) => (
            <button
              key={source}
              onClick={() => toggleSource(source)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                selectedSources.length === 0 || selectedSources.includes(source)
                  ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {SOURCE_LABELS[source]}
              {results && (
                <span className="ml-1 text-xs">
                  ({results.sources.find((s) => s.source === source)?.count || 0})
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-6">
          {/* AI Answer */}
          {results.aiAnswer && (
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-900">AI Answer</h2>
              </div>
              <p className="text-gray-700 leading-relaxed">{results.aiAnswer}</p>
              <div className="mt-4 flex items-center gap-4">
                <span className="text-sm text-gray-500">Was this helpful?</span>
                <button
                  onClick={() => handleAiAnswerFeedback(true)}
                  className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Yes
                </button>
                <button
                  onClick={() => handleAiAnswerFeedback(false)}
                  className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  No
                </button>
              </div>
            </div>
          )}

          {/* Result Count & Time */}
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>
              {results.totalCount} result{results.totalCount !== 1 ? "s" : ""}{" "}
              found
            </span>
            {results.responseTimeMs && (
              <span>{(results.responseTimeMs / 1000).toFixed(2)}s</span>
            )}
          </div>

          {/* Search Results */}
          {results.results.length > 0 ? (
            <div className="space-y-3">
              {results.results.map((result, index) => (
                <SearchResultCard
                  key={`${result.source}-${result.id}-${index}`}
                  result={result}
                  onClick={handleResultClick}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              No results found for "{query}"
            </div>
          )}

          {/* Related Questions */}
          {results.relatedQuestions && results.relatedQuestions.length > 0 && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h3 className="text-sm font-medium text-gray-900 mb-3">
                Related Questions
              </h3>
              <div className="space-y-2">
                {results.relatedQuestions.map((question, index) => (
                  <button
                    key={index}
                    onClick={() => handleRelatedQuestionClick(question)}
                    className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-700 transition-colors flex items-center gap-3"
                  >
                    <svg
                      className="w-4 h-4 text-gray-400 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!results && !loading && !query && (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-indigo-600"
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
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Start searching
          </h3>
          <p className="text-gray-500 max-w-sm mx-auto">
            Search across Notion, Google Drive, GitHub, and Slack to find
            documents, messages, and issues.
          </p>
        </div>
      )}
    </div>
  );
}
