/**
 * Plan Definitions (Stub)
 *
 * Defines subscription plans with pricing, limits, and features.
 */

export interface PlanLimits {
  agents: number;
  workflows: number;
  executionsPerMonth: number;
  teamMembers: number;
  storageGb: number;
  apiRequestsPerDay: number;
  extensions: number;
}

export interface PlanFeatures {
  slackIntegration: boolean;
  githubIntegration: boolean;
  customAgents: boolean;
  advancedAnalytics: boolean;
  prioritySupport: boolean;
  sso: boolean;
  auditLogs: boolean;
  customBranding: boolean;
}

export interface PlanPricing {
  monthly: number;
  yearly: number;
  currency: string;
}

export interface Plan {
  id: PlanId;
  name: string;
  description: string;
  pricing: PlanPricing;
  limits: PlanLimits;
  features: PlanFeatures;
  isPublic: boolean;
  isDefault: boolean;
}

export type PlanId = "free" | "starter" | "pro" | "enterprise";

export type UsageMetric =
  | "agents"
  | "workflows"
  | "executions"
  | "storage"
  | "api_requests"
  | "team_members"
  | "extensions";

const DEFAULT_FEATURES: PlanFeatures = {
  slackIntegration: true,
  githubIntegration: false,
  customAgents: false,
  advancedAnalytics: false,
  prioritySupport: false,
  sso: false,
  auditLogs: false,
  customBranding: false,
};

const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    description: "Get started with basic features",
    pricing: { monthly: 0, yearly: 0, currency: "usd" },
    limits: {
      agents: 1,
      workflows: 3,
      executionsPerMonth: 50,
      teamMembers: 1,
      storageGb: 1,
      apiRequestsPerDay: 100,
      extensions: 2,
    },
    features: { ...DEFAULT_FEATURES },
    isPublic: true,
    isDefault: true,
  },
  starter: {
    id: "starter",
    name: "Starter",
    description: "For small teams",
    pricing: { monthly: 2900, yearly: 29000, currency: "usd" },
    limits: {
      agents: 3,
      workflows: 10,
      executionsPerMonth: 500,
      teamMembers: 5,
      storageGb: 10,
      apiRequestsPerDay: 1000,
      extensions: 10,
    },
    features: { ...DEFAULT_FEATURES, githubIntegration: true },
    isPublic: true,
    isDefault: false,
  },
  pro: {
    id: "pro",
    name: "Professional",
    description: "For growing teams",
    pricing: { monthly: 9900, yearly: 99000, currency: "usd" },
    limits: {
      agents: 10,
      workflows: 50,
      executionsPerMonth: 5000,
      teamMembers: 20,
      storageGb: 100,
      apiRequestsPerDay: 10000,
      extensions: -1,
    },
    features: {
      ...DEFAULT_FEATURES,
      githubIntegration: true,
      customAgents: true,
      advancedAnalytics: true,
      auditLogs: true,
    },
    isPublic: true,
    isDefault: false,
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    description: "For large organizations",
    pricing: { monthly: -1, yearly: -1, currency: "usd" },
    limits: {
      agents: -1,
      workflows: -1,
      executionsPerMonth: -1,
      teamMembers: -1,
      storageGb: -1,
      apiRequestsPerDay: -1,
      extensions: -1,
    },
    features: {
      slackIntegration: true,
      githubIntegration: true,
      customAgents: true,
      advancedAnalytics: true,
      prioritySupport: true,
      sso: true,
      auditLogs: true,
      customBranding: true,
    },
    isPublic: true,
    isDefault: false,
  },
};

export function getPlan(planId: PlanId): Plan {
  return PLANS[planId] || PLANS.free;
}

export function getAllPlans(): Plan[] {
  return Object.values(PLANS);
}

export function getPublicPlans(): Plan[] {
  return Object.values(PLANS).filter((p) => p.isPublic);
}

export function getDefaultPlan(): Plan {
  return PLANS.free;
}

export function getLimit(planId: PlanId, metric: UsageMetric): number {
  const plan = getPlan(planId);
  const limitKey = getLimitKeyForMetric(metric);
  return (plan.limits as unknown as Record<string, number>)[limitKey] ?? 0;
}

export function getLimitKeyForMetric(metric: UsageMetric): keyof PlanLimits {
  const mapping: Record<UsageMetric, keyof PlanLimits> = {
    agents: "agents",
    workflows: "workflows",
    executions: "executionsPerMonth",
    storage: "storageGb",
    api_requests: "apiRequestsPerDay",
    team_members: "teamMembers",
    extensions: "extensions",
  };
  return mapping[metric];
}

export function hasFeature(planId: PlanId, feature: keyof PlanFeatures): boolean {
  const plan = getPlan(planId);
  return plan.features[feature] ?? false;
}

export function isUnlimited(limit: number): boolean {
  return limit === -1;
}

export function comparePlans(planA: PlanId, planB: PlanId): number {
  const order: PlanId[] = ["free", "starter", "pro", "enterprise"];
  return order.indexOf(planA) - order.indexOf(planB);
}
