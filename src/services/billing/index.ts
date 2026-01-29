/**
 * Billing Services Index
 *
 * Exports all billing-related services for easy importing.
 */

// Plans
export {
  PLANS,
  getPlan,
  getPublicPlans,
  getAllPlans,
  isPaidPlan,
  hasFeature,
  getLimit,
  isUnlimited,
  getYearlySavingsPercent,
  formatPrice,
  getLimitKeyForMetric,
  METRIC_TO_LIMIT_KEY,
  type Plan,
  type PlanId,
  type PlanLimits,
  type PlanFeatures,
  type PlanPricing,
} from "./plans";

// Subscriptions
export {
  getSubscription,
  getOrCreateSubscription,
  createSubscription,
  updateSubscriptionFromStripe,
  changePlan,
  cancelSubscription,
  reactivateSubscription,
  setCustomLimits,
  linkStripeIds,
  isSubscriptionActive,
  isInTrial,
  getDaysRemaining,
  type Subscription,
  type SubscriptionStatus,
  type SubscriptionWithPlan,
  type CreateSubscriptionParams,
} from "./subscriptions";

// Usage
export {
  increment,
  setValue,
  getUsage,
  getCurrentUsage,
  getHistory,
  syncCountMetrics,
  resetDailyMetrics,
  getUsagePercentage,
  getCurrentPeriod,
  type UsageMetric,
  type UsageRecord,
  type UsageSummary,
} from "./usage";

// Limits
export {
  LimitEnforcer,
  LimitExceededError,
  SubscriptionInactiveError,
  limitEnforcer,
  checkLimit,
  enforceLimit,
  limitMiddleware,
} from "./limits";

// Stripe
export {
  isStripeConfigured,
  getOrCreateCustomer,
  createCheckoutSession,
  createBillingPortalSession,
  getStripeSubscription,
  cancelStripeSubscription,
  reactivateStripeSubscription,
  getInvoices as getStripeInvoices,
  getUpcomingInvoice,
  verifyWebhookSignature,
  handleWebhookEvent,
} from "./stripe";

// Invoices
export {
  getInvoice,
  getInvoiceByStripeId,
  getInvoicesForOrganization,
  createInvoice,
  updateInvoiceStatus,
  updateInvoiceFromStripe,
  syncInvoicesFromStripe,
  getUpcomingInvoicePreview,
  getInvoiceStats,
  type Invoice,
  type InvoiceStatus,
  type CreateInvoiceParams,
} from "./invoices";
