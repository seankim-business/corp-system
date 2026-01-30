/**
 * useIdentity Hook
 *
 * User-facing hooks for managing linked identities and suggestions.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { request } from "../api/client";

// =============================================================================
// TYPES
// =============================================================================

export interface ExternalIdentity {
  id: string;
  provider: "slack" | "google" | "notion";
  providerUserId: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  linkStatus: "unlinked" | "linked" | "suggested";
  linkMethod: "manual" | "auto" | "admin" | null;
  linkedAt: string | null;
  lastSyncedAt: string | null;
}

export interface IdentitySuggestion {
  id: string;
  externalIdentity: ExternalIdentity;
  confidenceScore: number;
  matchMethod: string;
  expiresAt: string;
  createdAt: string;
}

// =============================================================================
// QUERY HOOKS
// =============================================================================

/**
 * Fetch all identities linked to current user
 */
export function useUserIdentities() {
  return useQuery<ExternalIdentity[]>({
    queryKey: ["identities", "user"],
    queryFn: async () => {
      const response = await request<{ identities: ExternalIdentity[] }>({
        url: "/api/identities",
        method: "GET",
      });
      return response.identities;
    },
  });
}

/**
 * Fetch pending suggestions for current user
 */
export function useUserSuggestions() {
  return useQuery<IdentitySuggestion[]>({
    queryKey: ["identities", "suggestions"],
    queryFn: async () => {
      const response = await request<{ suggestions: IdentitySuggestion[] }>({
        url: "/api/identities/suggestions",
        method: "GET",
      });
      return response.suggestions;
    },
  });
}

// =============================================================================
// MUTATION HOOKS
// =============================================================================

/**
 * Link an identity to current user (self-service)
 */
export function useLinkIdentity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ identityId, reason }: { identityId: string; reason?: string }) => {
      return request<{ success: boolean; message: string }>({
        url: `/api/identities/${identityId}/link`,
        method: "POST",
        data: { reason },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["identities", "user"] });
      queryClient.invalidateQueries({ queryKey: ["identities", "suggestions"] });
    },
  });
}

/**
 * Unlink an identity from current user
 */
export function useUnlinkIdentity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ identityId, reason }: { identityId: string; reason?: string }) => {
      return request<{ success: boolean; message: string }>({
        url: `/api/identities/${identityId}/unlink`,
        method: "POST",
        data: { reason },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["identities", "user"] });
    },
  });
}

/**
 * Accept a suggestion
 */
export function useAcceptSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ suggestionId, reason }: { suggestionId: string; reason?: string }) => {
      return request<{ success: boolean; message: string }>({
        url: `/api/identities/suggestions/${suggestionId}/accept`,
        method: "POST",
        data: { reason },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["identities", "user"] });
      queryClient.invalidateQueries({ queryKey: ["identities", "suggestions"] });
    },
  });
}

/**
 * Reject a suggestion
 */
export function useRejectSuggestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ suggestionId, reason }: { suggestionId: string; reason?: string }) => {
      return request<{ success: boolean; message: string }>({
        url: `/api/identities/suggestions/${suggestionId}/reject`,
        method: "POST",
        data: { reason },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["identities", "suggestions"] });
    },
  });
}
