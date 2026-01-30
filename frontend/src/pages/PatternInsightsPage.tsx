/**
 * Pattern Insights Page
 * Dashboard for viewing detected patterns and generating SOPs
 */

import { useState, useEffect } from "react";
import { isNotAvailableResponse } from "../utils/fetch-helpers";
import FeatureComingSoon from "../components/FeatureComingSoon";

interface DetectedPattern {
  id: string;
  type: "sequence" | "cluster" | "time";
  data: unknown;
  frequency: number;
  confidence: number;
  status: "active" | "dismissed" | "converted";
  sopDraftId?: string;
  createdAt: string;
}

interface PatternStats {
  total: number;
  byType: {
    sequence: number;
    cluster: number;
    time: number;
  };
  avgConfidence: number;
}

export default function PatternInsightsPage() {
  const [patterns, setPatterns] = useState<DetectedPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notAvailable, setNotAvailable] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    fetchPatterns();
  }, [activeFilter]);

  const fetchPatterns = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (activeFilter !== "all") {
        params.set("type", activeFilter);
      }
      params.set("status", "active");
      params.set("limit", "50");

      const response = await fetch(`/api/patterns?${params}`, {
        credentials: "include",
      });

      if (isNotAvailableResponse(response)) {
        setNotAvailable(true);
        return;
      }

      if (!response.ok) throw new Error("Failed to fetch patterns");

      const data = await response.json();
      setPatterns(data.patterns);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const runAnalysis = async () => {
    try {
      setAnalyzing(true);
      const response = await fetch("/api/patterns/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          lookbackDays: 30,
          generateDrafts: true,
        }),
      });

      if (!response.ok) throw new Error("Failed to run analysis");

      await fetchPatterns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const dismissPattern = async (patternId: string) => {
    try {
      const response = await fetch(`/api/patterns/${patternId}/dismiss`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to dismiss pattern");

      setPatterns(patterns.filter((p) => p.id !== patternId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to dismiss");
    }
  };

  const generateSOP = async (patternId: string) => {
    try {
      const response = await fetch(`/api/patterns/${patternId}/generate-sop`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to generate SOP");

      const data = await response.json();
      // Navigate to draft or show success
      window.location.href = `/sop-drafts/${data.draft.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate SOP");
    }
  };

  const getStats = (): PatternStats => {
    const byType = { sequence: 0, cluster: 0, time: 0 };
    let totalConfidence = 0;

    for (const p of patterns) {
      byType[p.type]++;
      totalConfidence += p.confidence;
    }

    return {
      total: patterns.length,
      byType,
      avgConfidence: patterns.length > 0 ? totalConfidence / patterns.length : 0,
    };
  };

  const renderPatternData = (pattern: DetectedPattern) => {
    const data = pattern.data as Record<string, unknown>;

    switch (pattern.type) {
      case "sequence":
        return (
          <div className="text-sm text-gray-600">
            <span className="font-medium">Sequence:</span>{" "}
            {(data.sequence as string[])?.join(" → ") || "N/A"}
          </div>
        );
      case "cluster":
        return (
          <div className="text-sm text-gray-600">
            <span className="font-medium">Intent:</span>{" "}
            {(data.commonIntent as string) || "Similar requests"}
          </div>
        );
      case "time":
        return (
          <div className="text-sm text-gray-600">
            <span className="font-medium">Schedule:</span>{" "}
            {(data.description as string) || "Recurring pattern"}
          </div>
        );
      default:
        return null;
    }
  };

  const stats = getStats();

  if (notAvailable) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Pattern Insights</h1>
            <p className="text-gray-600 mt-1">Detected patterns that could be automated as SOPs</p>
          </div>
          <FeatureComingSoon
            title="Pattern Detection"
            description="Pattern detection is currently being set up. This feature will analyze user actions and suggest automation opportunities once the backend service is activated."
            onRetry={fetchPatterns}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pattern Insights</h1>
            <p className="text-gray-600 mt-1">
              Detected patterns that could be automated as SOPs
            </p>
          </div>
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {analyzing ? "Analyzing..." : "Run Analysis"}
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Total Patterns</div>
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Sequence Patterns</div>
            <div className="text-2xl font-bold text-blue-600">{stats.byType.sequence}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Request Clusters</div>
            <div className="text-2xl font-bold text-green-600">{stats.byType.cluster}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Time Patterns</div>
            <div className="text-2xl font-bold text-purple-600">{stats.byType.time}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6">
          {["all", "sequence", "cluster", "time"].map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-4 py-2 rounded-lg ${
                activeFilter === filter
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading patterns...</p>
          </div>
        ) : patterns.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-gray-400 text-5xl mb-4">📊</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No patterns detected</h3>
            <p className="text-gray-600 mb-4">
              Run an analysis to detect automation opportunities from user actions.
            </p>
            <button
              onClick={runAnalysis}
              disabled={analyzing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Run Analysis Now
            </button>
          </div>
        ) : (
          /* Pattern Cards */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {patterns.map((pattern) => (
              <div key={pattern.id} className="bg-white rounded-lg shadow p-4">
                {/* Pattern Header */}
                <div className="flex justify-between items-start mb-3">
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      pattern.type === "sequence"
                        ? "bg-blue-100 text-blue-700"
                        : pattern.type === "cluster"
                          ? "bg-green-100 text-green-700"
                          : "bg-purple-100 text-purple-700"
                    }`}
                  >
                    {pattern.type}
                  </span>
                  <span className="text-sm text-gray-500">
                    {Math.round(pattern.confidence * 100)}% confidence
                  </span>
                </div>

                {/* Pattern Data */}
                <div className="mb-3">{renderPatternData(pattern)}</div>

                {/* Metrics */}
                <div className="flex gap-4 text-sm text-gray-500 mb-4">
                  <span>Frequency: {pattern.frequency}</span>
                  <span>•</span>
                  <span>{new Date(pattern.createdAt).toLocaleDateString()}</span>
                </div>

                {/* Confidence Bar */}
                <div className="h-2 bg-gray-200 rounded-full mb-4">
                  <div
                    className={`h-full rounded-full ${
                      pattern.confidence >= 0.8
                        ? "bg-green-500"
                        : pattern.confidence >= 0.6
                          ? "bg-yellow-500"
                          : "bg-red-500"
                    }`}
                    style={{ width: `${pattern.confidence * 100}%` }}
                  ></div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => generateSOP(pattern.id)}
                    className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                  >
                    Generate SOP
                  </button>
                  <button
                    onClick={() => dismissPattern(pattern.id)}
                    className="px-3 py-2 text-gray-600 text-sm border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
