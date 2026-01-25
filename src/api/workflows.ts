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

import { Router, Request, Response } from 'express';
import { db as prisma } from '../db/client';
import { requireAuth } from '../middleware/auth.middleware';
import { executeNotionTool } from '../mcp-servers/notion';

const router = Router();

router.get('/workflows', requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;

    const workflows = await prisma.workflow.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ workflows });
  } catch (error) {
    console.error('List workflows error:', error);
    return res.status(500).json({ error: 'Failed to fetch workflows' });
  }
});

router.post('/workflows', requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const { name, description, config, enabled } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const workflow = await prisma.workflow.create({
      data: {
        organizationId,
        name,
        description: description || null,
        config: config || {},
        enabled: enabled !== undefined ? enabled : true,
      },
    });

    return res.status(201).json({ workflow });
  } catch (error) {
    console.error('Create workflow error:', error);
    return res.status(500).json({ error: 'Failed to create workflow' });
  }
});

router.get('/workflows/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const { id } = req.params;

    const workflow = await prisma.workflow.findFirst({
      where: { id, organizationId },
      include: {
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    return res.json({ workflow });
  } catch (error) {
    console.error('Get workflow error:', error);
    return res.status(500).json({ error: 'Failed to fetch workflow' });
  }
});

router.put('/workflows/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const { id } = req.params;
    const { name, description, config, enabled } = req.body;

    const existing = await prisma.workflow.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const workflow = await prisma.workflow.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(config !== undefined && { config }),
        ...(enabled !== undefined && { enabled }),
      },
    });

    return res.json({ workflow });
  } catch (error) {
    console.error('Update workflow error:', error);
    return res.status(500).json({ error: 'Failed to update workflow' });
  }
});

router.delete('/workflows/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const { id } = req.params;

    const existing = await prisma.workflow.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    await prisma.workflow.delete({
      where: { id },
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('Delete workflow error:', error);
    return res.status(500).json({ error: 'Failed to delete workflow' });
  }
});

router.post('/workflows/:id/execute', requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const { id } = req.params;
    const { inputData } = req.body;

    const workflow = await prisma.workflow.findFirst({
      where: { id, organizationId, enabled: true },
    });

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found or disabled' });
    }

    const execution = await prisma.workflowExecution.create({
      data: {
        workflowId: id,
        status: 'pending',
        inputData: inputData || null,
        startedAt: new Date(),
      },
    });

    setTimeout(async () => {
      try {
        await prisma.workflowExecution.update({
          where: { id: execution.id },
          data: {
            status: 'running',
          },
        });

        const config = workflow.config as any;
        const steps = config.steps || [];
        let finalOutputData: any = { message: 'Workflow executed successfully' };

        if (steps.length > 0) {
          const notionConnection = await prisma.notionConnection.findUnique({
            where: { organizationId },
          });

          for (const step of steps) {
            if (step.type === 'mcp_call' && step.mcp === 'notion') {
              if (!notionConnection) {
                throw new Error('Notion connection not configured');
              }

              const toolInput = { ...step.input };
              
              Object.keys(toolInput).forEach((key) => {
                const value = toolInput[key];
                if (typeof value === 'string' && value.includes('{{')) {
                  const match = value.match(/\{\{input\.(\w+)\}\}/);
                  if (match && inputData) {
                    const inputKey = match[1];
                    toolInput[key] = (inputData as any)[inputKey];
                  }
                }
              });

              const toolResult = await executeNotionTool(
                notionConnection.apiKey,
                step.tool,
                toolInput
              );

              finalOutputData = { ...finalOutputData, ...toolResult };
            }
          }
        } else {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        await prisma.workflowExecution.update({
          where: { id: execution.id },
          data: {
            status: 'success',
            outputData: { ...finalOutputData, timestamp: new Date() },
            completedAt: new Date(),
          },
        });
      } catch (error: any) {
        console.error('Execution background error:', error);
        await prisma.workflowExecution.update({
          where: { id: execution.id },
          data: {
            status: 'failed',
            errorMessage: error.message || 'Execution failed',
            completedAt: new Date(),
          },
        });
      }
    }, 0);

    return res.status(202).json({ execution });
  } catch (error) {
    console.error('Execute workflow error:', error);
    return res.status(500).json({ error: 'Failed to execute workflow' });
  }
});

router.get('/workflows/:id/executions', requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const { id } = req.params;

    const workflow = await prisma.workflow.findFirst({
      where: { id, organizationId },
    });

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const executions = await prisma.workflowExecution.findMany({
      where: { workflowId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return res.json({ executions });
  } catch (error) {
    console.error('Get executions error:', error);
    return res.status(500).json({ error: 'Failed to fetch executions' });
  }
});

router.get('/executions', requireAuth, async (req: Request, res: Response) => {
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
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return res.json({ executions });
  } catch (error) {
    console.error('List executions error:', error);
    return res.status(500).json({ error: 'Failed to fetch executions' });
  }
});

router.get('/executions/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const { id } = req.params;

    const execution = await prisma.workflowExecution.findFirst({
      where: { id },
      include: {
        workflow: true,
      },
    });

    if (!execution || execution.workflow.organizationId !== organizationId) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    return res.json({ execution });
  } catch (error) {
    console.error('Get execution error:', error);
    return res.status(500).json({ error: 'Failed to fetch execution' });
  }
});

export default router;