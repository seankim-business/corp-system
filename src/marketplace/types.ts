// Marketplace Types

export interface MarketplaceExtension {
  id: string;
  name: string;
  slug: string;
  description: string;
  longDescription: string;

  // Publisher
  publisherId: string;
  publisherName: string;
  publisherVerified: boolean;

  // Versioning
  version: string;
  versions: ExtensionVersion[];

  // Categorization
  category: string;
  tags: string[];

  // Pricing
  pricing: "free" | "paid" | "freemium";
  price?: {
    amount: number;
    currency: string;
    interval?: "month" | "year" | "once";
  };

  // Stats
  stats: {
    downloads: number;
    activeInstalls: number;
    rating: number;
    reviewCount: number;
  };

  // Media
  icon: string | null;
  screenshots: string[];
  demoUrl?: string;
  repositoryUrl?: string;
  documentationUrl?: string;

  // Metadata
  requirements: {
    nubabelVersion: string;
    permissions: string[];
  };

  // Status
  status: "draft" | "review" | "published" | "rejected";
  featured: boolean;

  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExtensionVersion {
  id: string;
  extensionId: string;
  version: string;
  changelog: string | null;
  packageUrl: string;
  packageSize: number | null;
  manifest: ExtensionManifest;
  checksum: string | null;
  status: "draft" | "review" | "published";
  downloads: number;
  publishedAt: Date | null;
  createdAt: Date;
}

export interface ExtensionManifest {
  name: string;
  version: string;
  description: string;
  main: string;
  author: string;
  license?: string;
  keywords?: string[];
  repository?: string;
  nubabel: {
    minVersion: string;
    permissions: string[];
    hooks?: {
      onInstall?: string;
      onUninstall?: string;
      onUpdate?: string;
    };
    capabilities?: string[];
  };
}

export interface Review {
  id: string;
  extensionId: string;
  userId: string;
  userName: string;
  organizationId: string;

  rating: number; // 1-5
  title: string;
  body: string;

  // Moderation
  status: "pending" | "approved" | "rejected";
  moderatedAt?: Date;

  // Helpful votes
  helpfulCount: number;

  // Publisher response
  publisherResponse?: {
    body: string;
    respondedAt: Date;
  };

  createdAt: Date;
  updatedAt: Date;
}

export interface Publisher {
  id: string;
  userId: string;
  name: string;
  slug: string;
  email: string;
  website?: string;
  description?: string;
  logoUrl?: string;

  verified: boolean;
  verifiedAt?: Date;

  stripeAccountId?: string;
  payoutEnabled: boolean;

  // Stats (computed)
  extensionCount?: number;
  totalDownloads?: number;
  totalRevenue?: number;

  createdAt: Date;
  updatedAt: Date;
}

export interface ExtensionInstall {
  id: string;
  extensionId: string;
  versionId: string;
  organizationId: string;
  installedBy: string;
  status: "active" | "uninstalled";
  installedAt: Date;
  uninstalledAt?: Date;
  lastUsedAt?: Date;
}

export interface ExtensionPurchase {
  id: string;
  extensionId: string;
  organizationId: string;
  purchasedBy: string;
  amount: number;
  currency: string;
  paymentType: "once" | "subscription";
  stripePaymentId?: string;
  stripeSubscriptionId?: string;
  status: "active" | "cancelled" | "expired";
  expiresAt?: Date;
  cancelledAt?: Date;
  createdAt: Date;
}

export interface PublisherPayout {
  id: string;
  publisherId: string;
  amount: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  stripeTransferId?: string;
  status: "pending" | "processing" | "completed" | "failed";
  paidAt?: Date;
  createdAt: Date;
}

export interface MarketplaceCategory {
  id: string;
  slug: string;
  name: string;
  description?: string;
  icon?: string;
  sortOrder: number;
  extensionCount?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SearchResult {
  extensions: MarketplaceExtension[];
  total: number;
  facets: {
    categories: { name: string; count: number }[];
    tags: { name: string; count: number }[];
    pricing: { type: string; count: number }[];
  };
}

export interface RatingSummary {
  average: number;
  count: number;
  distribution: { [stars: number]: number };
}

export interface PublisherAnalytics {
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

export interface PublisherRegistration {
  name: string;
  slug: string;
  email: string;
  website?: string;
  description?: string;
}

export interface ExtensionSubmission {
  name: string;
  slug: string;
  description: string;
  longDescription: string;
  category: string;
  tags: string[];
  pricing: "free" | "paid" | "freemium";
  priceAmount?: number;
  priceCurrency?: string;
  priceInterval?: "month" | "year" | "once";
  icon?: string;
  screenshots?: string[];
  demoUrl?: string;
  repositoryUrl?: string;
  documentationUrl?: string;
}
