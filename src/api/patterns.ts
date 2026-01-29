/**
 * Pattern Detection API Routes
 * Routes for pattern detection and SOP draft management
 */

import { Router } from "express";
import { z } from "zod";
import { authenticate, requireAdmin } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import { patternDetector } from "../services/pattern-detector";
import { logger } from "../utils/logger";

const router = Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const analyzeBodySchema = z.object({
  lookbackDays: z.number().int().min(1).max(365).default(30),
  minSupport: z.number().int().min(1).optional(),
  generateDrafts: z.boolean().default(false),
});

const patternFilterQuerySchema = z.object({
  type: z.enum(["sequence", "cluster", "time"]).optional(),
  status: z.enum(["active", "dismissed", "converted"]).optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const uuidParamSchema = z.object({
  id: z.string().uuid(),
});

const sopDraftFilterQuerySchema = z.object({
  status: z.enum(["draft", "pending_review", "approved", "rejected"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const rejectBodySchema = z.object({
  reason: z.string().min(1).max(1000),
});

type PatternFilterQuery = z.infer<typeof patternFilterQuerySchema>;
type SOPDraftFilterQuery = z.infer<typeof sopDraftFilterQuerySchema>;

// ============================================================================
// PATTERN ROUTES
// ============================================================================

/**
 * List detected patterns
 */
router.get("/patterns", authenticate, validate({ query: patternFilterQuerySchema }), async (req, res) => {
  try {
    const { organizationId } = req.user!;
    const query = req.query as unknown as PatternFilterQuery;

    const patterns = await patternDetector.getPatterns(organizationId, {
      type: query.type,
      status: query.status,
      minConfidence: query.minConfidence,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    });

    return res.json({ patterns });
  } catch (error) {
    logger.error(
      "Failed to list patterns",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to list patterns" });
  }
});

/**
 * Get a single pattern by ID
 */
router.get("/patterns/:id", authenticate, validate({ params: uuidParamSchema }), async (req, res) => {
  try {
    const id = req.params.id as string;
    const pattern = await patternDetector.getPattern(id);

    if (!pattern) {
      return res.status(404).json({ error: "Pattern not found" });
    }

    // Verify organization access
    if (pattern.organizationId !== req.user!.organizationId) {
      return res.status(403).json({ error: "Access denied" });
    }

    return res.json({ pattern });
  } catch (error) {
    logger.error(
      "Failed to get pattern",
      { patternId: req.params.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to get pattern" });
  }
});

/**
 * Dismiss a pattern (won't be suggested again)
 */
router.post("/patterns/:id/dismiss", authenticate, validate({ params: uuidParamSchema }), async (req, res) => {
  try {
    const id = req.params.id as string;
    const pattern = await patternDetector.getPattern(id);

    if (!pattern) {
      return res.status(404).json({ error: "Pattern not found" });
    }

    if (pattern.organizationId !== req.user!.organizationId) {
      return res.status(403).json({ error: "Access denied" });
    }

    await patternDetector.dismissPattern(id);

    return res.json({ success: true });
  } catch (error) {
    logger.error(
      "Failed to dismiss pattern",
      { patternId: req.params.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to dismiss pattern" });
  }
});

/**
 * List sequence patterns (filtered view)
 */
router.get("/patterns/sequences", authenticate, validate({ query: patternFilterQuerySchema }), async (req, res) => {
  try {
    const { organizationId } = req.user!;
    const query = req.query as unknown as PatternFilterQuery;

    const patterns = await patternDetector.getPatterns(organizationId, {
      type: "sequence",
      status: query.status,
      minConfidence: query.minConfidence,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    });

    return res.json({ patterns });
  } catch (error) {
    logger.error(
      "Failed to list sequence patterns",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to list sequence patterns" });
  }
});

/**
 * List request clusters (filtered view)
 */
router.get("/patterns/clusters", authenticate, validate({ query: patternFilterQuerySchema }), async (req, res) => {
  try {
    const { organizationId } = req.user!;
    const query = req.query as unknown as PatternFilterQuery;

    const patterns = await patternDetector.getPatterns(organizationId, {
      type: "cluster",
      status: query.status,
      minConfidence: query.minConfidence,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    });

    return res.json({ patterns });
  } catch (error) {
    logger.error(
      "Failed to list cluster patterns",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to list cluster patterns" });
  }
});

/**
 * List time patterns (filtered view)
 */
router.get("/patterns/time", authenticate, validate({ query: patternFilterQuerySchema }), async (req, res) => {
  try {
    const { organizationId } = req.user!;
    const query = req.query as unknown as PatternFilterQuery;

    const patterns = await patternDetector.getPatterns(organizationId, {
      type: "time",
      status: query.status,
      minConfidence: query.minConfidence,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    });

    return res.json({ patterns });
  } catch (error) {
    logger.error(
      "Failed to list time patterns",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to list time patterns" });
  }
});

/**
 * Generate SOP from pattern
 */
router.post("/patterns/:id/generate-sop", authenticate, validate({ params: uuidParamSchema }), async (req, res) => {
  try {
    const id = req.params.id as string;
    const { organizationId } = req.user!;

    const pattern = await patternDetector.getPattern(id);

    if (!pattern) {
      return res.status(404).json({ error: "Pattern not found" });
    }

    if (pattern.organizationId !== organizationId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const draft = await patternDetector.generateSOPFromPattern(id, organizationId);

    return res.status(201).json({ draft });
  } catch (error) {
    logger.error(
      "Failed to generate SOP from pattern",
      { patternId: req.params.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to generate SOP from pattern" });
  }
});

/**
 * Trigger pattern analysis
 */
router.post("/patterns/analyze", authenticate, requireAdmin, validate({ body: analyzeBodySchema }), async (req, res) => {
  try {
    const { organizationId } = req.user!;
    const { lookbackDays, minSupport, generateDrafts } = req.body;

    const result = await patternDetector.analyze(organizationId, {
      lookbackDays,
      minSupport,
      generateDrafts,
    });

    return res.status(200).json({ result });
  } catch (error) {
    logger.error(
      "Failed to analyze patterns",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to analyze patterns" });
  }
});

// ============================================================================
// SOP DRAFT ROUTES
// ============================================================================

/**
 * List SOP drafts
 */
router.get("/sop-drafts", authenticate, validate({ query: sopDraftFilterQuerySchema }), async (req, res) => {
  try {
    const { organizationId } = req.user!;
    const query = req.query as unknown as SOPDraftFilterQuery;

    const drafts = await patternDetector.getSOPDrafts(organizationId, {
      status: query.status,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    });

    return res.json({ drafts });
  } catch (error) {
    logger.error(
      "Failed to list SOP drafts",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to list SOP drafts" });
  }
});

/**
 * Get a single SOP draft by ID
 */
router.get("/sop-drafts/:id", authenticate, validate({ params: uuidParamSchema }), async (req, res) => {
  try {
    const id = req.params.id as string;
    const draft = await patternDetector.getSOPDraft(id);

    if (!draft) {
      return res.status(404).json({ error: "SOP draft not found" });
    }

    if (draft.organizationId !== req.user!.organizationId) {
      return res.status(403).json({ error: "Access denied" });
    }

    return res.json({ draft });
  } catch (error) {
    logger.error(
      "Failed to get SOP draft",
      { draftId: req.params.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to get SOP draft" });
  }
});

/**
 * Get SOP draft as YAML
 */
router.get("/sop-drafts/:id/yaml", authenticate, validate({ params: uuidParamSchema }), async (req, res) => {
  try {
    const id = req.params.id as string;
    const draft = await patternDetector.getSOPDraft(id);

    if (!draft) {
      return res.status(404).json({ error: "SOP draft not found" });
    }

    if (draft.organizationId !== req.user!.organizationId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const yaml = patternDetector.convertToYAML(draft);

    res.setHeader("Content-Type", "text/yaml");
    res.setHeader("Content-Disposition", `attachment; filename="${draft.name}.yaml"`);
    return res.send(yaml);
  } catch (error) {
    logger.error(
      "Failed to get SOP draft as YAML",
      { draftId: req.params.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to get SOP draft as YAML" });
  }
});

/**
 * Approve SOP draft
 */
router.post("/sop-drafts/:id/approve", authenticate, requireAdmin, validate({ params: uuidParamSchema }), async (req, res) => {
  try {
    const id = req.params.id as string;
    const { id: userId, organizationId } = req.user!;

    const draft = await patternDetector.getSOPDraft(id);

    if (!draft) {
      return res.status(404).json({ error: "SOP draft not found" });
    }

    if (draft.organizationId !== organizationId) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (draft.status !== "pending_review" && draft.status !== "draft") {
      return res.status(400).json({ error: `Cannot approve draft in ${draft.status} status` });
    }

    await patternDetector.approveSOPDraft(id, userId);

    return res.json({ success: true });
  } catch (error) {
    logger.error(
      "Failed to approve SOP draft",
      { draftId: req.params.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to approve SOP draft" });
  }
});

/**
 * Reject SOP draft
 */
router.post("/sop-drafts/:id/reject", authenticate, requireAdmin, validate({ params: uuidParamSchema, body: rejectBodySchema }), async (req, res) => {
  try {
    const id = req.params.id as string;
    const { reason } = req.body;
    const { id: userId, organizationId } = req.user!;

    const draft = await patternDetector.getSOPDraft(id);

    if (!draft) {
      return res.status(404).json({ error: "SOP draft not found" });
    }

    if (draft.organizationId !== organizationId) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (draft.status !== "pending_review" && draft.status !== "draft") {
      return res.status(400).json({ error: `Cannot reject draft in ${draft.status} status` });
    }

    await patternDetector.rejectSOPDraft(id, userId, reason);

    return res.json({ success: true });
  } catch (error) {
    logger.error(
      "Failed to reject SOP draft",
      { draftId: req.params.id },
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to reject SOP draft" });
  }
});

export default router;
