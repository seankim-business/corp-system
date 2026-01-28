/**
 * Workflow API Routes
 *
 * 기획:
 * - 워크플로우 CRUD API
 * - 워크플로우 실행 API
 * - 실행 이력 조회 API
 * - Multi-tenant: organizationId로 필터링
 *
 * 엔드포인트:
 * - GET    /api/workflows
 * - POST   /api/workflows
 * - GET    /api/workflows/:id
 * - PUT    /api/workflows/:id
 * - DELETE /api/workflows/:id
 * - POST   /api/workflows/:id/execute
 * - GET    /api/workflows/:id/executions
 * - GET    /api/executions/:id
 */

import { Router, Request, Response } from "express";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { executeNotionTool } from "../mcp-servers/notion";
import { executeLinearTool } from "../mcp-servers/linear";
import { executeGitHubTool } from "../mcp-servers/github";
import { MCPConnection } from "../orchestrator/types";
import {
  validate,
  uuidParamSchema,
  createWorkflowSchema,
  updateWorkflowSchema,
  executeWorkflowSchema,
  CreateWorkflowInput,
  UpdateWorkflowInput,
  ExecuteWorkflowInput,
} from "../middleware/validation.middleware";

const router = Router();

router.get(
  "/workflows",
  requireAuth,
  requirePermission(Permission.WORKFLOW_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;

      const workflows = await prisma.workflow.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
      });

      return res.json({ workflows });
    } catch (error) {
      console.error("List workflows error:", error);
      return res.status(500).json({ error: "Failed to fetch workflows" });
    }
  },
);

router.post(
  "/workflows",
  requireAuth,
  requirePermission(Permission.WORKFLOW_CREATE),
  validate({ body: createWorkflowSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { name, description, config, enabled } = req.body as CreateWorkflowInput;

      const workflow = await prisma.workflow.create({
        data: {
          organizationId,
          name,
          description: description || null,
          config: (config || {}) as object,
          enabled,
        },
      });

      return res.status(201).json({ workflow });
    } catch (error) {
      console.error("Create workflow error:", error);
      return res.status(500).json({ error: "Failed to create workflow" });
    }
  },
);

router.get(
  "/workflows/:id",
  requireAuth,
  requirePermission(Permission.WORKFLOW_READ),
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = String(req.params.id);

      const workflow = await prisma.workflow.findFirst({
        where: { id, organizationId },
        include: {
          executions: {
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      });

      if (!workflow) {
        return res.status(404).json({ error: "Workflow not found" });
      }

      return res.json({ workflow });
    } catch (error) {
      console.error("Get workflow error:", error);
      return res.status(500).json({ error: "Failed to fetch workflow" });
    }
  },
);

router.put(
  "/workflows/:id",
  requireAuth,
  requirePermission(Permission.WORKFLOW_UPDATE),
  validate({ params: uuidParamSchema, body: updateWorkflowSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = String(req.params.id);
      const { name, description, config, enabled } = req.body as UpdateWorkflowInput;

      const existing = await prisma.workflow.findFirst({
        where: { id, organizationId },
      });

      if (!existing) {
        return res.status(404).json({ error: "Workflow not found" });
      }

      const workflow = await prisma.workflow.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(config !== undefined && { config: config as object }),
          ...(enabled !== undefined && { enabled }),
        },
      });

      return res.json({ workflow });
    } catch (error) {
      console.error("Update workflow error:", error);
      return res.status(500).json({ error: "Failed to update workflow" });
    }
  },
);

router.delete(
  "/workflows/:id",
  requireAuth,
  requirePermission(Permission.WORKFLOW_DELETE),
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = String(req.params.id);

      const existing = await prisma.workflow.findFirst({
        where: { id, organizationId },
      });

      if (!existing) {
        return res.status(404).json({ error: "Workflow not found" });
      }

      await prisma.workflow.delete({
        where: { id },
      });

      return res.json({ success: true });
    } catch (error) {
      console.error("Delete workflow error:", error);
      return res.status(500).json({ error: "Failed to delete workflow" });
    }
  },
);

router.post(
  "/workflows/:id/execute",
  requireAuth,
  requirePermission(Permission.WORKFLOW_EXECUTE),
  validate({ params: uuidParamSchema, body: executeWorkflowSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = String(req.params.id);
      const { inputData } = req.body as ExecuteWorkflowInput;

      const workflow = await prisma.workflow.findFirst({
        where: { id, organizationId, enabled: true },
      });

      if (!workflow) {
        return res.status(404).json({ error: "Workflow not found or disabled" });
      }

      const execution = await prisma.workflowExecution.create({
        data: {
          workflowId: id,
          status: "pending",
          inputData: inputData ? (inputData as object) : undefined,
          startedAt: new Date(),
        },
      });

      setTimeout(async () => {
        try {
          await prisma.workflowExecution.update({
            where: { id: execution.id },
            data: {
              status: "running",
            },
          });

          const config = workflow.config as any;
          const steps = config.steps || [];
          let finalOutputData: any = { message: "Workflow executed successfully" };

          if (steps.length > 0) {
            const [notionConnection, linearConnection, githubConnection] = await Promise.all([
              prisma.notionConnection.findUnique({
                where: { organizationId },
              }),
              prisma.mCPConnection.findFirst({
                where: { organizationId, provider: "linear", enabled: true },
              }),
              prisma.mCPConnection.findFirst({
                where: { organizationId, provider: "github", enabled: true },
              }),
            ]);

            for (const step of steps) {
              if (step.type === "mcp_call") {
                const toolInput = { ...step.input };

                Object.keys(toolInput).forEach((key) => {
                  const value = toolInput[key];
                  if (typeof value === "string" && value.includes("{{")) {
                    const match = value.match(/\{\{input\.(\w+)\}\}/);
                    if (match && inputData) {
                      const inputKey = match[1];
                      toolInput[key] = (inputData as any)[inputKey];
                    }
                  }
                });

                if (step.mcp === "notion") {
                  if (!notionConnection) {
                    throw new Error("Notion connection not configured");
                  }
                  const notionAccessConnection: MCPConnection = {
                    id: notionConnection.id,
                    organizationId: notionConnection.organizationId,
                    provider: "notion",
                    namespace: "notion",
                    name: "Notion",
                    config: {
                      apiKey: notionConnection.apiKey,
                      defaultDatabaseId: notionConnection.defaultDatabaseId,
                    },
                    refreshToken: null,
                    expiresAt: null,
                    enabled: true,
                    createdAt: notionConnection.createdAt,
                    updatedAt: notionConnection.updatedAt,
                  };
                  const toolResult = await executeNotionTool(
                    notionConnection.apiKey,
                    step.tool,
                    toolInput,
                    organizationId,
                    notionAccessConnection,
                    req.user?.id,
                  );
                  finalOutputData = { ...finalOutputData, ...toolResult };
                } else if (step.mcp === "linear") {
                  if (!linearConnection) {
                    throw new Error("Linear connection not configured");
                  }
                  const config = linearConnection.config as { apiKey: string };
                  if (!config.apiKey) {
                    throw new Error("Linear API key not configured");
                  }
                  const linearRefreshToken = (linearConnection as Record<string, unknown>)
                    .refreshToken as string | null | undefined;
                  const linearExpiresAt = (linearConnection as Record<string, unknown>)
                    .expiresAt as Date | string | null | undefined;
                  const linearAccessConnection: MCPConnection = {
                    id: linearConnection.id,
                    organizationId: linearConnection.organizationId,
                    provider: linearConnection.provider,
                    namespace: linearConnection.provider.toLowerCase(),
                    name: linearConnection.name,
                    config: linearConnection.config as Record<string, unknown>,
                    refreshToken: linearRefreshToken ?? null,
                    expiresAt:
                      linearExpiresAt instanceof Date
                        ? linearExpiresAt
                        : linearExpiresAt
                          ? new Date(linearExpiresAt)
                          : null,
                    enabled: linearConnection.enabled,
                    createdAt: linearConnection.createdAt,
                    updatedAt: linearConnection.updatedAt,
                  };
                  const toolResult = await executeLinearTool(
                    config.apiKey,
                    step.tool,
                    toolInput,
                    organizationId,
                    linearAccessConnection,
                    req.user?.id,
                  );
                  finalOutputData = { ...finalOutputData, ...toolResult };
                } else if (step.mcp === "github") {
                  if (!githubConnection) {
                    throw new Error("GitHub connection not configured");
                  }
                  const config = githubConnection.config as { accessToken: string };
                  if (!config.accessToken) {
                    throw new Error("GitHub access token not configured");
                  }
                  const githubRefreshToken = (githubConnection as Record<string, unknown>)
                    .refreshToken as string | null | undefined;
                  const githubExpiresAt = (githubConnection as Record<string, unknown>)
                    .expiresAt as Date | string | null | undefined;
                  const githubAccessConnection: MCPConnection = {
                    id: githubConnection.id,
                    organizationId: githubConnection.organizationId,
                    provider: githubConnection.provider,
                    namespace: githubConnection.provider.toLowerCase(),
                    name: githubConnection.name,
                    config: githubConnection.config as Record<string, unknown>,
                    refreshToken: githubRefreshToken ?? null,
                    expiresAt:
                      githubExpiresAt instanceof Date
                        ? githubExpiresAt
                        : githubExpiresAt
                          ? new Date(githubExpiresAt)
                          : null,
                    enabled: githubConnection.enabled,
                    createdAt: githubConnection.createdAt,
                    updatedAt: githubConnection.updatedAt,
                  };
                  const toolResult = await executeGitHubTool(
                    config.accessToken,
                    step.tool,
                    toolInput,
                    organizationId,
                    githubAccessConnection,
                    req.user?.id,
                  );
                  finalOutputData = { ...finalOutputData, ...toolResult };
                }
              }
            }
          } else {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }

          await prisma.workflowExecution.update({
            where: { id: execution.id },
            data: {
              status: "success",
              outputData: { ...finalOutputData, timestamp: new Date() },
              completedAt: new Date(),
            },
          });
        } catch (error: any) {
          console.error("Execution background error:", error);
          await prisma.workflowExecution.update({
            where: { id: execution.id },
            data: {
              status: "failed",
              errorMessage: error.message || "Execution failed",
              completedAt: new Date(),
            },
          });
        }
      }, 0);

      return res.status(202).json({ execution });
    } catch (error) {
      console.error("Execute workflow error:", error);
      return res.status(500).json({ error: "Failed to execute workflow" });
    }
  },
);

router.get(
  "/workflows/:id/executions",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = String(req.params.id);

      const workflow = await prisma.workflow.findFirst({
        where: { id, organizationId },
      });

      if (!workflow) {
        return res.status(404).json({ error: "Workflow not found" });
      }

      const executions = await prisma.workflowExecution.findMany({
        where: { workflowId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      return res.json({ executions });
    } catch (error) {
      console.error("Get executions error:", error);
      return res.status(500).json({ error: "Failed to fetch executions" });
    }
  },
);

router.get(
  "/executions",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;

      const executions = await prisma.workflowExecution.findMany({
        where: {
          workflow: {
            organizationId,
          },
        },
        include: {
          workflow: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      return res.json({ executions });
    } catch (error) {
      console.error("List executions error:", error);
      return res.status(500).json({ error: "Failed to fetch executions" });
    }
  },
);

router.get(
  "/executions/:id",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = String(req.params.id);

      const execution = await prisma.workflowExecution.findFirst({
        where: { id },
        include: {
          workflow: true,
        },
      });

      if (!execution || execution.workflow.organizationId !== organizationId) {
        return res.status(404).json({ error: "Execution not found" });
      }

      return res.json({ execution });
    } catch (error) {
      console.error("Get execution error:", error);
      return res.status(500).json({ error: "Failed to fetch execution" });
    }
  },
);

export default router;
