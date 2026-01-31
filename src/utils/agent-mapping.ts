/**
 * OMC <-> Nubabel Agent Mapping
 *
 * Maps the 32 OMC agents to their Nubabel equivalents and vice versa.
 * This enables seamless interoperability between the two systems.
 */

import { ModelTier } from "./agent-ir";

/**
 * Agent mapping entry
 */
export interface AgentMapping {
  /** OMC agent name (e.g., "executor", "executor-high") */
  omcName: string;
  /** OMC model tier */
  omcTier: ModelTier;
  /** OMC model name */
  omcModel: "haiku" | "sonnet" | "opus";
  /** Suggested Nubabel equivalent agent ID */
  nubabelEquivalent: string;
  /** Functional category */
  category: string;
  /** Brief description */
  description: string;
  /** Primary capabilities */
  capabilities: string[];
}

/**
 * Complete mapping of all 32 OMC agents
 */
export const OMC_AGENT_MAPPING: AgentMapping[] = [
  // === EXECUTION TIER ===
  {
    omcName: "executor-low",
    omcTier: "low",
    omcModel: "haiku",
    nubabelEquivalent: "task-executor-low",
    category: "execution",
    description: "Simple single-file task executor",
    capabilities: ["single-file-edits", "simple-fixes", "config-updates"],
  },
  {
    omcName: "executor",
    omcTier: "medium",
    omcModel: "sonnet",
    nubabelEquivalent: "task-executor",
    category: "execution",
    description: "Focused task executor for implementation work",
    capabilities: ["multi-step-tasks", "feature-implementation", "refactoring"],
  },
  {
    omcName: "executor-high",
    omcTier: "high",
    omcModel: "opus",
    nubabelEquivalent: "task-executor-high",
    category: "execution",
    description: "Complex multi-file task executor",
    capabilities: [
      "multi-file-refactoring",
      "architectural-changes",
      "complex-algorithms",
    ],
  },

  // === ARCHITECTURE/ANALYSIS TIER ===
  {
    omcName: "architect-low",
    omcTier: "low",
    omcModel: "haiku",
    nubabelEquivalent: "code-analyzer-low",
    category: "analysis",
    description: "Quick code analysis and simple debugging",
    capabilities: ["quick-analysis", "simple-debugging", "code-review"],
  },
  {
    omcName: "architect-medium",
    omcTier: "medium",
    omcModel: "sonnet",
    nubabelEquivalent: "code-analyzer",
    category: "analysis",
    description: "Standard architecture and debugging advisor",
    capabilities: ["architecture-review", "debugging", "pattern-analysis"],
  },
  {
    omcName: "architect",
    omcTier: "high",
    omcModel: "opus",
    nubabelEquivalent: "code-analyzer-high",
    category: "analysis",
    description: "Strategic architecture and debugging advisor",
    capabilities: [
      "deep-analysis",
      "root-cause-debugging",
      "architectural-guidance",
    ],
  },

  // === EXPLORATION/SEARCH TIER ===
  {
    omcName: "explore",
    omcTier: "low",
    omcModel: "haiku",
    nubabelEquivalent: "codebase-explorer-low",
    category: "search",
    description: "Fast codebase search specialist",
    capabilities: ["file-search", "pattern-matching", "code-location"],
  },
  {
    omcName: "explore-medium",
    omcTier: "medium",
    omcModel: "sonnet",
    nubabelEquivalent: "codebase-explorer",
    category: "search",
    description: "Thorough codebase search and analysis",
    capabilities: [
      "deep-search",
      "dependency-tracing",
      "pattern-discovery",
    ],
  },
  {
    omcName: "explore-high",
    omcTier: "high",
    omcModel: "opus",
    nubabelEquivalent: "codebase-explorer-high",
    category: "search",
    description: "Complex architectural search and mapping",
    capabilities: [
      "architectural-mapping",
      "cross-module-analysis",
      "system-exploration",
    ],
  },

  // === RESEARCH TIER ===
  {
    omcName: "researcher-low",
    omcTier: "low",
    omcModel: "haiku",
    nubabelEquivalent: "researcher-low",
    category: "research",
    description: "Quick documentation and API lookup",
    capabilities: ["doc-lookup", "api-reference", "quick-research"],
  },
  {
    omcName: "researcher",
    omcTier: "medium",
    omcModel: "sonnet",
    nubabelEquivalent: "researcher",
    category: "research",
    description: "Documentation and external research",
    capabilities: ["research", "doc-analysis", "external-resources"],
  },
  {
    omcName: "researcher-high",
    omcTier: "high",
    omcModel: "opus",
    nubabelEquivalent: "researcher-high",
    category: "research",
    description: "Deep research and synthesis",
    capabilities: ["deep-research", "synthesis", "comprehensive-analysis"],
  },

  // === FRONTEND/DESIGN TIER ===
  {
    omcName: "designer-low",
    omcTier: "low",
    omcModel: "haiku",
    nubabelEquivalent: "ui-designer-low",
    category: "frontend",
    description: "Quick UI fixes and simple styling",
    capabilities: ["simple-styling", "css-fixes", "component-tweaks"],
  },
  {
    omcName: "designer",
    omcTier: "medium",
    omcModel: "sonnet",
    nubabelEquivalent: "ui-designer",
    category: "frontend",
    description: "UI/UX designer-developer",
    capabilities: ["ui-design", "component-creation", "styling"],
  },
  {
    omcName: "designer-high",
    omcTier: "high",
    omcModel: "opus",
    nubabelEquivalent: "ui-designer-high",
    category: "frontend",
    description: "Complex UI systems and design systems",
    capabilities: [
      "design-systems",
      "complex-animations",
      "ui-architecture",
    ],
  },

  // === DOCUMENTATION TIER ===
  {
    omcName: "writer",
    omcTier: "low",
    omcModel: "haiku",
    nubabelEquivalent: "technical-writer",
    category: "documentation",
    description: "Documentation and technical writing",
    capabilities: ["documentation", "readme", "comments", "api-docs"],
  },

  // === VISUAL/MULTIMODAL TIER ===
  {
    omcName: "vision",
    omcTier: "medium",
    omcModel: "sonnet",
    nubabelEquivalent: "visual-analyzer",
    category: "visual",
    description: "Image and diagram analysis",
    capabilities: ["image-analysis", "diagram-interpretation", "visual-qa"],
  },

  // === PLANNING TIER ===
  {
    omcName: "planner",
    omcTier: "high",
    omcModel: "opus",
    nubabelEquivalent: "strategic-planner",
    category: "planning",
    description: "Strategic planning and task decomposition",
    capabilities: [
      "strategic-planning",
      "task-decomposition",
      "roadmap-creation",
    ],
  },

  // === REVIEW TIER ===
  {
    omcName: "critic",
    omcTier: "high",
    omcModel: "opus",
    nubabelEquivalent: "plan-reviewer",
    category: "review",
    description: "Plan and code review specialist",
    capabilities: ["plan-review", "critique", "quality-assessment"],
  },
  {
    omcName: "analyst",
    omcTier: "high",
    omcModel: "opus",
    nubabelEquivalent: "pre-planning-analyst",
    category: "analysis",
    description: "Pre-planning analysis and requirements gathering",
    capabilities: [
      "requirements-analysis",
      "pre-planning",
      "scope-definition",
    ],
  },

  // === TESTING TIER ===
  {
    omcName: "qa-tester",
    omcTier: "medium",
    omcModel: "sonnet",
    nubabelEquivalent: "qa-tester",
    category: "testing",
    description: "Quality assurance and testing",
    capabilities: ["testing", "test-execution", "qa-verification"],
  },
  {
    omcName: "qa-tester-high",
    omcTier: "high",
    omcModel: "opus",
    nubabelEquivalent: "qa-tester-high",
    category: "testing",
    description: "Complex testing scenarios and strategies",
    capabilities: [
      "test-strategy",
      "complex-scenarios",
      "integration-testing",
    ],
  },

  // === SECURITY TIER ===
  {
    omcName: "security-reviewer-low",
    omcTier: "low",
    omcModel: "haiku",
    nubabelEquivalent: "security-scanner-low",
    category: "security",
    description: "Quick security scans",
    capabilities: ["quick-scan", "basic-vulnerabilities", "security-check"],
  },
  {
    omcName: "security-reviewer",
    omcTier: "high",
    omcModel: "opus",
    nubabelEquivalent: "security-reviewer",
    category: "security",
    description: "Comprehensive security review",
    capabilities: [
      "security-audit",
      "vulnerability-detection",
      "security-recommendations",
    ],
  },

  // === BUILD TIER ===
  {
    omcName: "build-fixer-low",
    omcTier: "low",
    omcModel: "haiku",
    nubabelEquivalent: "build-fixer-low",
    category: "build",
    description: "Simple build error fixes",
    capabilities: ["simple-build-fixes", "import-fixes", "config-fixes"],
  },
  {
    omcName: "build-fixer",
    omcTier: "medium",
    omcModel: "sonnet",
    nubabelEquivalent: "build-fixer",
    category: "build",
    description: "Build and TypeScript error resolution",
    capabilities: ["build-fixes", "typescript-errors", "dependency-issues"],
  },

  // === TDD TIER ===
  {
    omcName: "tdd-guide-low",
    omcTier: "low",
    omcModel: "haiku",
    nubabelEquivalent: "tdd-assistant-low",
    category: "testing",
    description: "Quick test suggestions",
    capabilities: ["test-suggestions", "simple-tests", "tdd-basics"],
  },
  {
    omcName: "tdd-guide",
    omcTier: "medium",
    omcModel: "sonnet",
    nubabelEquivalent: "tdd-assistant",
    category: "testing",
    description: "TDD workflow guidance",
    capabilities: ["tdd-workflow", "test-design", "red-green-refactor"],
  },

  // === CODE REVIEW TIER ===
  {
    omcName: "code-reviewer-low",
    omcTier: "low",
    omcModel: "haiku",
    nubabelEquivalent: "code-reviewer-low",
    category: "review",
    description: "Quick code checks",
    capabilities: ["quick-review", "style-check", "basic-feedback"],
  },
  {
    omcName: "code-reviewer",
    omcTier: "high",
    omcModel: "opus",
    nubabelEquivalent: "code-reviewer",
    category: "review",
    description: "Comprehensive code review",
    capabilities: [
      "comprehensive-review",
      "design-feedback",
      "best-practices",
    ],
  },

  // === DATA SCIENCE TIER ===
  {
    omcName: "scientist-low",
    omcTier: "low",
    omcModel: "haiku",
    nubabelEquivalent: "data-analyst-low",
    category: "data-science",
    description: "Quick data inspection",
    capabilities: ["data-inspection", "basic-statistics", "quick-analysis"],
  },
  {
    omcName: "scientist",
    omcTier: "medium",
    omcModel: "sonnet",
    nubabelEquivalent: "data-analyst",
    category: "data-science",
    description: "Data analysis and statistics",
    capabilities: ["data-analysis", "statistics", "visualization"],
  },
  {
    omcName: "scientist-high",
    omcTier: "high",
    omcModel: "opus",
    nubabelEquivalent: "data-scientist-high",
    category: "data-science",
    description: "Complex ML and hypothesis testing",
    capabilities: ["ml-analysis", "hypothesis-testing", "advanced-statistics"],
  },
];

/**
 * Create lookup maps for fast access
 */
const omcToNubabelMap = new Map<string, AgentMapping>();
const nubabelToOmcMap = new Map<string, AgentMapping>();

OMC_AGENT_MAPPING.forEach((mapping) => {
  omcToNubabelMap.set(mapping.omcName, mapping);
  nubabelToOmcMap.set(mapping.nubabelEquivalent, mapping);
});

/**
 * Get Nubabel equivalent for an OMC agent
 */
export function getOMCToNubabelMapping(omcName: string): AgentMapping | undefined {
  return omcToNubabelMap.get(omcName);
}

/**
 * Get OMC equivalent for a Nubabel agent
 */
export function getNubabelToOMCMapping(nubabelId: string): AgentMapping | undefined {
  return nubabelToOmcMap.get(nubabelId);
}

/**
 * Get all agents for a specific category
 */
export function getAgentsByCategory(category: string): AgentMapping[] {
  return OMC_AGENT_MAPPING.filter((m) => m.category === category);
}

/**
 * Get all agents for a specific tier
 */
export function getAgentsByTier(tier: ModelTier): AgentMapping[] {
  return OMC_AGENT_MAPPING.filter((m) => m.omcTier === tier);
}

/**
 * Find agents by capability
 */
export function findAgentsByCapability(capability: string): AgentMapping[] {
  return OMC_AGENT_MAPPING.filter((m) =>
    m.capabilities.some((c) => c.includes(capability))
  );
}

/**
 * Get the recommended agent for a task type
 */
export function recommendAgent(
  taskType: string,
  preferredTier?: ModelTier
): AgentMapping | undefined {
  // Find agents that can handle this task type
  const candidates = OMC_AGENT_MAPPING.filter((m) =>
    m.capabilities.some((c) => taskType.toLowerCase().includes(c)) ||
    m.category === taskType.toLowerCase()
  );

  if (candidates.length === 0) {
    // Default to general executor
    return preferredTier
      ? OMC_AGENT_MAPPING.find(
          (m) => m.omcName.startsWith("executor") && m.omcTier === preferredTier
        )
      : omcToNubabelMap.get("executor");
  }

  // If tier preference, filter by it
  if (preferredTier) {
    const tierMatch = candidates.find((c) => c.omcTier === preferredTier);
    if (tierMatch) return tierMatch;
  }

  // Default to medium tier if available
  const mediumTier = candidates.find((c) => c.omcTier === "medium");
  return mediumTier || candidates[0];
}

/**
 * Get all unique categories
 */
export function getAllCategories(): string[] {
  const categories = new Set(OMC_AGENT_MAPPING.map((m) => m.category));
  return [...categories].sort();
}

/**
 * Validate that an agent name exists
 */
export function isValidOMCAgent(name: string): boolean {
  return omcToNubabelMap.has(name);
}

/**
 * Validate that a Nubabel agent ID exists in our mapping
 */
export function isValidNubabelEquivalent(id: string): boolean {
  return nubabelToOmcMap.has(id);
}
