import { BaseQueue } from "./base.queue";

export interface N8nSyncJobData {
  type: "workflow" | "execution" | "credential" | "health-check";
  organizationId: string;
  instanceId: string;
  workflowId?: string;
  executionId?: string;
  credentialId?: string;
}

export interface N8nSyncJobResult {
  success: boolean;
  syncedCount?: number;
  error?: string;
}

class N8nSyncQueueClass extends BaseQueue<N8nSyncJobData> {
  constructor() {
    super({
      name: "n8n-sync",
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
      rateLimiter: {
        max: 30,
        duration: 60000,
      },
    });
  }

  async enqueueSyncWorkflows(organizationId: string, instanceId: string): Promise<string> {
    const job = await this.add("sync-workflows", {
      type: "workflow",
      organizationId,
      instanceId,
    });
    return job.id!;
  }

  async enqueueSyncExecutions(
    organizationId: string,
    instanceId: string,
    workflowId?: string,
  ): Promise<string> {
    const job = await this.add("sync-executions", {
      type: "execution",
      organizationId,
      instanceId,
      workflowId,
    });
    return job.id!;
  }

  async enqueueSyncCredentials(organizationId: string, instanceId: string): Promise<string> {
    const job = await this.add("sync-credentials", {
      type: "credential",
      organizationId,
      instanceId,
    });
    return job.id!;
  }

  async enqueueHealthCheck(organizationId: string, instanceId: string): Promise<string> {
    const job = await this.add(
      "health-check",
      {
        type: "health-check",
        organizationId,
        instanceId,
      },
      {
        repeat: {
          every: 60000,
        },
      },
    );
    return job.id!;
  }
}

export const n8nSyncQueue = new N8nSyncQueueClass();
