import { Router, Request, Response } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requirePermission } from "../../middleware/require-permission";
import { Permission } from "../../auth/rbac";
import { validate, uuidParamSchema } from "../../middleware/validation.middleware";
import { arDepartmentService } from "../organization/ar-department.service";
import { logger } from "../../utils/logger";
import { z } from "zod";

const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createDepartmentSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  headPositionId: z.string().uuid().optional().nullable(),
  status: z.enum(["active", "inactive", "archived"]).optional().default("active"),
  metadata: z.record(z.unknown()).optional(),
});

const updateDepartmentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  headPositionId: z.string().uuid().optional().nullable(),
  status: z.enum(["active", "inactive", "archived"]).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const departmentFiltersSchema = z.object({
  status: z.enum(["active", "inactive", "archived"]).optional(),
  parentId: z.string().uuid().optional(),
  search: z.string().optional(),
});

const updateBudgetSchema = z.object({
  budgetCents: z.number().int().min(0),
});

const dateRangeSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

// =============================================================================
// CRUD ENDPOINTS
// =============================================================================

/**
 * @route   GET /api/ar/departments
 * @desc    List all departments for an organization
 * @access  Private - Requires AR_READ permission
 */
router.get(
  "/",
  requireAuth,
  requirePermission(Permission.AR_READ),
  validate({ query: departmentFiltersSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const filters = req.query as z.infer<typeof departmentFiltersSchema>;

      const departments = await arDepartmentService.findAll(organizationId, {
        status: filters.status as any,
        parentId: filters.parentId,
        search: filters.search,
      });

      return res.json({
        departments,
        total: departments.length,
      });
    } catch (error) {
      logger.error(
        "Failed to list departments",
        { organizationId: req.user?.organizationId },
        error instanceof Error ? error : new Error(String(error))
      );
      return res.status(500).json({ error: "Failed to list departments" });
    }
  }
);

/**
 * @route   POST /api/ar/departments
 * @desc    Create a new department
 * @access  Private - Requires AR_WRITE permission
 */
router.post(
  "/",
  requireAuth,
  requirePermission(Permission.AR_WRITE),
  validate({ body: createDepartmentSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const data = req.body as z.infer<typeof createDepartmentSchema>;

      const department = await arDepartmentService.create(organizationId, {
        name: data.name,
        description: data.description ?? undefined,
        parentId: data.parentId ?? undefined,
        headPositionId: data.headPositionId ?? undefined,
        status: data.status,
        metadata: data.metadata,
      });

      return res.status(201).json({ department });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        "Failed to create department",
        { organizationId: req.user?.organizationId },
        error instanceof Error ? error : new Error(String(error))
      );

      if (errorMessage.includes("not found") || errorMessage.includes("different organization")) {
        return res.status(400).json({ error: errorMessage });
      }
      if (errorMessage.includes("already exists")) {
        return res.status(409).json({ error: errorMessage });
      }

      return res.status(500).json({ error: "Failed to create department" });
    }
  }
);

/**
 * @route   GET /api/ar/departments/:id
 * @desc    Get a single department by ID
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

      const department = await arDepartmentService.findById(id);

      if (!department || department.organizationId !== organizationId) {
        return res.status(404).json({ error: "Department not found" });
      }

      return res.json({ department });
    } catch (error) {
      logger.error(
        "Failed to get department",
        { departmentId: req.params.id },
        error instanceof Error ? error : new Error(String(error))
      );
      return res.status(500).json({ error: "Failed to get department" });
    }
  }
);

/**
 * @route   PATCH /api/ar/departments/:id
 * @desc    Update a department
 * @access  Private - Requires AR_WRITE permission
 */
router.patch(
  "/:id",
  requireAuth,
  requirePermission(Permission.AR_WRITE),
  validate({ params: uuidParamSchema, body: updateDepartmentSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = String(req.params.id);
      const data = req.body as z.infer<typeof updateDepartmentSchema>;

      // Verify department belongs to organization
      const existing = await arDepartmentService.findById(id);
      if (!existing || existing.organizationId !== organizationId) {
        return res.status(404).json({ error: "Department not found" });
      }

      const department = await arDepartmentService.update(id, {
        name: data.name,
        description: data.description ?? undefined,
        parentId: data.parentId ?? undefined,
        headPositionId: data.headPositionId ?? undefined,
        status: data.status,
        metadata: data.metadata,
      });

      return res.json({ department });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        "Failed to update department",
        { departmentId: req.params.id },
        error instanceof Error ? error : new Error(String(error))
      );

      if (errorMessage.includes("circular") || errorMessage.includes("not found")) {
        return res.status(400).json({ error: errorMessage });
      }

      return res.status(500).json({ error: "Failed to update department" });
    }
  }
);

/**
 * @route   DELETE /api/ar/departments/:id
 * @desc    Delete (archive) a department
 * @access  Private - Requires AR_WRITE permission
 */
router.delete(
  "/:id",
  requireAuth,
  requirePermission(Permission.AR_WRITE),
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = String(req.params.id);

      // Verify department belongs to organization
      const existing = await arDepartmentService.findById(id);
      if (!existing || existing.organizationId !== organizationId) {
        return res.status(404).json({ error: "Department not found" });
      }

      await arDepartmentService.delete(id);

      return res.status(204).send();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        "Failed to delete department",
        { departmentId: req.params.id },
        error instanceof Error ? error : new Error(String(error))
      );

      if (errorMessage.includes("with children")) {
        return res.status(400).json({ error: errorMessage });
      }

      return res.status(500).json({ error: "Failed to delete department" });
    }
  }
);

// =============================================================================
// HIERARCHY ENDPOINTS
// =============================================================================

/**
 * @route   GET /api/ar/departments/:id/hierarchy
 * @desc    Get department hierarchy starting from this department
 * @access  Private - Requires AR_READ permission
 */
router.get(
  "/:id/hierarchy",
  requireAuth,
  requirePermission(Permission.AR_READ),
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = String(req.params.id);

      // Verify department belongs to organization
      const department = await arDepartmentService.findById(id);
      if (!department || department.organizationId !== organizationId) {
        return res.status(404).json({ error: "Department not found" });
      }

      // Get children hierarchy
      const children = await arDepartmentService.getChildren(id);
      const ancestors = await arDepartmentService.getAncestors(id);

      return res.json({
        department,
        children,
        ancestors,
      });
    } catch (error) {
      logger.error(
        "Failed to get department hierarchy",
        { departmentId: req.params.id },
        error instanceof Error ? error : new Error(String(error))
      );
      return res.status(500).json({ error: "Failed to get department hierarchy" });
    }
  }
);

/**
 * @route   GET /api/ar/departments/:id/costs
 * @desc    Get department costs for a date range
 * @access  Private - Requires AR_READ permission
 */
router.get(
  "/:id/costs",
  requireAuth,
  requirePermission(Permission.AR_READ),
  validate({ params: uuidParamSchema, query: dateRangeSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = String(req.params.id);
      const { startDate, endDate } = req.query as z.infer<typeof dateRangeSchema>;

      // Verify department belongs to organization
      const department = await arDepartmentService.findById(id);
      if (!department || department.organizationId !== organizationId) {
        return res.status(404).json({ error: "Department not found" });
      }

      const costs = await arDepartmentService.getDepartmentCosts(id, {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });

      return res.json({ costs });
    } catch (error) {
      logger.error(
        "Failed to get department costs",
        { departmentId: req.params.id },
        error instanceof Error ? error : new Error(String(error))
      );
      return res.status(500).json({ error: "Failed to get department costs" });
    }
  }
);

/**
 * @route   PATCH /api/ar/departments/:id/budget
 * @desc    Update department budget
 * @access  Private - Requires AR_WRITE permission
 */
router.patch(
  "/:id/budget",
  requireAuth,
  requirePermission(Permission.AR_WRITE),
  validate({ params: uuidParamSchema, body: updateBudgetSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = String(req.params.id);
      const { budgetCents } = req.body as z.infer<typeof updateBudgetSchema>;

      // Verify department belongs to organization
      const existing = await arDepartmentService.findById(id);
      if (!existing || existing.organizationId !== organizationId) {
        return res.status(404).json({ error: "Department not found" });
      }

      const department = await arDepartmentService.updateBudget(id, budgetCents);

      return res.json({ department });
    } catch (error) {
      logger.error(
        "Failed to update department budget",
        { departmentId: req.params.id },
        error instanceof Error ? error : new Error(String(error))
      );
      return res.status(500).json({ error: "Failed to update department budget" });
    }
  }
);

export default router;
