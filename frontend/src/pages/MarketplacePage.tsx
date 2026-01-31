import { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { request } from "../api/client";

interface Extension {
  id: string;
  name: string;
  slug: string;
  description: string;
  publisherName: string;
  publisherVerified: boolean;
  category: string;
  pricing: "free" | "paid" | "freemium";
  price?: { amount: number; currency: string; interval?: string };
  stats: {
    downloads: number;
    activeInstalls: number;
    rating: number;
    reviewCount: number;
  };
  icon: string | null;
  featured: boolean;
}

interface Category {
  id: string;
  slug: string;
  name: string;
  icon?: string;
  extensionCount?: number;
}

interface SearchFacets {
  categories: { name: string; count: number }[];
  tags: { name: string; count: number }[];
  pricing: { type: string; count: number }[];
}

interface SkillSuggestion {
  patternId: string;
  suggestedName: string;
  suggestedDescription: string;
  suggestedTriggers: string[];
  confidence: number;
  frequency: number;
  patternType: string;
}

export default function MarketplacePage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [featured, setFeatured] = useState<Extension[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [facets, setFacets] = useState<SearchFacets | null>(null);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get("category") || "");
  const [selectedPricing, setSelectedPricing] = useState(searchParams.get("pricing") || "");
  const [sortBy, setSortBy] = useState(searchParams.get("sort") || "popular");
  const [page, setPage] = useState(1);

  const [suggestions, setSuggestions] = useState<SkillSuggestion[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const fetchExtensions = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set("q", searchQuery);
      if (selectedCategory) params.set("category", selectedCategory);
      if (selectedPricing) params.set("pricing", selectedPricing);
      params.set("sort", sortBy);
      params.set("page", String(page));
      params.set("limit", "20");

      const endpoint = searchQuery ? "/api/marketplace/search" : "/api/marketplace/extensions";
      const result = await request<{
        extensions: Extension[];
        items?: Extension[];
        total: number;
        facets?: SearchFacets;
      }>({
        url: `${endpoint}?${params.toString()}`,
        method: "GET",
      });

      setExtensions(result.extensions || result.items || []);
      setTotal(result.total);
      if (result.facets) setFacets(result.facets);
    } catch (error) {
      console.error("Failed to fetch extensions:", error);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedCategory, selectedPricing, sortBy, page]);

  const fetchFeatured = useCallback(async () => {
    try {
      const result = await request<{ extensions: Extension[] }>({
        url: "/api/marketplace/featured",
        method: "GET",
      });
      setFeatured(result.extensions);
    } catch (error) {
      console.error("Failed to fetch featured:", error);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const result = await request<{ categories: Category[] }>({
        url: "/api/marketplace/categories",
        method: "GET",
      });
      setCategories(result.categories);
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    }
  }, []);

  const fetchSuggestions = useCallback(async () => {
    try {
      const result = await request<{ success: boolean; data: SkillSuggestion[] }>({
        url: "/api/marketplace/suggestions",
        method: "GET",
      });
      setSuggestions(result.data || []);
    } catch {
      // Suggestions are optional - fail silently
    }
  }, []);

  useEffect(() => {
    fetchCategories();
    fetchFeatured();
    fetchSuggestions();
  }, [fetchCategories, fetchFeatured, fetchSuggestions]);

  useEffect(() => {
    fetchExtensions();
  }, [fetchExtensions]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.set("q", searchQuery);
    if (selectedCategory) params.set("category", selectedCategory);
    if (selectedPricing) params.set("pricing", selectedPricing);
    if (sortBy !== "popular") params.set("sort", sortBy);
    setSearchParams(params);
  }, [searchQuery, selectedCategory, selectedPricing, sortBy, setSearchParams]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchExtensions();
  };

  const handleAcceptSuggestion = async (patternId: string) => {
    setAcceptingId(patternId);
    try {
      await request({
        url: `/api/marketplace/suggestions/${patternId}/accept`,
        method: "POST",
      });
      setSuggestions((prev) => prev.filter((s) => s.patternId !== patternId));
    } catch (error) {
      console.error("Failed to accept suggestion:", error);
    } finally {
      setAcceptingId(null);
    }
  };

  const handleDismissSuggestion = async (patternId: string) => {
    try {
      await request({
        url: `/api/marketplace/suggestions/${patternId}/dismiss`,
        method: "POST",
      });
      setSuggestions((prev) => prev.filter((s) => s.patternId !== patternId));
    } catch (error) {
      console.error("Failed to dismiss suggestion:", error);
    }
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return String(num);
  };

  const formatPrice = (ext: Extension): string => {
    if (ext.pricing === "free") return "Free";
    if (!ext.price) return "Paid";
    const amount = (ext.price.amount / 100).toFixed(2);
    const interval = ext.price.interval ? `/${ext.price.interval}` : "";
    return `$${amount}${interval}`;
  };

  const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <span key={i} className={i <= rating ? "text-yellow-400" : "text-gray-300"}>
          ★
        </span>
      );
    }
    return stars;
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Extension Marketplace</h1>
          <p className="text-indigo-100 mb-6">
            Discover and install extensions to supercharge your workspace
          </p>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="flex gap-3 max-w-2xl">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search extensions..."
              className="flex-1 px-4 py-3 rounded-lg text-gray-900 focus:ring-2 focus:ring-white"
            />
            <button
              type="submit"
              className="px-6 py-3 bg-white text-indigo-600 rounded-lg font-medium hover:bg-indigo-50"
            >
              Search
            </button>
          </form>
        </div>
      </div>

      <div className="max-w-6xl mx-auto py-8 px-6">
        {/* External Tools Banner */}
        <div className="mb-8 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔌</span>
              <div>
                <h3 className="font-semibold text-gray-900">Looking for MCP Servers & External Tools?</h3>
                <p className="text-sm text-gray-600">
                  Connect to Smithery, Glama, ComfyUI, CivitAI, and more external ecosystems
                </p>
              </div>
            </div>
            <Link
              to="/marketplace-hub"
              className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 whitespace-nowrap"
            >
              Browse External Tools
            </Link>
          </div>
        </div>

        {/* Featured Section */}
        {!searchQuery && featured.length > 0 && (
          <div className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Featured Extensions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {featured.slice(0, 3).map((ext) => (
                <Link
                  key={ext.id}
                  to={`/marketplace/${ext.slug}`}
                  className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-5 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center shadow-sm">
                      {ext.icon ? (
                        <img src={ext.icon} alt="" className="w-10 h-10 rounded-lg" />
                      ) : (
                        <span className="text-2xl">📦</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 truncate">{ext.name}</h3>
                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full">
                          Featured
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">{ext.description}</p>
                      <div className="flex items-center gap-3 mt-2 text-sm">
                        <span className="flex items-center text-yellow-500">
                          {renderStars(Math.round(ext.stats.rating))}
                          <span className="text-gray-500 ml-1">({ext.stats.reviewCount})</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* AI Skill Suggestions */}
        {suggestions.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">AI-Suggested Skills</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Skills automatically detected from your team's usage patterns
                </p>
              </div>
              <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                {suggestions.length} suggestion{suggestions.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {suggestions.map((suggestion) => (
                <div
                  key={suggestion.patternId}
                  className="bg-white border border-purple-200 rounded-xl p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                      <span className="text-lg">
                        {suggestion.patternType === "composite" ? "🧩" : suggestion.patternType === "sequence" ? "🔗" : "🔄"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div
                        className="h-2 w-16 bg-gray-200 rounded-full overflow-hidden"
                        title={`${Math.round(suggestion.confidence * 100)}% confidence`}
                      >
                        <div
                          className="h-full bg-purple-500 rounded-full"
                          style={{ width: `${suggestion.confidence * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">
                        {Math.round(suggestion.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                  <h3 className="font-semibold text-gray-900">{suggestion.suggestedName}</h3>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                    {suggestion.suggestedDescription}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {suggestion.suggestedTriggers.slice(0, 3).map((trigger) => (
                      <span
                        key={trigger}
                        className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
                      >
                        {trigger}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 mt-2">
                    Detected {suggestion.frequency}x as {suggestion.patternType} pattern
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => handleAcceptSuggestion(suggestion.patternId)}
                      disabled={acceptingId === suggestion.patternId}
                      className="flex-1 px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                    >
                      {acceptingId === suggestion.patternId ? "Creating..." : "Create Skill"}
                    </button>
                    <button
                      onClick={() => handleDismissSuggestion(suggestion.patternId)}
                      className="px-3 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-8">
          {/* Sidebar */}
          <div className="w-56 flex-shrink-0">
            {/* Categories */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Categories</h3>
              <ul className="space-y-1">
                <li>
                  <button
                    onClick={() => {
                      setSelectedCategory("");
                      setPage(1);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                      !selectedCategory
                        ? "bg-indigo-100 text-indigo-700"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    All Categories
                  </button>
                </li>
                {categories.map((cat) => (
                  <li key={cat.id}>
                    <button
                      onClick={() => {
                        setSelectedCategory(cat.slug);
                        setPage(1);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between ${
                        selectedCategory === cat.slug
                          ? "bg-indigo-100 text-indigo-700"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      <span>{cat.name}</span>
                      {cat.extensionCount !== undefined && (
                        <span className="text-xs text-gray-400">{cat.extensionCount}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Pricing Filter */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Pricing</h3>
              <ul className="space-y-1">
                {["", "free", "paid", "freemium"].map((price) => (
                  <li key={price}>
                    <button
                      onClick={() => {
                        setSelectedPricing(price);
                        setPage(1);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                        selectedPricing === price
                          ? "bg-indigo-100 text-indigo-700"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {price === "" ? "All" : price.charAt(0).toUpperCase() + price.slice(1)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Tags from facets */}
            {(facets?.tags?.length ?? 0) > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Popular Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {facets?.tags?.slice(0, 10).map((tag) => (
                    <button
                      key={tag.name}
                      onClick={() => setSearchQuery(tag.name)}
                      className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200"
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {/* Sort & Results Count */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-600">
                {total} extension{total !== 1 ? "s" : ""} found
              </p>
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1);
                }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="popular">Most Popular</option>
                <option value="recent">Recently Added</option>
                <option value="rating">Highest Rated</option>
                <option value="trending">Trending</option>
              </select>
            </div>

            {/* Extension Grid */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600"></div>
              </div>
            ) : extensions.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">🔍</div>
                <h3 className="text-lg font-medium text-gray-900">No extensions found</h3>
                <p className="text-gray-500 mt-1">Try adjusting your search or filters</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {extensions.map((ext) => (
                  <Link
                    key={ext.id}
                    to={`/marketplace/${ext.slug}`}
                    className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex gap-4">
                      <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        {ext.icon ? (
                          <img src={ext.icon} alt="" className="w-8 h-8 rounded-lg" />
                        ) : (
                          <span className="text-xl">📦</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900 truncate">{ext.name}</h3>
                          {ext.publisherVerified && (
                            <span className="text-blue-500" title="Verified Publisher">
                              ✓
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 truncate">{ext.publisherName}</p>
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{ext.description}</p>

                        <div className="flex items-center justify-between mt-3">
                          <div className="flex items-center gap-3 text-sm">
                            <span className="flex items-center text-yellow-500">
                              ★ {ext.stats.rating.toFixed(1)}
                            </span>
                            <span className="text-gray-400">
                              {formatNumber(ext.stats.downloads)} downloads
                            </span>
                          </div>
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              ext.pricing === "free"
                                ? "bg-green-100 text-green-700"
                                : ext.pricing === "freemium"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {formatPrice(ext)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Pagination */}
            {total > 20 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {page} of {Math.ceil(total / 20)}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= Math.ceil(total / 20)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
