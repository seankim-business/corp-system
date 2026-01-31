/**
 * useAgents Hook
 *
 * Fetches available agents for selection in forms.
 */
import { useQuery } from "@tanstack/react-query";
import { request } from "../api/client";

interface Agent {
  id: string;
  name: string;
  type: string;
  role?: string;
  displayName?: string;
}

interface AgentsResponse {
  agents: Agent[];
}

export function useAgents() {
  return useQuery<AgentsResponse>({
    queryKey: ["agents"],
    queryFn: async () => {
      return request<AgentsResponse>({
        url: "/api/v1/agents",
        method: "GET",
      });
    },
  });
}
