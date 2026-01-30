import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../db/client";
import { logger } from "../utils/logger";
import { n8nPermissionService } from "../services/n8n/permission-service";

const router = Router();

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
  let instance = await db.n8nInstance.findUnique({
    where: { organizationId },
  });

  if (!instance) {
    instance = await db.n8nInstance.create({
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

    const workflow = await db.n8nWorkflow.create({
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

router.get(
  "/workflows/:id",
  requireAuth,
  checkPermission("view"),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const workflow = await db.n8nWorkflow.findUnique({
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

      const workflow = await db.n8nWorkflow.update({
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
      await db.n8nWorkflow.delete({
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
      const workflow = await db.n8nWorkflow.update({
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
      const workflow = await db.n8nWorkflow.update({
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

      const execution = await db.n8nExecution.create({
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
        await db.n8nExecution.update({
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
      const executions = await db.n8nExecution.findMany({
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

    const categories = await db.n8nWorkflow.groupBy({
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

export default router;
