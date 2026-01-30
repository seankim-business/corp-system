import { BaseQueue } from "./base.queue";

export interface CodeOperationJobData {
  // Operation type
  operationType: 'debug' | 'implement' | 'refactor' | 'fix' | 'test';
  description: string;

  // Repository info
  repository: {
    owner: string;
    name: string;
    branch: string;  // Base branch (usually 'main')
    url: string;
  };

  // Target files (optional - AI will discover if not provided)
  targetFiles?: string[];

  // Context for debugging
  errorContext?: {
    errorMessage: string;
    stackTrace?: string;
    logs?: string;
    file?: string;
    line?: number;
  };

  // Context for feature implementation
  featureContext?: {
    featureRequestId?: string;
    requirements: string;
    acceptanceCriteria: string[];
  };

  // Organization info
  organizationId: string;
  userId: string;
  agentPosition: number;  // AR position for permissions

  // Tracking
  sessionId: string;
  eventId: string;

  // Slack integration
  slackChannel?: string;
  slackThreadTs?: string;
  slackTeamId?: string;

  // Safety settings
  approvalRequired: boolean;
  maxIterations?: number;  // Default 5

  // Priority
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface CodeOperationResult {
  success: boolean;
  operationId: string;

  // If successful
  branch?: string;
  commits?: Array<{ sha: string; message: string }>;
  pr?: { number: number; url: string };
  filesModified?: string[];

  // If failed
  error?: string;
  failedAt?: string;

  // Metrics
  iterations: number;
  duration: number;
}

export class CodeOperationQueue extends BaseQueue<CodeOperationJobData> {
  constructor() {
    super({
      name: "code-operations",
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: {
          age: 7 * 24 * 3600,  // 7 days
          count: 1000,
        } as any,
        removeOnFail: {
          age: 30 * 24 * 3600,  // 30 days
        } as any,
      },
    });
  }

  async enqueueOperation(data: CodeOperationJobData): Promise<string> {
    const job = await this.add(data.operationType, data, {
      priority: getPriorityNumber(data.priority),
      jobId: `code-op-${data.sessionId}-${Date.now()}`,
    });
    return job.id!;
  }
}

function getPriorityNumber(priority: CodeOperationJobData['priority']): number {
  switch (priority) {
    case 'critical': return 1;
    case 'high': return 2;
    case 'medium': return 3;
    case 'low': return 4;
    default: return 3;
  }
}

export const codeOperationQueue = new CodeOperationQueue();

// Helper function for easier import
export async function queueCodeOperation(data: CodeOperationJobData): Promise<string> {
  return codeOperationQueue.enqueueOperation(data);
}
