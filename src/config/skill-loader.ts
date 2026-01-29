import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { z } from "zod";
import { logger } from "../utils/logger";
import { ExtensionRegistry, Extension } from '../services/extension-registry';
import { PrismaClient } from '@prisma/client';

// Singleton registry instance (initialized lazily)
let registryInstance: ExtensionRegistry | null = null;

/**
 * Get or create the ExtensionRegistry singleton
 */
export function getExtensionRegistry(prisma?: PrismaClient): ExtensionRegistry | null {
  if (!registryInstance && prisma) {
    registryInstance = new ExtensionRegistry(prisma);
  }
  return registryInstance;
}

/**
 * Initialize registry with Prisma client (call from app startup)
 */
export function initExtensionRegistry(prisma: PrismaClient, redis?: any): void {
  registryInstance = new ExtensionRegistry(prisma, redis);
}

// Define Zod Schema for Skill Configuration
const SkillParameterSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string(),
  required: z.boolean().optional().default(false),
  default: z.unknown().optional(),
});

const SkillOutputSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string(),
});

export const SkillConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  triggers: z.array(z.string()),
  parameters: z.array(SkillParameterSchema).optional().default([]),
  outputs: z.array(SkillOutputSchema).optional().default([]),
  tools_required: z.array(z.string()).optional().default([]),
});

export type SkillConfig = z.infer<typeof SkillConfigSchema>;
export type SkillParameter = z.infer<typeof SkillParameterSchema>;
export type SkillOutput = z.infer<typeof SkillOutputSchema>;

const SKILLS_DIR = path.resolve(__dirname, "../../config/skills");

let skillsCache: SkillConfig[] | null = null;
let skillMapCache: Record<string, SkillConfig> | null = null;

/**
 * Loads all skill configurations from the YAML files.
 * Validates each file against the schema.
 */
export function loadSkills(): SkillConfig[] {
  if (skillsCache) return skillsCache;

  if (!fs.existsSync(SKILLS_DIR)) {
    logger.warn(`Skills directory not found: ${SKILLS_DIR}`);
    return [];
  }

  const files = fs
    .readdirSync(SKILLS_DIR)
    .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"));
  const skills: SkillConfig[] = [];

  for (const file of files) {
    const filePath = path.join(SKILLS_DIR, file);
    try {
      const fileContent = fs.readFileSync(filePath, "utf8");
      const parsed = yaml.load(fileContent);
      const skill = SkillConfigSchema.parse(parsed);
      skills.push(skill);
    } catch (error) {
      logger.error(`Failed to load skill config from ${file}:`, { file }, error as Error);
      throw new Error(`Invalid skill configuration in ${file}: ${(error as Error).message}`);
    }
  }

  skillsCache = skills;
  return skills;
}

/**
 * Map of skill ID to SkillConfig for easy lookup
 */
export function getSkillsMap(): Record<string, SkillConfig> {
  if (skillMapCache) return skillMapCache;

  const skills = loadSkills();
  skillMapCache = skills.reduce(
    (acc, skill) => {
      acc[skill.id] = skill;
      return acc;
    },
    {} as Record<string, SkillConfig>,
  );

  return skillMapCache;
}

export function getSkillById(id: string): SkillConfig | undefined {
  return getSkillsMap()[id];
}

/**
 * Load skills for a specific agent based on agent's skill list
 */
export function loadSkillsForAgent(agentSkillIds: string[]): SkillConfig[] {
  const skillsMap = getSkillsMap();
  return agentSkillIds
    .map((id) => skillsMap[id])
    .filter((skill): skill is SkillConfig => skill !== undefined);
}

/**
 * Find skills that match a given trigger keyword
 */
export function findSkillsByTrigger(keyword: string): SkillConfig[] {
  const lowerKeyword = keyword.toLowerCase();
  return loadSkills().filter((skill) =>
    skill.triggers.some((trigger) => trigger.toLowerCase().includes(lowerKeyword)),
  );
}

/**
 * Clear skill caches (useful for hot-reloading in development)
 */
export function clearSkillCache(): void {
  skillsCache = null;
  skillMapCache = null;
}

/**
 * Get skills from registry with YAML fallback
 * This provides backward compatibility during migration
 */
export async function getUnifiedSkills(orgId: string): Promise<(SkillConfig | Extension)[]> {
  const yamlSkills = loadSkills();

  if (!registryInstance) {
    return yamlSkills;
  }

  try {
    const dbSkills = await registryInstance.listSkills(orgId);
    // DB skills take priority, then add YAML skills not in DB
    const dbSlugs = new Set(dbSkills.map(s => s.slug));
    const uniqueYamlSkills = yamlSkills.filter(s => !dbSlugs.has(s.id));
    return [...dbSkills, ...uniqueYamlSkills];
  } catch (error) {
    logger.warn('Failed to load DB skills, using YAML fallback', { error });
    return yamlSkills;
  }
}

/**
 * Find skills matching a trigger with registry + YAML fallback
 */
export async function findUnifiedSkillsByTrigger(
  orgId: string,
  keyword: string
): Promise<(SkillConfig | Extension)[]> {
  const yamlMatches = findSkillsByTrigger(keyword);

  if (!registryInstance) {
    return yamlMatches;
  }

  try {
    const resolved = await registryInstance.resolveSkillsForRequest(orgId, keyword);
    const dbMatches = resolved.map(r => r.skill);
    const dbSlugs = new Set(dbMatches.map(s => s.slug));
    const uniqueYaml = yamlMatches.filter(s => !dbSlugs.has(s.id));
    return [...dbMatches, ...uniqueYaml];
  } catch (error) {
    logger.warn('Failed to search DB skills, using YAML fallback', { error });
    return yamlMatches;
  }
}
