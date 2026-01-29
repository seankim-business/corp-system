import fetch from 'node-fetch';
import { BaseMarketplaceProvider } from '../marketplace-provider';
import { Skill, SearchOptions, SearchResult } from '../client';

export class AnthropicSkillsProvider extends BaseMarketplaceProvider {
  readonly name = 'anthropic';
  readonly displayName = 'Anthropic Skills (GitHub)';
  readonly baseUrl = 'https://api.github.com/repos/anthropics/skills/contents';
  readonly supportsAuth = true;

  async searchSkills(options: SearchOptions = {}): Promise<SearchResult> {
    const { search = '', limit = 50 } = options;

    try {
      const response = await fetch(this.baseUrl, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          ...(process.env.GITHUB_TOKEN && {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          }),
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const items = (await response.json()) as any[];

      const skills = await Promise.all(
        items
          .filter((item) => item.type === 'dir')
          .slice(0, limit)
          .map(async (item) => {
            const skillUrl = `${this.baseUrl}/${item.name}/SKILL.md`;
            const skillResponse = await fetch(skillUrl, {
              headers: {
                Accept: 'application/vnd.github.v3.raw',
                ...(process.env.GITHUB_TOKEN && {
                  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                }),
              },
            });

            if (skillResponse.ok) {
              const content = await skillResponse.text();
              return this.normalizeSkill({
                name: item.name,
                path: item.path,
                url: item.html_url,
                content,
              });
            }
            return null;
          })
      );

      const validSkills = skills.filter((s): s is Skill => s !== null);

      const filtered = search
        ? validSkills.filter(
            (s) =>
              s.name.toLowerCase().includes(search.toLowerCase()) ||
              s.description.toLowerCase().includes(search.toLowerCase())
          )
        : validSkills;

      return {
        skills: filtered,
        total: filtered.length,
      };
    } catch (error: any) {
      throw new Error(`Anthropic Skills search failed: ${error.message}`);
    }
  }

  normalizeSkill(rawSkill: any): Skill {
    const descMatch = rawSkill.content?.match(/description:\s*(.+)/i);
    const description = descMatch ? descMatch[1].trim() : '';

    return {
      id: `anthropic-${rawSkill.name}`,
      name: rawSkill.name,
      author: 'anthropics',
      scoped_name: `anthropics/${rawSkill.name}`,
      description,
      stars: 0,
      forks: 0,
      github_url: `https://github.com/anthropics/skills/tree/main/${rawSkill.name}`,
      raw_url: `https://raw.githubusercontent.com/anthropics/skills/main/${rawSkill.name}/SKILL.md`,
      repo_full_name: 'anthropics/skills',
      path: rawSkill.path || rawSkill.name,
      branch: 'main',
      author_avatar: 'https://avatars.githubusercontent.com/u/74567276',
      has_assets: false,
      assets: [],
    };
  }
}
