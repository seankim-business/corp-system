/**
 * Skill Resolver
 *
 * Bridges the orchestrator with the Extension Registry, resolving registry-based
 * skills for incoming requests and building enhanced system prompts.
 */
import { getExtensionRegistry } from '../services/extension-registry';
import { Extension, ResolvedSkill } from '../services/extension-registry/types';
import { RequestAnalysis } from './types';
import { logger } from '../utils/logger';
import { trace } from '@opentelemetry/api';

export interface SkillResolutionResult {
  /** Registry-based skills that match the request */
  resolvedSkills: ResolvedSkill[];
  /** System prompt additions from matched skills */
  skillPrompts: string[];
  /** Skills that can be directly executed (code/mcp runtime) */
  executableSkills: Extension[];
  /** Skills that enhance the AI prompt (prompt runtime) */
  promptSkills: Extension[];
}

/**
 * Resolve skills from the Extension Registry for a given request
 *
 * @param organizationId - Organization context
 * @param userRequest - The raw user request text
 * @param analysis - Request analysis containing keywords and entities
 * @param legacySkills - Legacy skill slugs to filter out (avoid duplicates)
 * @returns Resolved skills with prompts and execution metadata
 */
export async function resolveSkillsFromRegistry(
  organizationId: string,
  userRequest: string,
  analysis: RequestAnalysis,
  legacySkills: string[],
): Promise<SkillResolutionResult> {
  const tracer = trace.getTracer('orchestrator');
  return tracer.startActiveSpan('orchestrator.resolve_skills', async (span) => {
    try {
      span.setAttribute('organization_id', organizationId);
      span.setAttribute('request_length', userRequest.length);
      span.setAttribute('keywords_count', analysis.keywords.length);
      span.setAttribute('legacy_skills_count', legacySkills.length);

      logger.debug('Resolving skills from registry', {
        organizationId,
        requestLength: userRequest.length,
        keywords: analysis.keywords,
        legacySkillsCount: legacySkills.length,
      });

      // Get the ExtensionRegistry singleton
      const registry = getExtensionRegistry();

      // Resolve skills for the request
      // NOTE: Do NOT pass keywords as third param - that's agentId (UUID), not keywords.
      // The method extracts keywords from the request internally.
      const allResolvedSkills = await registry.resolveSkillsForRequest(
        organizationId,
        userRequest,
        // agentId is optional - only pass if we have a specific agent UUID to filter by
      );

      span.setAttribute('total_matches', allResolvedSkills.length);

      // Filter out skills that duplicate legacy skills
      const resolvedSkills = allResolvedSkills.filter(
        (rs) => !legacySkills.includes(rs.skill.slug),
      );

      span.setAttribute('filtered_matches', resolvedSkills.length);

      logger.info('Skills resolved from registry', {
        totalMatches: allResolvedSkills.length,
        afterFilter: resolvedSkills.length,
        filtered: allResolvedSkills.length - resolvedSkills.length,
      });

      // Separate skills by runtime type
      const executableSkills: Extension[] = [];
      const promptSkills: Extension[] = [];

      for (const rs of resolvedSkills) {
        const { skill } = rs;
        if (skill.runtimeType === 'code' || skill.runtimeType === 'mcp') {
          executableSkills.push(skill);
        } else if (skill.runtimeType === 'prompt' || skill.runtimeType === 'composite') {
          promptSkills.push(skill);
        }
      }

      span.setAttribute('executable_skills', executableSkills.length);
      span.setAttribute('prompt_skills', promptSkills.length);

      // Build system prompt additions from matched skills
      const skillPrompts = buildRegistrySkillPrompts(resolvedSkills);

      logger.debug('Skill resolution complete', {
        executableSkills: executableSkills.length,
        promptSkills: promptSkills.length,
        promptLength: skillPrompts.length,
      });

      return {
        resolvedSkills,
        skillPrompts: skillPrompts ? [skillPrompts] : [],
        executableSkills,
        promptSkills,
      };
    } catch (error) {
      span.recordException(error as Error);
      logger.error('Error resolving skills from registry', {
        organizationId,
        error: (error as Error).message,
      }, error as Error);

      // Return empty result on error
      return {
        resolvedSkills: [],
        skillPrompts: [],
        executableSkills: [],
        promptSkills: [],
      };
    } finally {
      span.end();
    }
  });
}

/**
 * Merge legacy skill names with registry skill slugs
 *
 * @param legacySkills - Array of legacy skill names
 * @param resolvedSkills - Array of resolved registry skills
 * @returns Combined list without duplicates
 */
export function mergeSkillNames(
  legacySkills: string[],
  resolvedSkills: ResolvedSkill[],
): string[] {
  const skillSet = new Set(legacySkills);

  for (const rs of resolvedSkills) {
    skillSet.add(rs.skill.slug);
  }

  return Array.from(skillSet);
}

/**
 * Build enhanced system prompt from registry skills
 *
 * @param skills - Array of resolved skills
 * @returns Formatted prompt string for injection into AI system prompt
 */
export function buildRegistrySkillPrompts(skills: ResolvedSkill[]): string {
  if (skills.length === 0) {
    return '';
  }

  const sections: string[] = [];

  for (const rs of skills) {
    const { skill, matchedTriggers } = rs;

    let section = `## Skill: ${skill.name}\n${skill.description}`;

    if (skill.triggers.length > 0) {
      section += `\nTriggers: ${skill.triggers.join(', ')}`;
    }

    if (matchedTriggers.length > 0) {
      section += `\nMatched Triggers: ${matchedTriggers.join(', ')}`;
    }

    if (skill.parameters.length > 0) {
      section += '\n\n### Parameters:';
      for (const param of skill.parameters) {
        const requiredLabel = param.required ? ' (required)' : '';
        section += `\n- **${param.name}**${requiredLabel}: ${param.description}`;
        if (param.default !== undefined) {
          section += ` (default: ${JSON.stringify(param.default)})`;
        }
      }
    }

    if (skill.outputs.length > 0) {
      section += '\n\n### Outputs:';
      for (const output of skill.outputs) {
        section += `\n- **${output.name}**: ${output.description}`;
      }
    }

    if (skill.toolsRequired.length > 0) {
      section += `\n\n**Required Tools:** ${skill.toolsRequired.join(', ')}`;
    }

    if (skill.dependencies.length > 0) {
      section += `\n\n**Dependencies:** ${skill.dependencies.join(', ')}`;
    }

    sections.push(section);
  }

  return sections.join('\n\n---\n\n');
}
