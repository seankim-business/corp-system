/**
 * Member Identities Hook
 *
 * React Query hook for fetching linked identities for organization members.
 */

import { useQuery } from "@tanstack/react-query";
import { request } from "../api/client";

export interface MemberIdentity {
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
}

export interface MemberWithIdentities {
  userId: string;
  identities: MemberIdentity[];
}

/**
 * Fetch all identities grouped by user for the organization
 */
export function useMemberIdentities() {
  return useQuery({
    queryKey: ["member-identities"],
    queryFn: async () => {
      const data = await request<{ identities: (MemberIdentity & { userId: string | null })[] }>({
        url: "/api/admin/identities",
        method: "GET",
        params: { status: "linked", limit: 1000 },
      });

      // Group identities by userId
      const grouped = new Map<string, MemberIdentity[]>();

      data.identities.forEach((identity) => {
        if (identity.userId) {
          const existing = grouped.get(identity.userId) || [];
          existing.push(identity);
          grouped.set(identity.userId, existing);
        }
      });

      return grouped;
    },
    staleTime: 60000, // 1 minute
  });
}
