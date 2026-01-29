/**
 * Plan Definitions
 *
 * Defines subscription plans with pricing, limits, and features.
 * Plans are immutable - changes should be done by creating new plans.
 */

export interface PlanLimits {
  agents: number; // -1 for unlimited
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
  monthly: number; // Price in cents, -1 for custom pricing
  yearly: number; // Price in cents, -1 for custom pricing
  currency: string;
}

export interface Plan {
  id: string;
  name: string;
  nameKo: string; // Korean name
  description: string;
  descriptionKo: string; // Korean description
  pricing: PlanPricing;
  limits: PlanLimits;
  features: PlanFeatures;
  stripePriceId: {
    monthly: string;
    yearly: string;
  };
  popular?: boolean; // Mark as popular/recommended
  hidden?: boolean; // Hide from public pricing page
}

export type PlanId = "free" | "pro" | "business" | "enterprise";

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    nameKo: "무료",
    description: "Perfect for getting started",
    descriptionKo: "시작하기에 완벽한 무료 플랜",
    pricing: {
      monthly: 0,
      yearly: 0,
      currency: "USD",
    },
    limits: {
      agents: 2,
      workflows: 5,
      executionsPerMonth: 100,
      teamMembers: 3,
      storageGb: 1,
      apiRequestsPerDay: 100,
      extensions: 2,
    },
    features: {
      slackIntegration: true,
      githubIntegration: false,
      customAgents: false,
      advancedAnalytics: false,
      prioritySupport: false,
      sso: false,
      auditLogs: false,
      customBranding: false,
    },
    stripePriceId: {
      monthly: "",
      yearly: "",
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    nameKo: "프로",
    description: "For growing teams",
    descriptionKo: "성장하는 팀을 위한 플랜",
    pricing: {
      monthly: 4900, // $49/month
      yearly: 49000, // $490/year (2 months free)
      currency: "USD",
    },
    limits: {
      agents: 10,
      workflows: -1, // Unlimited
      executionsPerMonth: 5000,
      teamMembers: 20,
      storageGb: 10,
      apiRequestsPerDay: 5000,
      extensions: 10,
    },
    features: {
      slackIntegration: true,
      githubIntegration: true,
      customAgents: true,
      advancedAnalytics: true,
      prioritySupport: false,
      sso: false,
      auditLogs: true,
      customBranding: false,
    },
    stripePriceId: {
      monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || "",
      yearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID || "",
    },
    popular: true,
  },
  business: {
    id: "business",
    name: "Business",
    nameKo: "비즈니스",
    description: "For large teams",
    descriptionKo: "대규모 팀을 위한 플랜",
    pricing: {
      monthly: 19900, // $199/month
      yearly: 199000, // $1990/year (2 months free)
      currency: "USD",
    },
    limits: {
      agents: -1, // Unlimited
      workflows: -1,
      executionsPerMonth: 50000,
      teamMembers: -1,
      storageGb: 100,
      apiRequestsPerDay: 50000,
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
    stripePriceId: {
      monthly: process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID || "",
      yearly: process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID || "",
    },
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    nameKo: "엔터프라이즈",
    description: "Custom solutions for enterprise",
    descriptionKo: "엔터프라이즈 고객을 위한 맞춤 플랜",
    pricing: {
      monthly: -1, // Custom pricing
      yearly: -1,
      currency: "USD",
    },
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
    stripePriceId: {
      monthly: "",
      yearly: "",
    },
    hidden: true, // Contact sales
  },
};

/**
 * Get a plan by ID
 */
export function getPlan(planId: string): Plan {
  const plan = PLANS[planId as PlanId];
  if (!plan) {
    return PLANS.free; // Default to free plan
  }
  return plan;
}

/**
 * Get all public plans (for pricing page)
 */
export function getPublicPlans(): Plan[] {
  return Object.values(PLANS).filter((plan) => !plan.hidden);
}

/**
 * Get all plans
 */
export function getAllPlans(): Plan[] {
  return Object.values(PLANS);
}

/**
 * Check if a plan is paid
 */
export function isPaidPlan(planId: string): boolean {
  const plan = getPlan(planId);
  return plan.pricing.monthly > 0 || plan.pricing.yearly > 0;
}

/**
 * Check if a plan has a specific feature
 */
export function hasFeature(
  planId: string,
  feature: keyof PlanFeatures,
): boolean {
  const plan = getPlan(planId);
  return plan.features[feature];
}

/**
 * Get the limit for a specific metric
 */
export function getLimit(
  planId: string,
  metric: keyof PlanLimits,
): number {
  const plan = getPlan(planId);
  return plan.limits[metric];
}

/**
 * Check if a limit is unlimited
 */
export function isUnlimited(planId: string, metric: keyof PlanLimits): boolean {
  return getLimit(planId, metric) === -1;
}

/**
 * Calculate yearly savings percentage
 */
export function getYearlySavingsPercent(planId: string): number {
  const plan = getPlan(planId);
  if (plan.pricing.monthly <= 0 || plan.pricing.yearly <= 0) {
    return 0;
  }
  const monthlyTotal = plan.pricing.monthly * 12;
  const savings = ((monthlyTotal - plan.pricing.yearly) / monthlyTotal) * 100;
  return Math.round(savings);
}

/**
 * Format price for display
 */
export function formatPrice(
  cents: number,
  currency: string = "USD",
  locale: string = "en-US",
): string {
  if (cents === -1) {
    return "Custom";
  }
  if (cents === 0) {
    return "Free";
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/**
 * Map usage metric to plan limit key
 */
export const METRIC_TO_LIMIT_KEY: Record<string, keyof PlanLimits> = {
  executions: "executionsPerMonth",
  api_requests: "apiRequestsPerDay",
  storage_bytes: "storageGb",
  team_members: "teamMembers",
  agents: "agents",
  workflows: "workflows",
};

/**
 * Get limit key for a usage metric
 */
export function getLimitKeyForMetric(
  metric: string,
): keyof PlanLimits | undefined {
  return METRIC_TO_LIMIT_KEY[metric];
}
