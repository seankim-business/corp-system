import fetch from 'node-fetch';

export interface Skill {
  id: string;
  name: string;
  author: string;
  scoped_name: string;
  description: string;
  stars: number;
  forks: number;
  github_url: string;
  raw_url: string;
  repo_full_name: string;
  path: string;
  branch: string;
  author_avatar: string;
  has_assets: boolean;
  assets: string[];
}

export interface SearchResult {
  skills: Skill[];
  total: number;
}

export interface SearchOptions {
  search?: string;
  author?: string;
  category?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'stars' | 'recent' | 'name';
}

const API_BASE_URL = 'https://www.agentskills.in/api/skills';

export class SkillsMPClient {
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

    const url = `${API_BASE_URL}?${params.toString()}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as SearchResult;
      return data;
    } catch (error: any) {
      throw new Error(`Failed to search skills: ${error.message}`);
    }
  }

  async getSkillByName(name: string, author?: string): Promise<Skill | null> {
    const result = await this.searchSkills({
      search: name,
      author,
      limit: 5,
      sortBy: 'stars',
    });

    if (result.skills.length === 0) {
      return null;
    }

    const exactMatch = result.skills.find(
      (s) => s.name === name && (!author || s.author === author)
    );

    return exactMatch || result.skills[0];
  }

  parseGitHubUrl(skill: Skill): {
    owner: string;
    repo: string;
    branch: string;
    skillPath: string;
  } | null {
    const match = skill.github_url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) return null;

    const [, owner, repo] = match;
    const branch = skill.branch || 'main';
    const skillPath = skill.path.replace(/\/SKILL\.md$/i, '');

    return { owner, repo, branch, skillPath };
  }
}
