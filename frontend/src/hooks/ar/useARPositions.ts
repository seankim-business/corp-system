/**
 * useARPositions Hook
 *
 * Manages AR position data with CRUD operations.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { request } from "../../api/client";
import type {
  ARPosition,
  CreatePositionInput,
  UpdatePositionInput,
  ARFilters
} from "../../types/ar";

interface PositionsResponse {
  positions: ARPosition[];
  total: number;
}

export function useARPositions(filters?: ARFilters) {
  return useQuery<PositionsResponse>({
    queryKey: ["ar", "positions", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.departmentId) params.set("departmentId", filters.departmentId);
      if (filters?.search) params.set("search", filters.search);
      if (filters?.page) params.set("page", String(filters.page));
      if (filters?.pageSize) params.set("pageSize", String(filters.pageSize));

      return request<PositionsResponse>({
        url: `/api/ar/positions?${params.toString()}`,
        method: "GET",
      });
    },
  });
}

export function useARPosition(id: string | undefined) {
  return useQuery<{ position: ARPosition }>({
    queryKey: ["ar", "positions", id],
    queryFn: async () => {
      return request<{ position: ARPosition }>({
        url: `/api/ar/positions/${id}`,
        method: "GET",
      });
    },
    enabled: !!id,
  });
}

export function useCreatePosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePositionInput) => {
      return request<{ position: ARPosition }>({
        url: "/api/ar/positions",
        method: "POST",
        data: input,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ar", "positions"] });
    },
  });
}

export function useUpdatePosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdatePositionInput & { id: string }) => {
      return request<{ position: ARPosition }>({
        url: `/api/ar/positions/${id}`,
        method: "PATCH",
        data: input,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ar", "positions"] });
      queryClient.invalidateQueries({ queryKey: ["ar", "positions", variables.id] });
    },
  });
}

export function useDeletePosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return request<{ success: boolean }>({
        url: `/api/ar/positions/${id}`,
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ar", "positions"] });
    },
  });
}
