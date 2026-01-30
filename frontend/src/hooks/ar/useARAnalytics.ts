/**
 * useARAnalytics Hook
 *
 * Fetches AR analytics and reports.
 */
import { useQuery } from "@tanstack/react-query";
import { request } from "../../api/client";
import type { AnalyticsReport, AgentHealthCheck, Recommendation } from "../../types/ar";

export function useARAnalyticsReport(periodDays: number = 30) {
  return useQuery<AnalyticsReport>({
    queryKey: ["ar", "analytics", "report", periodDays],
    queryFn: async () => {
      return request<AnalyticsReport>({
        url: `/api/ar/analytics/report?periodDays=${periodDays}`,
        method: "GET",
      });
    },
  });
}

export function useARMetric(metric: 'workload' | 'performance' | 'cost' | 'completion') {
  return useQuery<{ value: number; trend: number; history: { date: string; value: number }[] }>({
    queryKey: ["ar", "analytics", "metric", metric],
    queryFn: async () => {
      return request({
        url: `/api/ar/analytics/metric/${metric}`,
        method: "GET",
      });
    },
  });
}

export function useARDailyOps() {
  return useQuery<{ checks: { name: string; status: string; details: string }[] }>({
    queryKey: ["ar", "analytics", "ops", "daily"],
    queryFn: async () => {
      return request({
        url: "/api/ar/analytics/ops/daily",
        method: "GET",
      });
    },
  });
}

export function useARHealthCheck() {
  return useQuery<{ agents: AgentHealthCheck[] }>({
    queryKey: ["ar", "analytics", "health"],
    queryFn: async () => {
      return request<{ agents: AgentHealthCheck[] }>({
        url: "/api/ar/analytics/ops/health",
        method: "GET",
      });
    },
    refetchInterval: 60000, // Refresh every minute
  });
}

export function useARCoachingNeeds() {
  return useQuery<{ agents: { agentId: string; agentName: string; needs: string[]; priority: string }[] }>({
    queryKey: ["ar", "analytics", "coaching"],
    queryFn: async () => {
      return request({
        url: "/api/ar/analytics/coaching/needs",
        method: "GET",
      });
    },
  });
}

export function useARRecommendations() {
  return useQuery<{ recommendations: Recommendation[] }>({
    queryKey: ["ar", "analytics", "recommendations"],
    queryFn: async () => {
      return request<{ recommendations: Recommendation[] }>({
        url: "/api/ar/analytics/recommendations",
        method: "GET",
      });
    },
  });
}
