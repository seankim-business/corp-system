import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { Category } from './types';
import { AgentType } from './agent-registry';

// Types
export type OMCTier = 'LOW' | 'MEDIUM' | 'HIGH';

export interface OMCDelegationRule {
  pattern: string;
  omc_agent: string;
  nubabel_agent: AgentType;
  tier: OMCTier;
  category: Category;
}

export interface ApprovalThreshold {
  type: string;
  minAmount?: number;
  maxAmount?: number;
  approver: string;
  timeoutHours: number;
}

export interface OMCConfig {
  delegationRules: OMCDelegationRule[];
  approvalMatrix: ApprovalThreshold[];
  agentMapping: Record<string, AgentType>;
}

export interface OMCRoutingResult {
  useOMC: boolean;
  omcAgent?: string;
  nubabelAgent?: AgentType;
  tier?: OMCTier;
  category?: Category;
  reason: string;
}

/**
 * Build static mapping from OMC agents to Nubabel agents
 * Based on plan section 2.4 (lines 383-408)
 */
function buildAgentMapping(): Record<string, AgentType> {
  return {
    // Analysis domain
    'architect': 'orchestrator',
    'architect-low': 'orchestrator',
    'architect-medium': 'orchestrator',

    // Execution domain
    'executor': 'task',
    'executor-low': 'task',
    'executor-high': 'task',

    // Search/Exploration domain
    'explore': 'search',
    'explore-medium': 'search',
    'explore-high': 'search',

    // Research domain
    'researcher': 'data',
    'researcher-low': 'data',
    'researcher-high': 'analytics',

    // Design domain (closest match to Nubabel)
    'designer': 'report',
    'designer-low': 'report',
    'designer-high': 'report',

    // Documentation domain
    'writer': 'report',

    // Data science domain
    'scientist': 'data',
    'scientist-low': 'data',
    'scientist-high': 'analytics',

    // QA domain (verification role)
    'qa-tester': 'approval',
    'qa-tester-high': 'approval',

    // Security domain
    'security-reviewer': 'orchestrator',
    'security-reviewer-low': 'orchestrator',

    // Build/DevOps domain
    'build-fixer': 'task',
    'build-fixer-low': 'task',

    // TDD domain
    'tdd-guide': 'task',
    'tdd-guide-low': 'task',

    // Code Review domain
    'code-reviewer': 'orchestrator',
    'code-reviewer-low': 'orchestrator',

    // Planning domain
    'planner': 'orchestrator',
    'critic': 'orchestrator',
    'analyst': 'analytics',

    // Visual analysis
    'vision': 'data',

    // Nubabel-specific agents (preserved)
    'comms': 'comms',
    'approval': 'approval',
    'orchestrator': 'orchestrator',
    'data': 'data',
    'report': 'report',
    'search': 'search',
    'task': 'task',
    'analytics': 'analytics',
  };
}

/**
 * Load OMC configuration from .omc/config/ directory
 * Returns null if config doesn't exist (graceful degradation)
 * Based on plan section 2.4 (lines 354-378)
 */
export function loadOMCConfig(): OMCConfig | null {
  const configPath = join(process.cwd(), '.omc', 'config');

  if (!existsSync(configPath)) {
    return null; // OMC not configured - graceful degradation
  }

  try {
    const delegationPath = join(configPath, 'delegation-rules.yaml');
    const approvalPath = join(configPath, 'approval-matrix.yaml');

    let delegationRules: OMCDelegationRule[] = [];
    if (existsSync(delegationPath)) {
      const parsed = parseYaml(readFileSync(delegationPath, 'utf-8'));
      delegationRules = parsed?.rules || [];
    }

    let approvalMatrix: ApprovalThreshold[] = [];
    if (existsSync(approvalPath)) {
      const parsed = parseYaml(readFileSync(approvalPath, 'utf-8'));
      // Flatten all threshold types into a single array
      const thresholds = parsed?.thresholds || {};
      approvalMatrix = [
        ...(thresholds.expense || []),
        ...(thresholds.content_publish || []),
        ...(thresholds.process_change || []),
        ...(thresholds.code_change || []),
      ];
    }

    return {
      delegationRules,
      approvalMatrix,
      agentMapping: buildAgentMapping(),
    };
  } catch (error) {
    console.warn('OMC config load failed, using defaults:', error);
    return null;
  }
}

/**
 * Determine if a request should be routed through OMC patterns
 * Based on plan section 2.4 (lines 414-437)
 *
 * @param userRequest - The user's request string
 * @returns Routing decision with agent and tier information
 */
export function shouldDelegateToOMC(userRequest: string): OMCRoutingResult {
  const config = loadOMCConfig();

  if (!config) {
    return {
      useOMC: false,
      reason: 'OMC not configured'
    };
  }

  // Check delegation rules with pattern matching
  for (const rule of config.delegationRules) {
    const regex = new RegExp(rule.pattern, 'i');
    if (regex.test(userRequest)) {
      return {
        useOMC: true,
        omcAgent: rule.omc_agent,
        nubabelAgent: rule.nubabel_agent,
        tier: rule.tier,
        category: rule.category,
        reason: `Matched rule: ${rule.pattern}`
      };
    }
  }

  return {
    useOMC: false,
    reason: 'No matching OMC rule'
  };
}

/**
 * Get Nubabel agent for a given OMC agent
 * Useful for reverse mapping when processing OMC-style requests
 *
 * @param omcAgent - OMC agent identifier (e.g., 'architect-low')
 * @returns Corresponding Nubabel agent type or null if not found
 */
export function getOMCAgentForNubabel(omcAgent: string): AgentType | null {
  const config = loadOMCConfig();

  if (!config) {
    return null;
  }

  const nubabelAgent = config.agentMapping[omcAgent];
  return nubabelAgent || null;
}

/**
 * Get approval threshold configuration for a given request type
 *
 * @param requestType - Type of request (e.g., 'expense', 'content_publish')
 * @param amount - Optional amount for threshold calculation
 * @returns Approval threshold configuration or null if not found
 */
export function getApprovalThreshold(
  requestType: string,
  amount?: number
): ApprovalThreshold | null {
  const config = loadOMCConfig();

  if (!config) {
    return null;
  }

  // Find matching approval threshold
  const thresholds = config.approvalMatrix.filter(t => t.type === requestType);

  if (thresholds.length === 0) {
    return null;
  }

  // If amount is provided, find the appropriate threshold range
  if (amount !== undefined) {
    for (const threshold of thresholds) {
      const meetsMin = threshold.minAmount === undefined || amount >= threshold.minAmount;
      const meetsMax = threshold.maxAmount === undefined || amount <= threshold.maxAmount;

      if (meetsMin && meetsMax) {
        return threshold;
      }
    }
  }

  // Return first matching threshold if no amount specified
  return thresholds[0];
}

/**
 * Get all available OMC agents from the mapping
 * Useful for discovering available agent types
 *
 * @returns Array of OMC agent identifiers
 */
export function getAvailableOMCAgents(): string[] {
  const mapping = buildAgentMapping();
  return Object.keys(mapping).filter(key => {
    // Only return OMC-specific agents (exclude Nubabel-native)
    return !['comms', 'approval', 'orchestrator', 'data', 'report', 'search', 'task', 'analytics'].includes(key);
  });
}
