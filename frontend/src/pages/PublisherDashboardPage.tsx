import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { request, ApiError } from "../api/client";

interface Publisher {
  id: string;
  name: string;
  slug: string;
  email: string;
  website?: string;
  description?: string;
  verified: boolean;
  payoutEnabled: boolean;
  extensionCount?: number;
}

interface Extension {
  id: string;
  name: string;
  slug: string;
  status: string;
  stats: {
    downloads: number;
    activeInstalls: number;
    rating: number;
    reviewCount: number;
  };
  pricing: string;
}

interface Analytics {
  totalDownloads: number;
  totalRevenue: number;
  totalInstalls: number;
  extensionStats: {
    extensionId: string;
    name: string;
    downloads: number;
    installs: number;
    revenue: number;
    rating: number;
  }[];
  downloadTrend: { date: string; count: number }[];
  revenueTrend: { date: string; amount: number }[];
}

interface Payout {
  id: string;
  amount: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  paidAt?: string;
}

export default function PublisherDashboardPage() {
  const [publisher, setPublisher] = useState<Publisher | null>(null);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [activeTab, setActiveTab] = useState<"overview" | "extensions" | "payouts">("overview");

  // Register form state
  const [registerForm, setRegisterForm] = useState({
    name: "",
    slug: "",
    email: "",
    website: "",
    description: "",
  });

  const fetchPublisher = useCallback(async () => {
    try {
      const result = await request<{ publisher: Publisher }>({
        url: "/api/marketplace/publishers/me",
        method: "GET",
      });
      setPublisher(result.publisher);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setShowRegisterForm(true);
      }
      return false;
    }
  }, []);

  const fetchExtensions = useCallback(async () => {
    try {
      const result = await request<{ extensions: Extension[] }>({
        url: "/api/marketplace/publishers/me/extensions",
        method: "GET",
      });
      setExtensions(result.extensions);
    } catch (err) {
      console.error("Failed to fetch extensions:", err);
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    try {
      const result = await request<{ analytics: Analytics }>({
        url: `/api/marketplace/publishers/me/analytics?period=${analyticsPeriod}`,
        method: "GET",
      });
      setAnalytics(result.analytics);
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
    }
  }, [analyticsPeriod]);

  const fetchPayouts = useCallback(async () => {
    try {
      const result = await request<{ payouts: Payout[] }>({
        url: "/api/marketplace/publishers/me/payouts",
        method: "GET",
      });
      setPayouts(result.payouts);
    } catch (err) {
      console.error("Failed to fetch payouts:", err);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      const hasPublisher = await fetchPublisher();
      if (hasPublisher) {
        await Promise.all([fetchExtensions(), fetchAnalytics(), fetchPayouts()]);
      }
      setIsLoading(false);
    };
    init();
  }, [fetchPublisher, fetchExtensions, fetchAnalytics, fetchPayouts]);

  useEffect(() => {
    if (publisher) {
      fetchAnalytics();
    }
  }, [analyticsPeriod, publisher, fetchAnalytics]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRegistering(true);
    try {
      const result = await request<{ publisher: Publisher }>({
        url: "/api/marketplace/publishers/register",
        method: "POST",
        data: registerForm,
      });
      setPublisher(result.publisher);
      setShowRegisterForm(false);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Registration failed";
      alert(message);
    } finally {
      setIsRegistering(false);
    }
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return String(num);
  };

  const formatCurrency = (cents: number): string => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // Registration Form
  if (showRegisterForm) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Become a Publisher</h1>
          <p className="text-gray-600 mt-2">
            Create and share extensions with the Nubabel community
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Publisher Name *
              </label>
              <input
                type="text"
                value={registerForm.name}
                onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="Acme Inc."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Publisher Slug *
              </label>
              <input
                type="text"
                value={registerForm.slug}
                onChange={(e) =>
                  setRegisterForm({
                    ...registerForm,
                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
                  })
                }
                required
                pattern="[a-z0-9-]+"
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="acme-inc"
              />
              <p className="text-xs text-gray-500 mt-1">
                URL-friendly identifier (lowercase, hyphens only)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact Email *
              </label>
              <input
                type="email"
                value={registerForm.email}
                onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="publisher@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Website
              </label>
              <input
                type="url"
                value={registerForm.website}
                onChange={(e) => setRegisterForm({ ...registerForm, website: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="https://example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={registerForm.description}
                onChange={(e) => setRegisterForm({ ...registerForm, description: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                rows={3}
                placeholder="Tell us about your organization..."
              />
            </div>

            <button
              type="submit"
              disabled={isRegistering}
              className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
            >
              {isRegistering ? "Registering..." : "Register as Publisher"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!publisher) {
    return null;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Publisher Dashboard</h1>
          <p className="text-gray-600">
            {publisher.name}
            {publisher.verified && (
              <span className="ml-2 text-blue-500">✓ Verified</span>
            )}
          </p>
        </div>
        <Link
          to="/marketplace/submit"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          Submit Extension
        </Link>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-6">
          {(["overview", "extensions", "payouts"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 text-sm font-medium border-b-2 -mb-px ${
                activeTab === tab
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "overview" && "Overview"}
              {tab === "extensions" && `Extensions (${extensions.length})`}
              {tab === "payouts" && "Payouts"}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "overview" && analytics && (
        <div>
          {/* Period Selector */}
          <div className="flex justify-end mb-4">
            <select
              value={analyticsPeriod}
              onChange={(e) => setAnalyticsPeriod(e.target.value as any)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="text-sm text-gray-500">Total Downloads</div>
              <div className="text-3xl font-bold text-gray-900 mt-1">
                {formatNumber(analytics.totalDownloads)}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="text-sm text-gray-500">Active Installs</div>
              <div className="text-3xl font-bold text-gray-900 mt-1">
                {formatNumber(analytics.totalInstalls)}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="text-sm text-gray-500">Total Revenue</div>
              <div className="text-3xl font-bold text-green-600 mt-1">
                {formatCurrency(analytics.totalRevenue)}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="text-sm text-gray-500">Extensions</div>
              <div className="text-3xl font-bold text-gray-900 mt-1">
                {extensions.length}
              </div>
            </div>
          </div>

          {/* Download Trend Chart (simplified) */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h3 className="font-semibold text-gray-900 mb-4">Download Trend</h3>
            <div className="h-48 flex items-end gap-1">
              {analytics.downloadTrend.slice(-30).map((point, i) => {
                const maxCount = Math.max(...analytics.downloadTrend.map((p) => p.count)) || 1;
                const height = (point.count / maxCount) * 100;
                return (
                  <div
                    key={i}
                    className="flex-1 bg-indigo-500 rounded-t hover:bg-indigo-600 transition-colors"
                    style={{ height: `${Math.max(height, 2)}%` }}
                    title={`${point.date}: ${point.count} downloads`}
                  />
                );
              })}
            </div>
          </div>

          {/* Extension Stats */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Extension Performance</h3>
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3">Extension</th>
                  <th className="pb-3 text-right">Downloads</th>
                  <th className="pb-3 text-right">Installs</th>
                  <th className="pb-3 text-right">Revenue</th>
                  <th className="pb-3 text-right">Rating</th>
                </tr>
              </thead>
              <tbody>
                {analytics.extensionStats.map((stat) => (
                  <tr key={stat.extensionId} className="border-b last:border-b-0">
                    <td className="py-3 font-medium text-gray-900">{stat.name}</td>
                    <td className="py-3 text-right text-gray-600">
                      {formatNumber(stat.downloads)}
                    </td>
                    <td className="py-3 text-right text-gray-600">
                      {formatNumber(stat.installs)}
                    </td>
                    <td className="py-3 text-right text-green-600">
                      {formatCurrency(stat.revenue)}
                    </td>
                    <td className="py-3 text-right">
                      <span className="text-yellow-500">★</span> {stat.rating.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "extensions" && (
        <div className="bg-white rounded-xl border border-gray-200">
          {extensions.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">📦</div>
              <h3 className="text-lg font-medium text-gray-900">No extensions yet</h3>
              <p className="text-gray-500 mt-1">Submit your first extension to get started</p>
              <Link
                to="/marketplace/submit"
                className="inline-block mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Submit Extension
              </Link>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="p-4">Extension</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Downloads</th>
                  <th className="p-4 text-right">Rating</th>
                  <th className="p-4 text-right">Pricing</th>
                </tr>
              </thead>
              <tbody>
                {extensions.map((ext) => (
                  <tr key={ext.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="p-4">
                      <Link
                        to={`/marketplace/${ext.slug}`}
                        className="font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        {ext.name}
                      </Link>
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          ext.status === "published"
                            ? "bg-green-100 text-green-700"
                            : ext.status === "review"
                              ? "bg-yellow-100 text-yellow-700"
                              : ext.status === "rejected"
                                ? "bg-red-100 text-red-700"
                                : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {ext.status}
                      </span>
                    </td>
                    <td className="p-4 text-right text-gray-600">
                      {formatNumber(ext.stats.downloads)}
                    </td>
                    <td className="p-4 text-right">
                      <span className="text-yellow-500">★</span> {ext.stats.rating.toFixed(1)}
                      <span className="text-gray-400 text-sm ml-1">({ext.stats.reviewCount})</span>
                    </td>
                    <td className="p-4 text-right">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          ext.pricing === "free"
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {ext.pricing}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === "payouts" && (
        <div>
          {!publisher.payoutEnabled && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-3">
                <span className="text-2xl">💳</span>
                <div>
                  <div className="font-medium text-yellow-800">Set up payouts</div>
                  <p className="text-sm text-yellow-700">
                    Connect your Stripe account to receive payments from paid extensions.
                  </p>
                </div>
                <button className="ml-auto px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm">
                  Connect Stripe
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200">
            {payouts.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">💰</div>
                <h3 className="text-lg font-medium text-gray-900">No payouts yet</h3>
                <p className="text-gray-500 mt-1">
                  Payouts are processed monthly for paid extension revenue
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-gray-500 border-b">
                    <th className="p-4">Period</th>
                    <th className="p-4">Amount</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Paid Date</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((payout) => (
                    <tr key={payout.id} className="border-b last:border-b-0">
                      <td className="p-4 text-gray-900">
                        {new Date(payout.periodStart).toLocaleDateString()} -{" "}
                        {new Date(payout.periodEnd).toLocaleDateString()}
                      </td>
                      <td className="p-4 font-medium text-green-600">
                        {formatCurrency(payout.amount)}
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            payout.status === "completed"
                              ? "bg-green-100 text-green-700"
                              : payout.status === "processing"
                                ? "bg-blue-100 text-blue-700"
                                : payout.status === "failed"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {payout.status}
                        </span>
                      </td>
                      <td className="p-4 text-gray-600">
                        {payout.paidAt ? new Date(payout.paidAt).toLocaleDateString() : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
