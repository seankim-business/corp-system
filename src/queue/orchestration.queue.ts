import { Queue } from "bullmq";
import { createQueue, defaultRateLimits } from "./base.queue";

/**
 * Orchestration Queue
 *
 * Processes AI orchestration requests asynchronously:
 * - Category selection
 * - Skill selection
 * - MCP tool aggregation
 * - OhMyOpenCode delegate_task execution
 *
 * Benefits:
 * - Non-blocking orchestration (can take 30s-5min for LLM calls)
 * - Progress tracking via SSE
 * - Cancellation support
 * - Cost tracking per organization
 */

export interface OrchestrationJobData {
  organizationId: string;
  userId: string;
  sessionId: string;
  userRequest: string;
  category?: string; // Pre-selected category (optional)
  skills?: string[]; // Pre-selected skills (optional)
  context?: Record<string, any>;
  metadata: {
    source: "slack" | "web" | "api";
    channelId?: string; // For Slack responses
    threadTs?: string; // For Slack thread replies
  };
}

export interface OrchestrationJobResult {
  output: string;
  status: "success" | "failed";
  category: string;
  skills: string[];
  duration: number;
  model: string;
  sessionId: string;
  metadata?: Record<string, any>;
}

export const orchestrationQueue: Queue<OrchestrationJobData> = createQueue(
  "orchestration",
  {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      ...defaultRateLimits["orchestration"],
    },
  },
);

/**
 * Add an orchestration job to the queue
 */
export async function enqueueOrchestration(
  data: OrchestrationJobData,
): Promise<string> {
  const job = await orchestrationQueue.add(
    `orchestrate-${data.organizationId}`,
    data,
    {
      // Job-specific options
      jobId: `orch-${data.sessionId}-${Date.now()}`,
      priority: data.metadata.source === "slack" ? 1 : 10, // Slack has higher priority
    },
  );

  return job.id!;
}

/**
 * Cancel an orchestration job
 */
export async function cancelOrchestration(jobId: string): Promise<boolean> {
  const job = await orchestrationQueue.getJob(jobId);
  if (!job) return false;

  const state = await job.getState();
  if (state === "waiting" || state === "delayed") {
    await job.remove();
    return true;
  }

  // For active jobs, we can't cancel directly (handled by worker)
  return false;
}

/**
 * Get orchestration job status
 */
export async function getOrchestrationStatus(jobId: string) {
  const job = await orchestrationQueue.getJob(jobId);
  if (!job) return null;

  const state = await job.getState();
  const progress = await job.progress;

  return {
    id: job.id,
    state,
    progress,
    data: job.data,
    failedReason: job.failedReason,
    finishedOn: job.finishedOn,
    processedOn: job.processedOn,
  };
}

/**
 * Get pending orchestrations for an organization
 */
export async function getPendingOrchestrations(organizationId: string) {
  const jobs = await orchestrationQueue.getJobs([
    "waiting",
    "active",
    "delayed",
  ]);
  return jobs.filter((job) => job.data.organizationId === organizationId);
}

/**
 * Get orchestration metrics by organization
 */
export async function getOrchestrationMetrics(organizationId: string) {
  const jobs = await orchestrationQueue.getJobs([
    "completed",
    "failed",
    "active",
  ]);
  const orgJobs = jobs.filter(
    (job) => job.data.organizationId === organizationId,
  );

  const completed = orgJobs.filter((j) => j.finishedOn).length;
  const failed = orgJobs.filter((j) => j.failedReason).length;
  const active = orgJobs.filter((j) => j.processedOn && !j.finishedOn).length;

  const avgDuration =
    orgJobs
      .filter((j) => j.finishedOn && j.processedOn)
      .reduce((sum, j) => sum + (j.finishedOn! - j.processedOn!), 0) /
      completed || 0;

  return {
    completed,
    failed,
    active,
    successRate: completed / (completed + failed) || 0,
    avgDuration,
  };
}
