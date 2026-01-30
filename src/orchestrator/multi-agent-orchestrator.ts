/**
 * Multi-Agent Orchestrator
 *
 * This module integrates the new agent system with the existing orchestrator:
 * - Agent Registry: 8 specialized agents (data, report, comms, search, task, approval, analytics, orchestrator)
 * - Agent Coordinator: Multi-agent coordination with parallel execution
 * - Task Decomposer: Break complex requests into subtasks
 * - Proactive Monitor: Risk detection and alerts
 * - Task Prioritizer: Auto-prioritization using Eisenhower matrix
 */

import { agentRegistry, AgentType } from "./agent-registry";
import {
  coordinateAgents,
  coordinateParallel,
  aggregateResults,
  AgentExecutionContext,
  AgentExecutionResult,
} from "./agent-coordinator";
import { decomposeTask, DecompositionResult, estimateTaskComplexity } from "./task-decomposer";
import { OrchestrationRequest, OrchestrationResult } from "./types";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";
import { db as prisma } from "../db/client";

// ============================================================================
// Loop Detection System
// ============================================================================

export interface LoopDetectionConfig {
  /** Maximum iterations before forced termination (default: 10) */
  maxIterations: number;
  /** Maximum depth for circular dependency detection (default: 5) */
  maxDependencyDepth: number;
  /** Enable task repetition detection (default: true) */
  detectTaskRepetition: boolean;
  /** Similarity threshold for task comparison (0-1, default: 0.85) */
  similarityThreshold: number;
}

export interface LoopDetectionState {
  /** Track task hashes executed by each agent */
  agentTaskHistory: Map<AgentType, string[]>;
  /** Track agent execution chain for circular dependency detection */
  executionChain: AgentType[];
  /** Current iteration count */
  iterationCount: number;
  /** Detected loops */
  detectedLoops: LoopInfo[];
}

export interface LoopInfo {
  type: "task-repetition" | "circular-dependency";
  agents: AgentType[];
  description: string;
  timestamp: number;
}

export interface LoopDetectionResult {
  loopDetected: boolean;
  loopType?: "task-repetition" | "circular-dependency" | "max-iterations";
  summary: string;
  detectedLoops: LoopInfo[];
  iterationCount: number;
}

const DEFAULT_LOOP_CONFIG: LoopDetectionConfig = {
  maxIterations: 10,
  maxDependencyDepth: 5,
  detectTaskRepetition: true,
  similarityThreshold: 0.85,
};

/**
 * Create a hash from a task description for comparison
 */
function hashTask(task: string): string {
  // Normalize and create a simple hash
  const normalized = task.toLowerCase().trim().replace(/\s+/g, " ");
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
}


/**
 * Detect circular dependencies in agent execution chain (A→B→C→A)
 */
function detectCircularDependency(
  chain: AgentType[],
  newAgent: AgentType,
  maxDepth: number
): { detected: boolean; cycle: AgentType[] } {
  // Check if new agent already exists in the recent chain
  const recentChain = chain.slice(-maxDepth);
  const agentIndex = recentChain.indexOf(newAgent);
  
  if (agentIndex !== -1) {
    // Found a cycle: extract the circular path
    const cycle = [...recentChain.slice(agentIndex), newAgent];
    return { detected: true, cycle };
  }
  
  return { detected: false, cycle: [] };
}

/**
 * Detect if an agent is repeating the same task
 */
function detectTaskRepetition(
  agentHistory: string[],
  newTaskHash: string,
  _config: LoopDetectionConfig
): boolean {
  // Check for exact hash match
  if (agentHistory.includes(newTaskHash)) {
    return true;
  }
  return false;
}

/**
 * Initialize loop detection state
 */
export function initLoopDetectionState(): LoopDetectionState {
  return {
    agentTaskHistory: new Map(),
    executionChain: [],
    iterationCount: 0,
    detectedLoops: [],
  };
}

/**
 * Check for loops before executing an agent task
 */
export function checkForLoop(
  state: LoopDetectionState,
  agentType: AgentType,
  task: string,
  config: LoopDetectionConfig = DEFAULT_LOOP_CONFIG
): LoopDetectionResult {
  state.iterationCount++;
  
  // Check max iterations
  if (state.iterationCount > config.maxIterations) {
    return {
      loopDetected: true,
      loopType: "max-iterations",
      summary: `Maximum iterations (${config.maxIterations}) exceeded. Forcing termination to prevent infinite loop.`,
      detectedLoops: state.detectedLoops,
      iterationCount: state.iterationCount,
    };
  }
  
  // Check for circular dependencies
  const circularCheck = detectCircularDependency(
    state.executionChain,
    agentType,
    config.maxDependencyDepth
  );
  
  if (circularCheck.detected) {
    const loopInfo: LoopInfo = {
      type: "circular-dependency",
      agents: circularCheck.cycle,
      description: `Circular dependency detected: ${circularCheck.cycle.join(" → ")}`,
      timestamp: Date.now(),
    };
    state.detectedLoops.push(loopInfo);
    
    return {
      loopDetected: true,
      loopType: "circular-dependency",
      summary: `Circular dependency detected: ${circularCheck.cycle.join(" → ")}. Terminating to prevent infinite loop.`,
      detectedLoops: state.detectedLoops,
      iterationCount: state.iterationCount,
    };
  }
  
  // Check for task repetition
  if (config.detectTaskRepetition) {
    const taskHash = hashTask(task);
    const agentHistory = state.agentTaskHistory.get(agentType) || [];
    
    if (detectTaskRepetition(agentHistory, taskHash, config)) {
      const loopInfo: LoopInfo = {
        type: "task-repetition",
        agents: [agentType],
        description: `Agent ${agentType} attempted to repeat the same task`,
        timestamp: Date.now(),
      };
      state.detectedLoops.push(loopInfo);
      
      return {
        loopDetected: true,
        loopType: "task-repetition",
        summary: `Agent ${agentType} is repeating the same task. Terminating to prevent infinite loop.`,
        detectedLoops: state.detectedLoops,
        iterationCount: state.iterationCount,
      };
    }
    
    // Update history
    agentHistory.push(taskHash);
    state.agentTaskHistory.set(agentType, agentHistory);
  }
  
  // Update execution chain
  state.executionChain.push(agentType);
  
  return {
    loopDetected: false,
    summary: "No loop detected",
    detectedLoops: state.detectedLoops,
    iterationCount: state.iterationCount,
  };
}

/**
 * Generate a summary when loop is detected for graceful exit
 */
export function generateLoopExitSummary(
  state: LoopDetectionState,
  partialResults: Map<string, AgentExecutionResult>
): string {
  const completedTasks = Array.from(partialResults.entries())
    .filter(([_, result]) => result.success)
    .map(([taskId, result]) => `- ${taskId}: ${result.output.substring(0, 100)}...`);
  
  const loopSummary = state.detectedLoops
    .map((loop) => `- ${loop.type}: ${loop.description}`)
    .join("\n");
  
  return `
## Loop Detection Summary

**Status:** Terminated due to loop detection
**Total Iterations:** ${state.iterationCount}

### Detected Loops:
${loopSummary || "None"}

### Completed Tasks Before Termination:
${completedTasks.length > 0 ? completedTasks.join("\n") : "None"}

### Execution Chain:
${state.executionChain.join(" → ")}

**Recommendation:** Review the task decomposition to avoid circular dependencies or repetitive tasks.
`.trim();
}

export interface MultiAgentRequest extends OrchestrationRequest {
  enableMultiAgent?: boolean;
  maxAgents?: number;
  enableParallel?: boolean;
  timeout?: number;
  /** Loop detection configuration */
  loopDetection?: Partial<LoopDetectionConfig>;
}

export interface MultiAgentResult extends OrchestrationResult {
  multiAgentMetadata?: {
    agentsUsed: AgentType[];
    decomposition?: DecompositionResult;
    executionMode: "single" | "sequential" | "parallel";
    subtaskResults?: Map<string, AgentExecutionResult>;
    /** Loop detection information */
    loopDetection?: LoopDetectionResult;
  };
}

const MAX_AGENTS_PER_REQUEST = 5;
const DEFAULT_TIMEOUT_MS = 120000;

/**
 * Orchestrate a request using the multi-agent system
 *
 * This function:
 * 1. Analyzes the request complexity
 * 2. Decomposes into subtasks if multi-agent is beneficial
 * 3. Executes with appropriate agents (single, sequential, or parallel)
 * 4. Aggregates and returns results
 */
export async function orchestrateMultiAgent(request: MultiAgentRequest): Promise<MultiAgentResult> {
  const startTime = Date.now();
  const {
    userRequest,
    sessionId,
    organizationId,
    userId,
    enableMultiAgent = true,
    maxAgents = MAX_AGENTS_PER_REQUEST,
    enableParallel = true,
    timeout = DEFAULT_TIMEOUT_MS,
    loopDetection: loopDetectionConfig,
  } = request;

  // Initialize loop detection
  const loopConfig: LoopDetectionConfig = {
    ...DEFAULT_LOOP_CONFIG,
    ...loopDetectionConfig,
  };
  const loopState = initLoopDetectionState();

  logger.info("Multi-agent orchestration started", {
    sessionId,
    organizationId,
    enableMultiAgent,
    enableParallel,
    requestLength: userRequest.length,
  });

  metrics.increment("multi_agent.orchestration_started", { organizationId });

  // Root execution ID for tracking (only created if multi-agent is used)
  let rootExecutionId: string | undefined;

  try {
    const complexity = estimateTaskComplexity(userRequest);

    if (!enableMultiAgent || complexity === "low") {
      logger.debug("Using single-agent execution", { complexity });
      return executeSingleAgent(request);
    }

    const decomposition = decomposeTask(userRequest);

    if (!decomposition.requiresMultiAgent) {
      logger.debug("Task does not require multi-agent", {
        subtaskCount: decomposition.subtasks.length,
      });
      return executeSingleAgent(request);
    }

    const limitedSubtasks = decomposition.subtasks.slice(0, maxAgents);

    logger.info("Multi-agent decomposition complete", {
      originalSubtasks: decomposition.subtasks.length,
      limitedSubtasks: limitedSubtasks.length,
      complexity: decomposition.estimatedComplexity,
      parallelGroups: decomposition.suggestedParallelization.length,
    });

    // Create root execution for tracking sub-agent spawns (E2-T1)
    const rootExecution = await prisma.orchestratorExecution.create({
      data: {
        organizationId,
        userId,
        sessionId,
        category: "multi-agent-root",
        skills: [],
        status: "running",
        duration: 0,
        inputData: {
          request: userRequest,
          enableMultiAgent,
          enableParallel,
        },
        metadata: {
          complexity: decomposition.estimatedComplexity,
          subtaskCount: decomposition.subtasks.length,
        },
      },
    });

    rootExecutionId = rootExecution.id;

    const context: AgentExecutionContext = {
      organizationId,
      userId,
      sessionId,
      depth: 0,
      maxDepth: 3,
      rootExecutionId,
    };

    let results: Map<string, AgentExecutionResult>;
    let executionMode: "sequential" | "parallel";
    let loopResult: LoopDetectionResult | undefined;

    if (enableParallel && canExecuteInParallel(decomposition)) {
      executionMode = "parallel";
      
      // Check for loops before parallel execution
      for (const subtask of limitedSubtasks) {
        loopResult = checkForLoop(loopState, subtask.assignedAgent, subtask.description, loopConfig);
        if (loopResult.loopDetected) {
          logger.warn("Loop detected before parallel execution", {
            loopType: loopResult.loopType,
            summary: loopResult.summary,
          });
          
          const summary = generateLoopExitSummary(loopState, new Map());
          return {
            output: summary,
            status: "failed",
            metadata: {
              category: "unspecified-high",
              skills: [],
              duration: Date.now() - startTime,
              model: "multi-agent",
              sessionId,
            },
            multiAgentMetadata: {
              agentsUsed: [],
              decomposition,
              executionMode,
              loopDetection: loopResult,
            },
          };
        }
      }
      
      const parallelTasks = limitedSubtasks.map((subtask) => ({
        agentType: subtask.assignedAgent,
        prompt: subtask.description,
      }));

      const parallelResults = await Promise.race([
        coordinateParallel(parallelTasks, context),
        createTimeoutPromise<AgentExecutionResult[]>(timeout),
      ]);

      results = new Map();
      parallelResults.forEach((result, index) => {
        results.set(limitedSubtasks[index].id, result);
      });
    } else {
      executionMode = "sequential";
      results = new Map();
      
      // Execute sequentially with loop detection
      for (const subtask of limitedSubtasks) {
        loopResult = checkForLoop(loopState, subtask.assignedAgent, subtask.description, loopConfig);
        
        if (loopResult.loopDetected) {
          logger.warn("Loop detected during sequential execution", {
            loopType: loopResult.loopType,
            summary: loopResult.summary,
            completedTasks: results.size,
          });
          
          metrics.increment("multi_agent.loop_detected", {
            organizationId,
            loopType: loopResult.loopType || "unknown",
          });
          
          const summary = generateLoopExitSummary(loopState, results);
          return {
            output: summary,
            status: "failed",
            metadata: {
              category: "unspecified-high",
              skills: [],
              duration: Date.now() - startTime,
              model: "multi-agent",
              sessionId,
            },
            multiAgentMetadata: {
              agentsUsed: Array.from(results.values()).map((r) => r.agentId),
              decomposition,
              executionMode,
              subtaskResults: results,
              loopDetection: loopResult,
            },
          };
        }
        
        // Execute single subtask
        const singleTaskResults = await Promise.race([
          coordinateAgents(userRequest, [subtask], context),
          createTimeoutPromise<Map<string, AgentExecutionResult>>(timeout),
        ]);
        
        // Merge results
        singleTaskResults.forEach((value, key) => {
          results.set(key, value);
        });
      }
    }

    const aggregatedOutput = aggregateResults(results);

    const successCount = Array.from(results.values()).filter((r) => r.success).length;
    const failedCount = results.size - successCount;

    const duration = Date.now() - startTime;

    await saveMultiAgentExecution({
      organizationId,
      userId,
      sessionId,
      request: userRequest,
      decomposition,
      results,
      duration,
      executionMode,
    });

    // Update root execution status (E2-T1)
    if (rootExecutionId) {
      await prisma.orchestratorExecution.update({
        where: { id: rootExecutionId },
        data: {
          status: failedCount === 0 ? "success" : "failed",
          duration,
          outputData: {
            aggregatedOutput,
            agentsUsed: Array.from(results.values()).map((r) => r.agentId),
          },
        },
      });
    }

    metrics.increment("multi_agent.orchestration_completed", {
      organizationId,
      executionMode,
      success: String(failedCount === 0),
    });

    metrics.histogram("multi_agent.orchestration_duration", duration, {
      executionMode,
      agentCount: String(results.size),
    });

    logger.info("Multi-agent orchestration completed", {
      duration,
      executionMode,
      agentsUsed: Array.from(results.values()).map((r) => r.agentId),
      successCount,
      failedCount,
    });

    return {
      output: aggregatedOutput,
      status: failedCount === 0 ? "success" : "failed",
      metadata: {
        category: "unspecified-high",
        skills: [],
        duration,
        model: "multi-agent",
        sessionId,
      },
      multiAgentMetadata: {
        agentsUsed: Array.from(results.values()).map((r) => r.agentId),
        decomposition,
        executionMode,
        subtaskResults: results,
        loopDetection: {
          loopDetected: false,
          summary: "Execution completed without loops",
          detectedLoops: loopState.detectedLoops,
          iterationCount: loopState.iterationCount,
        },
      },
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      "Multi-agent orchestration failed",
      { sessionId, organizationId, duration, rootExecutionId },
      error instanceof Error ? error : new Error(errorMessage),
    );

    metrics.increment("multi_agent.orchestration_failed", { organizationId });

    // Update root execution status on error (E2-T1)
    if (rootExecutionId) {
      await prisma.orchestratorExecution
        .update({
          where: { id: rootExecutionId },
          data: {
            status: "failed",
            duration,
            errorMessage,
          },
        })
        .catch((updateError) => {
          logger.warn("Failed to update root execution on error", {
            rootExecutionId,
            error: updateError instanceof Error ? updateError.message : String(updateError),
          });
        });
    }

    return {
      output: `Multi-agent orchestration failed: ${errorMessage}`,
      status: "failed",
      metadata: {
        category: "unspecified-high",
        skills: [],
        duration,
        model: "multi-agent",
        sessionId,
      },
    };
  }
}

async function executeSingleAgent(request: MultiAgentRequest): Promise<MultiAgentResult> {
  const { userRequest, sessionId, organizationId, userId } = request;

  const keywords = userRequest.toLowerCase().split(/\s+/);
  const selectedAgent = agentRegistry.selectAgentForTask(userRequest, keywords);
  const agent = agentRegistry.getAgent(selectedAgent);

  logger.debug("Single agent selected", {
    agent: selectedAgent,
    agentName: agent?.name,
  });

  const { orchestrate } = await import("./index");

  const result = await orchestrate({
    userRequest,
    sessionId,
    organizationId,
    userId,
  });

  return {
    ...result,
    multiAgentMetadata: {
      agentsUsed: [selectedAgent],
      executionMode: "single",
    },
  };
}

function canExecuteInParallel(decomposition: DecompositionResult): boolean {
  const firstGroup = decomposition.suggestedParallelization[0];
  if (!firstGroup) return false;

  return firstGroup.length > 1 || decomposition.suggestedParallelization.length === 1;
}

function createTimeoutPromise<T>(ms: number): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);
  });
}

async function saveMultiAgentExecution(data: {
  organizationId: string;
  userId: string;
  sessionId: string;
  request: string;
  decomposition: DecompositionResult;
  results: Map<string, AgentExecutionResult>;
  duration: number;
  executionMode: string;
}): Promise<void> {
  try {
    const resultsArray = Array.from(data.results.entries()).map(([taskId, result]) => ({
      taskId,
      agentId: result.agentId,
      success: result.success,
      output: result.output.substring(0, 1000),
      duration: result.metadata.duration,
    }));

    await prisma.orchestratorExecution.create({
      data: {
        organizationId: data.organizationId,
        userId: data.userId,
        sessionId: data.sessionId,
        category: "multi-agent",
        skills: [],
        status: resultsArray.every((r) => r.success) ? "success" : "failed",
        duration: data.duration,
        inputData: {
          prompt: data.request,
          decomposition: {
            requiresMultiAgent: data.decomposition.requiresMultiAgent,
            estimatedComplexity: data.decomposition.estimatedComplexity,
            subtaskCount: data.decomposition.subtasks.length,
          },
        },
        outputData: {
          results: resultsArray,
        },
        metadata: {
          executionMode: data.executionMode,
          agentsUsed: resultsArray.map((r) => r.agentId),
          subtaskCount: data.decomposition.subtasks.length,
        },
      },
    });
  } catch (error) {
    logger.warn("Failed to save multi-agent execution", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Check if a request should use multi-agent orchestration
 */
export function shouldUseMultiAgent(request: string): boolean {
  const complexity = estimateTaskComplexity(request);
  const decomposition = decomposeTask(request);

  return complexity !== "low" && decomposition.requiresMultiAgent;
}

/**
 * Get suggested agents for a request
 */
export function getSuggestedAgents(request: string): AgentType[] {
  const decomposition = decomposeTask(request);
  return decomposition.subtasks.map((t) => t.assignedAgent);
}

/**
 * Get all available agents
 */
export function getAvailableAgents() {
  return agentRegistry.getAllAgents().map((agent) => ({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    emoji: agent.emoji,
    capabilities: agent.capabilities.map((c) => c.name),
  }));
}
