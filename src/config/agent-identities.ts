/**
 * Agent Identity Configuration
 *
 * Defines visual identities (name, icon) for different agent types when posting to Slack.
 * Each identity represents a specific role or processing stage in the AI workflow.
 */

/**
 * Agent identity interface defining display properties
 */
export interface AgentIdentity {
  /** Unique identifier for the agent type */
  id: string;
  /** Display name shown in Slack messages */
  name: string;
  /** Slack emoji code for icon_emoji parameter */
  emoji: string;
  /** Human-readable description of the agent's role */
  description: string;
}

/**
 * Agent identity map keyed by agent type
 */
const AGENT_IDENTITIES: Record<string, AgentIdentity> = {
  // Default fallback identity
  default: {
    id: "default",
    name: "Nubabel",
    emoji: ":robot_face:",
    description: "General AI assistant",
  },

  // Processing stages
  analyzing: {
    id: "analyzing",
    name: "Nubabel Analyzer",
    emoji: ":mag:",
    description: "Analyzing your request",
  },
  searching: {
    id: "searching",
    name: "Nubabel Search",
    emoji: ":female-detective:",
    description: "Searching for information",
  },
  executing: {
    id: "executing",
    name: "Nubabel Executor",
    emoji: ":zap:",
    description: "Executing task",
  },
  generating: {
    id: "generating",
    name: "Nubabel Writer",
    emoji: ":pencil2:",
    description: "Generating response",
  },

  // MCP Provider-specific identities
  notion: {
    id: "notion",
    name: "Nubabel × Notion",
    emoji: ":spiral_note_pad:",
    description: "Working with Notion",
  },
  linear: {
    id: "linear",
    name: "Nubabel × Linear",
    emoji: ":ticket:",
    description: "Working with Linear",
  },
  github: {
    id: "github",
    name: "Nubabel × GitHub",
    emoji: ":octocat:",
    description: "Working with GitHub",
  },
  slack: {
    id: "slack",
    name: "Nubabel × Slack",
    emoji: ":speech_balloon:",
    description: "Working with Slack",
  },
};

/**
 * Get agent identity by agent type
 *
 * @param agentType - The agent type identifier
 * @returns The matching agent identity or default fallback
 *
 * @example
 * ```typescript
 * const identity = getAgentIdentity("notion");
 * console.log(identity.name); // "Nubabel × Notion"
 * ```
 */
export function getAgentIdentity(agentType: string): AgentIdentity {
  return AGENT_IDENTITIES[agentType] ?? AGENT_IDENTITIES.default;
}

/**
 * Get all available agent identities
 *
 * @returns Array of all defined agent identities
 *
 * @example
 * ```typescript
 * const allIdentities = getAllIdentities();
 * console.log(allIdentities.length); // 9
 * ```
 */
export function getAllIdentities(): AgentIdentity[] {
  return Object.values(AGENT_IDENTITIES);
}

/**
 * Check if an agent type has a custom identity defined
 *
 * @param agentType - The agent type identifier
 * @returns True if custom identity exists, false if would use default
 *
 * @example
 * ```typescript
 * hasCustomIdentity("notion"); // true
 * hasCustomIdentity("unknown"); // false
 * ```
 */
export function hasCustomIdentity(agentType: string): boolean {
  return agentType in AGENT_IDENTITIES && agentType !== "default";
}

/**
 * Get list of all available agent type identifiers
 *
 * @returns Array of agent type IDs
 */
export function getAvailableAgentTypes(): string[] {
  return Object.keys(AGENT_IDENTITIES);
}
