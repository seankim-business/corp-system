import { agentRegistry, AgentType } from "./agent-registry";
import { SubTask } from "./agent-coordinator";
import { logger } from "../utils/logger";

export interface DecompositionResult {
  originalRequest: string;
  subtasks: SubTask[];
  requiresMultiAgent: boolean;
  estimatedComplexity: "low" | "medium" | "high";
  suggestedParallelization: string[][];
}

interface TaskPattern {
  pattern: RegExp;
  agents: AgentType[];
  description: string;
  dependencies?: Partial<Record<AgentType, AgentType[]>>;
}

const TASK_PATTERNS: TaskPattern[] = [
  {
    pattern:
      /(?:create|write|generate).*(?:report|summary|document).*(?:from|using|with).*(?:data|metrics|numbers)/i,
    agents: ["data", "report"],
    description: "Data extraction followed by report generation",
    dependencies: { report: ["data"] },
  },
  {
    pattern: /(?:send|notify|share).*(?:report|summary|update).*(?:to|with)/i,
    agents: ["data", "report", "comms"],
    description: "Create and distribute report",
    dependencies: { report: ["data"], comms: ["report"] },
  },
  {
    pattern: /(?:find|search|locate).*(?:and|then).*(?:summarize|analyze|report)/i,
    agents: ["search", "analytics", "report"],
    description: "Search, analyze, and report",
    dependencies: { analytics: ["search"], report: ["analytics"] },
  },
  {
    pattern: /(?:analyze|review).*(?:tasks?|todos?|work).*(?:prioritize|organize|sort)/i,
    agents: ["task", "analytics"],
    description: "Analyze and prioritize tasks",
    dependencies: { analytics: ["task"] },
  },
  {
    pattern: /(?:get|fetch|pull).*(?:approval|permission|sign.?off).*(?:for|from)/i,
    agents: ["approval", "comms"],
    description: "Create approval and notify",
    dependencies: { comms: ["approval"] },
  },
  {
    pattern: /(?:weekly|daily|monthly).*(?:report|summary|update)/i,
    agents: ["data", "analytics", "report", "comms"],
    description: "Periodic report with distribution",
    dependencies: { analytics: ["data"], report: ["analytics"], comms: ["report"] },
  },
  {
    pattern: /(?:what|how).*(?:trending|performing|doing)/i,
    agents: ["data", "analytics"],
    description: "Performance analysis",
    dependencies: { analytics: ["data"] },
  },
  {
    pattern: /(?:update|sync|refresh).*(?:all|multiple|several)/i,
    agents: ["data", "task"],
    description: "Bulk update operation",
  },
];

const KEYWORD_TO_AGENT: Record<string, AgentType> = {
  metrics: "data",
  data: "data",
  numbers: "data",
  statistics: "data",
  extract: "data",
  query: "data",
  database: "data",
  spreadsheet: "data",

  report: "report",
  document: "report",
  summary: "report",
  brief: "report",
  format: "report",
  template: "report",
  pdf: "report",

  send: "comms",
  notify: "comms",
  message: "comms",
  email: "comms",
  slack: "comms",
  distribute: "comms",
  share: "comms",

  search: "search",
  find: "search",
  locate: "search",
  where: "search",
  look: "search",

  task: "task",
  todo: "task",
  assign: "task",
  priority: "task",
  organize: "task",
  schedule: "task",

  approve: "approval",
  approval: "approval",
  permission: "approval",
  authorize: "approval",
  sign: "approval",

  analyze: "analytics",
  trend: "analytics",
  insight: "analytics",
  predict: "analytics",
  forecast: "analytics",
  pattern: "analytics",
};

function generateSubTaskId(): string {
  return `subtask_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

export function decomposeTask(request: string): DecompositionResult {
  logger.debug("Decomposing task", { request: request.substring(0, 100) });

  for (const taskPattern of TASK_PATTERNS) {
    if (taskPattern.pattern.test(request)) {
      logger.debug("Matched task pattern", { description: taskPattern.description });
      return createDecompositionFromPattern(request, taskPattern);
    }
  }

  const detectedAgents = detectAgentsFromKeywords(request);

  if (detectedAgents.length === 0) {
    return {
      originalRequest: request,
      subtasks: [
        {
          id: generateSubTaskId(),
          description: request,
          assignedAgent: "orchestrator",
          dependencies: [],
          status: "pending",
        },
      ],
      requiresMultiAgent: false,
      estimatedComplexity: "low",
      suggestedParallelization: [["orchestrator"]],
    };
  }

  if (detectedAgents.length === 1) {
    return {
      originalRequest: request,
      subtasks: [
        {
          id: generateSubTaskId(),
          description: request,
          assignedAgent: detectedAgents[0],
          dependencies: [],
          status: "pending",
        },
      ],
      requiresMultiAgent: false,
      estimatedComplexity: "low",
      suggestedParallelization: [[detectedAgents[0]]],
    };
  }

  return createDecompositionFromAgents(request, detectedAgents);
}

function createDecompositionFromPattern(
  request: string,
  pattern: TaskPattern,
): DecompositionResult {
  const subtasks: SubTask[] = [];
  const idMap = new Map<AgentType, string>();

  for (const agentType of pattern.agents) {
    const id = generateSubTaskId();
    idMap.set(agentType, id);

    const dependencies: string[] = [];
    if (pattern.dependencies?.[agentType]) {
      for (const depAgent of pattern.dependencies[agentType]) {
        const depId = idMap.get(depAgent);
        if (depId) {
          dependencies.push(depId);
        }
      }
    }

    const agent = agentRegistry.getAgent(agentType);
    subtasks.push({
      id,
      description: buildSubtaskDescription(request, agentType, agent?.name || agentType),
      assignedAgent: agentType,
      dependencies,
      status: "pending",
    });
  }

  const parallelGroups = computeParallelGroups(subtasks);

  return {
    originalRequest: request,
    subtasks,
    requiresMultiAgent: subtasks.length > 1,
    estimatedComplexity: subtasks.length <= 2 ? "medium" : "high",
    suggestedParallelization: parallelGroups,
  };
}

function createDecompositionFromAgents(request: string, agents: AgentType[]): DecompositionResult {
  const subtasks: SubTask[] = [];
  const idMap = new Map<AgentType, string>();

  const orderedAgents = inferAgentOrder(agents);

  let previousId: string | undefined;

  for (const agentType of orderedAgents) {
    const id = generateSubTaskId();
    idMap.set(agentType, id);

    const agent = agentRegistry.getAgent(agentType);
    subtasks.push({
      id,
      description: buildSubtaskDescription(request, agentType, agent?.name || agentType),
      assignedAgent: agentType,
      dependencies: previousId ? [previousId] : [],
      status: "pending",
    });

    previousId = id;
  }

  const parallelGroups = computeParallelGroups(subtasks);

  return {
    originalRequest: request,
    subtasks,
    requiresMultiAgent: subtasks.length > 1,
    estimatedComplexity: subtasks.length <= 2 ? "medium" : "high",
    suggestedParallelization: parallelGroups,
  };
}

function detectAgentsFromKeywords(request: string): AgentType[] {
  const words = request.toLowerCase().split(/\s+/);
  const detectedAgents = new Set<AgentType>();

  for (const word of words) {
    const cleanWord = word.replace(/[^a-z]/g, "");
    if (cleanWord in KEYWORD_TO_AGENT) {
      detectedAgents.add(KEYWORD_TO_AGENT[cleanWord]);
    }
  }

  return Array.from(detectedAgents);
}

function inferAgentOrder(agents: AgentType[]): AgentType[] {
  const AGENT_PRIORITY: Record<AgentType, number> = {
    search: 1,
    data: 2,
    analytics: 3,
    task: 4,
    approval: 5,
    report: 6,
    comms: 7,
    orchestrator: 0,
  };

  return [...agents].sort((a, b) => (AGENT_PRIORITY[a] || 99) - (AGENT_PRIORITY[b] || 99));
}

function buildSubtaskDescription(
  originalRequest: string,
  agentType: AgentType,
  agentName: string,
): string {
  const taskDescriptions: Record<AgentType, string> = {
    orchestrator: `Coordinate the overall task: ${originalRequest}`,
    data: `Extract and prepare relevant data for: ${originalRequest}`,
    report: `Create formatted report/document for: ${originalRequest}`,
    comms: `Send notifications/messages for: ${originalRequest}`,
    search: `Search and find relevant information for: ${originalRequest}`,
    task: `Manage and organize tasks related to: ${originalRequest}`,
    approval: `Handle approval workflow for: ${originalRequest}`,
    analytics: `Analyze trends and generate insights for: ${originalRequest}`,
  };

  return taskDescriptions[agentType] || `[${agentName}] Process: ${originalRequest}`;
}

function computeParallelGroups(subtasks: SubTask[]): string[][] {
  const groups: string[][] = [];
  const completed = new Set<string>();

  while (completed.size < subtasks.length) {
    const currentGroup: string[] = [];

    for (const task of subtasks) {
      if (completed.has(task.id)) continue;

      const depsReady = task.dependencies.every((depId) => completed.has(depId));
      if (depsReady) {
        currentGroup.push(task.assignedAgent);
      }
    }

    if (currentGroup.length === 0) {
      logger.warn("Circular dependency detected in subtasks");
      break;
    }

    groups.push(currentGroup);

    for (const task of subtasks) {
      if (!completed.has(task.id)) {
        const depsReady = task.dependencies.every((depId) => completed.has(depId));
        if (depsReady) {
          completed.add(task.id);
        }
      }
    }
  }

  return groups;
}

export function estimateTaskComplexity(request: string): "low" | "medium" | "high" {
  const decomposition = decomposeTask(request);

  if (!decomposition.requiresMultiAgent) {
    return "low";
  }

  if (decomposition.subtasks.length <= 3) {
    return "medium";
  }

  return "high";
}

export function suggestAgentsForTask(request: string): AgentType[] {
  const decomposition = decomposeTask(request);
  return decomposition.subtasks.map((t) => t.assignedAgent);
}
