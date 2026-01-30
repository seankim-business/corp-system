import { Router, Request, Response } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requirePermission } from "../../middleware/require-permission";
import { Permission } from "../../auth/rbac";
import { validate, uuidParamSchema } from "../../middleware/validation.middleware";
import { arPositionService } from "../organization/ar-position.service";
import { logger } from "../../utils/logger";
import { z } from "zod";
import { PositionLevel } from "../types";

const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createPositionSchema = z.object({
  departmentId: z.string().uuid(),
  title: z.string().min(1).max(255),
  level: z.number().int().min(1).max(5),
  reportsToId: z.string().uuid().optional().nullable(),
  requiredCapabilities: z.array(z.string()).optional().default([]),
  metadata: z.record(z.unknown()).optional(),
});

const updatePositionSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  level: z.number().int().min(1).max(5).optional(),
  reportsToId: z.string().uuid().optional().nullable(),
  requiredCapabilities: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const positionFiltersSchema = z.object({
  departmentId: z.string().uuid().optional(),
  level: z.coerce.number().int().min(1).max(5).optional(),
  reportsToId: z.string().uuid().optional(),
  hasVacancies: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

const changeReportingLineSchema = z.object({
  newReportsToId: z.string().uuid().nullable(),
});

// =============================================================================
// CRUD ENDPOINTS
// =============================================================================

/**
 * @route   GET /api/ar/positions
 * @desc    List all positions for an organization
 * @access  Private - Requires AR_READ permission
 */
router.get(
  "/",
  requireAuth,
  requirePermission(Permission.AR_READ),
  validate({ query: positionFiltersSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const filters = req.query as z.infer<typeof positionFiltersSchema>;

      const positions = await arPositionService.findAll(organizationId, {
        departmentId: filters.departmentId,
        level: filters.level as any,
        reportsToId: filters.reportsToId,
        hasVacancies: filters.hasVacancies,
        search: filters.search,
      });

      return res.json({
        positions,
        total: positions.length,
      });
    } catch (error) {
      logger.error(
        "Failed to list positions",
        { organizationId: req.user?.organizationId },
        error instanceof Error ? error : new Error(String(error))
      );
      return res.status(500).json({ error: "Failed to list positions" });
    }
  }
);

/**
 * @route   POST /api/ar/positions
 * @desc    Create a new position
 * @access  Private - Requires AR_WRITE permission
 */
router.post(
  "/",
  requireAuth,
  requirePermission(Permission.AR_WRITE),
  validate({ body: createPositionSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const data = req.body as z.infer<typeof createPositionSchema>;

      const position = await arPositionService.create(organizationId, {
        ...data,
        level: data.level as PositionLevel,
        reportsToId: data.reportsToId ?? undefined,
      }, userId);

      return res.status(201).json({ position });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        "Failed to create position",
        { organizationId: req.user?.organizationId },
        error instanceof Error ? error : new Error(String(error))
      );

      if (errorMessage.includes("not found") || errorMessage.includes("circular")) {
        return res.status(400).json({ error: errorMessage });
      }

      return res.status(500).json({ error: "Failed to create position" });
    }
  }
);

/**
 * @route   GET /api/ar/positions/:id
 * @desc    Get a single position by ID
 * @access  Private - Requires AR_READ permission
 */
router.get(
  "/:id",
  requireAuth,
  requirePermission(Permission.AR_READ),
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = String(req.params.id);

      const position = await arPositionService.findById(organizationId, id);

      if (!position) {
        return res.status(404).json({ error: "Position not found" });
      }

      return res.json({ position });
    } catch (error) {
      logger.error(
        "Failed to get position",
        { positionId: req.params.id },
        error instanceof Error ? error : new Error(String(error))
      );
      return res.status(500).json({ error: "Failed to get position" });
    }
  }
);

/**
 * @route   PATCH /api/ar/positions/:id
 * @desc    Update a position
 * @access  Private - Requires AR_WRITE permission
 */
router.patch(
  "/:id",
  requireAuth,
  requirePermission(Permission.AR_WRITE),
  validate({ params: uuidParamSchema, body: updatePositionSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const id = String(req.params.id);
      const data = req.body as z.infer<typeof updatePositionSchema>;

      const position = await arPositionService.update(organizationId, id, {
        ...data,
        level: data.level as any,
        reportsToId: data.reportsToId ?? undefined,
      }, userId);

      return res.json({ position });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        "Failed to update position",
        { positionId: req.params.id },
        error instanceof Error ? error : new Error(String(error))
      );

      if (errorMessage.includes("not found")) {
        return res.status(404).json({ error: errorMessage });
      }
      if (errorMessage.includes("circular")) {
        return res.status(400).json({ error: errorMessage });
      }

      return res.status(500).json({ error: "Failed to update position" });
    }
  }
);

/**
 * @route   DELETE /api/ar/positions/:id
 * @desc    Delete a position
 * @access  Private - Requires AR_WRITE permission
 */
router.delete(
  "/:id",
  requireAuth,
  requirePermission(Permission.AR_WRITE),
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const id = String(req.params.id);

      await arPositionService.delete(organizationId, id, userId);

      return res.status(204).send();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        "Failed to delete position",
        { positionId: req.params.id },
        error instanceof Error ? error : new Error(String(error))
      );

      if (errorMessage.includes("not found")) {
        return res.status(404).json({ error: errorMessage });
      }
      if (errorMessage.includes("active assignment") || errorMessage.includes("direct report")) {
        return res.status(400).json({ error: errorMessage });
      }

      return res.status(500).json({ error: "Failed to delete position" });
    }
  }
);

// =============================================================================
// HIERARCHY ENDPOINTS
// =============================================================================

/**
 * @route   GET /api/ar/positions/:id/reporting-chain
 * @desc    Get full reporting chain from position to top
 * @access  Private - Requires AR_READ permission
 */
router.get(
  "/:id/reporting-chain",
  requireAuth,
  requirePermission(Permission.AR_READ),
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = String(req.params.id);

      // Verify position exists
      const position = await arPositionService.findById(organizationId, id);
      if (!position) {
        return res.status(404).json({ error: "Position not found" });
      }

      const reportingChain = await arPositionService.getReportingChain(organizationId, id);

      return res.json({
        reportingChain,
        levels: reportingChain.length,
      });
    } catch (error) {
      logger.error(
        "Failed to get reporting chain",
        { positionId: req.params.id },
        error instanceof Error ? error : new Error(String(error))
      );
      return res.status(500).json({ error: "Failed to get reporting chain" });
    }
  }
);

/**
 * @route   GET /api/ar/positions/:id/direct-reports
 * @desc    Get all direct reports for a position
 * @access  Private - Requires AR_READ permission
 */
router.get(
  "/:id/direct-reports",
  requireAuth,
  requirePermission(Permission.AR_READ),
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = String(req.params.id);

      // Verify position exists
      const position = await arPositionService.findById(organizationId, id);
      if (!position) {
        return res.status(404).json({ error: "Position not found" });
      }

      const directReports = await arPositionService.getDirectReports(organizationId, id);

      return res.json({
        directReports,
        total: directReports.length,
      });
    } catch (error) {
      logger.error(
        "Failed to get direct reports",
        { positionId: req.params.id },
        error instanceof Error ? error : new Error(String(error))
      );
      return res.status(500).json({ error: "Failed to get direct reports" });
    }
  }
);

/**
 * @route   POST /api/ar/positions/:id/change-reporting-line
 * @desc    Change the reporting line for a position
 * @access  Private - Requires AR_WRITE permission
 */
router.post(
  "/:id/change-reporting-line",
  requireAuth,
  requirePermission(Permission.AR_WRITE),
  validate({ params: uuidParamSchema, body: changeReportingLineSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const id = String(req.params.id);
      const { newReportsToId } = req.body as z.infer<typeof changeReportingLineSchema>;

      const position = await arPositionService.changeReportingLine(
        organizationId,
        id,
        newReportsToId,
        userId
      );

      return res.json({ position });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        "Failed to change reporting line",
        { positionId: req.params.id },
        error instanceof Error ? error : new Error(String(error))
      );

      if (errorMessage.includes("not found")) {
        return res.status(404).json({ error: errorMessage });
      }
      if (errorMessage.includes("circular") || errorMessage.includes("itself")) {
        return res.status(400).json({ error: errorMessage });
      }

      return res.status(500).json({ error: "Failed to change reporting line" });
    }
  }
);

export default router;
