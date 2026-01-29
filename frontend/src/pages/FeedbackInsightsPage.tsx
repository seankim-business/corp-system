/**
 * FeedbackInsightsPage
 *
 * Dashboard for viewing feedback analytics, patterns, and recommended actions.
 * Allows admins to apply or dismiss improvement actions.
 */

import { useState, useEffect } from "react";

interface FeedbackAnalysis {
  totalCount: number;
  sentimentDistribution: Record<string, number>;
  categoryDistribution: Record<string, number>;
  recentFeedback: Feedback[];
  period: { days: number; since: string };
}

interface Feedback {
  id: string;
  type: string;
  rating?: number;
  reaction?: string;
  category?: string;
  sentiment?: string;
  originalRequest: string;
  agentResponse: string;
  createdAt: string;
}

interface FeedbackAction {
  id: string;
  type: string;
  priority: string;
  description: string;
  status: string;
  autoApplicable: boolean;
  requiresHumanReview: boolean;
  estimatedImpact: {
    affectedRequests: number;
    expectedImprovement: number;
  };
  createdAt: string;
}

interface ImprovementStats {
  applied: number;
  rolledBack: number;
  pending: number;
  successRate: number;
}

export default function FeedbackInsightsPage() {
  const [analysis, setAnalysis] = useState<FeedbackAnalysis | null>(null);
  const [actions, setActions] = useState<FeedbackAction[]>([]);
  const [stats, setStats] = useState<ImprovementStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetchData();
  }, [days]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [analysisRes, actionsRes] = await Promise.all([
        fetch(`/api/feedback/analysis?days=${days}`, { credentials: "include" }),
        fetch("/api/feedback/actions", { credentials: "include" }),
      ]);

      if (!analysisRes.ok || !actionsRes.ok) {
        throw new Error("Failed to fetch feedback data");
      }

      const analysisData = await analysisRes.json();
      const actionsData = await actionsRes.json();

      setAnalysis(analysisData);
      setActions(actionsData.actions);
      setStats(actionsData.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleApplyAction = async (actionId: string) => {
    setProcessingAction(actionId);
    try {
      const res = await fetch(`/api/feedback/actions/${actionId}/apply`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to apply action");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply action");
    } finally {
      setProcessingAction(null);
    }
  };

  const handleDismissAction = async (actionId: string) => {
    setProcessingAction(actionId);
    try {
      const res = await fetch(`/api/feedback/actions/${actionId}/dismiss`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to dismiss action");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to dismiss action");
    } finally {
      setProcessingAction(null);
    }
  };

  const handleProcessFeedback = async () => {
    try {
      const res = await fetch("/api/feedback/process", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to process feedback");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process feedback");
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case "positive":
        return "text-green-600 bg-green-100";
      case "negative":
        return "text-red-600 bg-red-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "text-red-600 bg-red-100";
      case "medium":
        return "text-yellow-600 bg-yellow-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Feedback Insights</h1>
        <div className="flex items-center gap-4">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            onClick={handleProcessFeedback}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Process Pending
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-700">{error}</div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Total Feedback</p>
          <p className="text-3xl font-bold text-gray-900">{analysis?.totalCount || 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Pending Actions</p>
          <p className="text-3xl font-bold text-yellow-600">{stats?.pending || 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Applied Actions</p>
          <p className="text-3xl font-bold text-green-600">{stats?.applied || 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">Success Rate</p>
          <p className="text-3xl font-bold text-indigo-600">
            {stats ? `${(stats.successRate * 100).toFixed(0)}%` : "N/A"}
          </p>
        </div>
      </div>

      {/* Sentiment & Category Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Sentiment Distribution</h2>
          <div className="space-y-3">
            {analysis?.sentimentDistribution &&
              Object.entries(analysis.sentimentDistribution).map(([sentiment, count]) => (
                <div key={sentiment} className="flex items-center justify-between">
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${getSentimentColor(sentiment)}`}
                  >
                    {sentiment}
                  </span>
                  <span className="text-gray-700 font-medium">{count}</span>
                </div>
              ))}
            {(!analysis?.sentimentDistribution ||
              Object.keys(analysis.sentimentDistribution).length === 0) && (
              <p className="text-gray-500 text-sm">No sentiment data available</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Category Distribution</h2>
          <div className="space-y-3">
            {analysis?.categoryDistribution &&
              Object.entries(analysis.categoryDistribution)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([category, count]) => (
                  <div key={category} className="flex items-center justify-between">
                    <span className="text-gray-700">{category.replace(/_/g, " ")}</span>
                    <span className="bg-gray-100 px-3 py-1 rounded-full text-sm font-medium text-gray-700">
                      {count}
                    </span>
                  </div>
                ))}
            {(!analysis?.categoryDistribution ||
              Object.keys(analysis.categoryDistribution).length === 0) && (
              <p className="text-gray-500 text-sm">No category data available</p>
            )}
          </div>
        </div>
      </div>

      {/* Recommended Actions */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recommended Actions</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {actions.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">No pending actions</div>
          ) : (
            actions.map((action) => (
              <div key={action.id} className="px-6 py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${getPriorityColor(action.priority)}`}
                      >
                        {action.priority}
                      </span>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                        {action.type.replace(/_/g, " ")}
                      </span>
                      {action.autoApplicable && (
                        <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
                          Auto-applicable
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-gray-900">{action.description}</p>
                    <p className="mt-1 text-sm text-gray-500">
                      Est. impact: {action.estimatedImpact.affectedRequests} requests, +
                      {(action.estimatedImpact.expectedImprovement * 100).toFixed(0)}% improvement
                    </p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleApplyAction(action.id)}
                      disabled={processingAction === action.id}
                      className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      {processingAction === action.id ? "..." : "Apply"}
                    </button>
                    <button
                      onClick={() => handleDismissAction(action.id)}
                      disabled={processingAction === action.id}
                      className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recent Feedback */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Feedback</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Sentiment
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Request
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {analysis?.recentFeedback?.slice(0, 10).map((feedback) => (
                <tr key={feedback.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {feedback.type}
                    {feedback.rating && <span className="ml-1">({feedback.rating}/5)</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {feedback.sentiment && (
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${getSentimentColor(feedback.sentiment)}`}
                      >
                        {feedback.sentiment}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {feedback.category?.replace(/_/g, " ") || "-"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {feedback.originalRequest}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(feedback.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {(!analysis?.recentFeedback || analysis.recentFeedback.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No feedback yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
