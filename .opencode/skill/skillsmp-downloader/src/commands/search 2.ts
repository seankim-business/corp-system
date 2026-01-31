import { Skill, SearchOptions } from '../api/client';
import { marketplaceManager } from '../api/marketplace-manager';

export async function searchSkills(
  query: string,
  options: Partial<SearchOptions> = {}
): Promise<Skill[]> {

  const {
    author,
    limit = 20,
    sortBy = 'stars',
  } = options;

  console.log(`🔍 Searching across all marketplaces for "${query}"...`);

  const result = await marketplaceManager.searchAll({
    search: query,
    author,
    limit,
    sortBy,
  });

  console.log(`\nFound ${result.total.toLocaleString()} skills (showing top ${result.skills.length}):\n`);

  for (const skill of result.skills) {
    const stars = skill.stars ? `⭐${skill.stars.toLocaleString()}` : '';
    console.log(`  ${skill.name} ${stars}`);
    console.log(`    ${skill.description.slice(0, 80)}...`);
    console.log(`    by ${skill.author}`);
    console.log('');
  }

  return result.skills;
}

export function displaySkill(skill: Skill): void {
  console.log(`\n📦 ${skill.name}`);
  console.log(`   Author: ${skill.author}`);
  console.log(`   Stars: ${skill.stars ? `⭐ ${skill.stars.toLocaleString()}` : 'N/A'}`);
  console.log(`   Description: ${skill.description}`);
  console.log(`   GitHub: ${skill.github_url}`);
  console.log('');
}
