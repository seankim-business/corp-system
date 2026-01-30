import { db } from "../../db/client";
import { logger } from "../../utils/logger";
import { n8nProvisioner } from "./instance-provisioner";

export interface N8nSkillConfig {
  workflowId: string;
  n8nWorkflowId: string;
  webhookPath?: string;
  method: "POST" | "GET";
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface SkillExecutionResult {
  success: boolean;
  output?: unknown;
  executionId?: string;
  error?: string;
}

export class N8nSkillAdapter {
  async registerAsSkill(workflowId: string): Promise<boolean> {
    try {
      const n8nWorkflow = this.getWorkflowDelegate();
      const workflow = await n8nWorkflow.findUnique({
        where: { id: workflowId },
        include: { instance: true },
      });

      if (!workflow) {
        logger.error("Workflow not found", { workflowId });
        return false;
      }

      if (!workflow.isActive) {
        logger.warn("Cannot register inactive workflow as skill", { workflowId });
        return false;
      }

      const webhookPath = this.extractWebhookPath(workflow.workflowJson as any);

      await n8nWorkflow.update({
        where: { id: workflowId },
        data: {
          isSkill: true,
        },
      });

      logger.info("Workflow registered as skill", {
        workflowId,
        name: workflow.name,
        webhookPath,
      });

      return true;
    } catch (error) {
      logger.error("Failed to register workflow as skill", { workflowId, error });
      return false;
    }
  }

  async unregisterSkill(workflowId: string): Promise<boolean> {
    try {
      const n8nWorkflow = this.getWorkflowDelegate();
      await n8nWorkflow.update({
        where: { id: workflowId },
        data: { isSkill: false },
      });

      logger.info("Workflow unregistered as skill", { workflowId });
      return true;
    } catch (error) {
      logger.error("Failed to unregister skill", { workflowId, error });
      return false;
    }
  }

  async executeSkill(
    workflowId: string,
    input: Record<string, unknown>,
  ): Promise<SkillExecutionResult> {
    try {
      const n8nWorkflow = this.getWorkflowDelegate();
      const workflow = await n8nWorkflow.findUnique({
        where: { id: workflowId },
        include: { instance: true },
      });

      if (!workflow || !workflow.isSkill) {
        return { success: false, error: "Workflow is not registered as a skill" };
      }

      const client = await n8nProvisioner.getClient(workflow.instanceId);
      if (!client) {
        return { success: false, error: "n8n instance not available" };
      }

      const webhookPath = this.extractWebhookPath(workflow.workflowJson as any);

      if (webhookPath) {
        const result = await client.triggerWebhook(webhookPath, input);

        const n8nExecution = this.getExecutionDelegate();
        const execution = await n8nExecution.create({
          data: {
            workflowId: workflow.id,
            n8nExecutionId: `skill_${Date.now()}`,
            status: "success",
            mode: "webhook",
            startedAt: new Date(),
            completedAt: new Date(),
            inputData: input,
            outputData: result as object,
            triggeredBy: "skill",
          },
        });

        return {
          success: true,
          output: result,
          executionId: execution.id,
        };
      }

      return { success: false, error: "Workflow has no webhook trigger" };
    } catch (error) {
      logger.error("Skill execution failed", { workflowId, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async getSkillWorkflows(organizationId: string) {
    const n8nWorkflow = this.getWorkflowDelegate();
    return n8nWorkflow.findMany({
      where: {
        organizationId,
        isSkill: true,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        tags: true,
      },
    });
  }

  async getSkillInfo(workflowId: string) {
    const n8nWorkflow = this.getWorkflowDelegate();
    const workflow = await n8nWorkflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow || !workflow.isSkill) {
      return null;
    }

    const workflowJson = workflow.workflowJson as any;
    const webhookNode = this.findWebhookNode(workflowJson);

    return {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      category: workflow.category,
      webhookPath: webhookNode ? this.getWebhookPath(webhookNode) : null,
      method: webhookNode?.parameters?.httpMethod || "POST",
    };
  }

  private extractWebhookPath(workflowJson: { nodes?: any[] }): string | null {
    const webhookNode = this.findWebhookNode(workflowJson);
    return webhookNode ? this.getWebhookPath(webhookNode) : null;
  }

  private findWebhookNode(workflowJson: { nodes?: any[] }): any | null {
    if (!workflowJson?.nodes) return null;
    return workflowJson.nodes.find((node: any) => node.type === "n8n-nodes-base.webhook");
  }

  private getWebhookPath(webhookNode: any): string {
    return webhookNode.parameters?.path || webhookNode.name;
  }

  private getWorkflowDelegate() {
    const prismaClient = db as unknown as Record<string, unknown>;
    return prismaClient.n8nWorkflow as {
      findUnique: (args: Record<string, unknown>) => Promise<any | null>;
      update: (args: Record<string, unknown>) => Promise<any>;
      findMany: (args: Record<string, unknown>) => Promise<any[]>;
    };
  }

  private getExecutionDelegate() {
    const prismaClient = db as unknown as Record<string, unknown>;
    return prismaClient.n8nExecution as {
      create: (args: Record<string, unknown>) => Promise<any>;
    };
  }
}

export const n8nSkillAdapter = new N8nSkillAdapter();
