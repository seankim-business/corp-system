import { MarketplaceProvider } from './marketplace-provider';
import { SkillsMPProvider } from './providers/skillsmp-provider';
import { AnthropicSkillsProvider } from './providers/anthropic-provider';
import { Skill, SearchOptions, SearchResult } from './client';

export class MarketplaceManager {
  private providers: Map<string, MarketplaceProvider> = new Map();
  private activeProviders: string[] = [];

  constructor() {
    this.registerProvider(new SkillsMPProvider());
    this.registerProvider(new AnthropicSkillsProvider());
    
    this.activeProviders = ['skillsmp', 'anthropic'];
  }

  registerProvider(provider: MarketplaceProvider): void {
    this.providers.set(provider.name, provider);
  }

  getProvider(name: string): MarketplaceProvider | undefined {
    return this.providers.get(name);
  }

  getAllProviders(): MarketplaceProvider[] {
    return Array.from(this.providers.values());
  }

  getActiveProviders(): MarketplaceProvider[] {
    return this.activeProviders
      .map((name) => this.providers.get(name))
      .filter((p): p is MarketplaceProvider => p !== undefined);
  }

  setActiveProviders(names: string[]): void {
    const validNames = names.filter((name) => this.providers.has(name));
    this.activeProviders = validNames;
  }

  async searchAll(options: SearchOptions = {}): Promise<SearchResult> {
    const activeProviders = this.getActiveProviders();

    const results = await Promise.allSettled(
      activeProviders.map((provider) =>
        provider.searchSkills(options).catch((error) => {
          console.warn(`${provider.displayName} search failed:`, error.message);
          return { skills: [], total: 0 };
        })
      )
    );

    const allSkills: Skill[] = [];
    let totalCount = 0;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allSkills.push(...result.value.skills);
        totalCount += result.value.total;
      }
    }

    const uniqueSkills = this.deduplicateSkills(allSkills);

    const sortedSkills = this.sortSkills(uniqueSkills, options.sortBy || 'stars');

    const limit = options.limit || 50;
    const offset = options.offset || 0;
    const paginatedSkills = sortedSkills.slice(offset, offset + limit);

    return {
      skills: paginatedSkills,
      total: uniqueSkills.length,
    };
  }

  async searchByProvider(
    providerName: string,
    options: SearchOptions = {}
  ): Promise<SearchResult> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    return provider.searchSkills(options);
  }

  private deduplicateSkills(skills: Skill[]): Skill[] {
    const seen = new Set<string>();
    const unique: Skill[] = [];

    for (const skill of skills) {
      const key = `${skill.author}/${skill.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(skill);
      }
    }

    return unique;
  }

  private sortSkills(skills: Skill[], sortBy: 'stars' | 'recent' | 'name'): Skill[] {
    const sorted = [...skills];

    switch (sortBy) {
      case 'stars':
        sorted.sort((a, b) => (b.stars || 0) - (a.stars || 0));
        break;
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'recent':
        break;
    }

    return sorted;
  }

  async getSkillByName(
    name: string,
    author?: string,
    providerName?: string
  ): Promise<Skill | null> {
    if (providerName) {
      const provider = this.providers.get(providerName);
      if (!provider) {
        throw new Error(`Provider not found: ${providerName}`);
      }
      return provider.getSkillByName(name, author);
    }

    const activeProviders = this.getActiveProviders();

    for (const provider of activeProviders) {
      try {
        const skill = await provider.getSkillByName(name, author);
        if (skill) {
          return skill;
        }
      } catch (error) {
        console.warn(`${provider.displayName} lookup failed:`, error);
      }
    }

    return null;
  }
}

export const marketplaceManager = new MarketplaceManager();
