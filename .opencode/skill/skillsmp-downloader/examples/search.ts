/**
 * Example: Search SkillsMP Marketplace
 * 
 * Usage: When user asks "Search for Python skills" or "Find Excel skills"
 */

interface Skill {
  id: string;
  name: string;
  author: string;
  scoped_name: string;
  description: string;
  stars: number;
  github_url: string;
  raw_url: string;
}

interface SearchResult {
  skills: Skill[];
  total: number;
}

async function searchSkills(
  query: string,
  options: {
    limit?: number;
    sortBy?: 'stars' | 'recent' | 'name';
    author?: string;
  } = {}
): Promise<SearchResult> {
  const { limit = 20, sortBy = 'stars', author } = options;
  
  // Build API URL
  const params = new URLSearchParams({
    search: query,
    sortBy,
    limit: limit.toString(),
  });
  
  if (author) params.set('author', author);
  
  const url = `https://www.agentskills.in/api/skills?${params}`;
  
  console.log(`🔍 Searching for "${query}"...`);
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data: SearchResult = await response.json();
    
    console.log(`\nFound ${data.total.toLocaleString()} skills (showing top ${data.skills.length}):\n`);
    
    // Display results
    for (const skill of data.skills) {
      const stars = skill.stars ? `⭐${skill.stars.toLocaleString()}` : '';
      console.log(`  ${skill.name} ${stars}`);
      console.log(`    ${skill.description.slice(0, 60)}...`);
      console.log(`    by ${skill.author}`);
      console.log('');
    }
    
    return data;
    
  } catch (error) {
    console.error('Failed to search skills:', error);
    throw error;
  }
}

// Example Usage:

// Search for Python skills
await searchSkills('python', { limit: 10 });

// Search for specific author
await searchSkills('excel', { author: 'anthropic', limit: 5 });

// Search with different sorting
await searchSkills('web scraping', { sortBy: 'recent', limit: 15 });
