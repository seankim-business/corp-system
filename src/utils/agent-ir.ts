/**
 * Agent Intermediate Representation (IR)
 *
 * A format-agnostic representation of an AI agent that can be converted
 * bidirectionally between OMC (markdown) and Nubabel (YAML) formats.
 */

/**
 * Model tier levels for agent complexity/capability
 */
export type ModelTier = "low" | "medium" | "high";

/**
 * Estimated cost category for the agent
 */
export type CostEstimate = "low" | "medium" | "high";

/**
 * Source system that the agent originated from
 */
export type AgentSource = "omc" | "nubabel";

/**
 * Model configuration for an agent
 */
export interface AgentModelConfig {
  /** Capability tier: low (haiku), medium (sonnet), high (opus) */
  tier: ModelTier;
  /** Temperature for response generation (0-1) */
  temperature?: number;
  /** Maximum tokens for response */
  maxTokens?: number;
  /** Original model name from source system */
  originalModel?: string;
}

/**
 * Tool access configuration
 */
export interface AgentToolConfig {
  /** Tools the agent is allowed to use */
  allowed: string[];
  /** Tools explicitly denied to the agent */
  denied?: string[];
}

/**
 * Permission configuration for Nubabel agents
 */
export interface AgentPermissions {
  /** Resource patterns the agent can read */
  read: string[];
  /** Resource patterns the agent can write */
  write: string[];
}

/**
 * Agent metadata for discovery and routing
 */
export interface AgentMetadata {
  /** Functional category (e.g., "development", "analysis", "design") */
  category?: string;
  /** Keywords for routing and discovery */
  keywords?: string[];
  /** Estimated operational cost */
  estimatedCost?: CostEstimate;
  /** Original file path if loaded from file */
  sourcePath?: string;
  /** Emoji identifier (Nubabel specific) */
  emoji?: string;
  /** Whether the agent is enabled */
  enabled?: boolean;
  /** Whether this is a fallback agent */
  fallback?: boolean;
  /** Skills the agent possesses (Nubabel specific) */
  skills?: string[];
  /** SOPs the agent follows (Nubabel specific) */
  sops?: string[];
  /** Agent function description (Nubabel specific) */
  function?: string;
}

/**
 * Intermediate Representation for agents
 *
 * This is the canonical format that both OMC and Nubabel agents
 * are converted to/from for interoperability.
 */
export interface AgentIR {
  /** Unique identifier for the agent */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of the agent's purpose */
  description: string;
  /** Source system: "omc" or "nubabel" */
  source: AgentSource;

  /** Model configuration */
  model: AgentModelConfig;

  /** System prompt / instructions for the agent */
  systemPrompt: string;
  /** Optional preamble for orchestrators */
  preamble?: string;

  /** Tool access configuration */
  tools: AgentToolConfig;

  /** Permission configuration (primarily for Nubabel) */
  permissions?: AgentPermissions;

  /** Additional metadata */
  metadata: AgentMetadata;
}

/**
 * Map from OMC model names to tiers
 */
export const OMC_MODEL_TO_TIER: Record<string, ModelTier> = {
  haiku: "low",
  sonnet: "medium",
  opus: "high",
};

/**
 * Map from tier to OMC model names
 */
export const TIER_TO_OMC_MODEL: Record<ModelTier, string> = {
  low: "haiku",
  medium: "sonnet",
  high: "opus",
};

/**
 * Infer tier from OMC agent name suffix
 */
export function inferTierFromName(name: string): ModelTier {
  if (name.endsWith("-low")) return "low";
  if (name.endsWith("-medium")) return "medium";
  if (name.endsWith("-high")) return "high";
  // Default to medium for base agents without suffix
  return "medium";
}

/**
 * Infer cost estimate from tier
 */
export function inferCostFromTier(tier: ModelTier): CostEstimate {
  return tier; // Direct mapping: low->low, medium->medium, high->high
}

/**
 * Normalize agent ID to a consistent format
 */
export function normalizeAgentId(id: string, source: AgentSource): string {
  // Remove source prefixes if present
  if (source === "omc" && id.startsWith("omc:")) {
    return id.slice(4);
  }
  if (source === "nubabel" && id.startsWith("nubabel:")) {
    return id.slice(8);
  }
  return id;
}

/**
 * Create a minimal AgentIR with required fields
 */
export function createMinimalAgentIR(
  id: string,
  name: string,
  source: AgentSource,
  tier: ModelTier = "medium"
): AgentIR {
  return {
    id,
    name,
    description: "",
    source,
    model: { tier },
    systemPrompt: "",
    tools: { allowed: [] },
    metadata: {},
  };
}

/**
 * Validate that an AgentIR has all required fields
 */
export function validateAgentIR(ir: AgentIR): string[] {
  const errors: string[] = [];

  if (!ir.id) errors.push("Missing required field: id");
  if (!ir.name) errors.push("Missing required field: name");
  if (!ir.source) errors.push("Missing required field: source");
  if (!ir.model) errors.push("Missing required field: model");
  if (!ir.model?.tier) errors.push("Missing required field: model.tier");
  if (!["low", "medium", "high"].includes(ir.model?.tier)) {
    errors.push(`Invalid model tier: ${ir.model?.tier}`);
  }
  if (!ir.tools) errors.push("Missing required field: tools");

  return errors;
}
