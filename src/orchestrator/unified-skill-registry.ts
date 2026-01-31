/**
 * Unified Skill Registry
 *
 * Manages skills from both OMC (oh-my-claudecode) and Nubabel sources.
 * Provides unified skill lookup, routing, and conflict resolution.
 */

import * as fs from "fs";
import * as path from "path";
import { logger } from "../utils/logger";
import {
  loadOmcSkillsFromDirectory,
  convertToUnifiedSkill,
  parseSkillMd,
} from "../utils/omc-skill-parser";
import {
  UnifiedSkill,
  SkillMatchResult,
  SkillRegistryConfig,
  SkillRegistryState,
  SkillSource,
} from "./types/unified-skill";

// Default paths
const DEFAULT_OMC_SKILLS_PATH = path.join(
  process.env.HOME || "",
  ".claude/plugins/cache/omc/oh-my-claudecode",
);
const DEFAULT_NUBABEL_SKILLS_PATH = path.join(
  process.cwd(),
  "config/skills/omc-skills.json",
);

/**
 * Unified Skill Registry
 *
 * Singleton that manages all registered skills from multiple sources.
 */
class UnifiedSkillRegistry {
  private state: SkillRegistryState = {
    skills: new Map(),
    lastLoadedAt: null,
    initialized: false,
  };

  private config: SkillRegistryConfig = {
    enableOmcSkills: true,
    enableNubabelSkills: true,
    cacheTtlMs: 300000, // 5 minutes
  };

  /**
   * Initialize the registry with configuration
   */
  configure(config: Partial<SkillRegistryConfig>): void {
    this.config = { ...this.config, ...config };
    logger.debug("Skill registry configured", { config: this.config });
  }

  /**
   * Load all skills from configured sources
   */
  async loadSkills(): Promise<void> {
    const startTime = Date.now();

    try {
      this.state.skills.clear();

      // Load OMC skills if enabled
      if (this.config.enableOmcSkills) {
        await this.loadOmcSkills();
      }

      // Load Nubabel skills if enabled
      if (this.config.enableNubabelSkills) {
        await this.loadNubabelSkills();
      }

      this.state.lastLoadedAt = new Date();
      this.state.initialized = true;
      this.state.lastError = undefined;

      logger.info("Skill registry loaded", {
        totalSkills: this.state.skills.size,
        omcSkills: Array.from(this.state.skills.values()).filter(
          (s) => s.source === "omc",
        ).length,
        nubabelSkills: Array.from(this.state.skills.values()).filter(
          (s) => s.source === "nubabel",
        ).length,
        loadTimeMs: Date.now() - startTime,
      });
    } catch (error) {
      this.state.lastError = error instanceof Error ? error : new Error(String(error));
      logger.error("Failed to load skill registry", {
        error: this.state.lastError.message,
      });
      throw this.state.lastError;
    }
  }

  /**
   * Load OMC skills from filesystem
   */
  private async loadOmcSkills(): Promise<void> {
    // Try to find OMC skills directory
    const omcPath = this.config.omcSkillsPath || DEFAULT_OMC_SKILLS_PATH;

    // Find latest version if path is base directory
    let skillsDir = omcPath;
    if (fs.existsSync(omcPath) && !fs.existsSync(path.join(omcPath, "skills"))) {
      // Look for version directories
      try {
        const versions = fs.readdirSync(omcPath)
          .filter(entry => {
            const fullPath = path.join(omcPath, entry);
            return fs.statSync(fullPath).isDirectory() && /^\d+\.\d+\.\d+$/.test(entry);
          })
          .sort((a, b) => {
            const [aMajor, aMinor, aPatch] = a.split(".").map(Number);
            const [bMajor, bMinor, bPatch] = b.split(".").map(Number);
            if (aMajor !== bMajor) return bMajor - aMajor;
            if (aMinor !== bMinor) return bMinor - aMinor;
            return bPatch - aPatch;
          });

        if (versions.length > 0) {
          skillsDir = path.join(omcPath, versions[0], "skills");
        }
      } catch {
        // Ignore errors, will use default path
      }
    } else if (fs.existsSync(path.join(omcPath, "skills"))) {
      skillsDir = path.join(omcPath, "skills");
    }

    if (!fs.existsSync(skillsDir)) {
      logger.warn("OMC skills directory not found", { skillsDir });
      return;
    }

    const skills = loadOmcSkillsFromDirectory(skillsDir);
    for (const skill of skills) {
      this.registerSkill(skill);
    }
  }

  /**
   * Load Nubabel skills from JSON config
   */
  private async loadNubabelSkills(): Promise<void> {
    const configPath = this.config.nubabelSkillsPath || DEFAULT_NUBABEL_SKILLS_PATH;

    if (!fs.existsSync(configPath)) {
      logger.debug("Nubabel skills config not found", { configPath });
      return;
    }

    try {
      const content = fs.readFileSync(configPath, "utf-8");
      const skillsConfig = JSON.parse(content);

      if (Array.isArray(skillsConfig.skills)) {
        for (const skillData of skillsConfig.skills) {
          const skill: UnifiedSkill = {
            name: skillData.name,
            description: skillData.description || "",
            source: skillData.source || "nubabel",
            keywords: skillData.keywords || [],
            priority: skillData.priority || 50,
            nubabelAgentId: skillData.nubabelAgentId,
            nubabelTools: skillData.nubabelTools,
            nubabelMcpRequired: skillData.nubabelMcpRequired,
            requiresAuth: skillData.requiresAuth || false,
            estimatedCost: skillData.estimatedCost || "medium",
            maxDuration: skillData.maxDuration || 120000,
            omcSkillPath: skillData.omcSkillPath,
            omcAgents: skillData.omcAgents,
            omcExecutionMode: skillData.omcExecutionMode,
            applicableCategories: skillData.applicableCategories,
            conflictsWith: skillData.conflictsWith,
            dependsOn: skillData.dependsOn,
          };
          this.registerSkill(skill);
        }
      }
    } catch (error) {
      logger.warn("Failed to load Nubabel skills config", {
        configPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Register a skill in the registry
   */
  registerSkill(skill: UnifiedSkill): void {
    const existing = this.state.skills.get(skill.name);

    if (existing) {
      // Merge if sources differ (create hybrid)
      if (existing.source !== skill.source) {
        const merged: UnifiedSkill = {
          ...existing,
          ...skill,
          source: "hybrid" as SkillSource,
          keywords: [...new Set([...existing.keywords, ...skill.keywords])],
          priority: Math.max(existing.priority, skill.priority),
          omcAgents: skill.omcAgents || existing.omcAgents,
          omcSkillPath: skill.omcSkillPath || existing.omcSkillPath,
          nubabelAgentId: skill.nubabelAgentId || existing.nubabelAgentId,
          nubabelTools: skill.nubabelTools || existing.nubabelTools,
        };
        this.state.skills.set(skill.name, merged);
        logger.debug("Merged skill from multiple sources", { name: skill.name });
      } else if (skill.priority > existing.priority) {
        // Replace if higher priority
        this.state.skills.set(skill.name, skill);
      }
    } else {
      this.state.skills.set(skill.name, skill);
    }
  }

  /**
   * Register an OMC skill by path
   */
  registerOmcSkill(skillMdPath: string): UnifiedSkill | null {
    const parsed = parseSkillMd(skillMdPath);
    if (!parsed) {
      return null;
    }

    const skill = convertToUnifiedSkill(parsed);
    this.registerSkill(skill);
    return skill;
  }

  /**
   * Register a Nubabel skill
   */
  registerNubabelSkill(skill: Omit<UnifiedSkill, "source">): void {
    this.registerSkill({
      ...skill,
      source: "nubabel",
    });
  }

  /**
   * Get a skill by name
   */
  getSkillByName(name: string): UnifiedSkill | undefined {
    return this.state.skills.get(name);
  }

  /**
   * Find skills matching keywords
   */
  findSkillByKeywords(text: string, options?: {
    minScore?: number;
    source?: SkillSource;
    limit?: number;
  }): SkillMatchResult[] {
    const { minScore = 1, source, limit = 10 } = options || {};
    const normalizedText = text.toLowerCase();
    const matches: SkillMatchResult[] = [];

    for (const skill of this.state.skills.values()) {
      // Filter by source if specified
      if (source && skill.source !== source && skill.source !== "hybrid") {
        continue;
      }

      const matchedKeywords: string[] = [];
      let score = 0;

      for (const keyword of skill.keywords) {
        if (normalizedText.includes(keyword.toLowerCase())) {
          matchedKeywords.push(keyword);
          // Weight longer keywords higher
          score += 1 + keyword.length / 10;
        }
      }

      // Exact name match gets bonus
      if (normalizedText.includes(skill.name.toLowerCase())) {
        score += 5;
        if (!matchedKeywords.includes(skill.name)) {
          matchedKeywords.push(skill.name);
        }
      }

      if (score >= minScore) {
        matches.push({
          skill,
          matchedKeywords,
          score,
          source: skill.source,
        });
      }
    }

    // Sort by score (descending) then priority (descending)
    matches.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.skill.priority - a.skill.priority;
    });

    return matches.slice(0, limit);
  }

  /**
   * Get all OMC skills
   */
  getOmcSkills(): UnifiedSkill[] {
    return Array.from(this.state.skills.values()).filter(
      (s) => s.source === "omc" || s.source === "hybrid",
    );
  }

  /**
   * Get all Nubabel skills
   */
  getNubabelSkills(): UnifiedSkill[] {
    return Array.from(this.state.skills.values()).filter(
      (s) => s.source === "nubabel" || s.source === "hybrid",
    );
  }

  /**
   * Get all registered skills
   */
  getAllSkills(): UnifiedSkill[] {
    return Array.from(this.state.skills.values());
  }

  /**
   * Check if a skill exists
   */
  hasSkill(name: string): boolean {
    return this.state.skills.has(name);
  }

  /**
   * Get registry state
   */
  getState(): Readonly<SkillRegistryState> {
    return this.state;
  }

  /**
   * Check if registry is initialized
   */
  isInitialized(): boolean {
    return this.state.initialized;
  }

  /**
   * Check if cache is stale
   */
  isCacheStale(): boolean {
    if (!this.state.lastLoadedAt) {
      return true;
    }
    const cacheAge = Date.now() - this.state.lastLoadedAt.getTime();
    return cacheAge > (this.config.cacheTtlMs || 300000);
  }

  /**
   * Ensure registry is loaded, refreshing if stale
   */
  async ensureLoaded(): Promise<void> {
    if (!this.state.initialized || this.isCacheStale()) {
      await this.loadSkills();
    }
  }

  /**
   * Clear the registry
   */
  clear(): void {
    this.state.skills.clear();
    this.state.initialized = false;
    this.state.lastLoadedAt = null;
  }
}

// Export singleton instance
export const unifiedSkillRegistry = new UnifiedSkillRegistry();

// Export class for testing
export { UnifiedSkillRegistry };
