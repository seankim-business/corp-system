/**
 * Identity Admin Hooks
 *
 * React Query hooks for admin identity management.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

// =============================================================================
// Types
// =============================================================================

export interface ExternalIdentity {
  id: string;
  provider: "slack" | "google" | "notion";
  providerUserId: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  linkStatus: "linked" | "unlinked" | "suggested";
  linkMethod: "auto" | "manual" | "admin" | null;
  linkedAt: string | null;
  lastSyncedAt: string | null;
  linkedUser?: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface IdentityStats {
  total: number;
  linked: number;
  unlinked: number;
  suggested: number;
  byProvider: {
    slack: number;
    google: number;
    notion: number;
  };
}

export interface IdentitySuggestion {
  id: string;
  externalIdentity: ExternalIdentity;
  suggestedUser: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  };
  confidenceScore: number;
  matchMethod: string;
  expiresAt: string;
  createdAt: string;
}

export interface IdentitySettings {
  organizationId: string;
  autoLinkOnEmail: boolean;
  autoLinkThreshold: number;
  suggestionThreshold: number;
  providerPriority: string[];
  allowUserSelfLink: boolean;
  allowUserSelfUnlink: boolean;
  requireAdminApproval: boolean;
  suggestionExpiryDays: number;
}

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Fetch all identities with filtering
 */
export function useIdentities(params?: {
  status?: string;
  provider?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["admin", "identities", params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params?.status) searchParams.set("status", params.status);
      if (params?.provider) searchParams.set("provider", params.provider);
      if (params?.page) searchParams.set("page", params.page.toString());
      if (params?.limit) searchParams.set("limit", params.limit.toString());

      const response = await fetch(`/api/admin/identities?${searchParams}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch identities");
      }

      return response.json() as Promise<{
        identities: ExternalIdentity[];
        pagination: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
        };
      }>;
    },
  });
}

/**
 * Fetch identity statistics
 */
export function useIdentityStats() {
  return useQuery({
    queryKey: ["admin", "identities", "stats"],
    queryFn: async () => {
      const response = await fetch("/api/admin/identities/stats", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch identity stats");
      }

      return response.json() as Promise<IdentityStats>;
    },
  });
}

/**
 * Fetch pending suggestions
 */
export function useIdentitySuggestions() {
  return useQuery({
    queryKey: ["admin", "identities", "suggestions"],
    queryFn: async () => {
      const response = await fetch("/api/admin/identities/suggestions", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch suggestions");
      }

      const data = await response.json();
      return data.suggestions as IdentitySuggestion[];
    },
  });
}

/**
 * Fetch identity settings
 */
export function useIdentitySettings() {
  return useQuery({
    queryKey: ["admin", "identities", "settings"],
    queryFn: async () => {
      const response = await fetch("/api/admin/identities/settings", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch settings");
      }

      return response.json() as Promise<{ settings: IdentitySettings }>;
    },
  });
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * Link identity to user (admin override)
 */
export function useLinkIdentity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      identityId,
      userId,
      reason,
    }: {
      identityId: string;
      userId: string;
      reason?: string;
    }) => {
      const response = await fetch(`/api/admin/identities/${identityId}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, reason }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to link identity");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "identities"] });
      queryClient.invalidateQueries({
        queryKey: ["admin", "identities", "stats"],
      });
    },
  });
}

/**
 * Unlink identity (admin override)
 */
export function useUnlinkIdentity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      identityId,
      reason,
    }: {
      identityId: string;
      reason?: string;
    }) => {
      const response = await fetch(`/api/admin/identities/${identityId}/unlink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to unlink identity");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "identities"] });
      queryClient.invalidateQueries({
        queryKey: ["admin", "identities", "stats"],
      });
    },
  });
}

/**
 * Accept suggestion
 */
export function useAcceptSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      suggestionId,
      reason,
    }: {
      suggestionId: string;
      reason?: string;
    }) => {
      const response = await fetch(
        `/api/identities/suggestions/${suggestionId}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ reason }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to accept suggestion");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "identities"] });
      queryClient.invalidateQueries({
        queryKey: ["admin", "identities", "suggestions"],
      });
      queryClient.invalidateQueries({
        queryKey: ["admin", "identities", "stats"],
      });
    },
  });
}

/**
 * Reject suggestion
 */
export function useRejectSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      suggestionId,
      reason,
    }: {
      suggestionId: string;
      reason?: string;
    }) => {
      const response = await fetch(
        `/api/identities/suggestions/${suggestionId}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ reason }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to reject suggestion");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "identities", "suggestions"],
      });
    },
  });
}

/**
 * Update identity settings
 */
export function useUpdateIdentitySettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: Partial<IdentitySettings>) => {
      const response = await fetch("/api/admin/identities/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update settings");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "identities", "settings"],
      });
    },
  });
}

/**
 * Sync all Slack users to ExternalIdentity system with auto-linking
 */
export function useSyncSlackIdentities() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await api.post<{
        success: boolean;
        message: string;
        stats: {
          total: number;
          synced: number;
          alreadyExists: number;
          autoLinked: number;
          suggested: number;
          errors: number;
        };
      }>("admin/identities/sync-slack");

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "identities"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "identities", "stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "identities", "suggestions"] });
    },
  });
}
