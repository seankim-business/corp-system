import { Skill, SearchOptions, SearchResult } from './client';

export interface MarketplaceProvider {
  readonly name: string;
  readonly displayName: string;
  readonly baseUrl: string;
  readonly supportsAuth: boolean;
  
  searchSkills(options: SearchOptions): Promise<SearchResult>;
  getSkillByName(name: string, author?: string): Promise<Skill | null>;
  normalizeSkill(rawSkill: any): Skill;
}

export abstract class BaseMarketplaceProvider implements MarketplaceProvider {
  abstract readonly name: string;
  abstract readonly displayName: string;
  abstract readonly baseUrl: string;
  abstract readonly supportsAuth: boolean;
  
  abstract searchSkills(options: SearchOptions): Promise<SearchResult>;
  abstract normalizeSkill(rawSkill: any): Skill;
  
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
}
