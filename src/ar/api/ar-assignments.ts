import { Router, Request, Response } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requirePermission } from "../../middleware/require-permission";
import { Permission } from "../../auth/rbac";
import { validate, uuidParamSchema } from "../../middleware/validation.middleware";
import { arAssignmentService, AssignmentFilters } from "../organization/ar-assignment.service";
import { logger } from "../../utils/logger";
import { z } from "zod";

const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createAssignmentSchema = z.object({
  agentId: z.string().uuid(),
  positionId: z.string().uuid(),
  humanSupervisor: z.string().uuid().optional(),
  assignmentType: z.enum(["permanent", "temporary", "acting"]).optional().default("permanent"),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.enum(["active", "on_leave", "suspended", "terminated"]).optional().default("active"),
  performanceScore: z.number().min(0).max(100).optional(),
  workload: z.number().min(0).max(1).optional().default(1.0),
  metadata: z.record(z.unknown()).optional(),
});

const updateAssignmentSchema = z.object({
  humanSupervisor: z.string().uuid().optional(),
  assignmentType: z.enum(["permanent", "temporary", "acting"]).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.enum(["active", "on_leave", "suspended", "terminated"]).optional(),
  performanceScore: z.number().min(0).max(100).optional(),
  workload: z.number().min(0).max(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const assignmentFiltersSchema = z.object({
  status: z.enum(["active", "on_leave", "suspended", "terminated"]).optional(),
  assignmentType: z.enum(["permanent", "temporary", "acting"]).optional(),
  agentId: z.string().uuid().optional(),
  positionId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  humanSupervisor: z.string().uuid().optional(),
});

const reassignSchema = z.object({
  newPositionId: z.string().uuid(),
});

const updateStatusSchema = z.object({
  status: z.enum(["active", "on_leave", "suspended", "terminated"]),
});

const terminateSchema = z.object({
  reason: z.string().optional(),
});

// =============================================================================
// CRUD ENDPOINTS
// =============================================================================

/**
 * @route   GET /api/ar/assignments
 * @desc    List all assignments for an organization
 * @access  Private - Requires AR_READ permission
 */
router.get(
  "/",
  requireAuth,
  requirePermission(Permission.AR_READ),
  validate({ query: assignmentFiltersSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const filters = req.query as z.infer<typeof assignmentFiltersSchema>;

      const assignments = await arAssignmentService.findAll(organizationId, filters as AssignmentFilters);

      return res.json({
        assignments,
        total: assignments.length,
      });
    } catch (error) {
      logger.error(
        "Failed to list assignments",
        { organizationId: req.user?.organizationId },
        error instanceof Error ? error : new Error(String(error))
      );
      return res.status(500).json({ error: "Failed to list assignments" });
    }
  }
);

/**
 * @route   POST /api/ar/assignments
 * @desc    Create a new assignment
 * @access  Private - Requires AR_WRITE permission
 */
router.post(
  "/",
  requireAuth,
  requirePermission(Permission.AR_WRITE),
  validate({ body: createAssignmentSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const data = req.body as z.infer<typeof createAssignmentSchema>;

      const assignment = await arAssignmentService.create({
        organizationId,
        agentId: data.agentId,
        positionId: data.positionId,
        humanSupervisor: data.humanSupervisor,
        assignmentType: data.assignmentType,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        status: data.status,
        performanceScore: data.performanceScore,
        workload: data.workload,
        metadata: data.metadata,
      });

      return res.status(201).json({ assignment });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        "Failed to create assignment",
        { organizationId: req.user?.organizationId },
        error instanceof Error ? error : new Error(String(error))
      );

      if (
        errorMessage.includes("not found") ||
        errorMessage.includes("capacity") ||
        errorMessage.includes("not active") ||
        errorMessage.includes("already assigned")
      ) {
        return res.status(400).json({ error: errorMessage });
      }

      return res.status(500).json({ error: "Failed to create assignment" });
    }
  }
);

/**
 * @route   GET /api/ar/assignments/:id
 * @desc    Get a single assignment by ID
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
      const { id } = req.params;

      const assignment = await arAssignmentService.findById(id as string);

      if (!assignment || assignment.organizationId !== organizationId) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      return res.json({ assignment });
    } catch (error) {
      logger.error(
        "Failed to get assignment",
        { assignmentId: req.params.id },
        error instanceof Error ? error : new Error(String(error))
      );
      return res.status(500).json({ error: "Failed to get assignment" });
    }
  }
);

/**
 * @route   PATCH /api/ar/assignments/:id
 * @desc    Update an assignment
 * @access  Private - Requires AR_WRITE permission
 */
router.patch(
  "/:id",
  requireAuth,
  requirePermission(Permission.AR_WRITE),
  validate({ params: uuidParamSchema, body: updateAssignmentSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const data = req.body as z.infer<typeof updateAssignmentSchema>;

      // Verify assignment belongs to organization
      const existing = await arAssignmentService.findById(id as string);
      if (!existing || existing.organizationId !== organizationId) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      const assignment = await arAssignmentService.update(id as string, {
        humanSupervisor: data.humanSupervisor,
        assignmentType: data.assignmentType,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        status: data.status,
        performanceScore: data.performanceScore,
        workload: data.workload,
        metadata: data.metadata,
      });

      return res.json({ assignment });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        "Failed to update assignment",
        { assignmentId: req.params.id },
        error instanceof Error ? error : new Error(String(error))
      );

      if (errorMessage.includes("not found") || errorMessage.includes("capacity")) {
        return res.status(400).json({ error: errorMessage });
      }

      return res.status(500).json({ error: "Failed to update assignment" });
    }
  }
);

/**
 * @route   DELETE /api/ar/assignments/:id
 * @desc    Terminate an assignment
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
      const { id } = req.params;

      // Verify assignment belongs to organization
      const existing = await arAssignmentService.findById(id as string);
      if (!existing || existing.organizationId !== organizationId) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      await arAssignmentService.terminate(id as string, "Terminated via API");

      return res.status(204).send();
    } catch (error) {
      logger.error(
        "Failed to delete assignment",
        { assignmentId: req.params.id },
        error instanceof Error ? error : new Error(String(error))
      );
      return res.status(500).json({ error: "Failed to delete assignment" });
    }
  }
);

// =============================================================================
// ASSIGNMENT OPERATIONS
// =============================================================================

/**
 * @route   POST /api/ar/assignments/:id/reassign
 * @desc    Reassign an agent to a new position
 * @access  Private - Requires AR_WRITE permission
 */
router.post(
  "/:id/reassign",
  requireAuth,
  requirePermission(Permission.AR_WRITE),
  validate({ params: uuidParamSchema, body: reassignSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const { newPositionId } = req.body as z.infer<typeof reassignSchema>;

      // Verify assignment belongs to organization
      const existing = await arAssignmentService.findById(id as string);
      if (!existing || existing.organizationId !== organizationId) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      const assignment = await arAssignmentService.reassignAgent(id as string, newPositionId);

      return res.json({ assignment });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        "Failed to reassign agent",
        { assignmentId: req.params.id },
        error instanceof Error ? error : new Error(String(error))
      );

      if (errorMessage.includes("not found") || errorMessage.includes("capacity")) {
        return res.status(400).json({ error: errorMessage });
      }

      return res.status(500).json({ error: "Failed to reassign agent" });
    }
  }
);

/**
 * @route   PATCH /api/ar/assignments/:id/status
 * @desc    Update assignment status
 * @access  Private - Requires AR_WRITE permission
 */
router.patch(
  "/:id/status",
  requireAuth,
  requirePermission(Permission.AR_WRITE),
  validate({ params: uuidParamSchema, body: updateStatusSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const { status } = req.body as z.infer<typeof updateStatusSchema>;

      // Verify assignment belongs to organization
      const existing = await arAssignmentService.findById(id as string);
      if (!existing || existing.organizationId !== organizationId) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      const assignment = await arAssignmentService.updateStatus(id as string, status);

      return res.json({ assignment });
    } catch (error) {
      logger.error(
        "Failed to update assignment status",
        { assignmentId: req.params.id },
        error instanceof Error ? error : new Error(String(error))
      );
      return res.status(500).json({ error: "Failed to update assignment status" });
    }
  }
);

/**
 * @route   POST /api/ar/assignments/:id/terminate
 * @desc    Terminate an assignment with reason
 * @access  Private - Requires AR_WRITE permission
 */
router.post(
  "/:id/terminate",
  requireAuth,
  requirePermission(Permission.AR_WRITE),
  validate({ params: uuidParamSchema, body: terminateSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { id } = req.params;
      const { reason } = req.body as z.infer<typeof terminateSchema>;

      // Verify assignment belongs to organization
      const existing = await arAssignmentService.findById(id as string);
      if (!existing || existing.organizationId !== organizationId) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      const assignment = await arAssignmentService.terminate(id as string, reason);

      return res.json({ assignment });
    } catch (error) {
      logger.error(
        "Failed to terminate assignment",
        { assignmentId: req.params.id },
        error instanceof Error ? error : new Error(String(error))
      );
      return res.status(500).json({ error: "Failed to terminate assignment" });
    }
  }
);

export default router;
