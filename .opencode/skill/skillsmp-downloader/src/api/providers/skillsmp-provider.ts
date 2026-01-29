import fetch from 'node-fetch';
import { BaseMarketplaceProvider } from '../marketplace-provider';
import { Skill, SearchOptions, SearchResult } from '../client';

export class SkillsMPProvider extends BaseMarketplaceProvider {
  readonly name = 'skillsmp';
  readonly displayName = 'SkillsMP';
  readonly baseUrl = 'https://www.agentskills.in/api/skills';
  readonly supportsAuth = false;

  async searchSkills(options: SearchOptions = {}): Promise<SearchResult> {
    const {
      search = '',
      author,
      category,
      limit = 50,
      offset = 0,
      sortBy = 'stars',
    } = options;

    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (author) params.set('author', author);
    if (category) params.set('category', category);
    params.set('limit', limit.toString());
    params.set('offset', offset.toString());
    params.set('sortBy', sortBy);

    const url = `${this.baseUrl}?${params.toString()}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      
      return {
        skills: data.skills.map((s: any) => this.normalizeSkill(s)),
        total: data.total,
      };
    } catch (error: any) {
      throw new Error(`SkillsMP search failed: ${error.message}`);
    }
  }

  normalizeSkill(rawSkill: any): Skill {
    return {
      id: rawSkill.id,
      name: rawSkill.name,
      author: rawSkill.author,
      scoped_name: rawSkill.scoped_name,
      description: rawSkill.description,
      stars: rawSkill.stars || 0,
      forks: rawSkill.forks || 0,
      github_url: rawSkill.github_url,
      raw_url: rawSkill.raw_url,
      repo_full_name: rawSkill.repo_full_name,
      path: rawSkill.path,
      branch: rawSkill.branch || 'main',
      author_avatar: rawSkill.author_avatar,
      has_assets: rawSkill.has_assets || false,
      assets: rawSkill.assets || [],
    };
  }
}
