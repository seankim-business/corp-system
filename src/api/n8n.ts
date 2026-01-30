import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db as prismaDb } from "../db/client";
import { logger } from "../utils/logger";
import { n8nPermissionService } from "../services/n8n/permission-service";
import { workflowGeneratorService } from "../services/n8n/workflow-generator";
import type { GenerateOptions } from "../services/n8n/workflow-generator";
import { n8nSkillAdapter } from "../services/n8n/skill-adapter";
import { sopConverter } from "../services/n8n/sop-converter";
import type { N8nWorkflowInput } from "../services/n8n";

const router = Router();

const db = prismaDb as unknown as Record<string, any>;
const n8nInstance = db.n8nInstance;
const n8nWorkflow = db.n8nWorkflow;
const n8nExecution = db.n8nExecution;

const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.string().default("uncategorized"),
  tags: z.array(z.string()).default([]),
  workflowJson: z.object({
    name: z.string(),
    nodes: z.array(z.any()),
    connections: z.record(z.any()),
    settings: z.any().optional(),
  }),
  isActive: z.boolean().default(false),
});

const UpdateWorkflowSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  workflowJson: z
    .object({
      name: z.string(),
      nodes: z.array(z.any()),
      connections: z.record(z.any()),
      settings: z.any().optional(),
    })
    .optional(),
  isActive: z.boolean().optional(),
  isSkill: z.boolean().optional(),
});

const GenerateAiWorkflowSchema = z.object({
  prompt: z.string().min(1),
  category: z.string().optional(),
  availableCredentials: z.array(z.string()).optional(),
});

const ListWorkflowsQuerySchema = z.object({
  category: z.string().optional(),
  isActive: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  isSkill: z
    .string()
    .transform((v) => v === "true")
    .optional(),
  search: z.string().optional(),
  limit: z.string().transform(Number).default("50"),
  offset: z.string().transform(Number).default("0"),
});

const ExecuteSkillSchema = z.object({
  input: z.record(z.unknown()).optional(),
});

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || !req.user.organizationId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
};

const checkPermission = (permission: "view" | "execute" | "edit") => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const workflowId = String(req.params.id);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const hasPermission = await n8nPermissionService.checkPermission({
      userId,
      workflowId,
      permission,
    });

    if (!hasPermission) {
      return res.status(403).json({ error: "Permission denied" });
    }

    return next();
  };
};

async function getOrCreateInstance(organizationId: string) {
  let instance = await n8nInstance.findUnique({
    where: { organizationId },
  });

  if (!instance) {
    instance = await n8nInstance.create({
      data: {
        organizationId,
        containerUrl: `https://placeholder.workflows.nubabel.com`,
        apiKey: "placeholder",
        encryptionKey: "placeholder",
        webhookBaseUrl: `https://placeholder.workflows.nubabel.com/webhook`,
        status: "active",
        config: {},
      },
    });
  }

  return instance;
}

router.get("/workflows", requireAuth, async (req: Request, res: Response) => {
  try {
    const query = ListWorkflowsQuerySchema.parse(req.query);
    const organizationId = req.currentOrganizationId!;
    const userId = req.user!.id;

    const workflows = await n8nPermissionService.getAccessibleWorkflows(
      userId,
      organizationId,
      "view",
    );

    let filtered = workflows;

    if (query.category) {
      filtered = filtered.filter((w: any) => w.category === query.category);
    }

    if (query.isActive !== undefined) {
      filtered = filtered.filter((w: any) => w.isActive === query.isActive);
    }

    if (query.isSkill !== undefined) {
      filtered = filtered.filter((w: any) => w.isSkill === query.isSkill);
    }

    if (query.search) {
      const search = query.search.toLowerCase();
      filtered = filtered.filter(
        (w: any) =>
          w.name.toLowerCase().includes(search) || w.description?.toLowerCase().includes(search),
      );
    }

    const total = filtered.length;
    const paginated = filtered.slice(query.offset, query.offset + query.limit);

    return res.json({
      data: paginated,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
      },
    });
  } catch (error) {
    logger.error("Failed to list workflows", { error });
    return res.status(500).json({ error: "Failed to list workflows" });
  }
});

router.post("/workflows", requireAuth, async (req: Request, res: Response) => {
  try {
    const data = CreateWorkflowSchema.parse(req.body);
    const organizationId = req.currentOrganizationId!;

    const instance = await getOrCreateInstance(organizationId);

    const n8nWorkflowId = `nubabel_${Date.now()}`;

    const workflow = await n8nWorkflow.create({
      data: {
        organizationId,
        instanceId: instance.id,
        n8nWorkflowId,
        name: data.name,
        description: data.description,
        category: data.category,
        tags: data.tags,
        workflowJson: data.workflowJson,
        isActive: data.isActive,
        isSkill: false,
      },
    });

    await n8nPermissionService.setupDefaultPermissions(workflow.id);

    logger.info("Workflow created", { workflowId: workflow.id, organizationId });

    return res.status(201).json(workflow);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    logger.error("Failed to create workflow", { error });
    return res.status(500).json({ error: "Failed to create workflow" });
  }
});

// POST /api/n8n/generate - Generate workflow from natural language
router.post("/generate", requireAuth, async (req: Request, res: Response) => {
  try {
    const data = GenerateAiWorkflowSchema.parse(req.body);
    const workflow = await workflowGeneratorService.generateWorkflow(data.prompt, {
      category: data.category,
    });

    return res.json({
      success: true,
      workflow,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    logger.error("Failed to generate workflow", { error });
    return res.status(500).json({ error: "Failed to generate workflow" });
  }
});

router.get(
  "/workflows/:id",
  requireAuth,
  checkPermission("view"),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const workflow = await n8nWorkflow.findUnique({
        where: { id },
        include: {
          _count: {
            select: { executions: true, permissions: true },
          },
        },
      });

      if (!workflow) {
        return res.status(404).json({ error: "Workflow not found" });
      }

      return res.json(workflow);
    } catch (error) {
      logger.error("Failed to get workflow", { error });
      return res.status(500).json({ error: "Failed to get workflow" });
    }
  },
);

router.put(
  "/workflows/:id",
  requireAuth,
  checkPermission("edit"),
  async (req: Request, res: Response) => {
    try {
      const data = UpdateWorkflowSchema.parse(req.body);
      const id = String(req.params.id);

      const workflow = await n8nWorkflow.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });

      logger.info("Workflow updated", { workflowId: workflow.id });

      return res.json(workflow);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      logger.error("Failed to update workflow", { error });
      return res.status(500).json({ error: "Failed to update workflow" });
    }
  },
);

router.delete(
  "/workflows/:id",
  requireAuth,
  checkPermission("edit"),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      await n8nWorkflow.delete({
        where: { id },
      });

      logger.info("Workflow deleted", { workflowId: id });

      return res.status(204).send();
    } catch (error) {
      logger.error("Failed to delete workflow", { error });
      return res.status(500).json({ error: "Failed to delete workflow" });
    }
  },
);

router.post(
  "/workflows/:id/activate",
  requireAuth,
  checkPermission("edit"),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const workflow = await n8nWorkflow.update({
        where: { id },
        data: { isActive: true },
      });

      return res.json(workflow);
    } catch (error) {
      logger.error("Failed to activate workflow", { error });
      return res.status(500).json({ error: "Failed to activate workflow" });
    }
  },
);

router.post(
  "/workflows/:id/deactivate",
  requireAuth,
  checkPermission("edit"),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const workflow = await n8nWorkflow.update({
        where: { id },
        data: { isActive: false },
      });

      return res.json(workflow);
    } catch (error) {
      logger.error("Failed to deactivate workflow", { error });
      return res.status(500).json({ error: "Failed to deactivate workflow" });
    }
  },
);

router.post(
  "/workflows/:id/register-skill",
  requireAuth,
  checkPermission("edit"),
  async (req: Request, res: Response) => {
    try {
      const workflowId = String(req.params.id);
      const registered = await n8nSkillAdapter.registerAsSkill(workflowId);

      if (!registered) {
        return res.status(400).json({ error: "Failed to register workflow as skill" });
      }

      return res.json({ success: true });
    } catch (error) {
      logger.error("Failed to register workflow as skill", { error });
      return res.status(500).json({ error: "Failed to register workflow as skill" });
    }
  },
);

router.delete(
  "/workflows/:id/register-skill",
  requireAuth,
  checkPermission("edit"),
  async (req: Request, res: Response) => {
    try {
      const workflowId = String(req.params.id);
      const unregistered = await n8nSkillAdapter.unregisterSkill(workflowId);

      if (!unregistered) {
        return res.status(400).json({ error: "Failed to unregister workflow as skill" });
      }

      return res.json({ success: true });
    } catch (error) {
      logger.error("Failed to unregister workflow as skill", { error });
      return res.status(500).json({ error: "Failed to unregister workflow as skill" });
    }
  },
);

router.get("/skills", requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.currentOrganizationId!;
    const skills = await n8nSkillAdapter.getSkillWorkflows(organizationId);
    return res.json(skills);
  } catch (error) {
    logger.error("Failed to list skills", { error });
    return res.status(500).json({ error: "Failed to list skills" });
  }
});

router.post(
  "/skills/:id/execute",
  requireAuth,
  checkPermission("execute"),
  async (req: Request, res: Response) => {
    try {
      const workflowId = String(req.params.id);
      const data = ExecuteSkillSchema.parse(req.body ?? {});
      const input = data.input ?? {};

      const result = await n8nSkillAdapter.executeSkill(workflowId, input);

      if (!result.success) {
        return res.status(400).json({ error: result.error || "Skill execution failed" });
      }

      return res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation error", details: error.errors });
      }
      logger.error("Failed to execute skill", { error });
      return res.status(500).json({ error: "Failed to execute skill" });
    }
  },
);

router.post(
  "/workflows/:id/execute",
  requireAuth,
  checkPermission("execute"),
  async (req: Request, res: Response) => {
    try {
      const workflowId = String(req.params.id);
      const inputData = req.body.inputData || {};
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const execution = await n8nExecution.create({
        data: {
          workflowId,
          n8nExecutionId: `exec_${Date.now()}`,
          status: "waiting",
          mode: "manual",
          startedAt: new Date(),
          inputData,
          triggeredBy: userId,
        },
      });

      setTimeout(async () => {
        await n8nExecution.update({
          where: { id: execution.id },
          data: {
            status: "success",
            completedAt: new Date(),
            outputData: { result: "Simulated execution completed" },
          },
        });
      }, 2000);

      logger.info("Workflow execution started", {
        workflowId,
        executionId: execution.id,
      });

      return res.status(202).json(execution);
    } catch (error) {
      logger.error("Failed to execute workflow", { error });
      return res.status(500).json({ error: "Failed to execute workflow" });
    }
  },
);

router.get(
  "/workflows/:id/executions",
  requireAuth,
  checkPermission("view"),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const executions = await n8nExecution.findMany({
        where: { workflowId: id },
        orderBy: { startedAt: "desc" },
        take: 50,
      });

      return res.json(executions);
    } catch (error) {
      logger.error("Failed to get executions", { error });
      return res.status(500).json({ error: "Failed to get executions" });
    }
  },
);

router.get("/categories", requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const categories = await n8nWorkflow.groupBy({
      by: ["category"],
      where: { organizationId },
      _count: { category: true },
    });

    return res.json(
      categories.map((c: any) => ({
        name: c.category,
        count: c._count.category,
      })),
    );
  } catch (error) {
    logger.error("Failed to get categories", { error });
    return res.status(500).json({ error: "Failed to get categories" });
  }
});

router.get(
  "/workflows/:id/permissions",
  requireAuth,
  checkPermission("edit"),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const permissions = await n8nPermissionService.getWorkflowPermissions(id);
      return res.json(permissions);
    } catch (error) {
      logger.error("Failed to get permissions", { error });
      return res.status(500).json({ error: "Failed to get permissions" });
    }
  },
);

router.post(
  "/workflows/:id/permissions",
  requireAuth,
  checkPermission("edit"),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const { agentId, roleId, canView, canExecute, canEdit } = req.body;

      await n8nPermissionService.grantPermission({
        workflowId: id,
        agentId,
        roleId,
        canView,
        canExecute,
        canEdit,
      });

      return res.status(201).json({ success: true });
    } catch (error) {
      logger.error("Failed to grant permission", { error });
      return res.status(500).json({ error: "Failed to grant permission" });
    }
  },
);

router.delete(
  "/workflows/:id/permissions",
  requireAuth,
  checkPermission("edit"),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const { agentId, roleId } = req.body;

      await n8nPermissionService.revokePermission(id, {
        agentId,
        roleId,
      });

      return res.status(204).send();
    } catch (error) {
      logger.error("Failed to revoke permission", { error });
      return res.status(500).json({ error: "Failed to revoke permission" });
    }
  },
);

// Workflow Generation Schemas
const GenerateWorkflowSchema = z.object({
  prompt: z.string().min(1),
  options: z
    .object({
      category: z.string().optional(),
      complexity: z.enum(["simple", "medium", "complex"]).optional(),
      preferredNodes: z.array(z.string()).optional(),
      maxNodes: z.number().optional(),
    })
    .optional(),
});

const RefineWorkflowSchema = z.object({
  workflowJson: z.object({
    name: z.string(),
    nodes: z.array(z.any()),
    connections: z.record(z.any()),
    settings: z.any().optional(),
  }),
  feedback: z.string().min(1),
});

const SuggestNodesSchema = z.object({
  description: z.string().min(1),
});

// POST /api/n8n/workflows/generate - Generate workflow from natural language
router.post("/workflows/generate", requireAuth, async (req: Request, res: Response) => {
  try {
    const data = GenerateWorkflowSchema.parse(req.body);
    const options: GenerateOptions | undefined = data.options;

    const workflow = await workflowGeneratorService.generateWorkflow(data.prompt, options);

    logger.info("Workflow generated via API", {
      name: workflow.name,
      nodeCount: workflow.nodes.length,
      userId: req.user?.id,
    });

    return res.json(workflow);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    logger.error("Failed to generate workflow", { error });
    return res.status(500).json({ error: "Failed to generate workflow" });
  }
});

// POST /api/n8n/workflows/refine - Refine existing workflow with feedback
router.post("/workflows/refine", requireAuth, async (req: Request, res: Response) => {
  try {
    const data = RefineWorkflowSchema.parse(req.body);

    const workflow = await workflowGeneratorService.refineWorkflow(
      data.workflowJson,
      data.feedback,
    );

    logger.info("Workflow refined via API", {
      name: workflow.name,
      nodeCount: workflow.nodes.length,
      userId: req.user?.id,
    });

    return res.json(workflow);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    logger.error("Failed to refine workflow", { error });
    return res.status(500).json({ error: "Failed to refine workflow" });
  }
});

// POST /api/n8n/workflows/suggest-nodes - Suggest n8n nodes for a use case
router.post("/workflows/suggest-nodes", requireAuth, async (req: Request, res: Response) => {
  try {
    const data = SuggestNodesSchema.parse(req.body);

    const suggestions = await workflowGeneratorService.suggestNodes(data.description);

    return res.json(suggestions);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    logger.error("Failed to suggest nodes", { error });
    return res.status(500).json({ error: "Failed to suggest nodes" });
  }
});

// POST /api/n8n/workflows/validate - Validate workflow JSON structure
router.post("/workflows/validate", requireAuth, async (req: Request, res: Response) => {
  try {
    const workflowJson = req.body;

    const result = workflowGeneratorService.validateGeneratedWorkflow(workflowJson);

    return res.json(result);
  } catch (error) {
    logger.error("Failed to validate workflow", { error });
    return res.status(500).json({ error: "Failed to validate workflow" });
  }
});

// ============================================================================
// SOP ↔ n8n Workflow Converter Endpoints
// ============================================================================

// SOP Step Schema
const SOPStepSchema = z.object({
  id: z.string(),
  order: z.number(),
  title: z.string(),
  description: z.string(),
  type: z.enum(["action", "approval", "notification", "condition"]),
  config: z
    .object({
      tool: z.string().optional(),
      action: z.string().optional(),
      approvers: z.array(z.string()).optional(),
      notifyChannels: z.array(z.string()).optional(),
      condition: z.string().optional(),
    })
    .optional(),
});

// SOP to Workflow Schema
const SOPToWorkflowSchema = z.object({
  steps: z.array(SOPStepSchema),
  workflowName: z.string().min(1),
});

// Workflow to SOP Schema
const WorkflowToSOPSchema = z.object({
  workflow: z.object({
    name: z.string(),
    nodes: z.array(z.any()),
    connections: z.record(z.any()),
    settings: z.any().optional(),
  }),
});

// POST /api/n8n/convert/sop-to-workflow - Convert SOP steps to n8n workflow
router.post("/convert/sop-to-workflow", requireAuth, async (req: Request, res: Response) => {
  try {
    const data = SOPToWorkflowSchema.parse(req.body);

    const workflow = sopConverter.sopToN8n(data.steps, data.workflowName);

    logger.info("SOP converted to workflow", {
      workflowName: data.workflowName,
      stepCount: data.steps.length,
      nodeCount: workflow.nodes.length,
      userId: req.user?.id,
    });

    return res.json({
      success: true,
      workflow,
      metadata: {
        originalStepCount: data.steps.length,
        generatedNodeCount: workflow.nodes.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    logger.error("Failed to convert SOP to workflow", { error });
    return res.status(500).json({ error: "Failed to convert SOP to workflow" });
  }
});

// POST /api/n8n/convert/workflow-to-sop - Convert n8n workflow to SOP steps
router.post("/convert/workflow-to-sop", requireAuth, async (req: Request, res: Response) => {
  try {
    const data = WorkflowToSOPSchema.parse(req.body);

    const steps = sopConverter.n8nToSop(data.workflow as N8nWorkflowInput);

    logger.info("Workflow converted to SOP", {
      workflowName: data.workflow.name,
      nodeCount: data.workflow.nodes.length,
      stepCount: steps.length,
      userId: req.user?.id,
    });

    return res.json({
      success: true,
      steps,
      metadata: {
        workflowName: data.workflow.name,
        originalNodeCount: data.workflow.nodes.length,
        generatedStepCount: steps.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    logger.error("Failed to convert workflow to SOP", { error });
    return res.status(500).json({ error: "Failed to convert workflow to SOP" });
  }
});

export default router;
