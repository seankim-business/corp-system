/**
 * useARDepartments Hook
 *
 * Manages AR department data with CRUD operations.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { request } from "../../api/client";
import type {
  ARDepartment,
  CreateDepartmentInput,
  UpdateDepartmentInput,
  DepartmentHierarchy,
  ARFilters
} from "../../types/ar";

interface DepartmentsResponse {
  departments: ARDepartment[];
  total: number;
}

export function useARDepartments(filters?: ARFilters) {
  return useQuery<DepartmentsResponse>({
    queryKey: ["ar", "departments", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.search) params.set("search", filters.search);
      if (filters?.page) params.set("page", String(filters.page));
      if (filters?.pageSize) params.set("pageSize", String(filters.pageSize));

      return request<DepartmentsResponse>({
        url: `/api/ar/departments?${params.toString()}`,
        method: "GET",
      });
    },
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });
}

export function useARDepartment(id: string | undefined) {
  return useQuery<{ department: ARDepartment }>({
    queryKey: ["ar", "departments", id],
    queryFn: async () => {
      return request<{ department: ARDepartment }>({
        url: `/api/ar/departments/${id}`,
        method: "GET",
      });
    },
    enabled: !!id,
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });
}

export function useARDepartmentHierarchy(id: string | undefined) {
  return useQuery<DepartmentHierarchy>({
    queryKey: ["ar", "departments", id, "hierarchy"],
    queryFn: async () => {
      return request<DepartmentHierarchy>({
        url: `/api/ar/departments/${id}/hierarchy`,
        method: "GET",
      });
    },
    enabled: !!id,
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });
}

export function useCreateDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateDepartmentInput) => {
      return request<{ department: ARDepartment }>({
        url: "/api/ar/departments",
        method: "POST",
        data: input,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ar", "departments"] });
    },
  });
}

export function useUpdateDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateDepartmentInput & { id: string }) => {
      return request<{ department: ARDepartment }>({
        url: `/api/ar/departments/${id}`,
        method: "PATCH",
        data: input,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ar", "departments"] });
      queryClient.invalidateQueries({ queryKey: ["ar", "departments", variables.id] });
    },
  });
}

export function useDeleteDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return request<{ success: boolean }>({
        url: `/api/ar/departments/${id}`,
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ar", "departments"] });
    },
  });
}

export function useUpdateDepartmentBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, budgetCents }: { id: string; budgetCents: number }) => {
      return request<{ department: ARDepartment }>({
        url: `/api/ar/departments/${id}/budget`,
        method: "PATCH",
        data: { budgetCents },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ar", "departments"] });
      queryClient.invalidateQueries({ queryKey: ["ar", "departments", variables.id] });
    },
  });
}
