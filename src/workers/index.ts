import { slackEventWorker } from "./slack-event.worker";
import { orchestrationWorker } from "./orchestration.worker";
import { notificationWorker } from "./notification.worker";
import { logger } from "../utils/logger";

export { slackEventWorker, orchestrationWorker, notificationWorker };

export async function startWorkers(): Promise<void> {
  logger.info("Starting BullMQ workers...");
  logger.info("Workers started:", {
    slackEvents: "active",
    orchestration: "active",
    notifications: "active",
  });
}

export async function stopWorkers(): Promise<void> {
  logger.info("Stopping BullMQ workers...");

  await Promise.all([
    slackEventWorker.close(),
    orchestrationWorker.close(),
    notificationWorker.close(),
  ]);

  logger.info("All workers stopped");
}
