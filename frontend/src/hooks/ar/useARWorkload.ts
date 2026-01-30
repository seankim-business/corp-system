/**
 * useARWorkload Hook
 *
 * Manages workload distribution and rebalancing.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { request } from "../../api/client";
import type { WorkloadAnalysis, RebalanceProposal } from "../../types/ar";

export function useARWorkload() {
  return useQuery<WorkloadAnalysis>({
    queryKey: ["ar", "workload"],
    queryFn: async () => {
      return request<WorkloadAnalysis>({
        url: "/api/ar/coordination/workload",
        method: "GET",
      });
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useRebalanceProposals() {
  return useQuery<{ proposals: RebalanceProposal[] }>({
    queryKey: ["ar", "workload", "proposals"],
    queryFn: async () => {
      return request<{ proposals: RebalanceProposal[] }>({
        url: "/api/ar/coordination/workload/proposals",
        method: "GET",
      });
    },
  });
}

export function useCreateRebalanceProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (trigger: 'manual' | 'overload' | 'underutilization' = 'manual') => {
      return request<{ proposal: RebalanceProposal }>({
        url: "/api/ar/coordination/workload/rebalance",
        method: "POST",
        data: { trigger },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ar", "workload", "proposals"] });
    },
  });
}

export function useApplyRebalanceProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ proposalId, partial, changeIds }: {
      proposalId: string;
      partial?: boolean;
      changeIds?: number[]
    }) => {
      return request<{ success: boolean; appliedChanges: number }>({
        url: "/api/ar/coordination/workload/apply",
        method: "POST",
        data: { proposalId, partial, changeIds },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ar", "workload"] });
      queryClient.invalidateQueries({ queryKey: ["ar", "workload", "proposals"] });
      queryClient.invalidateQueries({ queryKey: ["ar", "assignments"] });
    },
  });
}
