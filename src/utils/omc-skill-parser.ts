/**
 * OMC Skill Parser
 *
 * Parses OMC SKILL.md files into unified skill format.
 * Extracts frontmatter metadata, magic keywords, and required agents.
 */

import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger";
import {
  UnifiedSkill,
  ParsedOmcSkill,
  OmcSkillMetadata,
  SkillCostTier,
} from "../orchestrator/types/unified-skill";

/**
 * Parse YAML-like frontmatter from SKILL.md content
 */
function parseFrontmatter(content: string): { metadata: Record<string, string>; body: string } {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!frontmatterMatch) {
    return { metadata: {}, body: content };
  }

  const frontmatterBlock = frontmatterMatch[1];
  const body = frontmatterMatch[2];

  const metadata: Record<string, string> = {};
  const lines = frontmatterBlock.split("\n");

  for (const line of lines) {
    const match = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      metadata[key] = value;
    }
  }

  return { metadata, body };
}

/**
 * Extract magic keywords from skill content
 *
 * Looks for patterns like:
 * - "Magic Keywords" section
 * - "These phrases auto-activate" patterns
 * - Quoted keywords in lists
 */
export function extractKeywords(content: string, skillName: string): string[] {
  const keywords = new Set<string>();

  // Always include the skill name itself
  keywords.add(skillName.toLowerCase());

  // Look for "Magic Keywords" section
  const magicKeywordsSection = content.match(
    /## Magic Keywords[\s\S]*?(?=##|$)/i,
  );
  if (magicKeywordsSection) {
    // Extract quoted strings
    const quotedMatches = magicKeywordsSection[0].matchAll(/"([^"]+)"/g);
    for (const match of quotedMatches) {
      keywords.add(match[1].toLowerCase());
    }
  }

  // Look for "auto-activate" or "auto-triggers" patterns
  const autoTriggerSection = content.match(
    /(?:auto-?activate|auto-?trigger)[^:]*:[\s\S]*?(?=##|$)/i,
  );
  if (autoTriggerSection) {
    const quotedMatches = autoTriggerSection[0].matchAll(/"([^"]+)"/g);
    for (const match of quotedMatches) {
      keywords.add(match[1].toLowerCase());
    }
  }

  // Look for "When to Use" or "When Activated" sections with list items
  const whenSection = content.match(
    /## When (?:to Use|Activated)[\s\S]*?(?=##|$)/i,
  );
  if (whenSection) {
    // Extract quoted patterns from list items
    const listMatches = whenSection[0].matchAll(/[-*]\s+.*?"([^"]+)"/g);
    for (const match of listMatches) {
      keywords.add(match[1].toLowerCase());
    }
  }

  // Extract keywords from skill-specific patterns
  const skillKeywordPatterns: Record<string, string[]> = {
    autopilot: ["autopilot", "auto pilot", "autonomous", "build me", "create me", "make me", "full auto", "handle it all", "i want a", "i want an"],
    ralph: ["ralph", "don't stop", "must complete", "until done", "persistence"],
    ultrawork: ["ultrawork", "ulw", "maximum performance", "parallel execution", "fast", "parallel"],
    plan: ["plan this", "plan the", "planning", "strategic plan"],
    analyze: ["analyze", "debug", "investigate", "why", "deep analysis"],
    deepsearch: ["deepsearch", "search", "find in codebase", "where is"],
    "code-review": ["code review", "review code", "review this", "code-review"],
    tdd: ["tdd", "test first", "red green", "test-driven"],
    "security-review": ["security review", "security audit", "vulnerability", "owasp"],
    research: ["research", "analyze data", "statistics", "comprehensive research"],
    "git-master": ["commit", "git", "push", "pull", "rebase", "merge", "branch"],
    "frontend-ui-ux": ["design", "ui", "ux", "frontend", "component", "style", "react"],
  };

  const specificKeywords = skillKeywordPatterns[skillName.toLowerCase()];
  if (specificKeywords) {
    for (const kw of specificKeywords) {
      keywords.add(kw.toLowerCase());
    }
  }

  return Array.from(keywords);
}

/**
 * Extract agent references from skill content
 *
 * Looks for patterns like:
 * - Task(subagent_type="oh-my-claudecode:XXX", ...)
 * - Agent names in tables
 * - Explicit agent mentions
 */
export function extractAgents(content: string): string[] {
  const agents = new Set<string>();

  // Pattern: Task(subagent_type="oh-my-claudecode:XXX"
  const taskMatches = content.matchAll(
    /subagent_type\s*=\s*"oh-my-claudecode:([^"]+)"/g,
  );
  for (const match of taskMatches) {
    agents.add(match[1]);
  }

  // Pattern: `oh-my-claudecode:XXX` in backticks
  const backtickMatches = content.matchAll(/`oh-my-claudecode:([^`]+)`/g);
  for (const match of backtickMatches) {
    agents.add(match[1]);
  }

  // Known OMC agent names from tables/content
  const knownAgents = [
    "architect", "architect-low", "architect-medium",
    "executor", "executor-low", "executor-high",
    "explore", "explore-medium", "explore-high",
    "researcher", "researcher-low",
    "designer", "designer-low", "designer-high",
    "writer",
    "vision",
    "planner", "critic", "analyst",
    "qa-tester", "qa-tester-high",
    "security-reviewer", "security-reviewer-low",
    "build-fixer", "build-fixer-low",
    "tdd-guide", "tdd-guide-low",
    "code-reviewer", "code-reviewer-low",
    "scientist", "scientist-low", "scientist-high",
  ];

  for (const agent of knownAgents) {
    if (content.includes(agent)) {
      agents.add(agent);
    }
  }

  return Array.from(agents);
}

/**
 * Determine cost tier based on skill content
 */
function determineCostTier(skillName: string, agents: string[]): SkillCostTier {
  // High-cost skills: use opus models or multiple agents
  const highCostSkills = ["autopilot", "ralph", "ultrawork", "ultrapilot", "swarm", "ralplan"];
  if (highCostSkills.includes(skillName.toLowerCase())) {
    return "high";
  }

  // Check for opus-tier agents
  const opusAgents = ["architect", "planner", "critic", "analyst", "executor-high", "security-reviewer", "code-reviewer", "scientist-high"];
  const hasOpusAgent = agents.some(agent => opusAgents.includes(agent));
  if (hasOpusAgent) {
    return "high";
  }

  // Medium-cost skills: sonnet models, moderate complexity
  const mediumCostSkills = ["plan", "analyze", "research", "code-review", "security-review", "deepsearch"];
  if (mediumCostSkills.includes(skillName.toLowerCase())) {
    return "medium";
  }

  // Default to low cost
  return "low";
}

/**
 * Determine max duration based on skill type
 */
function determineMaxDuration(skillName: string): number {
  // Long-running execution modes (10 minutes)
  const longRunning = ["autopilot", "ralph", "ultrawork", "ultrapilot", "swarm", "ralplan", "ultraqa"];
  if (longRunning.includes(skillName.toLowerCase())) {
    return 600000; // 10 minutes
  }

  // Medium duration tasks (5 minutes)
  const mediumDuration = ["plan", "research", "code-review", "security-review"];
  if (mediumDuration.includes(skillName.toLowerCase())) {
    return 300000; // 5 minutes
  }

  // Default: 2 minutes
  return 120000;
}

/**
 * Parse a single SKILL.md file
 */
export function parseSkillMd(filePath: string): ParsedOmcSkill | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const { metadata, body } = parseFrontmatter(content);

    const skillMetadata: OmcSkillMetadata = {
      name: metadata.name || path.basename(path.dirname(filePath)),
      description: metadata.description || "",
      argumentHint: metadata["argument-hint"],
    };

    const magicKeywords = extractKeywords(body, skillMetadata.name);
    const agents = extractAgents(body);

    return {
      metadata: skillMetadata,
      content: body,
      magicKeywords,
      agents,
      filePath,
    };
  } catch (error) {
    logger.warn("Failed to parse OMC skill file", {
      filePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Convert parsed OMC skill to unified skill format
 */
export function convertToUnifiedSkill(parsed: ParsedOmcSkill): UnifiedSkill {
  const isExecutionMode = [
    "autopilot", "ralph", "ultrawork", "ultrapilot", "swarm",
    "pipeline", "ecomode", "ultraqa", "ralplan",
  ].includes(parsed.metadata.name.toLowerCase());

  const costTier = determineCostTier(parsed.metadata.name, parsed.agents);
  const maxDuration = determineMaxDuration(parsed.metadata.name);

  // Determine priority based on skill type
  let priority = 50; // default
  if (isExecutionMode) {
    priority = 100; // execution modes have highest priority
  } else if (["git-master", "frontend-ui-ux"].includes(parsed.metadata.name.toLowerCase())) {
    priority = 80; // domain skills have high priority
  } else if (["analyze", "deepsearch", "plan"].includes(parsed.metadata.name.toLowerCase())) {
    priority = 70; // core utility skills
  }

  return {
    name: parsed.metadata.name,
    description: parsed.metadata.description,
    source: "omc",
    keywords: parsed.magicKeywords,
    priority,
    omcSkillPath: parsed.filePath,
    omcAgents: parsed.agents,
    omcExecutionMode: isExecutionMode,
    requiresAuth: false, // OMC skills don't require external auth
    estimatedCost: costTier,
    maxDuration,
    // Set conflicts for execution modes (can't run multiple at once)
    conflictsWith: isExecutionMode
      ? ["autopilot", "ralph", "ultrawork", "ultrapilot", "swarm", "pipeline", "ecomode", "ultraqa"].filter(
          (m) => m !== parsed.metadata.name.toLowerCase(),
        )
      : undefined,
  };
}

/**
 * Load all OMC skills from a directory
 */
export function loadOmcSkillsFromDirectory(skillsDir: string): UnifiedSkill[] {
  const skills: UnifiedSkill[] = [];

  try {
    if (!fs.existsSync(skillsDir)) {
      logger.warn("OMC skills directory not found", { skillsDir });
      return skills;
    }

    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillMdPath = path.join(skillsDir, entry.name, "SKILL.md");
        if (fs.existsSync(skillMdPath)) {
          const parsed = parseSkillMd(skillMdPath);
          if (parsed) {
            const unified = convertToUnifiedSkill(parsed);
            skills.push(unified);
            logger.debug("Loaded OMC skill", {
              name: unified.name,
              keywords: unified.keywords.length,
              agents: unified.omcAgents?.length || 0,
            });
          }
        }
      }
    }

    logger.info("Loaded OMC skills from directory", {
      skillsDir,
      count: skills.length,
    });
  } catch (error) {
    logger.error("Failed to load OMC skills from directory", {
      skillsDir,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return skills;
}
