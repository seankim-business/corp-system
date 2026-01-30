/**
 * Autonomous Skill Discovery
 *
 * When the orchestrator cannot resolve skills for a request,
 * this module searches external sources to find and suggest
 * installable skills.
 */
import { logger } from '../utils/logger';
import { trace } from '@opentelemetry/api';
import { getExtensionRegistry } from '../services/extension-registry';
import { Extension } from '../services/extension-registry/types';
import { RequestAnalysis } from './types';

export interface DiscoveryResult {
  /** Whether any skills were auto-installed */
  installed: boolean;
  /** Skills that were auto-installed and are ready to use */
  installedSkills: Extension[];
  /** External skills found but requiring manual review */
  suggestedSkills: Array<{
    name: string;
    description: string;
    source: string;
    installUrl?: string;
  }>;
}

const tracer = trace.getTracer('orchestrator');

/**
 * Attempt to discover and optionally auto-install skills for an unmatched request.
 *
 * Discovery strategy:
 * 1. Search external sources (GitHub, NPM) using request keywords
 * 2. Auto-install skills with high confidence match (>0.8)
 * 3. Return suggestions for lower confidence matches
 *
 * @param organizationId - Organization context
 * @param analysis - Request analysis with keywords and entities
 * @param autoInstall - Whether to auto-install high-confidence matches (default: false)
 */
export async function discoverSkills(
  organizationId: string,
  analysis: RequestAnalysis,
  autoInstall = false,
): Promise<DiscoveryResult> {
  return tracer.startActiveSpan('orchestrator.discover_skills', async (span) => {
    const result: DiscoveryResult = {
      installed: false,
      installedSkills: [],
      suggestedSkills: [],
    };

    try {
      span.setAttribute('organization_id', organizationId);
      span.setAttribute('keywords', analysis.keywords.join(','));
      span.setAttribute('auto_install', autoInstall);

      const searchQuery = analysis.keywords.slice(0, 5).join(' ');
      if (!searchQuery) {
        return result;
      }

      logger.info('Discovering skills from external sources', {
        organizationId,
        query: searchQuery,
        autoInstall,
      });

      // Dynamically import marketplace sources to avoid circular deps
      const { createSourceRegistry } = await import('../services/marketplace/sources');
      const sources = createSourceRegistry();

      const searchPromises: Array<Promise<void>> = [];

      for (const [sourceName, source] of sources) {
        searchPromises.push(
          (async () => {
            try {
              const refs = await source.search(searchQuery, { limit: 3 });

              for (const ref of refs) {
                // Fetch full metadata for each reference
                let fetched;
                try {
                  fetched = await source.fetch(ref);
                } catch {
                  // Skip refs that can't be fetched
                  continue;
                }

                const { metadata } = fetched;

                // Score the match based on keyword overlap
                const score = scoreMatch(metadata.name, metadata.description, analysis.keywords);

                if (autoInstall && score >= 0.8) {
                  // Auto-install high-confidence matches
                  try {
                    const registry = getExtensionRegistry();
                    const slug = metadata.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
                    const installed = await registry.registerExtension(organizationId, {
                      slug,
                      name: metadata.name,
                      description: metadata.description,
                      version: metadata.version || '1.0.0',
                      extensionType: 'skill',
                      category: 'general',
                      tags: metadata.tags || analysis.keywords,
                      source: sourceName as 'github' | 'npm' | 'yaml' | 'generated',
                      format: 'native' as const,
                      runtimeType: 'prompt',
                      runtimeConfig: {},
                      triggers: analysis.keywords,
                      parameters: [],
                      outputs: [],
                      dependencies: [],
                      toolsRequired: [],
                      mcpProviders: [],
                      isPublic: false,
                      enabled: true,
                    });

                    result.installedSkills.push(installed);
                    result.installed = true;

                    logger.info('Auto-installed skill from discovery', {
                      skillSlug: installed.slug,
                      source: sourceName,
                      score,
                    });
                  } catch (installError) {
                    logger.warn('Failed to auto-install discovered skill', {
                      name: metadata.name,
                      source: sourceName,
                      error: (installError as Error).message,
                    });
                  }
                } else {
                  result.suggestedSkills.push({
                    name: metadata.name,
                    description: metadata.description,
                    source: sourceName,
                    installUrl: ref.url,
                  });
                }
              }
            } catch (sourceError) {
              logger.warn(`Discovery source ${sourceName} failed`, {
                error: (sourceError as Error).message,
              });
            }
          })()
        );
      }

      await Promise.allSettled(searchPromises);

      span.setAttribute('installed_count', result.installedSkills.length);
      span.setAttribute('suggested_count', result.suggestedSkills.length);

      logger.info('Skill discovery complete', {
        organizationId,
        installed: result.installedSkills.length,
        suggested: result.suggestedSkills.length,
      });

      return result;
    } catch (error) {
      span.recordException(error as Error);
      logger.error('Skill discovery failed', {
        organizationId,
        error: (error as Error).message,
      }, error as Error);
      return result;
    } finally {
      span.end();
    }
  });
}

/**
 * Score how well an external skill matches the request keywords
 */
function scoreMatch(name: string, description: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;

  const text = `${name} ${description}`.toLowerCase();
  let matchCount = 0;

  for (const keyword of keywords) {
    if (text.includes(keyword.toLowerCase())) {
      matchCount++;
    }
  }

  return matchCount / keywords.length;
}
