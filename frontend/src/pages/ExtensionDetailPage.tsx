import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { request, ApiError } from "../api/client";

interface Extension {
  id: string;
  name: string;
  slug: string;
  description: string;
  longDescription: string;
  publisherId: string;
  publisherName: string;
  publisherVerified: boolean;
  version: string;
  category: string;
  tags: string[];
  pricing: "free" | "paid" | "freemium";
  price?: { amount: number; currency: string; interval?: string };
  stats: {
    downloads: number;
    activeInstalls: number;
    rating: number;
    reviewCount: number;
  };
  icon: string | null;
  screenshots: string[];
  demoUrl?: string;
  repositoryUrl?: string;
  documentationUrl?: string;
  requirements: {
    nubabelVersion: string;
    permissions: string[];
  };
  publishedAt: string | null;
  updatedAt: string;
}

interface Review {
  id: string;
  userName: string;
  rating: number;
  title: string;
  body: string;
  helpfulCount: number;
  publisherResponse?: { body: string; respondedAt: string };
  createdAt: string;
}

interface RatingSummary {
  average: number;
  count: number;
  distribution: { [key: number]: number };
}

interface Version {
  id: string;
  version: string;
  changelog: string | null;
  publishedAt: string | null;
}

export default function ExtensionDetailPage() {
  const { slug } = useParams<{ slug: string }>();

  const [extension, setExtension] = useState<Extension | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [ratingSummary, setRatingSummary] = useState<RatingSummary | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [similar, setSimilar] = useState<Extension[]>([]);
  const [isInstalled, setIsInstalled] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "reviews" | "versions">("overview");
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);

  const fetchExtension = useCallback(async () => {
    if (!slug) return;
    setIsLoading(true);
    try {
      const result = await request<{ success: boolean; data: Extension }>({
        url: `/api/marketplace/${slug}`,
        method: "GET",
      });
      setExtension(result.data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("Extension not found");
      } else {
        setError("Failed to load extension");
      }
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  const fetchReviews = useCallback(async () => {
    if (!slug) return;
    try {
      const result = await request<{ reviews: { items: Review[] }; summary: RatingSummary }>({
        url: `/api/marketplace/${slug}/reviews`,
        method: "GET",
      });
      setReviews(result.reviews?.items || []);
      setRatingSummary(result.summary || null);
    } catch {
      // Reviews endpoint may not exist yet - fail silently
    }
  }, [slug]);

  const fetchVersions = useCallback(async () => {
    if (!slug) return;
    try {
      const result = await request<{ versions: Version[] }>({
        url: `/api/marketplace/${slug}/versions`,
        method: "GET",
      });
      setVersions(result.versions || []);
    } catch {
      // Versions endpoint may not exist yet - fail silently
    }
  }, [slug]);

  const fetchSimilar = useCallback(async () => {
    if (!slug) return;
    try {
      const result = await request<{ extensions: Extension[] }>({
        url: `/api/marketplace/${slug}/similar`,
        method: "GET",
      });
      setSimilar(result.extensions || []);
    } catch {
      // Similar endpoint may not exist yet - fail silently
    }
  }, [slug]);

  const checkInstalled = useCallback(async () => {
    try {
      const result = await request<{ success: boolean; data: { extensionId: string; extension: { slug: string } }[] }>({
        url: "/api/marketplace/my-extensions",
        method: "GET",
      });
      const installations = result.data || [];
      setIsInstalled(installations.some((i) => i.extension?.slug === slug));
    } catch {
      // Not logged in or other error - fail silently
    }
  }, [slug]);

  useEffect(() => {
    fetchExtension();
    fetchReviews();
    fetchVersions();
    fetchSimilar();
    checkInstalled();
  }, [fetchExtension, fetchReviews, fetchVersions, fetchSimilar, checkInstalled]);

  const handleInstall = async () => {
    if (!extension) return;
    setIsInstalling(true);
    try {
      await request({
        url: `/api/marketplace/${extension.slug}/install`,
        method: "POST",
      });
      setIsInstalled(true);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Install failed";
      alert(message);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleUninstall = async () => {
    if (!extension || !confirm("Are you sure you want to uninstall this extension?")) return;
    try {
      await request({
        url: `/api/marketplace/${extension.slug}/uninstall`,
        method: "DELETE",
      });
      setIsInstalled(false);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Uninstall failed";
      alert(message);
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

  const renderStars = (rating: number, size: "sm" | "lg" = "sm") => {
    const stars = [];
    const sizeClass = size === "lg" ? "text-xl" : "text-sm";
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <span key={i} className={`${i <= rating ? "text-yellow-400" : "text-gray-300"} ${sizeClass}`}>
          ★
        </span>
      );
    }
    return stars;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error || !extension) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">😕</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{error || "Extension not found"}</h2>
        <Link to="/marketplace" className="text-indigo-600 hover:text-indigo-800">
          ← Back to Marketplace
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm">
        <Link to="/marketplace" className="text-indigo-600 hover:text-indigo-800">
          Marketplace
        </Link>
        <span className="mx-2 text-gray-400">/</span>
        <span className="text-gray-600">{extension.name}</span>
      </nav>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex gap-6">
          <div className="w-24 h-24 bg-gray-100 rounded-2xl flex items-center justify-center flex-shrink-0">
            {extension.icon ? (
              <img src={extension.icon} alt="" className="w-16 h-16 rounded-xl" />
            ) : (
              <span className="text-4xl">📦</span>
            )}
          </div>

          <div className="flex-1">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{extension.name}</h1>
                <p className="text-gray-500 flex items-center gap-2 mt-1">
                  <span>{extension.publisherName}</span>
                  {extension.publisherVerified && (
                    <span className="text-blue-500" title="Verified Publisher">✓ Verified</span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  extension.pricing === "free"
                    ? "bg-green-100 text-green-700"
                    : extension.pricing === "freemium"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-amber-100 text-amber-700"
                }`}>
                  {formatPrice(extension)}
                </span>

                {isInstalled ? (
                  <button
                    onClick={handleUninstall}
                    className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Uninstall
                  </button>
                ) : (
                  <button
                    onClick={handleInstall}
                    disabled={isInstalling}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isInstalling ? "Installing..." : "Install"}
                  </button>
                )}
              </div>
            </div>

            <p className="text-gray-600 mt-3">{extension.description}</p>

            <div className="flex items-center gap-6 mt-4 text-sm">
              <div className="flex items-center gap-1">
                {renderStars(Math.round(extension.stats.rating))}
                <span className="text-gray-600 ml-1">
                  {extension.stats.rating.toFixed(1)} ({extension.stats.reviewCount} reviews)
                </span>
              </div>
              <span className="text-gray-400">|</span>
              <span className="text-gray-600">
                {formatNumber(extension.stats.downloads)} downloads
              </span>
              <span className="text-gray-400">|</span>
              <span className="text-gray-600">
                {formatNumber(extension.stats.activeInstalls)} active installs
              </span>
              <span className="text-gray-400">|</span>
              <span className="text-gray-600">v{extension.version}</span>
            </div>

            {extension.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {extension.tags.map((tag) => (
                  <Link
                    key={tag}
                    to={`/marketplace?q=${tag}`}
                    className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200"
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-6">
          {(["overview", "reviews", "versions"] as const).map((tab) => (
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
              {tab === "reviews" && `Reviews (${extension.stats.reviewCount})`}
              {tab === "versions" && "Version History"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="col-span-2">
          {activeTab === "overview" && (
            <div>
              {/* Screenshots */}
              {extension.screenshots.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Screenshots</h2>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {extension.screenshots.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt={`Screenshot ${i + 1}`}
                        onClick={() => setSelectedScreenshot(url)}
                        className="h-48 rounded-lg border border-gray-200 cursor-pointer hover:opacity-90"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="prose max-w-none">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Description</h2>
                <div className="text-gray-600 whitespace-pre-wrap">{extension.longDescription}</div>
              </div>
            </div>
          )}

          {activeTab === "reviews" && (
            <div>
              {/* Rating Summary */}
              {ratingSummary && (
                <div className="bg-gray-50 rounded-xl p-6 mb-6">
                  <div className="flex items-center gap-8">
                    <div className="text-center">
                      <div className="text-4xl font-bold text-gray-900">
                        {ratingSummary.average.toFixed(1)}
                      </div>
                      <div className="flex justify-center mt-1">
                        {renderStars(Math.round(ratingSummary.average), "lg")}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {ratingSummary.count} reviews
                      </div>
                    </div>
                    <div className="flex-1">
                      {[5, 4, 3, 2, 1].map((star) => (
                        <div key={star} className="flex items-center gap-2 mb-1">
                          <span className="text-sm text-gray-600 w-3">{star}</span>
                          <span className="text-yellow-400">★</span>
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-yellow-400"
                              style={{
                                width: `${ratingSummary.count > 0 ? (ratingSummary.distribution[star] / ratingSummary.count) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <span className="text-sm text-gray-500 w-8">
                            {ratingSummary.distribution[star] || 0}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Reviews List */}
              {reviews.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  No reviews yet. Be the first to review!
                </div>
              ) : (
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div key={review.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium text-gray-900">{review.title}</div>
                          <div className="flex items-center gap-2 mt-1">
                            {renderStars(review.rating)}
                            <span className="text-sm text-gray-500">
                              by {review.userName} • {new Date(review.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <span className="text-sm text-gray-400">
                          {review.helpfulCount} found helpful
                        </span>
                      </div>
                      <p className="text-gray-600 mt-2">{review.body}</p>
                      {review.publisherResponse && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg border-l-4 border-indigo-400">
                          <div className="text-sm font-medium text-gray-700">Publisher Response</div>
                          <p className="text-sm text-gray-600 mt-1">{review.publisherResponse.body}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "versions" && (
            <div className="space-y-4">
              {versions.map((v) => (
                <div key={v.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-gray-900">v{v.version}</div>
                    <span className="text-sm text-gray-500">
                      {v.publishedAt ? new Date(v.publishedAt).toLocaleDateString() : "Unpublished"}
                    </span>
                  </div>
                  {v.changelog && (
                    <div className="text-gray-600 text-sm mt-2 whitespace-pre-wrap">
                      {v.changelog}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div>
          {/* Info Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
            <h3 className="font-semibold text-gray-900 mb-3">Information</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Version</dt>
                <dd className="text-gray-900">{extension.version}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Category</dt>
                <dd className="text-gray-900">{extension.category}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Min Nubabel</dt>
                <dd className="text-gray-900">{extension.requirements.nubabelVersion}</dd>
              </div>
              {extension.publishedAt && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Published</dt>
                  <dd className="text-gray-900">
                    {new Date(extension.publishedAt).toLocaleDateString()}
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-500">Updated</dt>
                <dd className="text-gray-900">
                  {new Date(extension.updatedAt).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </div>

          {/* Links */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
            <h3 className="font-semibold text-gray-900 mb-3">Links</h3>
            <div className="space-y-2">
              {extension.repositoryUrl && (
                <a
                  href={extension.repositoryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800"
                >
                  <span>📂</span> Source Code
                </a>
              )}
              {extension.documentationUrl && (
                <a
                  href={extension.documentationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800"
                >
                  <span>📖</span> Documentation
                </a>
              )}
              {extension.demoUrl && (
                <a
                  href={extension.demoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800"
                >
                  <span>🎬</span> Live Demo
                </a>
              )}
            </div>
          </div>

          {/* Permissions */}
          {extension.requirements.permissions.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
              <h3 className="font-semibold text-gray-900 mb-3">Permissions</h3>
              <ul className="space-y-1 text-sm text-gray-600">
                {extension.requirements.permissions.map((p) => (
                  <li key={p} className="flex items-center gap-2">
                    <span className="text-amber-500">⚠</span> {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Similar Extensions */}
          {similar.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Similar Extensions</h3>
              <div className="space-y-3">
                {similar.slice(0, 4).map((ext) => (
                  <Link
                    key={ext.id}
                    to={`/marketplace/${ext.slug}`}
                    className="flex items-center gap-3 hover:bg-gray-50 p-2 -mx-2 rounded-lg"
                  >
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                      {ext.icon ? (
                        <img src={ext.icon} alt="" className="w-6 h-6 rounded" />
                      ) : (
                        <span>📦</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{ext.name}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-1">
                        <span className="text-yellow-400">★</span> {ext.stats.rating.toFixed(1)}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Screenshot Modal */}
      {selectedScreenshot && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedScreenshot(null)}
        >
          <img src={selectedScreenshot} alt="" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
