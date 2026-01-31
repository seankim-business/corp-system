/**
 * useARAssignments Hook
 *
 * Manages AR assignment data with CRUD operations.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { request } from "../../api/client";
import type {
  ARAssignment,
  CreateAssignmentInput,
  UpdateAssignmentInput,
  ARFilters
} from "../../types/ar";

interface AssignmentsResponse {
  assignments: ARAssignment[];
  total: number;
}

export function useARAssignments(filters?: ARFilters) {
  return useQuery<AssignmentsResponse>({
    queryKey: ["ar", "assignments", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.departmentId) params.set("departmentId", filters.departmentId);
      if (filters?.positionId) params.set("positionId", filters.positionId);
      if (filters?.agentId) params.set("agentId", filters.agentId);
      if (filters?.page) params.set("page", String(filters.page));
      if (filters?.pageSize) params.set("pageSize", String(filters.pageSize));

      return request<AssignmentsResponse>({
        url: `/api/ar/assignments?${params.toString()}`,
        method: "GET",
      });
    },
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });
}

export function useARAssignment(id: string | undefined) {
  return useQuery<{ assignment: ARAssignment }>({
    queryKey: ["ar", "assignments", id],
    queryFn: async () => {
      return request<{ assignment: ARAssignment }>({
        url: `/api/ar/assignments/${id}`,
        method: "GET",
      });
    },
    enabled: !!id,
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });
}

export function useCreateAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateAssignmentInput) => {
      return request<{ assignment: ARAssignment }>({
        url: "/api/ar/assignments",
        method: "POST",
        data: input,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ar", "assignments"] });
      queryClient.invalidateQueries({ queryKey: ["ar", "positions"] });
    },
  });
}

export function useUpdateAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateAssignmentInput & { id: string }) => {
      return request<{ assignment: ARAssignment }>({
        url: `/api/ar/assignments/${id}`,
        method: "PATCH",
        data: input,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ar", "assignments"] });
      queryClient.invalidateQueries({ queryKey: ["ar", "assignments", variables.id] });
    },
  });
}

export function useReassignAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, newPositionId }: { id: string; newPositionId: string }) => {
      return request<{ assignment: ARAssignment }>({
        url: `/api/ar/assignments/${id}/reassign`,
        method: "POST",
        data: { newPositionId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ar", "assignments"] });
      queryClient.invalidateQueries({ queryKey: ["ar", "positions"] });
    },
  });
}

export function useUpdateAssignmentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return request<{ assignment: ARAssignment }>({
        url: `/api/ar/assignments/${id}/status`,
        method: "PATCH",
        data: { status },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ar", "assignments"] });
      queryClient.invalidateQueries({ queryKey: ["ar", "assignments", variables.id] });
    },
  });
}

export function useTerminateAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      return request<{ success: boolean }>({
        url: `/api/ar/assignments/${id}/terminate`,
        method: "POST",
        data: { reason },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ar", "assignments"] });
      queryClient.invalidateQueries({ queryKey: ["ar", "positions"] });
    },
  });
}
