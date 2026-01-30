import "../../types/express.d.ts";
import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware";
import { requirePermission } from "../../middleware/require-permission";
import { Permission } from "../../auth/rbac";
import { validate } from "../../middleware/validation.middleware";
import { logger } from "../../utils/logger";

import * as catalogService from "../services/catalog";
import * as searchService from "../services/search";
import * as reviewsService from "../services/reviews";
import * as downloadsService from "../services/downloads";
import * as publisherService from "../services/publisher";
import * as paymentsService from "../services/payments";

const router = Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const listExtensionsSchema = z.object({
  category: z.string().optional(),
  tags: z.string().optional(), // comma-separated
  pricing: z.enum(["free", "paid", "freemium"]).optional(),
  sort: z.enum(["popular", "recent", "rating", "trending"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const searchSchema = z.object({
  q: z.string().min(1),
  category: z.string().optional(),
  tags: z.string().optional(),
  pricing: z.enum(["free", "paid", "freemium"]).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const slugParamSchema = z.object({
  slug: z.string().min(1),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().min(1).max(255),
  body: z.string().min(10).max(5000),
});

const updateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().min(1).max(255).optional(),
  body: z.string().min(10).max(5000).optional(),
});

const publisherRegistrationSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/),
  email: z.string().email(),
  website: z.string().url().optional(),
  description: z.string().max(1000).optional(),
});

const extensionSubmissionSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z.string().min(2).max(255).regex(/^[a-z0-9-]+$/),
  description: z.string().min(10).max(500),
  longDescription: z.string().min(50).max(10000),
  category: z.string().min(1),
  tags: z.array(z.string()).max(10).default([]),
  pricing: z.enum(["free", "paid", "freemium"]),
  priceAmount: z.number().int().positive().optional(),
  priceCurrency: z.string().length(3).optional(),
  priceInterval: z.enum(["month", "year", "once"]).optional(),
  icon: z.string().url().optional(),
  screenshots: z.array(z.string().url()).max(10).optional(),
  demoUrl: z.string().url().optional(),
  repositoryUrl: z.string().url().optional(),
  documentationUrl: z.string().url().optional(),
  packageUrl: z.string().url(),
  manifest: z.record(z.unknown()),
});

const purchaseSchema = z.object({
  paymentMethodId: z.string().min(1),
});

const subscribeSchema = z.object({
  plan: z.enum(["monthly", "yearly"]),
  paymentMethodId: z.string().min(1),
});

const respondToReviewSchema = z.object({
  response: z.string().min(10).max(2000),
});

// ============================================================================
// PUBLIC ROUTES (no auth required)
// ============================================================================

// List extensions
router.get(
  "/extensions",
  validate({ query: listExtensionsSchema }),
  async (req: Request, res: Response) => {
    try {
      const { category, tags, pricing, sort, page, limit } = req.query as any;

      const result = await catalogService.listExtensions({
        category,
        tags: tags ? String(tags).split(",") : undefined,
        pricing,
        sort,
        page,
        limit,
      });

      return res.json(result);
    } catch (error) {
      logger.error("List extensions error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Failed to list extensions" });
    }
  },
);

// Get extension by slug
router.get(
  "/extensions/:slug",
  validate({ params: slugParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      const extension = await catalogService.getExtension(String(slug));

      if (!extension) {
        return res.status(404).json({ error: "Extension not found" });
      }

      return res.json({ extension });
    } catch (error) {
      logger.error("Get extension error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Failed to get extension" });
    }
  },
);

// Search extensions
router.get(
  "/search",
  validate({ query: searchSchema }),
  async (req: Request, res: Response) => {
    try {
      const { q, category, tags, pricing, minRating, page, limit } = req.query as any;

      const result = await searchService.searchExtensions(
        q,
        {
          category,
          tags: tags ? String(tags).split(",") : undefined,
          pricing,
          minRating,
        },
        { page, limit },
      );

      return res.json(result);
    } catch (error) {
      logger.error("Search extensions error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Search failed" });
    }
  },
);

// Autocomplete suggestions
router.get("/suggest", async (req: Request, res: Response) => {
  try {
    const prefix = String(req.query.q || "");
    const suggestions = await searchService.suggestExtensions(prefix);
    return res.json({ suggestions });
  } catch (error) {
    logger.error("Suggest error", {}, error instanceof Error ? error : new Error(String(error)));
    return res.status(500).json({ error: "Suggestions failed" });
  }
});

// List categories
router.get("/categories", async (_req: Request, res: Response) => {
  try {
    const categories = await catalogService.getCategories();
    return res.json({ categories });
  } catch (error) {
    logger.error("List categories error", {}, error instanceof Error ? error : new Error(String(error)));
    return res.status(500).json({ error: "Failed to list categories" });
  }
});

// Get featured extensions
router.get("/featured", async (_req: Request, res: Response) => {
  try {
    const extensions = await catalogService.getFeaturedExtensions();
    return res.json({ extensions });
  } catch (error) {
    logger.error("Get featured error", {}, error instanceof Error ? error : new Error(String(error)));
    return res.status(500).json({ error: "Failed to get featured extensions" });
  }
});

// Get extension reviews (public)
router.get(
  "/extensions/:slug/reviews",
  validate({ params: slugParamSchema, query: paginationSchema }),
  async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      const { page, limit } = req.query as any;
      const sort = (req.query.sort as string) || "recent";

      const extension = await catalogService.getExtension(String(slug));
      if (!extension) {
        return res.status(404).json({ error: "Extension not found" });
      }

      const [reviews, summary] = await Promise.all([
        reviewsService.listReviews(extension.id, { sort: sort as any, page, limit }),
        reviewsService.getRatingSummary(extension.id),
      ]);

      return res.json({ reviews, summary });
    } catch (error) {
      logger.error("Get reviews error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Failed to get reviews" });
    }
  },
);

// Get similar extensions
router.get(
  "/extensions/:slug/similar",
  validate({ params: slugParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      const extension = await catalogService.getExtension(String(slug));

      if (!extension) {
        return res.status(404).json({ error: "Extension not found" });
      }

      const similar = await searchService.findSimilarExtensions(extension.id);
      return res.json({ extensions: similar });
    } catch (error) {
      logger.error("Get similar error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Failed to get similar extensions" });
    }
  },
);

// Get extension versions
router.get(
  "/extensions/:slug/versions",
  validate({ params: slugParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      const extension = await catalogService.getExtension(String(slug));

      if (!extension) {
        return res.status(404).json({ error: "Extension not found" });
      }

      const versions = await catalogService.getExtensionVersions(extension.id);
      return res.json({ versions });
    } catch (error) {
      logger.error("Get versions error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Failed to get versions" });
    }
  },
);

// Get publisher profile (public)
router.get("/publishers/:slug", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const publisher = await publisherService.getPublisher(String(slug));

    if (!publisher) {
      return res.status(404).json({ error: "Publisher not found" });
    }

    const extensions = await publisherService.getPublisherExtensions(publisher.id);

    return res.json({
      publisher,
      extensions: extensions.filter((e) => e.status === "published"),
    });
  } catch (error) {
    logger.error("Get publisher error", {}, error instanceof Error ? error : new Error(String(error)));
    return res.status(500).json({ error: "Failed to get publisher" });
  }
});

// ============================================================================
// AUTHENTICATED ROUTES
// ============================================================================

// Get recommended extensions for org
router.get(
  "/recommended",
  requireAuth,
  requirePermission(Permission.WORKFLOW_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const extensions = await catalogService.getRecommendedExtensions(organizationId);
      return res.json({ extensions });
    } catch (error) {
      logger.error("Get recommended error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Failed to get recommendations" });
    }
  },
);

// Install extension
router.post(
  "/extensions/:id/install",
  requireAuth,
  requirePermission(Permission.INTEGRATION_MANAGE),
  validate({ params: idParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { organizationId, id: userId } = req.user!;
      const { versionId } = req.body;

      const install = await downloadsService.installExtension(
        String(id),
        organizationId,
        userId,
        versionId,
      );

      return res.status(201).json({ install });
    } catch (error) {
      logger.error("Install extension error", {}, error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error ? error.message : "Install failed";
      return res.status(400).json({ error: message });
    }
  },
);

// Uninstall extension
router.post(
  "/extensions/:id/uninstall",
  requireAuth,
  requirePermission(Permission.INTEGRATION_MANAGE),
  validate({ params: idParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { organizationId, id: userId } = req.user!;

      await downloadsService.uninstallExtension(String(id), organizationId, userId);

      return res.json({ success: true });
    } catch (error) {
      logger.error("Uninstall extension error", {}, error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error ? error.message : "Uninstall failed";
      return res.status(400).json({ error: message });
    }
  },
);

// Get installed extensions
router.get(
  "/installed",
  requireAuth,
  requirePermission(Permission.INTEGRATION_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const installed = await downloadsService.getInstalledExtensions(organizationId);
      return res.json({ installed });
    } catch (error) {
      logger.error("Get installed error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Failed to get installed extensions" });
    }
  },
);

// Create review
router.post(
  "/extensions/:id/reviews",
  requireAuth,
  requirePermission(Permission.WORKFLOW_READ),
  validate({ params: idParamSchema, body: createReviewSchema }),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { organizationId, id: userId, displayName, email } = req.user!;
      const { rating, title, body } = req.body;

      const review = await reviewsService.createReview(
        String(id),
        userId,
        displayName || email?.split("@")[0] || "Anonymous",
        organizationId,
        { rating, title, body },
      );

      return res.status(201).json({ review });
    } catch (error) {
      logger.error("Create review error", {}, error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error ? error.message : "Failed to create review";
      return res.status(400).json({ error: message });
    }
  },
);

// Update review
router.put(
  "/reviews/:id",
  requireAuth,
  validate({ params: idParamSchema, body: updateReviewSchema }),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { id: userId } = req.user!;

      const review = await reviewsService.updateReview(String(id), userId, req.body);

      return res.json({ review });
    } catch (error) {
      logger.error("Update review error", {}, error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error ? error.message : "Failed to update review";
      return res.status(400).json({ error: message });
    }
  },
);

// Delete review
router.delete(
  "/reviews/:id",
  requireAuth,
  validate({ params: idParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { id: userId } = req.user!;

      await reviewsService.deleteReview(String(id), userId);

      return res.json({ success: true });
    } catch (error) {
      logger.error("Delete review error", {}, error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error ? error.message : "Failed to delete review";
      return res.status(400).json({ error: message });
    }
  },
);

// Vote review helpful
router.post(
  "/reviews/:id/helpful",
  requireAuth,
  validate({ params: idParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { id: userId } = req.user!;

      await reviewsService.voteHelpful(String(id), userId);

      return res.json({ success: true });
    } catch (error) {
      logger.error("Vote helpful error", {}, error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error ? error.message : "Vote failed";
      return res.status(400).json({ error: message });
    }
  },
);

// Purchase extension
router.post(
  "/extensions/:id/purchase",
  requireAuth,
  requirePermission(Permission.BILLING_MANAGE),
  validate({ params: idParamSchema, body: purchaseSchema }),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { organizationId, id: userId } = req.user!;
      const { paymentMethodId } = req.body;

      const result = await paymentsService.purchaseExtension(
        organizationId,
        String(id),
        userId,
        paymentMethodId,
      );

      if (result.status === "failed") {
        return res.status(400).json({ error: result.error });
      }

      return res.json(result);
    } catch (error) {
      logger.error("Purchase error", {}, error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error ? error.message : "Purchase failed";
      return res.status(400).json({ error: message });
    }
  },
);

// Subscribe to extension
router.post(
  "/extensions/:id/subscribe",
  requireAuth,
  requirePermission(Permission.BILLING_MANAGE),
  validate({ params: idParamSchema, body: subscribeSchema }),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { organizationId, id: userId } = req.user!;
      const { plan, paymentMethodId } = req.body;

      const result = await paymentsService.subscribeToExtension(
        organizationId,
        String(id),
        userId,
        plan,
        paymentMethodId,
      );

      if (result.status === "failed") {
        return res.status(400).json({ error: result.error });
      }

      return res.json(result);
    } catch (error) {
      logger.error("Subscribe error", {}, error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error ? error.message : "Subscription failed";
      return res.status(400).json({ error: message });
    }
  },
);

// Cancel subscription
router.post(
  "/purchases/:id/cancel",
  requireAuth,
  requirePermission(Permission.BILLING_MANAGE),
  validate({ params: idParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { id: userId } = req.user!;

      await paymentsService.cancelSubscription(String(id), userId);

      return res.json({ success: true });
    } catch (error) {
      logger.error("Cancel subscription error", {}, error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error ? error.message : "Cancellation failed";
      return res.status(400).json({ error: message });
    }
  },
);

// Get organization purchases
router.get(
  "/purchases",
  requireAuth,
  // Note: Permission.BILLING_READ is already available but permission check omitted until marketplace is fully implemented
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const purchases = await paymentsService.getOrganizationPurchases(organizationId);
      return res.json({ purchases });
    } catch (error) {
      logger.error("Get purchases error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Failed to get purchases" });
    }
  },
);

// ============================================================================
// PUBLISHER ROUTES
// ============================================================================

// Register as publisher
router.post(
  "/publishers/register",
  requireAuth,
  validate({ body: publisherRegistrationSchema }),
  async (req: Request, res: Response) => {
    try {
      const { id: userId } = req.user!;

      const publisher = await publisherService.registerPublisher(userId, req.body);

      return res.status(201).json({ publisher });
    } catch (error) {
      logger.error("Register publisher error", {}, error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error ? error.message : "Registration failed";
      return res.status(400).json({ error: message });
    }
  },
);

// Get my publisher profile
router.get(
  "/publishers/me",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id: userId } = req.user!;

      const publisher = await publisherService.getPublisherByUserId(userId);

      if (!publisher) {
        return res.status(404).json({ error: "Not registered as publisher" });
      }

      return res.json({ publisher });
    } catch (error) {
      logger.error("Get my publisher error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Failed to get publisher profile" });
    }
  },
);

// Submit extension
router.post(
  "/publishers/extensions",
  requireAuth,
  validate({ body: extensionSubmissionSchema }),
  async (req: Request, res: Response) => {
    try {
      const { id: userId } = req.user!;

      const publisher = await publisherService.getPublisherByUserId(userId);
      if (!publisher) {
        return res.status(403).json({ error: "Must be registered as publisher" });
      }

      const { packageUrl, manifest, ...submission } = req.body;

      const result = await publisherService.submitExtension(
        publisher.id,
        submission,
        packageUrl,
        manifest,
      );

      return res.status(201).json(result);
    } catch (error) {
      logger.error("Submit extension error", {}, error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error ? error.message : "Submission failed";
      return res.status(400).json({ error: message });
    }
  },
);

// Get my extensions
router.get(
  "/publishers/me/extensions",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id: userId } = req.user!;

      const publisher = await publisherService.getPublisherByUserId(userId);
      if (!publisher) {
        return res.status(403).json({ error: "Must be registered as publisher" });
      }

      const extensions = await publisherService.getPublisherExtensions(publisher.id);

      return res.json({ extensions });
    } catch (error) {
      logger.error("Get my extensions error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Failed to get extensions" });
    }
  },
);

// Get publisher analytics
router.get(
  "/publishers/me/analytics",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id: userId } = req.user!;
      const period = (req.query.period as string) || "30d";

      const publisher = await publisherService.getPublisherByUserId(userId);
      if (!publisher) {
        return res.status(403).json({ error: "Must be registered as publisher" });
      }

      const analytics = await publisherService.getPublisherAnalytics(
        publisher.id,
        period as any,
      );

      return res.json({ analytics });
    } catch (error) {
      logger.error("Get analytics error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Failed to get analytics" });
    }
  },
);

// Get payout history
router.get(
  "/publishers/me/payouts",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id: userId } = req.user!;

      const publisher = await publisherService.getPublisherByUserId(userId);
      if (!publisher) {
        return res.status(403).json({ error: "Must be registered as publisher" });
      }

      const payouts = await publisherService.getPayoutHistory(publisher.id);

      return res.json({ payouts });
    } catch (error) {
      logger.error("Get payouts error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Failed to get payouts" });
    }
  },
);

// Respond to review
router.post(
  "/reviews/:id/respond",
  requireAuth,
  validate({ params: idParamSchema, body: respondToReviewSchema }),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { id: userId } = req.user!;
      const { response } = req.body;

      const publisher = await publisherService.getPublisherByUserId(userId);
      if (!publisher) {
        return res.status(403).json({ error: "Must be registered as publisher" });
      }

      await reviewsService.respondToReview(String(id), publisher.id, response);

      return res.json({ success: true });
    } catch (error) {
      logger.error("Respond to review error", {}, error instanceof Error ? error : new Error(String(error)));
      const message = error instanceof Error ? error.message : "Response failed";
      return res.status(400).json({ error: message });
    }
  },
);

export default router;
