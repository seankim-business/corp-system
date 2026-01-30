/**
 * n8n Store (Zustand)
 *
 * State management for n8n workflow operations:
 * - Workflow list with filtering and pagination
 * - CRUD operations
 * - Execution management
 * - Category management
 */

import { create } from "zustand";
import { request } from "../api/client";

export interface N8nWorkflow {
  id: string;
  name: string;
  description?: string;
  category: string;
  tags: string[];
  isActive: boolean;
  isSkill: boolean;
  workflowJson: {
    name: string;
    nodes: unknown[];
    connections: Record<string, unknown>;
    settings?: Record<string, unknown>;
  };
  createdAt: string;
  updatedAt: string;
  _count?: {
    executions: number;
    permissions: number;
  };
}

export interface N8nExecution {
  id: string;
  workflowId: string;
  n8nExecutionId: string;
  status: "waiting" | "running" | "success" | "error" | "canceled";
  mode: string;
  startedAt: string;
  completedAt?: string;
  inputData?: Record<string, unknown>;
  outputData?: Record<string, unknown>;
  errorMessage?: string;
}

export interface N8nCategory {
  name: string;
  count: number;
}

export interface N8nFilters {
  category: string;
  search: string;
  isActive: boolean | null;
  isSkill: boolean | null;
}

export interface N8nPagination {
  total: number;
  limit: number;
  offset: number;
}

interface N8nState {
  // Data
  workflows: N8nWorkflow[];
  categories: N8nCategory[];
  selectedWorkflow: N8nWorkflow | null;
  executions: N8nExecution[];

  // UI State
  isLoading: boolean;
  isExecuting: boolean;
  error: string | null;
  viewMode: "grid" | "list";
  filters: N8nFilters;
  pagination: N8nPagination;

  // Actions
  fetchWorkflows: () => Promise<void>;
  fetchCategories: () => Promise<void>;
  fetchWorkflowExecutions: (workflowId: string) => Promise<void>;
  createWorkflow: (data: CreateWorkflowInput) => Promise<N8nWorkflow>;
  updateWorkflow: (id: string, data: UpdateWorkflowInput) => Promise<N8nWorkflow>;
  deleteWorkflow: (id: string) => Promise<void>;
  executeWorkflow: (id: string, inputData?: Record<string, unknown>) => Promise<N8nExecution>;
  activateWorkflow: (id: string) => Promise<void>;
  deactivateWorkflow: (id: string) => Promise<void>;

  // UI Actions
  setFilters: (filters: Partial<N8nFilters>) => void;
  setViewMode: (mode: "grid" | "list") => void;
  setSelectedWorkflow: (workflow: N8nWorkflow | null) => void;
  setPage: (offset: number) => void;
  clearError: () => void;
}

export interface CreateWorkflowInput {
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  workflowJson: {
    name: string;
    nodes: unknown[];
    connections: Record<string, unknown>;
    settings?: Record<string, unknown>;
  };
  isActive?: boolean;
}

export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  workflowJson?: {
    name: string;
    nodes: unknown[];
    connections: Record<string, unknown>;
    settings?: Record<string, unknown>;
  };
  isActive?: boolean;
  isSkill?: boolean;
}

export const useN8nStore = create<N8nState>((set, get) => ({
  // Initial State
  workflows: [],
  categories: [],
  selectedWorkflow: null,
  executions: [],
  isLoading: false,
  isExecuting: false,
  error: null,
  viewMode: "grid",
  filters: {
    category: "",
    search: "",
    isActive: null,
    isSkill: null,
  },
  pagination: {
    total: 0,
    limit: 50,
    offset: 0,
  },

  // Data Actions
  fetchWorkflows: async () => {
    const { filters, pagination } = get();
    set({ isLoading: true, error: null });

    try {
      const params = new URLSearchParams();
      if (filters.category) params.set("category", filters.category);
      if (filters.search) params.set("search", filters.search);
      if (filters.isActive !== null) params.set("isActive", String(filters.isActive));
      if (filters.isSkill !== null) params.set("isSkill", String(filters.isSkill));
      params.set("limit", String(pagination.limit));
      params.set("offset", String(pagination.offset));

      const response = await request<{
        data: N8nWorkflow[];
        pagination: N8nPagination;
      }>({
        url: `/api/n8n/workflows?${params.toString()}`,
        method: "GET",
      });

      set({
        workflows: response.data,
        pagination: response.pagination,
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch workflows";
      set({ error: message, isLoading: false });
    }
  },

  fetchCategories: async () => {
    try {
      const categories = await request<N8nCategory[]>({
        url: "/api/n8n/categories",
        method: "GET",
      });
      set({ categories });
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    }
  },

  fetchWorkflowExecutions: async (workflowId: string) => {
    try {
      const executions = await request<N8nExecution[]>({
        url: `/api/n8n/workflows/${workflowId}/executions`,
        method: "GET",
      });
      set({ executions });
    } catch (error) {
      console.error("Failed to fetch executions:", error);
    }
  },

  createWorkflow: async (data: CreateWorkflowInput) => {
    set({ isLoading: true, error: null });

    try {
      const workflow = await request<N8nWorkflow>({
        url: "/api/n8n/workflows",
        method: "POST",
        data,
      });

      set((state) => ({
        workflows: [workflow, ...state.workflows],
        isLoading: false,
      }));

      return workflow;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create workflow";
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  updateWorkflow: async (id: string, data: UpdateWorkflowInput) => {
    set({ isLoading: true, error: null });

    try {
      const workflow = await request<N8nWorkflow>({
        url: `/api/n8n/workflows/${id}`,
        method: "PUT",
        data,
      });

      set((state) => ({
        workflows: state.workflows.map((w) => (w.id === id ? workflow : w)),
        selectedWorkflow: state.selectedWorkflow?.id === id ? workflow : state.selectedWorkflow,
        isLoading: false,
      }));

      return workflow;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update workflow";
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  deleteWorkflow: async (id: string) => {
    set({ isLoading: true, error: null });

    try {
      await request<void>({
        url: `/api/n8n/workflows/${id}`,
        method: "DELETE",
      });

      set((state) => ({
        workflows: state.workflows.filter((w) => w.id !== id),
        selectedWorkflow: state.selectedWorkflow?.id === id ? null : state.selectedWorkflow,
        isLoading: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete workflow";
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  executeWorkflow: async (id: string, inputData?: Record<string, unknown>) => {
    set({ isExecuting: true, error: null });

    try {
      const execution = await request<N8nExecution>({
        url: `/api/n8n/workflows/${id}/execute`,
        method: "POST",
        data: { inputData },
      });

      set((state) => ({
        executions: [execution, ...state.executions],
        isExecuting: false,
      }));

      return execution;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to execute workflow";
      set({ error: message, isExecuting: false });
      throw error;
    }
  },

  activateWorkflow: async (id: string) => {
    try {
      const workflow = await request<N8nWorkflow>({
        url: `/api/n8n/workflows/${id}/activate`,
        method: "POST",
      });

      set((state) => ({
        workflows: state.workflows.map((w) => (w.id === id ? workflow : w)),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to activate workflow";
      set({ error: message });
      throw error;
    }
  },

  deactivateWorkflow: async (id: string) => {
    try {
      const workflow = await request<N8nWorkflow>({
        url: `/api/n8n/workflows/${id}/deactivate`,
        method: "POST",
      });

      set((state) => ({
        workflows: state.workflows.map((w) => (w.id === id ? workflow : w)),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to deactivate workflow";
      set({ error: message });
      throw error;
    }
  },

  // UI Actions
  setFilters: (filters: Partial<N8nFilters>) => {
    set((state) => ({
      filters: { ...state.filters, ...filters },
      pagination: { ...state.pagination, offset: 0 },
    }));
    get().fetchWorkflows();
  },

  setViewMode: (mode: "grid" | "list") => {
    set({ viewMode: mode });
  },

  setSelectedWorkflow: (workflow: N8nWorkflow | null) => {
    set({ selectedWorkflow: workflow, executions: [] });
    if (workflow) {
      get().fetchWorkflowExecutions(workflow.id);
    }
  },

  setPage: (offset: number) => {
    set((state) => ({
      pagination: { ...state.pagination, offset },
    }));
    get().fetchWorkflows();
  },

  clearError: () => {
    set({ error: null });
  },
}));
