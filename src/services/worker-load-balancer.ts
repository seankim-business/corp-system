import { logger } from "../utils/logger";
import { redis } from "../db/redis";

export type LoadBalancingStrategy = "round-robin" | "least-connections" | "weighted" | "random";

export interface WorkerNode {
  id: string;
  hostname: string;
  activeJobs: number;
  maxConcurrency: number;
  weight: number;
  lastHeartbeat: Date;
  capabilities: string[];
  healthy: boolean;
}

const REDIS_KEY_PREFIX = "worker:lb:";
const DEFAULT_STALE_TIMEOUT_MS = 60_000;

export class WorkerLoadBalancer {
  private workers: Map<string, WorkerNode> = new Map();
  private roundRobinIndex: number = 0;
  private strategy: LoadBalancingStrategy;

  constructor(strategy: LoadBalancingStrategy = "least-connections") {
    this.strategy = strategy;
    logger.info("WorkerLoadBalancer initialized", { strategy });
  }

  registerWorker(
    node: Omit<WorkerNode, "activeJobs" | "healthy" | "lastHeartbeat">,
  ): void {
    const workerNode: WorkerNode = {
      ...node,
      weight: node.weight ?? 1,
      activeJobs: 0,
      healthy: true,
      lastHeartbeat: new Date(),
    };

    this.workers.set(node.id, workerNode);
    logger.info("Worker registered", {
      workerId: node.id,
      hostname: node.hostname,
      maxConcurrency: node.maxConcurrency,
      capabilities: node.capabilities,
    });
  }

  deregisterWorker(workerId: string): void {
    const existed = this.workers.delete(workerId);
    if (existed) {
      logger.info("Worker deregistered", { workerId });
    } else {
      logger.warn("Attempted to deregister unknown worker", { workerId });
    }
  }

  async heartbeat(workerId: string, activeJobs: number): Promise<void> {
    const worker = this.workers.get(workerId);
    if (!worker) {
      logger.warn("Heartbeat received for unknown worker", { workerId });
      return;
    }

    worker.lastHeartbeat = new Date();
    worker.activeJobs = activeJobs;
    worker.healthy = true;

    try {
      await redis.set(
        `${REDIS_KEY_PREFIX}${workerId}`,
        JSON.stringify({
          id: worker.id,
          hostname: worker.hostname,
          activeJobs: worker.activeJobs,
          maxConcurrency: worker.maxConcurrency,
          healthy: worker.healthy,
          lastHeartbeat: worker.lastHeartbeat.toISOString(),
        }),
        120,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Failed to persist heartbeat to Redis", {
        workerId,
        error: message,
      });
    }
  }

  selectWorker(queueName: string): WorkerNode | null {
    const eligible = this.getEligibleWorkers(queueName);
    if (eligible.length === 0) {
      logger.warn("No eligible workers available", {
        queueName,
        strategy: this.strategy,
        totalWorkers: this.workers.size,
      });
      return null;
    }

    let selected: WorkerNode | null = null;

    switch (this.strategy) {
      case "round-robin":
        selected = this.selectRoundRobin(eligible);
        break;
      case "least-connections":
        selected = this.selectLeastConnections(eligible);
        break;
      case "weighted":
        selected = this.selectWeighted(eligible);
        break;
      case "random":
        selected = this.selectRandom(eligible);
        break;
    }

    if (selected) {
      logger.debug("Worker selected", {
        workerId: selected.id,
        queueName,
        strategy: this.strategy,
        activeJobs: selected.activeJobs,
        maxConcurrency: selected.maxConcurrency,
      });
    }

    return selected;
  }

  reportJobStart(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (!worker) {
      logger.warn("reportJobStart called for unknown worker", { workerId });
      return;
    }

    worker.activeJobs = Math.min(worker.activeJobs + 1, worker.maxConcurrency);
    logger.debug("Job started on worker", {
      workerId,
      activeJobs: worker.activeJobs,
      maxConcurrency: worker.maxConcurrency,
    });
  }

  reportJobComplete(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (!worker) {
      logger.warn("reportJobComplete called for unknown worker", { workerId });
      return;
    }

    worker.activeJobs = Math.max(worker.activeJobs - 1, 0);
    logger.debug("Job completed on worker", {
      workerId,
      activeJobs: worker.activeJobs,
      maxConcurrency: worker.maxConcurrency,
    });
  }

  getWorkerStatus(): WorkerNode[] {
    return Array.from(this.workers.values());
  }

  markUnhealthy(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (!worker) {
      logger.warn("markUnhealthy called for unknown worker", { workerId });
      return;
    }

    worker.healthy = false;
    logger.warn("Worker marked unhealthy", {
      workerId,
      hostname: worker.hostname,
    });
  }

  pruneStaleWorkers(timeoutMs: number = DEFAULT_STALE_TIMEOUT_MS): void {
    const now = Date.now();
    const staleIds: string[] = [];

    for (const [id, worker] of this.workers) {
      const elapsed = now - worker.lastHeartbeat.getTime();
      if (elapsed > timeoutMs) {
        staleIds.push(id);
      }
    }

    for (const id of staleIds) {
      this.workers.delete(id);
    }

    if (staleIds.length > 0) {
      logger.info("Pruned stale workers", {
        count: staleIds.length,
        workerIds: staleIds,
        timeoutMs,
      });
    }
  }

  setStrategy(strategy: LoadBalancingStrategy): void {
    const previous = this.strategy;
    this.strategy = strategy;
    this.roundRobinIndex = 0;
    logger.info("Load balancing strategy changed", {
      previous,
      current: strategy,
    });
  }

  private getEligibleWorkers(queueName: string): WorkerNode[] {
    const eligible: WorkerNode[] = [];
    for (const worker of this.workers.values()) {
      if (
        worker.healthy &&
        worker.activeJobs < worker.maxConcurrency &&
        worker.capabilities.includes(queueName)
      ) {
        eligible.push(worker);
      }
    }
    return eligible;
  }

  private selectRoundRobin(workers: WorkerNode[]): WorkerNode {
    const index = this.roundRobinIndex % workers.length;
    this.roundRobinIndex = (this.roundRobinIndex + 1) % workers.length;
    return workers[index];
  }

  private selectLeastConnections(workers: WorkerNode[]): WorkerNode {
    let best = workers[0];
    let bestRatio = best.activeJobs / best.maxConcurrency;

    for (let i = 1; i < workers.length; i++) {
      const ratio = workers[i].activeJobs / workers[i].maxConcurrency;
      if (ratio < bestRatio) {
        best = workers[i];
        bestRatio = ratio;
      }
    }

    return best;
  }

  private selectWeighted(workers: WorkerNode[]): WorkerNode {
    let totalWeight = 0;
    for (const worker of workers) {
      totalWeight += worker.weight;
    }

    let random = Math.random() * totalWeight;
    for (const worker of workers) {
      random -= worker.weight;
      if (random <= 0) {
        return worker;
      }
    }

    // Fallback to last worker (should not normally reach here)
    return workers[workers.length - 1];
  }

  private selectRandom(workers: WorkerNode[]): WorkerNode {
    const index = Math.floor(Math.random() * workers.length);
    return workers[index];
  }
}

export const workerLoadBalancer = new WorkerLoadBalancer("least-connections");
