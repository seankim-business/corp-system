import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { validate } from "../middleware/validation.middleware";
import {
  loadSOPs,
  getSOPById,
  clearSOPCache,
  validateSOPDefinition,
  SOPDefinition,
} from "../config/sop-loader";
import { logger } from "../utils/logger";
import { z } from "zod";

const router = Router();

const SOPS_DIR = path.resolve(__dirname, "../../config/sops");

// Schema for creating/updating SOP
const sopEditorSchema = z.object({
  metadata: z.object({
    id: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    function: z.string().min(1),
    owner: z.string().min(1),
    version: z.string().default("1.0.0"),
  }),
  triggers: z.array(z.object({ pattern: z.string().min(1) })).min(1),
  steps: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        type: z.enum(["automated", "manual", "approval_required"]),
        agent: z.string().optional(),
        tool: z.string().optional(),
        input: z.record(z.unknown()).optional(),
        output: z.record(z.unknown()).optional(),
        timeout: z.string().optional(),
        requires_approval: z.boolean().optional(),
        approver: z.string().optional(),
        assignee: z.string().optional(),
        checklist: z.array(z.string()).optional(),
        conditional: z.object({ when: z.string() }).optional(),
        required_approvals: z.array(z.string()).optional(),
      }),
    )
    .min(1),
  exception_handling: z
    .array(
      z.object({
        condition: z.string(),
        action: z.enum([
          "notify_owner",
          "escalate",
          "retry_with_modification",
          "send_reminder",
          "request_revision",
          "halt_and_escalate",
          "return_to_step",
          "page_executive",
          "escalate_and_retry",
          "auto_update",
        ]),
        target: z.string().optional(),
        step: z.string().optional(),
        message: z.string().optional(),
        notify: z.string().optional(),
        when: z.string().optional(),
        max_retries: z.number().optional(),
      }),
    )
    .optional(),
});

const sopIdParamSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
});

// GET /api/sops - List all SOPs
router.get(
  "/",
  requireAuth,
  requirePermission(Permission.WORKFLOW_READ),
  async (_req: Request, res: Response) => {
    try {
      const sops = loadSOPs();

      const sopList = sops.map((sop) => ({
        id: sop.metadata.id,
        name: sop.metadata.name,
        function: sop.metadata.function,
        owner: sop.metadata.owner,
        version: sop.metadata.version,
        stepCount: sop.steps.length,
        triggerCount: sop.triggers.length,
      }));

      return res.json({ sops: sopList });
    } catch (error) {
      logger.error(
        "List SOPs error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to list SOPs" });
    }
  },
);

// GET /api/sops/:id - Get single SOP (parsed to JSON)
router.get(
  "/:id",
  requireAuth,
  requirePermission(Permission.WORKFLOW_READ),
  validate({ params: sopIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const sop = getSOPById(id);

      if (!sop) {
        return res.status(404).json({ error: "SOP not found" });
      }

      return res.json({ sop });
    } catch (error) {
      logger.error("Get SOP error", {}, error instanceof Error ? error : new Error(String(error)));
      return res.status(500).json({ error: "Failed to get SOP" });
    }
  },
);

// POST /api/sops - Create new SOP
router.post(
  "/",
  requireAuth,
  requirePermission(Permission.WORKFLOW_CREATE),
  validate({ body: sopEditorSchema }),
  async (req: Request, res: Response) => {
    try {
      const sopData = req.body;

      // Check if SOP already exists
      const existingSop = getSOPById(sopData.metadata.id);
      if (existingSop) {
        return res.status(409).json({ error: "SOP with this ID already exists" });
      }

      // Convert to full SOP format
      const fullSop: SOPDefinition = {
        schema_version: "1.0",
        kind: "SOP",
        metadata: sopData.metadata,
        triggers: sopData.triggers,
        steps: sopData.steps,
        exception_handling: sopData.exception_handling || [],
      };

      // Validate against schema
      validateSOPDefinition(fullSop);

      // Convert to YAML
      const yamlContent = yaml.dump(fullSop, {
        indent: 2,
        lineWidth: -1,
        quotingType: '"',
        forceQuotes: false,
      });

      // Ensure directory exists
      if (!fs.existsSync(SOPS_DIR)) {
        fs.mkdirSync(SOPS_DIR, { recursive: true });
      }

      // Write file
      const filePath = path.join(SOPS_DIR, `${sopData.metadata.id}.yaml`);
      fs.writeFileSync(filePath, yamlContent, "utf8");

      // Clear cache to reload
      clearSOPCache();

      logger.info("Created SOP", { sopId: sopData.metadata.id, userId: req.user!.id });

      return res.status(201).json({
        sop: fullSop,
        message: "SOP created successfully",
      });
    } catch (error) {
      logger.error(
        "Create SOP error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to create SOP",
      });
    }
  },
);

// PUT /api/sops/:id - Update existing SOP
router.put(
  "/:id",
  requireAuth,
  requirePermission(Permission.WORKFLOW_UPDATE),
  validate({ params: sopIdParamSchema, body: sopEditorSchema }),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const sopData = req.body;

      // Check if SOP exists
      const existingSop = getSOPById(id);
      if (!existingSop) {
        return res.status(404).json({ error: "SOP not found" });
      }

      // Ensure metadata.id matches route id
      if (sopData.metadata.id !== id) {
        return res.status(400).json({ error: "SOP ID in body must match route ID" });
      }

      // Convert to full SOP format
      const fullSop: SOPDefinition = {
        schema_version: "1.0",
        kind: "SOP",
        metadata: sopData.metadata,
        triggers: sopData.triggers,
        steps: sopData.steps,
        exception_handling: sopData.exception_handling || [],
      };

      // Validate against schema
      validateSOPDefinition(fullSop);

      // Convert to YAML
      const yamlContent = yaml.dump(fullSop, {
        indent: 2,
        lineWidth: -1,
        quotingType: '"',
        forceQuotes: false,
      });

      // Write file
      const filePath = path.join(SOPS_DIR, `${id}.yaml`);
      fs.writeFileSync(filePath, yamlContent, "utf8");

      // Clear cache to reload
      clearSOPCache();

      logger.info("Updated SOP", { sopId: id, userId: req.user!.id });

      return res.json({
        sop: fullSop,
        message: "SOP updated successfully",
      });
    } catch (error) {
      logger.error(
        "Update SOP error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to update SOP",
      });
    }
  },
);

// DELETE /api/sops/:id - Delete SOP
router.delete(
  "/:id",
  requireAuth,
  requirePermission(Permission.WORKFLOW_DELETE),
  validate({ params: sopIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);

      // Check if SOP exists
      const existingSop = getSOPById(id);
      if (!existingSop) {
        return res.status(404).json({ error: "SOP not found" });
      }

      // Delete file
      const filePath = path.join(SOPS_DIR, `${id}.yaml`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Clear cache to reload
      clearSOPCache();

      logger.info("Deleted SOP", { sopId: id, userId: req.user!.id });

      return res.json({ message: "SOP deleted successfully" });
    } catch (error) {
      logger.error(
        "Delete SOP error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to delete SOP" });
    }
  },
);

// POST /api/sops/:id/simulate - Dry-run SOP execution
router.post(
  "/:id/simulate",
  requireAuth,
  requirePermission(Permission.WORKFLOW_READ),
  validate({ params: sopIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const inputData = req.body.input || {};

      const sop = getSOPById(id);
      if (!sop) {
        return res.status(404).json({ error: "SOP not found" });
      }

      // Simulate execution - generate step-by-step preview
      const simulation = {
        sopId: sop.metadata.id,
        sopName: sop.metadata.name,
        inputData,
        steps: sop.steps.map((step, index) => {
          // Resolve template variables for preview
          const resolvedInput = step.input
            ? resolveTemplateVariables(step.input, inputData)
            : undefined;

          // Check conditional
          let willExecute = true;
          let skipReason: string | undefined;

          if (step.conditional?.when) {
            const result = evaluateCondition(step.conditional.when, inputData);
            willExecute = result;
            if (!result) {
              skipReason = `Condition not met: ${step.conditional.when}`;
            }
          }

          return {
            index,
            id: step.id,
            name: step.name,
            description: step.description,
            type: step.type,
            willExecute,
            skipReason,
            estimatedDuration: estimateStepDuration(step),
            resolvedInput,
            ...(step.agent && { agent: step.agent }),
            ...(step.tool && { tool: step.tool }),
            ...(step.approver && { approver: step.approver }),
            ...(step.assignee && { assignee: step.assignee }),
            ...(step.checklist && { checklist: step.checklist }),
          };
        }),
        totalSteps: sop.steps.length,
        estimatedTotalDuration: sop.steps.reduce(
          (sum, step) => sum + estimateStepDuration(step),
          0,
        ),
        exceptionHandlers: sop.exception_handling || [],
      };

      return res.json({ simulation });
    } catch (error) {
      logger.error(
        "Simulate SOP error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to simulate SOP" });
    }
  },
);

// GET /api/sops/:id/yaml - Get raw YAML content
router.get(
  "/:id/yaml",
  requireAuth,
  requirePermission(Permission.WORKFLOW_READ),
  validate({ params: sopIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);

      const filePath = path.join(SOPS_DIR, `${id}.yaml`);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "SOP not found" });
      }

      const yamlContent = fs.readFileSync(filePath, "utf8");
      return res.type("text/yaml").send(yamlContent);
    } catch (error) {
      logger.error(
        "Get SOP YAML error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to get SOP YAML" });
    }
  },
);

// Helper functions
function resolveTemplateVariables(
  obj: Record<string, unknown>,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = value.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
        const keys = path.trim().split(".");
        let current: unknown = data;
        for (const k of keys) {
          if (current && typeof current === "object" && k in current) {
            current = (current as Record<string, unknown>)[k];
          } else {
            return `{{${path}}}`;
          }
        }
        return String(current);
      });
    } else if (typeof value === "object" && value !== null) {
      result[key] = resolveTemplateVariables(value as Record<string, unknown>, data);
    } else {
      result[key] = value;
    }
  }

  return result;
}

function evaluateCondition(condition: string, data: Record<string, unknown>): boolean {
  // Simple condition evaluation for simulation
  // Supports: {{variable}} >= number, {{variable}} == "value", etc.
  try {
    const resolved = condition.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
      const keys = path.trim().split(".");
      let current: unknown = data;
      for (const k of keys) {
        if (current && typeof current === "object" && k in current) {
          current = (current as Record<string, unknown>)[k];
        } else {
          return "undefined";
        }
      }
      return typeof current === "string" ? `"${current}"` : String(current);
    });

    // Basic evaluation (safe subset)
    if (resolved.includes(">=")) {
      const [left, right] = resolved.split(">=").map((s) => s.trim());
      return Number(left) >= Number(right);
    }
    if (resolved.includes("<=")) {
      const [left, right] = resolved.split("<=").map((s) => s.trim());
      return Number(left) <= Number(right);
    }
    if (resolved.includes("==")) {
      const [left, right] = resolved.split("==").map((s) => s.trim());
      return left === right;
    }
    if (resolved.includes(">")) {
      const [left, right] = resolved.split(">").map((s) => s.trim());
      return Number(left) > Number(right);
    }
    if (resolved.includes("<")) {
      const [left, right] = resolved.split("<").map((s) => s.trim());
      return Number(left) < Number(right);
    }

    return true;
  } catch {
    return true;
  }
}

function estimateStepDuration(step: { type: string; timeout?: string }): number {
  // Return estimated duration in minutes
  if (step.timeout) {
    const match = step.timeout.match(/^(\d+)(m|h|d)$/);
    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2];
      switch (unit) {
        case "m":
          return value;
        case "h":
          return value * 60;
        case "d":
          return value * 60 * 24;
      }
    }
  }

  // Default estimates by type
  switch (step.type) {
    case "automated":
      return 2;
    case "manual":
      return 30;
    case "approval_required":
      return 60;
    default:
      return 15;
  }
}

export default router;
