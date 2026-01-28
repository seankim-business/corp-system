/**
 * SOP Generator API Routes
 *
 * Endpoints for generating Standard Operating Procedures from workflows
 */

import { Router, Request, Response } from "express";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { validate, uuidParamSchema } from "../middleware/validation.middleware";
import { generateSOP, validateSOP } from "../services/sop-generator";

const router = Router();

router.post(
  "/workflows/:id/generate-sop",
  requireAuth,
  requirePermission(Permission.WORKFLOW_READ),
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const workflowId = String(req.params.id);

      const workflow = await prisma.workflow.findFirst({
        where: { id: workflowId, organizationId },
      });

      if (!workflow) {
        return res.status(404).json({ error: "Workflow not found" });
      }

      const sop = generateSOP(workflowId, workflow.description || "", workflow.name);

      const validationErrors = validateSOP(sop);
      if (validationErrors.length > 0) {
        return res.status(400).json({
          error: "Generated SOP validation failed",
          details: validationErrors,
        });
      }

      return res.json({
        sop,
        message: "SOP generated successfully",
      });
    } catch (error) {
      console.error("Generate SOP error:", error);
      return res.status(500).json({ error: "Failed to generate SOP" });
    }
  },
);

export default router;
