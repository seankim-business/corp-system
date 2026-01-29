export { SkillsMPClient, Skill, SearchResult, SearchOptions } from './api/client';
export { searchSkills, displaySkill } from './commands/search';
export { installSkill, InstallOptions } from './commands/install';
export { PLATFORMS, getPlatformConfig, getAllPlatforms, PlatformConfig } from './platforms/config';

export async function handleUserRequest(request: string): Promise<string> {
  const lowerRequest = request.toLowerCase();

  try {
    if (lowerRequest.includes('search') || lowerRequest.includes('find') || lowerRequest.includes('검색')) {
      const searchTermMatch = request.match(/(?:search|find|검색)(?:\s+for)?\s+(.+?)(?:\s+skill|$)/i);
      if (!searchTermMatch) {
        return "Please specify what to search for. Example: 'Search for Python skills'";
      }

      const searchTerm = searchTermMatch[1].trim();
      const { searchSkills } = await import('./commands/search');
      const skills = await searchSkills(searchTerm, { limit: 10 });

      if (skills.length === 0) {
        return `No skills found matching "${searchTerm}"`;
      }

      return `Found ${skills.length} skills. Use 'install' command to install any of them.`;
    }

    if (lowerRequest.includes('install') || lowerRequest.includes('download') || lowerRequest.includes('설치')) {
      const skillNameMatch = request.match(/(?:install|download|설치)\s+(?:@)?([a-z0-9-_\/]+)/i);
      if (!skillNameMatch) {
        return "Please specify skill name. Example: 'Install xlsx' or 'Install @anthropic/pdf'";
      }

      const skillName = skillNameMatch[1].trim();

      const platformMatch = request.match(/(?:to|for|in)\s+(cursor|claude|opencode|copilot|antigravity|amp|kilo|roo|goose|codex)/i);
      const platforms = platformMatch ? [platformMatch[1].toLowerCase()] : ['cursor', 'claude', 'opencode'];

      const isGlobal = lowerRequest.includes('global') || lowerRequest.includes('전역');

      const { installSkill } = await import('./commands/install');
      await installSkill(skillName, { platforms, global: isGlobal });

      return `Successfully installed "${skillName}" to ${platforms.join(', ')}`;
    }

    if (lowerRequest.includes('top') || lowerRequest.includes('popular') || lowerRequest.includes('인기')) {
      const limitMatch = request.match(/top\s+(\d+)/i);
      const limit = limitMatch ? parseInt(limitMatch[1], 10) : 20;

      const { searchSkills } = await import('./commands/search');
      await searchSkills('', { limit, sortBy: 'stars' });

      return `Showing top ${limit} skills by stars.`;
    }

    return "I can help you search and install skills from SkillsMP. Try:\n" +
           "- 'Search for Python skills'\n" +
           "- 'Install xlsx'\n" +
           "- 'Install @anthropic/pdf to Cursor'\n" +
           "- 'Show top 20 skills'";

  } catch (error: any) {
    return `Error: ${error.message}`;
  }
}
