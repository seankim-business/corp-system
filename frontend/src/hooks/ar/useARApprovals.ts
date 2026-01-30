/**
 * useARApprovals Hook
 *
 * Manages AR approval request data.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { request } from "../../api/client";
import type { ARApprovalRequest, CreateApprovalInput, ARFilters } from "../../types/ar";

interface ApprovalsResponse {
  requests: ARApprovalRequest[];
  total: number;
}

export function useARApprovals(filters?: ARFilters & { requestType?: string; level?: number }) {
  return useQuery<ApprovalsResponse>({
    queryKey: ["ar", "approvals", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.requestType) params.set("requestType", filters.requestType);
      if (filters?.level) params.set("level", String(filters.level));
      if (filters?.page) params.set("page", String(filters.page));
      if (filters?.pageSize) params.set("pageSize", String(filters.pageSize));

      return request<ApprovalsResponse>({
        url: `/api/ar/approvals?${params.toString()}`,
        method: "GET",
      });
    },
  });
}

export function useARApproval(id: string | undefined) {
  return useQuery<{ request: ARApprovalRequest }>({
    queryKey: ["ar", "approvals", id],
    queryFn: async () => {
      return request<{ request: ARApprovalRequest }>({
        url: `/api/ar/approvals/${id}`,
        method: "GET",
      });
    },
    enabled: !!id,
  });
}

export function usePendingApprovals() {
  return useQuery<ApprovalsResponse>({
    queryKey: ["ar", "approvals", "pending"],
    queryFn: async () => {
      return request<ApprovalsResponse>({
        url: "/api/ar/approvals?status=pending",
        method: "GET",
      });
    },
  });
}

export function useCreateApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateApprovalInput) => {
      return request<{ request: ARApprovalRequest }>({
        url: "/api/ar/approvals",
        method: "POST",
        data: input,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ar", "approvals"] });
    },
  });
}

export function useApproveRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) => {
      return request<{ request: ARApprovalRequest }>({
        url: `/api/ar/approvals/${id}/approve`,
        method: "POST",
        data: { note },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ar", "approvals"] });
      queryClient.invalidateQueries({ queryKey: ["ar", "approvals", variables.id] });
    },
  });
}

export function useRejectRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) => {
      return request<{ request: ARApprovalRequest }>({
        url: `/api/ar/approvals/${id}/reject`,
        method: "POST",
        data: { note },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ar", "approvals"] });
      queryClient.invalidateQueries({ queryKey: ["ar", "approvals", variables.id] });
    },
  });
}

export function useEscalateRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      return request<{ request: ARApprovalRequest }>({
        url: `/api/ar/approvals/${id}/escalate`,
        method: "POST",
        data: { reason },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ar", "approvals"] });
      queryClient.invalidateQueries({ queryKey: ["ar", "approvals", variables.id] });
    },
  });
}
