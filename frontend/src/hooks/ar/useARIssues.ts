/**
 * useARIssues Hook
 *
 * Manages issue detection and resolution.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { request } from "../../api/client";
import type { Issue, IssueSummary } from "../../types/ar";

export function useARIssues() {
  return useQuery<{ issues: Issue[]; summary: IssueSummary }>({
    queryKey: ["ar", "issues"],
    queryFn: async () => {
      return request<{ issues: Issue[]; summary: IssueSummary }>({
        url: "/api/ar/coordination/issues",
        method: "GET",
      });
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useARIssueSummary() {
  return useQuery<IssueSummary>({
    queryKey: ["ar", "issues", "summary"],
    queryFn: async () => {
      return request<IssueSummary>({
        url: "/api/ar/coordination/issues/summary",
        method: "GET",
      });
    },
    refetchInterval: 30000,
  });
}

export function useResolveIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ issueId, resolution }: { issueId: string; resolution: string }) => {
      return request<{ success: boolean }>({
        url: `/api/ar/coordination/issues/${issueId}/resolve`,
        method: "POST",
        data: { resolution },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ar", "issues"] });
    },
  });
}
