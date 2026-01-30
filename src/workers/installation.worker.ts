import { Job } from "bullmq";
import { BaseWorker } from "../queue/base.queue";
import { InstallationJobData } from "../queue/installation.queue";
import { InstallationExecutor } from "../marketplace/services/installation-executor";
import { db } from "../db/client";
import { logger } from "../utils/logger";

export class InstallationWorker extends BaseWorker<InstallationJobData> {
  private executor: InstallationExecutor;

  constructor() {
    super("installations", { concurrency: 2 });
    this.executor = new InstallationExecutor();
  }

  async process(job: Job<InstallationJobData>): Promise<void> {
    const {
      queueId,
      organizationId,
      source,
      itemId,
      itemName,
      itemType,
      requestedBy,
      config,
    } = job.data;

    logger.info("Processing installation", {
      queueId,
      organizationId,
      source,
      itemId,
      itemName,
      jobId: job.id,
    });

    try {
      // 1. Update queue status to "installing"
      await db.installationQueue.update({
        where: { id: queueId },
        data: { status: "installing" },
      });

      // 2. Fetch item from source to get full details
      // TODO: Implement source-specific fetching logic
      // For now, we'll construct a minimal item object
      const item = {
        id: itemId,
        name: itemName,
        type: itemType,
        source,
        installMethod: "api", // Default, should come from source
      };

      // 3. Execute installation via InstallationExecutor
      const result = await this.executor.install(item as any, organizationId, requestedBy, config);

      // 4. Update queue status to "completed" with result
      await db.installationQueue.update({
        where: { id: queueId },
        data: {
          status: "completed",
          result: result as any,
        },
      });

      logger.info("Installation completed", {
        queueId,
        extensionId: result.extensionId,
        mcpConnectionId: result.mcpConnectionId,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Installation failed", {
        queueId,
        organizationId,
        source,
        itemId,
        error: message,
      });

      // 5. Update queue status to "failed" with error details
      await db.installationQueue.update({
        where: { id: queueId },
        data: {
          status: "failed",
          error: message,
        },
      });

      throw error;
    }
  }
}

export const installationWorker = new InstallationWorker();
