/**
 * n8n Instances Store (Zustand)
 *
 * State management for admin n8n instance operations:
 * - List all n8n instances
 * - Provision new instances
 * - Health checks
 * - Stop/Delete instances
 */

import { create } from "zustand";
import { request } from "../api/client";

export interface N8nInstance {
  id: string;
  organizationId: string;
  containerUrl: string;
  status: string;
  lastHealthCheck: string | null;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  _count: {
    workflows: number;
    credentials: number;
  };
}

export interface AvailableOrg {
  id: string;
  name: string;
  slug: string;
}

interface N8nInstancesState {
  instances: N8nInstance[];
  availableOrgs: AvailableOrg[];
  isLoading: boolean;
  error: string | null;

  fetchInstances: () => Promise<void>;
  fetchAvailableOrgs: () => Promise<void>;
  provisionInstance: (organizationId: string) => Promise<boolean>;
  performHealthCheck: (instanceId: string) => Promise<boolean>;
  stopInstance: (instanceId: string) => Promise<boolean>;
  deleteInstance: (instanceId: string) => Promise<boolean>;
}

export const useN8nInstancesStore = create<N8nInstancesState>((set, get) => ({
  instances: [],
  availableOrgs: [],
  isLoading: false,
  error: null,

  fetchInstances: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await request<{ data: N8nInstance[] }>({
        url: "/api/admin/n8n-instances",
        method: "GET",
      });
      set({ instances: response.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchAvailableOrgs: async () => {
    try {
      const response = await request<{ data: AvailableOrg[] }>({
        url: "/api/admin/n8n-instances/organizations/available",
        method: "GET",
      });
      set({ availableOrgs: response.data });
    } catch (error: any) {
      console.error("Failed to fetch available orgs:", error);
    }
  },

  provisionInstance: async (organizationId: string) => {
    try {
      await request<N8nInstance>({
        url: "/api/admin/n8n-instances",
        method: "POST",
        data: { organizationId },
      });
      await get().fetchInstances();
      await get().fetchAvailableOrgs();
      return true;
    } catch (error: any) {
      set({ error: error.message });
      return false;
    }
  },

  performHealthCheck: async (instanceId: string) => {
    try {
      const result = await request<{ healthy: boolean }>({
        url: `/api/admin/n8n-instances/${instanceId}/health-check`,
        method: "POST",
      });
      await get().fetchInstances();
      return result.healthy;
    } catch (error: any) {
      set({ error: error.message });
      return false;
    }
  },

  stopInstance: async (instanceId: string) => {
    try {
      await request<void>({
        url: `/api/admin/n8n-instances/${instanceId}/stop`,
        method: "POST",
      });
      await get().fetchInstances();
      return true;
    } catch (error: any) {
      set({ error: error.message });
      return false;
    }
  },

  deleteInstance: async (instanceId: string) => {
    try {
      await request<void>({
        url: `/api/admin/n8n-instances/${instanceId}`,
        method: "DELETE",
      });
      await get().fetchInstances();
      await get().fetchAvailableOrgs();
      return true;
    } catch (error: any) {
      set({ error: error.message });
      return false;
    }
  },
}));
