/**
 * Unified Skill Interface
 *
 * Defines the common structure for skills from both OMC (oh-my-claudecode) and Nubabel sources.
 * Enables unified routing and selection across skill providers.
 */

/**
 * Source of the skill definition
 */
export type SkillSource = "omc" | "nubabel" | "hybrid";

/**
 * Cost estimation tier for skill execution
 */
export type SkillCostTier = "low" | "medium" | "high";

/**
 * Unified skill interface supporting both OMC and Nubabel skills
 */
export interface UnifiedSkill {
  /** Unique skill identifier (e.g., "autopilot", "git-master") */
  name: string;

  /** Human-readable description */
  description: string;

  /** Origin of the skill definition */
  source: SkillSource;

  /** Keywords that trigger this skill (case-insensitive) */
  keywords: string[];

  /** Priority for conflict resolution (higher wins) */
  priority: number;

  // OMC-specific properties
  /** Path to OMC SKILL.md file */
  omcSkillPath?: string;

  /** OMC agents this skill can invoke */
  omcAgents?: string[];

  /** Whether this is an OMC execution mode (autopilot, ralph, ultrawork, etc.) */
  omcExecutionMode?: boolean;

  // Nubabel-specific properties
  /** ID of the Nubabel agent that handles this skill */
  nubabelAgentId?: string;

  /** Nubabel tools this skill can use */
  nubabelTools?: string[];

  /** MCP connections required by this skill */
  nubabelMcpRequired?: string[];

  // Routing metadata
  /** Whether external authentication is required */
  requiresAuth: boolean;

  /** Estimated cost tier for execution */
  estimatedCost: SkillCostTier;

  /** Maximum execution duration in milliseconds */
  maxDuration: number;

  /** Categories this skill applies to */
  applicableCategories?: string[];

  /** Skills that conflict with this one */
  conflictsWith?: string[];

  /** Skills that this one depends on */
  dependsOn?: string[];
}

/**
 * OMC skill metadata extracted from SKILL.md frontmatter
 */
export interface OmcSkillMetadata {
  name: string;
  description: string;
  argumentHint?: string;
}

/**
 * Parsed OMC skill from SKILL.md file
 */
export interface ParsedOmcSkill {
  metadata: OmcSkillMetadata;
  content: string;
  magicKeywords: string[];
  agents: string[];
  filePath: string;
}

/**
 * Skill match result from keyword-based routing
 */
export interface SkillMatchResult {
  skill: UnifiedSkill;
  matchedKeywords: string[];
  score: number;
  source: SkillSource;
}

/**
 * Skill routing decision
 */
export interface SkillRoutingDecision {
  /** Selected skill (if any) */
  selectedSkill: UnifiedSkill | null;

  /** All matching skills with scores */
  matches: SkillMatchResult[];

  /** Skills that were excluded due to conflicts */
  conflicts: Array<{ skill: UnifiedSkill; conflictsWith: string }>;

  /** Routing method used */
  method: "keyword" | "explicit" | "default" | "none";

  /** Time taken for routing decision in ms */
  routingTimeMs: number;
}

/**
 * Configuration for skill registry
 */
export interface SkillRegistryConfig {
  /** Path to OMC skills directory */
  omcSkillsPath?: string;

  /** Path to Nubabel skills config */
  nubabelSkillsPath?: string;

  /** Whether to enable OMC skill loading */
  enableOmcSkills?: boolean;

  /** Whether to enable Nubabel skill loading */
  enableNubabelSkills?: boolean;

  /** Cache TTL in milliseconds */
  cacheTtlMs?: number;
}

/**
 * Skill registry state
 */
export interface SkillRegistryState {
  /** All registered skills */
  skills: Map<string, UnifiedSkill>;

  /** Last load timestamp */
  lastLoadedAt: Date | null;

  /** Whether registry is initialized */
  initialized: boolean;

  /** Error from last load attempt (if any) */
  lastError?: Error;
}
