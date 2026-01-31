import { useState, useEffect, useCallback, ReactNode } from "react";
import { request } from "../api/client";

// Types matching backend CodeOperation model
interface CodeOperationStats {
  active: number;
  queued: number;
  completedToday: number;
  failedToday: number;
}

interface CodeOperation {
  id: string;
  operationType: "debug" | "implement" | "fix" | "refactor" | "test";
  description: string;
  status: "queued" | "analyzing" | "executing" | "testing" | "committing" | "completed" | "failed" | "cancelled";
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  prUrl?: string;
  errorMessage?: string;
  filesModified?: string[];
  iterations?: number;
}

interface PendingApproval {
  id: string;
  prUrl?: string;
  description: string;
  filesModified?: string[];
  iterations?: number;
  completedAt?: string;
}

export default function AgentMonitorPage() {
  const [stats, setStats] = useState<CodeOperationStats>({ active: 0, queued: 0, completedToday: 0, failedToday: 0 });
  const [activeOperations, setActiveOperations] = useState<CodeOperation[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [history, setHistory] = useState<CodeOperation[]>([]);
  const [expandedDiff, setExpandedDiff] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [statsData, activeData, approvalsData, historyData] = await Promise.all([
        request<CodeOperationStats>({ url: '/api/code-operations/stats', method: 'GET' }),
        request<CodeOperation[]>({ url: '/api/code-operations/active', method: 'GET' }),
        request<PendingApproval[]>({ url: '/api/code-operations/pending-approval', method: 'GET' }),
        request<CodeOperation[]>({ url: '/api/code-operations/history?limit=20', method: 'GET' }),
      ]);
      setStats(statsData);
      setActiveOperations(activeData);
      setPendingApprovals(approvalsData);
      setHistory(historyData);
    } catch (err) {
      console.error("Failed to fetch agent operations:", err);
      setError("Failed to fetch data. Please try again.");
    }
  }, []);

  // Initial fetch and auto-refresh every 5 seconds
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleApprove = async (id: string) => {
    try {
      await request({ url: `/api/code-operations/${id}/approve`, method: 'POST' });
      setPendingApprovals((prev) => prev.filter((p) => p.id !== id));
      // Refresh to get updated data
      fetchData();
    } catch (err) {
      console.error("Failed to approve:", err);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await request({ url: `/api/code-operations/${id}/reject`, method: 'POST', data: { reason: "Rejected via UI" } });
      setPendingApprovals((prev) => prev.filter((p) => p.id !== id));
      fetchData();
    } catch (err) {
      console.error("Failed to reject:", err);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await request({ url: `/api/code-operations/${id}/cancel`, method: 'POST' });
      setActiveOperations((prev) => prev.filter((op) => op.id !== id));
      fetchData();
    } catch (err) {
      console.error("Failed to cancel:", err);
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const getElapsedTime = (startedAt: string) => {
    return formatDuration(Date.now() - new Date(startedAt).getTime());
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      debug: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
      implement: "bg-purple-500/10 text-purple-400 border-purple-500/30",
      fix: "bg-orange-500/10 text-orange-400 border-orange-500/30",
      refactor: "bg-blue-500/10 text-blue-400 border-blue-500/30",
      test: "bg-green-500/10 text-green-400 border-green-500/30",
    };
    return colors[type] || colors.debug;
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, ReactNode> = {
      queued: (
        <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-slate-700 text-slate-300 border border-slate-600">
          QUEUED
        </span>
      ),
      analyzing: (
        <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-blue-500/20 text-blue-300 border border-blue-500/50 animate-pulse">
          ANALYZING
        </span>
      ),
      executing: (
        <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-blue-500/20 text-blue-300 border border-blue-500/50 animate-pulse">
          EXECUTING
        </span>
      ),
      testing: (
        <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-yellow-500/20 text-yellow-300 border border-yellow-500/50 animate-pulse">
          TESTING
        </span>
      ),
      committing: (
        <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-purple-500/20 text-purple-300 border border-purple-500/50 animate-pulse">
          COMMITTING
        </span>
      ),
      completed: (
        <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-green-500/20 text-green-300 border border-green-500/50">
          COMPLETE
        </span>
      ),
      failed: (
        <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-red-500/20 text-red-300 border border-red-500/50">
          FAILED
        </span>
      ),
      cancelled: (
        <span className="px-2.5 py-1 rounded-md text-xs font-mono bg-slate-500/20 text-slate-300 border border-slate-500/50">
          CANCELLED
        </span>
      ),
    };
    return badges[status] || badges.queued;
  };

  const isRunningStatus = (status: string) => {
    return ["analyzing", "executing", "testing", "committing"].includes(status);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Animated grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />

      <div className="relative max-w-[1800px] mx-auto px-8 py-10">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-4 mb-2">
                <h1 className="text-4xl font-black text-white tracking-tight">
                  AGENT OPERATIONS
                </h1>
                <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse shadow-lg shadow-green-400/50" />
              </div>
              <p className="text-slate-400 text-lg font-mono">
                Monitor and manage autonomous code changes in real-time
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 transition-all disabled:opacity-50 font-mono text-sm flex items-center gap-2"
            >
              <svg
                className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {isRefreshing ? "REFRESHING..." : "REFRESH"}
            </button>
          </div>
          {error && (
            <div className="mt-4 px-4 py-2 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm font-mono">
              {error}
            </div>
          )}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-6 mb-10">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-400 font-mono text-sm uppercase tracking-wider">
                Active
              </span>
              <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <div className="h-3 w-3 rounded-full bg-blue-400 animate-pulse" />
              </div>
            </div>
            <div className="text-5xl font-black text-white mb-1">{stats.active}</div>
            <div className="text-xs text-slate-500 font-mono">operations running</div>
          </div>

          <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-400 font-mono text-sm uppercase tracking-wider">
                Queued
              </span>
              <div className="h-8 w-8 rounded-lg bg-slate-700 flex items-center justify-center">
                <svg className="w-5 h-5 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                  <path
                    fillRule="evenodd"
                    d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>
            <div className="text-5xl font-black text-white mb-1">{stats.queued}</div>
            <div className="text-xs text-slate-500 font-mono">waiting to execute</div>
          </div>

          <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-400 font-mono text-sm uppercase tracking-wider">
                Completed
              </span>
              <div className="h-8 w-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>
            <div className="text-5xl font-black text-white mb-1">{stats.completedToday}</div>
            <div className="text-xs text-slate-500 font-mono">today</div>
          </div>

          <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-400 font-mono text-sm uppercase tracking-wider">
                Failed
              </span>
              <div className="h-8 w-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>
            <div className="text-5xl font-black text-white mb-1">{stats.failedToday}</div>
            <div className="text-xs text-slate-500 font-mono">today</div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Active Operations - 2 columns */}
          <div className="xl:col-span-2">
            <div className="bg-slate-900/50 backdrop-blur border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-700 bg-slate-900/80">
                <h2 className="text-xl font-bold text-white font-mono uppercase tracking-wide">
                  Active Operations
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/50">
                      <th className="px-6 py-3 text-left text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">
                        Operation ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">
                        Elapsed
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {activeOperations.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center">
                          <div className="text-slate-500 font-mono text-sm">
                            No active operations
                          </div>
                        </td>
                      </tr>
                    ) : (
                      activeOperations.map((op) => (
                        <tr key={op.id} className="hover:bg-slate-800/50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="font-mono text-sm text-slate-300">{op.id.slice(0, 8)}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-2.5 py-1 rounded-md text-xs font-mono uppercase border ${getTypeColor(op.operationType)}`}
                            >
                              {op.operationType}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-slate-200 max-w-md">{op.description}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(op.status)}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-mono text-slate-400">
                              {op.startedAt ? getElapsedTime(op.startedAt) : getElapsedTime(op.createdAt)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <button className="px-3 py-1.5 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-600 transition-colors">
                                View
                              </button>
                              {isRunningStatus(op.status) && (
                                <button
                                  onClick={() => handleCancel(op.id)}
                                  className="px-3 py-1.5 text-xs font-mono bg-red-900/30 hover:bg-red-900/50 text-red-300 rounded border border-red-700 transition-colors"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent History */}
            <div className="mt-8 bg-slate-900/50 backdrop-blur border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-700 bg-slate-900/80">
                <h2 className="text-xl font-bold text-white font-mono uppercase tracking-wide">
                  Recent History
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/50">
                      <th className="px-6 py-3 text-left text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">
                        ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">
                        Files
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">
                        Result
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">
                        PR
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {history.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center">
                          <div className="text-slate-500 font-mono text-sm">No operations yet</div>
                        </td>
                      </tr>
                    ) : (
                      history.map((op) => (
                        <tr key={op.id} className="hover:bg-slate-800/50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="font-mono text-sm text-slate-300">{op.id.slice(0, 8)}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-2.5 py-1 rounded-md text-xs font-mono uppercase border ${getTypeColor(op.operationType)}`}
                            >
                              {op.operationType}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-slate-200 max-w-md">{op.description}</div>
                            {op.errorMessage && (
                              <div className="text-xs text-red-400 mt-1 font-mono">{op.errorMessage}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-mono text-slate-400">
                              {op.filesModified?.length || 0}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(op.status)}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {op.prUrl ? (
                              <a
                                href={op.prUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 text-sm font-mono underline"
                              >
                                View PR
                              </a>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Approval Queue - 1 column */}
          <div className="xl:col-span-1">
            <div className="bg-slate-900/50 backdrop-blur border border-slate-700 rounded-xl shadow-2xl overflow-hidden sticky top-6">
              <div className="px-6 py-4 border-b border-slate-700 bg-slate-900/80">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white font-mono uppercase tracking-wide">
                    Approval Queue
                  </h2>
                  <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/50 rounded-md text-xs font-mono font-semibold">
                    {pendingApprovals.length} PENDING
                  </span>
                </div>
              </div>
              <div className="p-6 space-y-4 max-h-[800px] overflow-y-auto">
                {pendingApprovals.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 font-mono text-sm">
                    No pending approvals
                  </div>
                ) : (
                  pendingApprovals.map((approval) => (
                    <div
                      key={approval.id}
                      className="bg-slate-800/50 border border-slate-700 rounded-lg p-5 hover:border-slate-600 transition-colors"
                    >
                      <div className="mb-3">
                        {approval.prUrl ? (
                          <a
                            href={approval.prUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 font-mono text-sm font-semibold underline"
                          >
                            PR #{approval.prUrl.split("/").pop()}
                          </a>
                        ) : (
                          <span className="font-mono text-sm font-semibold text-slate-300">
                            Operation {approval.id.slice(0, 8)}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-slate-200 mb-4">{approval.description}</div>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-slate-900/50 rounded px-3 py-2 border border-slate-700">
                          <div className="text-xs text-slate-400 font-mono mb-1">Files</div>
                          <div className="text-lg font-bold text-white">{approval.filesModified?.length || 0}</div>
                        </div>
                        <div className="bg-slate-900/50 rounded px-3 py-2 border border-slate-700">
                          <div className="text-xs text-slate-400 font-mono mb-1">Iterations</div>
                          <div className="text-lg font-bold text-white">{approval.iterations || 0}</div>
                        </div>
                      </div>

                      {/* Files modified preview */}
                      {approval.filesModified && approval.filesModified.length > 0 && (
                        <div className="mb-4">
                          <button
                            onClick={() =>
                              setExpandedDiff(expandedDiff === approval.id ? null : approval.id)
                            }
                            className="text-xs text-slate-400 hover:text-slate-200 font-mono mb-2 flex items-center gap-1"
                          >
                            <svg
                              className={`w-3 h-3 transition-transform ${expandedDiff === approval.id ? "rotate-90" : ""}`}
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                            {expandedDiff === approval.id ? "Hide" : "Show"} files ({approval.filesModified.length})
                          </button>
                          {expandedDiff === approval.id && (
                            <ul className="bg-slate-950 border border-slate-700 rounded p-3 text-xs font-mono text-slate-300">
                              {approval.filesModified.map((file, i) => (
                                <li key={i} className="py-0.5">{file}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(approval.id)}
                          className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg font-mono text-sm font-semibold transition-colors"
                        >
                          APPROVE
                        </button>
                        <button
                          onClick={() => handleReject(approval.id)}
                          className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded-lg font-mono text-sm transition-colors"
                        >
                          REJECT
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
