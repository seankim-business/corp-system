import { agentRegistry, AgentType, AgentDefinition } from "./agent-registry";
import { delegateTask } from "./delegate-task";
import { logger } from "../utils/logger";

export interface SubTask {
  id: string;
  description: string;
  assignedAgent: AgentType;
  dependencies: string[];
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface CoordinationPlan {
  id: string;
  originalRequest: string;
  subtasks: SubTask[];
  status: "planning" | "executing" | "completed" | "failed";
  createdAt: Date;
  completedAt?: Date;
}

export interface AgentExecutionContext {
  organizationId: string;
  userId: string;
  sessionId: string;
  parentTaskId?: string;
  depth: number;
  maxDepth: number;
  // Sub-agent spawning support (added in E2-T1)
  parentExecutionId?: string;
  rootExecutionId?: string;
}

export interface AgentExecutionResult {
  agentId: AgentType;
  success: boolean;
  output: string;
  metadata: {
    duration: number;
    model: string;
    delegatedTo?: AgentType[];
    tokensUsed?: number;
  };
  error?: string;
}

const MAX_DELEGATION_DEPTH = 3;
const MAX_PARALLEL_AGENTS = 5;

export function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export async function executeWithAgent(
  agentType: AgentType,
  prompt: string,
  context: AgentExecutionContext,
): Promise<AgentExecutionResult> {
  const agent = agentRegistry.getAgent(agentType);

  if (!agent) {
    return {
      agentId: agentType,
      success: false,
      output: "",
      metadata: { duration: 0, model: "unknown" },
      error: `Agent type '${agentType}' not found in registry`,
    };
  }

  if (context.depth >= context.maxDepth) {
    return {
      agentId: agentType,
      success: false,
      output: "",
      metadata: { duration: 0, model: "unknown" },
      error: `Maximum delegation depth (${context.maxDepth}) exceeded`,
    };
  }

  const startTime = Date.now();

  logger.info("Executing with agent", {
    agentType,
    agentName: agent.name,
    depth: context.depth,
    organizationId: context.organizationId,
  });

  const enhancedPrompt = buildAgentPrompt(agent, prompt);

  try {
    const result = await delegateTask({
      category: agent.category,
      load_skills: agent.skills,
      prompt: enhancedPrompt,
      session_id: context.sessionId,
      organizationId: context.organizationId,
      userId: context.userId,
    });

    const duration = Date.now() - startTime;

    logger.info("Agent execution completed", {
      agentType,
      success: result.status === "success",
      duration,
    });

    return {
      agentId: agentType,
      success: result.status === "success",
      output: result.output,
      metadata: {
        duration,
        model: result.metadata.model,
      },
      error: result.status === "failed" ? result.metadata.error : undefined,
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error(
      "Agent execution failed",
      { agentType, duration },
      error instanceof Error ? error : new Error(String(error)),
    );

    return {
      agentId: agentType,
      success: false,
      output: "",
      metadata: { duration, model: "unknown" },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildAgentPrompt(agent: AgentDefinition, userPrompt: string): string {
  return `${agent.systemPrompt}

---

USER REQUEST:
${userPrompt}

---

RESPONSE GUIDELINES:
- You are the ${agent.name} (${agent.emoji})
- Focus on your specialized capabilities
- Be concise and actionable
- If you need data from another agent, specify what you need`;
}

export async function coordinateAgents(
  _request: string,
  subtasks: SubTask[],
  context: AgentExecutionContext,
): Promise<Map<string, AgentExecutionResult>> {
  const results = new Map<string, AgentExecutionResult>();
  const completed = new Set<string>();

  const sortedTasks = topologicalSort(subtasks);

  for (const task of sortedTasks) {
    const canExecute = task.dependencies.every((depId) => completed.has(depId));

    if (!canExecute) {
      results.set(task.id, {
        agentId: task.assignedAgent,
        success: false,
        output: "",
        metadata: { duration: 0, model: "unknown" },
        error: "Dependencies not met",
      });
      continue;
    }

    const dependencyContext = buildDependencyContext(task.dependencies, results);

    const promptWithContext = dependencyContext
      ? `${task.description}\n\nCONTEXT FROM PREVIOUS AGENTS:\n${dependencyContext}`
      : task.description;

    const result = await executeWithAgent(task.assignedAgent, promptWithContext, {
      ...context,
      parentTaskId: task.id,
      depth: context.depth + 1,
    });

    results.set(task.id, result);

    if (result.success) {
      completed.add(task.id);
    }
  }

  return results;
}

export async function coordinateParallel(
  tasks: Array<{ agentType: AgentType; prompt: string }>,
  context: AgentExecutionContext,
): Promise<AgentExecutionResult[]> {
  const limitedTasks = tasks.slice(0, MAX_PARALLEL_AGENTS);

  logger.info("Starting parallel agent execution", {
    totalTasks: tasks.length,
    executingTasks: limitedTasks.length,
    maxParallel: MAX_PARALLEL_AGENTS,
  });

  const promises = limitedTasks.map((task) =>
    executeWithAgent(task.agentType, task.prompt, context),
  );

  const results = await Promise.all(promises);

  const successCount = results.filter((r) => r.success).length;
  logger.info("Parallel execution completed", {
    total: results.length,
    success: successCount,
    failed: results.length - successCount,
  });

  return results;
}

function topologicalSort(tasks: SubTask[]): SubTask[] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const result: SubTask[] = [];

  function visit(taskId: string) {
    if (visited.has(taskId)) return;
    visited.add(taskId);

    const task = taskMap.get(taskId);
    if (!task) return;

    for (const depId of task.dependencies) {
      visit(depId);
    }

    result.push(task);
  }

  for (const task of tasks) {
    visit(task.id);
  }

  return result;
}

function buildDependencyContext(
  dependencyIds: string[],
  results: Map<string, AgentExecutionResult>,
): string {
  const contextParts: string[] = [];

  for (const depId of dependencyIds) {
    const result = results.get(depId);
    if (result?.success) {
      const agent = agentRegistry.getAgent(result.agentId);
      contextParts.push(
        `[${agent?.emoji || "📋"} ${agent?.name || result.agentId}]:\n${result.output}`,
      );
    }
  }

  return contextParts.join("\n\n");
}

export function aggregateResults(results: Map<string, AgentExecutionResult>): string {
  const successResults: string[] = [];
  const failedAgents: string[] = [];

  for (const result of results.values()) {
    if (result.success) {
      const agent = agentRegistry.getAgent(result.agentId);
      successResults.push(
        `${agent?.emoji || "✅"} **${agent?.name || result.agentId}**: ${result.output}`,
      );
    } else {
      const agent = agentRegistry.getAgent(result.agentId);
      failedAgents.push(`${agent?.name || result.agentId}: ${result.error || "Unknown error"}`);
    }
  }

  let aggregated = successResults.join("\n\n");

  if (failedAgents.length > 0) {
    aggregated += `\n\n⚠️ **Some agents encountered issues:**\n${failedAgents.join("\n")}`;
  }

  return aggregated;
}

export { MAX_DELEGATION_DEPTH, MAX_PARALLEL_AGENTS };
