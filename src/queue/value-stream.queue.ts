import { BaseQueue } from "./base.queue";

export type ValueStreamEventType =
  | "artifact.created"
  | "artifact.updated"
  | "artifact.deleted"
  | "artifact.status-changed"
  | "module.started"
  | "module.completed"
  | "module.failed"
  | "module.progress"
  | "flow.started"
  | "flow.completed"
  | "flow.failed";

export interface ValueStreamEventData {
  eventType: ValueStreamEventType;
  organizationId: string;
  moduleId: string;
  artifactId?: string;
  sessionId?: string;
  userId?: string;

  // Event-specific data
  data: {
    // For artifact events
    artifactVersion?: number;
    previousStatus?: string;
    newStatus?: string;
    upstreamArtifactIds?: string[];

    // For module events
    progress?: number;
    currentAction?: string;
    errorMessage?: string;
    errorType?: string;

    // For flow events
    templateId?: string;
    completedModules?: string[];
    pendingModules?: string[];
  };

  // Metadata
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export class ValueStreamQueue extends BaseQueue<ValueStreamEventData> {
  constructor() {
    super({
      name: "value-stream",
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 1000,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      },
      rateLimiter: {
        max: 100,
        duration: 60000,
      },
    });
  }

  async emitArtifactCreated(
    organizationId: string,
    moduleId: string,
    artifactId: string,
    upstreamArtifactIds?: string[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.add("artifact.created", {
      eventType: "artifact.created",
      organizationId,
      moduleId,
      artifactId,
      data: {
        upstreamArtifactIds,
      },
      metadata,
      timestamp: new Date(),
    }, {
      jobId: `artifact-created-${artifactId}`,
    });
  }

  async emitArtifactUpdated(
    organizationId: string,
    moduleId: string,
    artifactId: string,
    artifactVersion: number,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.add("artifact.updated", {
      eventType: "artifact.updated",
      organizationId,
      moduleId,
      artifactId,
      data: {
        artifactVersion,
      },
      metadata,
      timestamp: new Date(),
    }, {
      jobId: `artifact-updated-${artifactId}-v${artifactVersion}`,
    });
  }

  async emitArtifactStatusChanged(
    organizationId: string,
    moduleId: string,
    artifactId: string,
    previousStatus: string,
    newStatus: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.add("artifact.status-changed", {
      eventType: "artifact.status-changed",
      organizationId,
      moduleId,
      artifactId,
      data: {
        previousStatus,
        newStatus,
      },
      metadata,
      timestamp: new Date(),
    }, {
      jobId: `artifact-status-${artifactId}-${Date.now()}`,
    });
  }

  async emitModuleStarted(
    organizationId: string,
    moduleId: string,
    sessionId: string,
    userId?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.add("module.started", {
      eventType: "module.started",
      organizationId,
      moduleId,
      sessionId,
      userId,
      data: {},
      metadata,
      timestamp: new Date(),
    }, {
      jobId: `module-started-${sessionId}-${moduleId}`,
    });
  }

  async emitModuleProgress(
    organizationId: string,
    moduleId: string,
    sessionId: string,
    progress: number,
    currentAction?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.add("module.progress", {
      eventType: "module.progress",
      organizationId,
      moduleId,
      sessionId,
      data: {
        progress,
        currentAction,
      },
      metadata,
      timestamp: new Date(),
    }, {
      // Don't use unique jobId for progress events - allow multiple
    });
  }

  async emitModuleCompleted(
    organizationId: string,
    moduleId: string,
    sessionId: string,
    artifactId?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.add("module.completed", {
      eventType: "module.completed",
      organizationId,
      moduleId,
      sessionId,
      artifactId,
      data: {},
      metadata,
      timestamp: new Date(),
    }, {
      jobId: `module-completed-${sessionId}-${moduleId}`,
    });
  }

  async emitModuleFailed(
    organizationId: string,
    moduleId: string,
    sessionId: string,
    errorMessage: string,
    errorType?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.add("module.failed", {
      eventType: "module.failed",
      organizationId,
      moduleId,
      sessionId,
      data: {
        errorMessage,
        errorType,
      },
      metadata,
      timestamp: new Date(),
    }, {
      jobId: `module-failed-${sessionId}-${moduleId}`,
    });
  }

  async emitFlowStarted(
    organizationId: string,
    sessionId: string,
    templateId: string,
    pendingModules: string[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.add("flow.started", {
      eventType: "flow.started",
      organizationId,
      moduleId: "flow",
      sessionId,
      data: {
        templateId,
        completedModules: [],
        pendingModules,
      },
      metadata,
      timestamp: new Date(),
    }, {
      jobId: `flow-started-${sessionId}`,
    });
  }

  async emitFlowCompleted(
    organizationId: string,
    sessionId: string,
    templateId: string,
    completedModules: string[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.add("flow.completed", {
      eventType: "flow.completed",
      organizationId,
      moduleId: "flow",
      sessionId,
      data: {
        templateId,
        completedModules,
        pendingModules: [],
      },
      metadata,
      timestamp: new Date(),
    }, {
      jobId: `flow-completed-${sessionId}`,
    });
  }

  async emitFlowFailed(
    organizationId: string,
    sessionId: string,
    templateId: string,
    completedModules: string[],
    pendingModules: string[],
    errorMessage: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.add("flow.failed", {
      eventType: "flow.failed",
      organizationId,
      moduleId: "flow",
      sessionId,
      data: {
        templateId,
        completedModules,
        pendingModules,
        errorMessage,
      },
      metadata,
      timestamp: new Date(),
    }, {
      jobId: `flow-failed-${sessionId}`,
    });
  }

  // Generic emit method for custom events
  async emit(event: ValueStreamEventData): Promise<void> {
    await this.add(event.eventType, event, {
      jobId: `${event.eventType}-${event.artifactId || event.sessionId || Date.now()}`,
    });
  }
}

// Singleton instance
export const valueStreamQueue = new ValueStreamQueue();
