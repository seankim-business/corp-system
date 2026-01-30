import { SkillSource, ExternalSkillRef, FetchedSkill, SearchOptions } from './types';
import { logger } from '../../../utils/logger';

interface NpmPackage {
  name: string;
  version: string;
  description?: string;
  keywords?: string[];
  author?: { name: string } | string;
  license?: string;
  repository?: { url: string };
}

export class NpmSkillSource implements SkillSource {
  readonly name = 'npm';
  private baseUrl = 'https://registry.npmjs.org';

  async search(query: string, options: SearchOptions = {}): Promise<ExternalSkillRef[]> {
    const { limit = 20 } = options;

    try {
      // Search for packages with claude-skill or mcp-server keywords
      const searchUrl = `${this.baseUrl}/-/v1/search?text=${encodeURIComponent(query + ' keywords:claude-skill,mcp-server')}&size=${limit}`;

      const response = await fetch(searchUrl);
      if (!response.ok) {
        throw new Error(`npm API error: ${response.status}`);
      }

      const data = await response.json() as { objects?: any[] };
      const packages = data.objects || [];

      return packages.map((pkg: any) => ({
        source: 'npm',
        identifier: pkg.package.name,
        version: pkg.package.version,
        url: `https://www.npmjs.com/package/${pkg.package.name}`,
      }));
    } catch (error) {
      logger.error('npm search failed', { query }, error as Error);
      return [];
    }
  }

  async fetch(ref: ExternalSkillRef): Promise<FetchedSkill> {
    const { identifier, version = 'latest' } = ref;

    try {
      // Fetch package metadata
      const metaUrl = `${this.baseUrl}/${identifier}/${version}`;
      const response = await fetch(metaUrl);

      if (!response.ok) {
        throw new Error(`Package not found: ${identifier}@${version}`);
      }

      const pkg = await response.json() as NpmPackage;

      // For npm packages, we need to fetch the actual skill definition
      // This could be in the package itself or a linked file
      // For now, return the package.json as the skill definition
      // In production, you'd extract the actual skill file from the tarball
      const content = JSON.stringify({
        name: pkg.name,
        description: pkg.description,
        version: pkg.version,
        keywords: pkg.keywords,
      }, null, 2);

      const authorName = typeof pkg.author === 'string'
        ? pkg.author
        : pkg.author?.name;

      return {
        ref: { ...ref, version: pkg.version },
        metadata: {
          name: pkg.name,
          description: pkg.description || '',
          version: pkg.version,
          author: authorName,
          license: pkg.license,
          tags: pkg.keywords || [],
        },
        content,
        format: 'yaml',
      };
    } catch (error) {
      logger.error('npm fetch failed', { ref }, error as Error);
      throw error;
    }
  }

  async getVersions(ref: ExternalSkillRef): Promise<string[]> {
    const { identifier } = ref;

    try {
      const url = `${this.baseUrl}/${identifier}`;
      const response = await fetch(url);

      if (!response.ok) return ['latest'];

      const data = await response.json() as { versions?: Record<string, unknown> };
      const versions = Object.keys(data.versions || {});

      // Return latest 10 versions in descending order
      return versions.reverse().slice(0, 10);
    } catch {
      return ['latest'];
    }
  }
}
