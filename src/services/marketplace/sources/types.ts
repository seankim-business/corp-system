export interface ExternalSkillRef {
  source: string;
  identifier: string;
  owner?: string;
  repo?: string;
  version?: string;
  url?: string;
}

export interface ExternalSkillMetadata {
  name: string;
  description: string;
  version: string;
  author?: string;
  license?: string;
  tags: string[];
  downloads?: number;
  stars?: number;
}

export interface FetchedSkill {
  ref: ExternalSkillRef;
  metadata: ExternalSkillMetadata;
  content: string;
  format: 'skill-md' | 'openai-action' | 'langchain-tool' | 'yaml';
}

export interface SkillSource {
  readonly name: string;
  search(query: string, options?: SearchOptions): Promise<ExternalSkillRef[]>;
  fetch(ref: ExternalSkillRef): Promise<FetchedSkill>;
  getVersions(ref: ExternalSkillRef): Promise<string[]>;
}

export interface SearchOptions {
  limit?: number;
  page?: number;
  sort?: 'stars' | 'updated' | 'relevance';
}
