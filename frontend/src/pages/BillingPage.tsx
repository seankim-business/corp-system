/**
 * Billing Page Component
 *
 * Displays subscription information, usage metrics, and billing management.
 */

import React, { useEffect, useState } from "react";

interface Plan {
  id: string;
  name: string;
  nameKo: string;
  description: string;
  descriptionKo: string;
  pricing: {
    monthly: string;
    yearly: string;
    monthlyRaw: number;
    yearlyRaw: number;
    currency: string;
    yearlySavingsPercent: number;
  };
  limits: {
    agents: number;
    workflows: number;
    executionsPerMonth: number;
    teamMembers: number;
    storageGb: number;
    apiRequestsPerDay: number;
    extensions: number;
  };
  features: {
    slackIntegration: boolean;
    githubIntegration: boolean;
    customAgents: boolean;
    advancedAnalytics: boolean;
    prioritySupport: boolean;
    sso: boolean;
    auditLogs: boolean;
    customBranding: boolean;
  };
  popular: boolean;
}

interface Subscription {
  id: string;
  planId: string;
  plan: {
    id: string;
    name: string;
    nameKo: string;
  };
  status: string;
  billingInterval: "monthly" | "yearly";
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  hasStripeSubscription: boolean;
}

interface Usage {
  executions: number;
  api_requests: number;
  storage_bytes: number;
  team_members: number;
  agents: number;
  workflows: number;
}

interface Invoice {
  id: string;
  amount: number;
  amountFormatted: string;
  currency: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  paidAt: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  createdAt: string;
}

const BillingPage: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [limits, setLimits] = useState<Record<string, number> | null>(null);
  const [percentages, setPercentages] = useState<Record<string, number> | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBillingData();
  }, []);

  const loadBillingData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [plansRes, subscriptionRes, usageRes, invoicesRes] = await Promise.all([
        fetch("/api/billing/plans"),
        fetch("/api/billing/subscription"),
        fetch("/api/billing/usage"),
        fetch("/api/billing/invoices"),
      ]);

      if (!plansRes.ok || !subscriptionRes.ok || !usageRes.ok) {
        throw new Error("Failed to load billing data");
      }

      const plansData = await plansRes.json();
      const subscriptionData = await subscriptionRes.json();
      const usageData = await usageRes.json();
      const invoicesData = await invoicesRes.json();

      setPlans(plansData.plans);
      setSubscription(subscriptionData.subscription);
      setUsage(usageData.usage);
      setLimits(usageData.limits);
      setPercentages(usageData.percentages);
      setInvoices(invoicesData.invoices);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (planId: string) => {
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, billingInterval }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create checkout session");
      }

      const { url } = await res.json();
      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upgrade");
    }
  };

  const handleManageBilling = async () => {
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to open billing portal");
      }

      const { url } = await res.json();
      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open billing portal");
    }
  };

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel your subscription?")) {
      return;
    }

    try {
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ immediately: false }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cancel subscription");
      }

      await loadBillingData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel");
    }
  };

  const handleReactivate = async () => {
    try {
      const res = await fetch("/api/billing/reactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reactivate subscription");
      }

      await loadBillingData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reactivate");
    }
  };

  const formatLimit = (value: number): string => {
    if (value === -1) return "Unlimited";
    return value.toLocaleString();
  };

  const formatBytes = (bytes: number): string => {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(2)} GB`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Billing & Subscription</h1>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-4 text-red-500 hover:text-red-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Current Subscription */}
      {subscription && (
        <section className="mb-8 p-6 bg-white rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Current Plan</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-blue-600">
                {subscription.plan.name}
              </p>
              <p className="text-gray-500">
                {subscription.billingInterval === "yearly" ? "Annual" : "Monthly"} billing
              </p>
              <p className="text-sm text-gray-400">
                Current period ends:{" "}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </p>
              {subscription.cancelAtPeriodEnd && (
                <p className="text-sm text-orange-600 mt-2">
                  Subscription will be canceled at period end
                </p>
              )}
            </div>
            <div className="flex gap-3">
              {subscription.hasStripeSubscription && (
                <button
                  onClick={handleManageBilling}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Manage Billing
                </button>
              )}
              {subscription.cancelAtPeriodEnd ? (
                <button
                  onClick={handleReactivate}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Reactivate
                </button>
              ) : subscription.planId !== "free" ? (
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
                >
                  Cancel Plan
                </button>
              ) : null}
            </div>
          </div>
        </section>
      )}

      {/* Usage Section */}
      {usage && limits && percentages && (
        <section className="mb-8 p-6 bg-white rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Usage</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <UsageCard
              label="Executions"
              current={usage.executions}
              limit={limits.executionsPerMonth}
              percentage={percentages.executions}
            />
            <UsageCard
              label="API Requests (Daily)"
              current={usage.api_requests}
              limit={limits.apiRequestsPerDay}
              percentage={percentages.api_requests}
            />
            <UsageCard
              label="Agents"
              current={usage.agents}
              limit={limits.agents}
              percentage={percentages.agents}
            />
            <UsageCard
              label="Workflows"
              current={usage.workflows}
              limit={limits.workflows}
              percentage={percentages.workflows}
            />
            <UsageCard
              label="Team Members"
              current={usage.team_members}
              limit={limits.teamMembers}
              percentage={percentages.team_members}
            />
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600">Storage</span>
                <span className="text-sm text-gray-500">
                  {formatBytes(usage.storage_bytes)} / {formatLimit(limits.storageGb)} GB
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${Math.min(percentages.storage_bytes, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Plans Section */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Available Plans</h2>
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setBillingInterval("monthly")}
              className={`px-4 py-2 rounded-md transition ${
                billingInterval === "monthly"
                  ? "bg-white shadow text-blue-600"
                  : "text-gray-600"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingInterval("yearly")}
              className={`px-4 py-2 rounded-md transition ${
                billingInterval === "yearly"
                  ? "bg-white shadow text-blue-600"
                  : "text-gray-600"
              }`}
            >
              Yearly
              <span className="ml-1 text-xs text-green-600">Save 17%</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`p-6 bg-white rounded-lg shadow relative ${
                plan.popular ? "ring-2 ring-blue-500" : ""
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white text-xs px-3 py-1 rounded-full">
                  Most Popular
                </span>
              )}
              <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
              <p className="text-gray-500 text-sm mb-4">{plan.description}</p>
              <div className="mb-6">
                <span className="text-3xl font-bold">
                  {billingInterval === "yearly" ? plan.pricing.yearly : plan.pricing.monthly}
                </span>
                {plan.pricing.monthlyRaw > 0 && (
                  <span className="text-gray-500">
                    /{billingInterval === "yearly" ? "year" : "month"}
                  </span>
                )}
              </div>

              <ul className="space-y-2 mb-6 text-sm">
                <li className="flex items-center gap-2">
                  <CheckIcon /> {formatLimit(plan.limits.agents)} Agents
                </li>
                <li className="flex items-center gap-2">
                  <CheckIcon /> {formatLimit(plan.limits.workflows)} Workflows
                </li>
                <li className="flex items-center gap-2">
                  <CheckIcon /> {formatLimit(plan.limits.executionsPerMonth)} Executions/month
                </li>
                <li className="flex items-center gap-2">
                  <CheckIcon /> {formatLimit(plan.limits.teamMembers)} Team members
                </li>
                <li className="flex items-center gap-2">
                  <CheckIcon /> {plan.limits.storageGb} GB Storage
                </li>
                {plan.features.githubIntegration && (
                  <li className="flex items-center gap-2">
                    <CheckIcon /> GitHub Integration
                  </li>
                )}
                {plan.features.advancedAnalytics && (
                  <li className="flex items-center gap-2">
                    <CheckIcon /> Advanced Analytics
                  </li>
                )}
                {plan.features.prioritySupport && (
                  <li className="flex items-center gap-2">
                    <CheckIcon /> Priority Support
                  </li>
                )}
                {plan.features.sso && (
                  <li className="flex items-center gap-2">
                    <CheckIcon /> SSO
                  </li>
                )}
              </ul>

              {subscription?.planId === plan.id ? (
                <button
                  disabled
                  className="w-full py-2 bg-gray-100 text-gray-500 rounded-lg cursor-not-allowed"
                >
                  Current Plan
                </button>
              ) : plan.id === "free" ? (
                <button
                  disabled
                  className="w-full py-2 bg-gray-100 text-gray-500 rounded-lg cursor-not-allowed"
                >
                  Free
                </button>
              ) : plan.pricing.monthlyRaw === -1 ? (
                <a
                  href="mailto:sales@kyndof.com"
                  className="block w-full py-2 text-center border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50"
                >
                  Contact Sales
                </a>
              ) : (
                <button
                  onClick={() => handleUpgrade(plan.id)}
                  className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {subscription && subscription.planId !== "free" ? "Switch to" : "Upgrade to"} {plan.name}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Invoices Section */}
      {invoices.length > 0 && (
        <section className="p-6 bg-white rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Invoice History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Date</th>
                  <th className="text-left py-3 px-4">Period</th>
                  <th className="text-left py-3 px-4">Amount</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-left py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      {new Date(invoice.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      {new Date(invoice.periodStart).toLocaleDateString()} -{" "}
                      {new Date(invoice.periodEnd).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">{invoice.amountFormatted}</td>
                    <td className="py-3 px-4">
                      <StatusBadge status={invoice.status} />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        {invoice.hostedInvoiceUrl && (
                          <a
                            href={invoice.hostedInvoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            View
                          </a>
                        )}
                        {invoice.invoicePdfUrl && (
                          <a
                            href={invoice.invoicePdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            PDF
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};

const UsageCard: React.FC<{
  label: string;
  current: number;
  limit: number;
  percentage: number;
}> = ({ label, current, limit, percentage }) => {
  const formatLimit = (value: number): string => {
    if (value === -1) return "Unlimited";
    return value.toLocaleString();
  };

  const getColor = (pct: number): string => {
    if (pct >= 90) return "bg-red-500";
    if (pct >= 75) return "bg-orange-500";
    return "bg-blue-600";
  };

  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <div className="flex justify-between items-center mb-2">
        <span className="text-gray-600">{label}</span>
        <span className="text-sm text-gray-500">
          {current.toLocaleString()} / {formatLimit(limit)}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`${getColor(percentage)} h-2 rounded-full transition-all`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
};

const CheckIcon: React.FC = () => (
  <svg
    className="w-4 h-4 text-green-500"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 13l4 4L19 7"
    />
  </svg>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const colors: Record<string, string> = {
    paid: "bg-green-100 text-green-800",
    open: "bg-yellow-100 text-yellow-800",
    draft: "bg-gray-100 text-gray-800",
    void: "bg-red-100 text-red-800",
    uncollectible: "bg-red-100 text-red-800",
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs ${colors[status] || colors.draft}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

export default BillingPage;
