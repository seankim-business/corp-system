// Marketplace Module Index
// Re-export all services and types

export * from "./types";

// Services
export * as catalogService from "./services/catalog";
export * as searchService from "./services/search";
export * as reviewsService from "./services/reviews";
export * as downloadsService from "./services/downloads";
export * as publisherService from "./services/publisher";
export * as paymentsService from "./services/payments";

// Re-export specific commonly used functions
export {
  listExtensions,
  getExtension,
  getExtensionVersions,
  getFeaturedExtensions,
  getRecommendedExtensions,
  getCategories,
} from "./services/catalog";

export {
  searchExtensions,
  suggestExtensions,
  findSimilarExtensions,
} from "./services/search";

export {
  createReview,
  listReviews,
  respondToReview,
  voteHelpful,
  getRatingSummary,
} from "./services/reviews";

export {
  installExtension,
  uninstallExtension,
  getInstalledExtensions,
  isExtensionInstalled,
} from "./services/downloads";

export {
  registerPublisher,
  getPublisher,
  getPublisherByUserId,
  submitExtension,
  getPublisherExtensions,
  getPublisherAnalytics,
  getPayoutHistory,
} from "./services/publisher";

export {
  purchaseExtension,
  subscribeToExtension,
  cancelSubscription,
  processPayouts,
  getPurchase,
} from "./services/payments";
