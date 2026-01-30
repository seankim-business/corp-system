import { BaseQueue } from "./base.queue";

export interface InstallationJobData {
  queueId: string; // InstallationQueue record ID
  organizationId: string;
  source: string;
  itemId: string;
  itemName: string;
  itemType: string;
  config?: Record<string, unknown>;
  requestedBy: string;
  requiresApproval: boolean;
}

export class InstallationQueue extends BaseQueue<InstallationJobData> {
  constructor() {
    super({
      name: "installations",
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    });
  }

  async enqueueInstallation(data: InstallationJobData) {
    return this.add("installation", data, {
      jobId: `installation-${data.queueId}`,
    });
  }
}

export const installationQueue = new InstallationQueue();
