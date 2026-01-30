export * from './types';
export * from './github-source';
export * from './npm-source';

import { SkillSource } from './types';
import { GitHubSkillSource } from './github-source';
import { NpmSkillSource } from './npm-source';

export function createSourceRegistry(): Map<string, SkillSource> {
  const registry = new Map<string, SkillSource>();

  registry.set('github', new GitHubSkillSource());
  registry.set('npm', new NpmSkillSource());

  return registry;
}
