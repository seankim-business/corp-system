/**
 * ARWorkloadPage
 *
 * Workload distribution viewer and rebalancing tool.
 */

import { useState } from "react";
import {
  ArrowPathIcon,
  CheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { WorkloadBar } from "../../components/ar/WorkloadBar";
import { AgentHealthBadge } from "../../components/ar/AgentHealthIndicator";
import {
  useARWorkload,
  useRebalanceProposals,
  useCreateRebalanceProposal,
  useApplyRebalanceProposal,
} from "../../hooks/ar";

export default function ARWorkloadPage() {
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);

  const { data: workloadData, isLoading: workloadLoading } = useARWorkload();
  const { data: proposalsData, isLoading: proposalsLoading, refetch: refetchProposals } = useRebalanceProposals();
  const createProposalMutation = useCreateRebalanceProposal();
  const applyProposalMutation = useApplyRebalanceProposal();

  const handleCreateProposal = async () => {
    try {
      const result = await createProposalMutation.mutateAsync("manual");
      setSelectedProposalId(result.proposal.id);
      refetchProposals();
    } catch (error) {
      console.error("Failed to create proposal:", error);
    }
  };

  const handleApplyProposal = async (proposalId: string) => {
    try {
      await applyProposalMutation.mutateAsync({ proposalId });
      setSelectedProposalId(null);
      refetchProposals();
    } catch (error) {
      console.error("Failed to apply proposal:", error);
    }
  };

  const getHealthStatus = (workload: number) => {
    if (workload >= 0.9) return "critical";
    if (workload >= 0.8) return "warning";
    return "healthy";
  };

  const pendingProposals = proposalsData?.proposals?.filter(p => p.status === "pending") ?? [];
  const selectedProposal = pendingProposals.find(p => p.id === selectedProposalId);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Workload Distribution</h1>
          <p className="text-gray-600">Monitor and optimize agent workloads</p>
        </div>
        <button
          onClick={handleCreateProposal}
          disabled={createProposalMutation.isPending}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          <ArrowPathIcon className={`h-5 w-5 ${createProposalMutation.isPending ? 'animate-spin' : ''}`} />
          Generate Rebalancing
        </button>
      </div>

      {/* Stats Summary */}
      {workloadData?.stats && (
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-900">
                {Math.round(workloadData.stats.avgWorkload * 100)}%
              </p>
              <p className="text-sm text-gray-500">Average Workload</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-900">
                {Math.round(workloadData.stats.stdDeviation * 100)}%
              </p>
              <p className="text-sm text-gray-500">Std Deviation</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-green-600">
                {workloadData.stats.balanced}
              </p>
              <p className="text-sm text-gray-500">Balanced</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-red-600">
                {workloadData.stats.overloaded}
              </p>
              <p className="text-sm text-gray-500">Overloaded</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-yellow-600">
                {workloadData.stats.underutilized}
              </p>
              <p className="text-sm text-gray-500">Underutilized</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent Workloads */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Agent Workloads</h2>

          {workloadLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="animate-pulse flex items-center gap-4">
                  <div className="h-10 w-10 bg-gray-200 rounded-full" />
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                    <div className="h-3 bg-gray-100 rounded w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : workloadData?.snapshots?.length ? (
            <div className="space-y-4">
              {workloadData.snapshots.map((agent) => (
                <div
                  key={agent.agentId}
                  className={`flex items-center gap-4 p-4 rounded-lg border ${
                    agent.status === 'overloaded' ? 'bg-red-50 border-red-200' :
                    agent.status === 'underutilized' ? 'bg-yellow-50 border-yellow-200' :
                    'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
                    <span className="text-indigo-600 font-bold">{agent.agentName[0]}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900">{agent.agentName}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">{agent.taskCount} tasks</span>
                        <AgentHealthBadge status={getHealthStatus(agent.currentWorkload)} size="sm" />
                      </div>
                    </div>
                    <WorkloadBar workload={agent.currentWorkload} showPercentage showStatus />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No workload data available</p>
          )}
        </div>

        {/* Rebalancing Proposals */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Rebalancing Proposals</h2>

          {proposalsLoading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-20 bg-gray-100 rounded" />
              <div className="h-20 bg-gray-100 rounded" />
            </div>
          ) : pendingProposals.length > 0 ? (
            <div className="space-y-4">
              {pendingProposals.map((proposal) => (
                <div
                  key={proposal.id}
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    selectedProposalId === proposal.id
                      ? 'bg-indigo-50 border-indigo-200'
                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                  }`}
                  onClick={() => setSelectedProposalId(proposal.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900">
                      Proposal #{proposal.id.slice(0, 8)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(proposal.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {proposal.proposedChanges.length} changes, ~{Math.round(proposal.estimatedImprovement)}% improvement
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <ArrowPathIcon className="h-12 w-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No pending proposals</p>
              <button
                onClick={handleCreateProposal}
                className="mt-2 text-indigo-600 hover:text-indigo-800 text-sm"
              >
                Generate one
              </button>
            </div>
          )}

          {/* Selected Proposal Details */}
          {selectedProposal && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="font-medium text-gray-900 mb-3">Proposed Changes</h3>
              <div className="space-y-3">
                {selectedProposal.proposedChanges.map((change) => (
                  <div key={change.id} className="bg-white border rounded-lg p-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{change.fromAgentId}</span>
                      <span className="text-gray-400">→</span>
                      <span className="font-medium">{change.toAgentId}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {change.taskIds.length} task(s)
                    </p>
                    <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                      <div>
                        <span className="text-gray-500">From: </span>
                        <span className="text-red-600">
                          {Math.round(change.estimatedImpact.fromWorkload.before * 100)}%
                        </span>
                        <span className="text-gray-400"> → </span>
                        <span className="text-green-600">
                          {Math.round(change.estimatedImpact.fromWorkload.after * 100)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">To: </span>
                        <span>
                          {Math.round(change.estimatedImpact.toWorkload.before * 100)}%
                        </span>
                        <span className="text-gray-400"> → </span>
                        <span>
                          {Math.round(change.estimatedImpact.toWorkload.after * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => handleApplyProposal(selectedProposal.id)}
                  disabled={applyProposalMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <CheckIcon className="h-4 w-4" />
                  Apply
                </button>
                <button
                  onClick={() => setSelectedProposalId(null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
