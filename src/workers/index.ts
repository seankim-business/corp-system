import { Worker } from "bullmq";
import { slackEventWorker } from "./slack-event.worker";
import { orchestrationWorker } from "./orchestration.worker";
import { notificationWorker } from "./notification.worker";
import { webhookWorker } from "./webhook.worker";
import { scheduledTaskWorker } from "./scheduled-task.worker";
import { logger } from "../utils/logger";

export {
  slackEventWorker,
  orchestrationWorker,
  notificationWorker,
  webhookWorker,
  scheduledTaskWorker,
};

const workers: Worker[] = [];

export function registerWorker(worker: Worker): void {
  workers.push(worker);
  logger.debug(`Worker registered. Total workers: ${workers.length}`);
}

export async function startWorkers(): Promise<void> {
  logger.info("Starting BullMQ workers...");

  registerWorker(slackEventWorker.getWorker());
  registerWorker(orchestrationWorker.getWorker());
  registerWorker(notificationWorker.getWorker());
  registerWorker(webhookWorker.getWorker());
  registerWorker(scheduledTaskWorker.getWorker());

  logger.info("Workers started:", {
    slackEvents: "active",
    orchestration: "active",
    notifications: "active",
    webhooks: "active",
    scheduledTasks: "active",
    totalWorkers: workers.length,
  });
}

export async function stopWorkers(): Promise<void> {
  logger.info("Stopping BullMQ workers...");

  await Promise.all([
    slackEventWorker.close(),
    orchestrationWorker.close(),
    notificationWorker.close(),
    webhookWorker.close(),
    scheduledTaskWorker.close(),
  ]);

  logger.info("All workers stopped");
}

export async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  const shutdownTimeout = 30000;
  const startTime = Date.now();

  try {
    await Promise.race([
      Promise.all(workers.map((w) => w.close())),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Shutdown timeout")), shutdownTimeout),
      ),
    ]);

    const duration = Date.now() - startTime;
    logger.info(`All workers closed gracefully in ${duration}ms`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error("Forced shutdown after timeout:", { error: errorMsg });
  }
}
