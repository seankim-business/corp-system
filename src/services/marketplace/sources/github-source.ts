import { SkillSource, ExternalSkillRef, FetchedSkill, SearchOptions } from './types';
import { logger } from '../../../utils/logger';

interface GitHubRepo {
  full_name: string;
  name: string;
  owner: { login: string };
  description: string;
  stargazers_count: number;
  default_branch: string;
  topics: string[];
  license?: { spdx_id: string };
}

export class GitHubSkillSource implements SkillSource {
  readonly name = 'github';
  private baseUrl = 'https://api.github.com';
  private token?: string;

  constructor(token?: string) {
    this.token = token || process.env.GITHUB_TOKEN;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Nubabel-Skill-Fetcher',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async search(query: string, options: SearchOptions = {}): Promise<ExternalSkillRef[]> {
    const { limit = 20, sort = 'stars' } = options;

    try {
      // Search for repos with claude-skill or mcp-server topics
      const searchQuery = encodeURIComponent(`${query} topic:claude-skill OR topic:mcp-server`);
      const url = `${this.baseUrl}/search/repositories?q=${searchQuery}&sort=${sort}&per_page=${limit}`;

      const response = await fetch(url, { headers: this.getHeaders() });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = await response.json() as { items?: GitHubRepo[] };
      const repos: GitHubRepo[] = data.items || [];

      return repos.map(repo => ({
        source: 'github',
        identifier: repo.full_name,
        owner: repo.owner.login,
        repo: repo.name,
        version: 'latest',
        url: `https://github.com/${repo.full_name}`,
      }));
    } catch (error) {
      logger.error('GitHub search failed', { query }, error as Error);
      return [];
    }
  }

  async fetch(ref: ExternalSkillRef): Promise<FetchedSkill> {
    const { owner, repo } = ref;
    if (!owner || !repo) {
      throw new Error('Owner and repo required for GitHub fetch');
    }

    try {
      // Try to fetch SKILL.md first
      let content: string | null = null;
      let format: FetchedSkill['format'] = 'skill-md';

      const files = ['SKILL.md', 'skill.yaml', 'skill.yml', 'manifest.json'];

      for (const file of files) {
        try {
          const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${file}`;
          const response = await fetch(url, { headers: this.getHeaders() });

          if (response.ok) {
            const data = await response.json() as { content: string };
            content = Buffer.from(data.content, 'base64').toString('utf-8');
            format = file.endsWith('.md') ? 'skill-md' :
                     file.endsWith('.yaml') || file.endsWith('.yml') ? 'yaml' : 'skill-md';
            break;
          }
        } catch {
          continue;
        }
      }

      if (!content) {
        throw new Error(`No skill definition found in ${owner}/${repo}`);
      }

      // Fetch repo metadata
      const repoUrl = `${this.baseUrl}/repos/${owner}/${repo}`;
      const repoResponse = await fetch(repoUrl, { headers: this.getHeaders() });
      const repoData = await repoResponse.json() as GitHubRepo;

      return {
        ref,
        metadata: {
          name: repoData.name,
          description: repoData.description || '',
          version: ref.version || '1.0.0',
          author: owner,
          license: repoData.license?.spdx_id,
          tags: repoData.topics || [],
          stars: repoData.stargazers_count,
        },
        content,
        format,
      };
    } catch (error) {
      logger.error('GitHub fetch failed', { ref }, error as Error);
      throw error;
    }
  }

  async getVersions(ref: ExternalSkillRef): Promise<string[]> {
    const { owner, repo } = ref;
    if (!owner || !repo) return ['latest'];

    try {
      const url = `${this.baseUrl}/repos/${owner}/${repo}/releases`;
      const response = await fetch(url, { headers: this.getHeaders() });

      if (!response.ok) return ['latest'];

      const releases = await response.json() as Array<{ tag_name: string }>;
      return releases.map(r => r.tag_name).slice(0, 10);
    } catch {
      return ['latest'];
    }
  }
}
