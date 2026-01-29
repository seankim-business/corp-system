/**
 * SearchResultCard Component
 *
 * Displays a single search result with AI summary, source icon,
 * and quick actions (open, copy link).
 */

import { useState } from "react";

export interface SearchResult {
  source: "notion" | "drive" | "github" | "slack";
  id: string;
  title: string;
  snippet: string;
  url: string;
  score: number;
  aiSummary?: string;
  relevantExcerpt?: string;
  lastModified?: string;
  author?: string;
}

interface SearchResultCardProps {
  result: SearchResult;
  onClick?: (result: SearchResult) => void;
  onCopyLink?: (url: string) => void;
}

const SOURCE_ICONS: Record<string, { icon: string; color: string; bg: string }> = {
  notion: { icon: "N", color: "text-black", bg: "bg-white border border-gray-300" },
  drive: { icon: "G", color: "text-blue-600", bg: "bg-blue-50" },
  github: { icon: "GH", color: "text-gray-800", bg: "bg-gray-100" },
  slack: { icon: "S", color: "text-purple-600", bg: "bg-purple-50" },
};

const SOURCE_NAMES: Record<string, string> = {
  notion: "Notion",
  drive: "Google Drive",
  github: "GitHub",
  slack: "Slack",
};

export default function SearchResultCard({
  result,
  onClick,
  onCopyLink,
}: SearchResultCardProps) {
  const [copied, setCopied] = useState(false);
  const sourceConfig = SOURCE_ICONS[result.source] || SOURCE_ICONS.notion;

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(result.url);
    setCopied(true);
    onCopyLink?.(result.url);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(result.url, "_blank", "noopener,noreferrer");
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div
      className="bg-white rounded-lg border border-gray-200 p-4 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer"
      onClick={() => onClick?.(result)}
    >
      <div className="flex items-start gap-3">
        {/* Source Icon */}
        <div
          className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${sourceConfig.bg} ${sourceConfig.color}`}
        >
          {sourceConfig.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-gray-900 truncate">
                {result.title}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-500">
                  {SOURCE_NAMES[result.source]}
                </span>
                {result.lastModified && (
                  <>
                    <span className="text-gray-300">|</span>
                    <span className="text-xs text-gray-500">
                      {formatDate(result.lastModified)}
                    </span>
                  </>
                )}
                {result.author && (
                  <>
                    <span className="text-gray-300">|</span>
                    <span className="text-xs text-gray-500">{result.author}</span>
                  </>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={handleCopyLink}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                title="Copy link"
              >
                {copied ? (
                  <svg
                    className="w-4 h-4 text-green-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                )}
              </button>
              <button
                onClick={handleOpen}
                className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                title="Open in new tab"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* AI Summary or Snippet */}
          {result.aiSummary ? (
            <div className="mt-2 p-2 bg-indigo-50 rounded-md">
              <div className="flex items-center gap-1 text-xs text-indigo-600 font-medium mb-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                AI Summary
              </div>
              <p className="text-sm text-gray-700">{result.aiSummary}</p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-600 line-clamp-2">
              {result.relevantExcerpt || result.snippet || "No preview available"}
            </p>
          )}

          {/* Relevance Score */}
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full"
                style={{ width: `${Math.round(result.score * 100)}%` }}
              />
            </div>
            <span className="text-xs text-gray-400">
              {Math.round(result.score * 100)}% match
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
