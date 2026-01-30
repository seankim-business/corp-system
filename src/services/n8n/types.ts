export interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, { id: string; name: string }>;
  disabled?: boolean;
  notes?: string;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  continueOnFail?: boolean;
  onError?: "continueErrorOutput" | "continueRegularOutput" | "stopWorkflow";
}

export interface N8nConnection {
  node: string;
  type: string;
  index: number;
}

export interface N8nConnections {
  [nodeName: string]: {
    [outputType: string]: N8nConnection[][];
  };
}

export interface N8nWorkflowSettings {
  executionOrder?: "v0" | "v1";
  saveDataErrorExecution?: "all" | "none";
  saveDataSuccessExecution?: "all" | "none";
  saveManualExecutions?: boolean;
  callerPolicy?: "any" | "none" | "workflowsFromAList" | "workflowsFromSameOwner";
  timezone?: string;
}

export interface N8nWorkflowInput {
  name: string;
  nodes: N8nNode[];
  connections: N8nConnections;
  settings?: N8nWorkflowSettings;
  staticData?: Record<string, unknown>;
  active?: boolean;
}

export interface N8nWorkflow extends N8nWorkflowInput {
  id: string;
  createdAt: string;
  updatedAt: string;
  versionId?: string;
}

export interface N8nExecutionStatus {
  status: "waiting" | "running" | "success" | "error" | "canceled";
}

export interface N8nExecution {
  id: string;
  finished: boolean;
  mode: "manual" | "trigger" | "webhook" | "retry" | "integrated";
  retryOf?: string;
  retrySuccessId?: string;
  startedAt: string;
  stoppedAt?: string;
  workflowId: string;
  data?: {
    resultData?: {
      runData?: Record<string, unknown>;
      error?: { message: string; stack?: string };
    };
  };
  status: "waiting" | "running" | "success" | "error" | "canceled";
}

export interface N8nCredentialInput {
  name: string;
  type: string;
  data: Record<string, unknown>;
}

export interface N8nCredential {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListOptions {
  cursor?: string;
  limit?: number;
}

export interface ExecutionListOptions extends ListOptions {
  status?: "waiting" | "running" | "success" | "error";
  workflowId?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor?: string;
}
