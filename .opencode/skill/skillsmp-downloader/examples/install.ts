/**
 * Example: Install Skills from SkillsMP
 * 
 * Usage: When user asks "Install xlsx skill" or "Download @anthropic/pdf to Cursor"
 */

import * as fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface Skill {
  name: string;
  author: string;
  github_url: string;
  raw_url: string;
  path: string;
  branch: string;
}

// Platform configuration
const PLATFORMS = {
  cursor: {
    name: 'Cursor',
    projectDir: '.cursor/skills',
    globalDir: `${process.env.HOME}/.cursor/skills`,
  },
  claude: {
    name: 'Claude Code',
    projectDir: '.claude/skills',
    globalDir: `${process.env.HOME}/.claude/skills`,
  },
  opencode: {
    name: 'OpenCode',
    projectDir: '.opencode/skill',
    globalDir: `${process.env.HOME}/.config/opencode/skill`,
  },
  copilot: {
    name: 'GitHub Copilot',
    projectDir: '.github/skills',
    globalDir: `${process.env.HOME}/.github/skills`,
  },
  antigravity: {
    name: 'Antigravity',
    projectDir: '.agent/skills',
    globalDir: `${process.env.HOME}/.gemini/antigravity/skills`,
  },
};

async function installSkill(
  scopedName: string,
  platforms: string[] = ['cursor', 'claude', 'opencode'],
  global = false
): Promise<void> {
  console.log(`📦 Installing "${scopedName}"...\n`);
  
  // 1. Search for skill
  const [author, name] = parseScopedName(scopedName);
  const searchUrl = `https://www.agentskills.in/api/skills?search=${name}${author ? `&author=${author}` : ''}&sortBy=stars&limit=5`;
  
  const response = await fetch(searchUrl);
  const { skills } = await response.json();
  
  const skill: Skill = skills.find((s: any) =>
    s.name === name && (!author || s.author === author)
  ) || skills[0];
  
  if (!skill) {
    throw new Error(`Skill not found: ${scopedName}`);
  }
  
  console.log(`Found: ${skill.name} by ${skill.author}`);
  console.log(`GitHub: ${skill.github_url}\n`);
  
  // 2. Parse GitHub URL
  const match = skill.github_url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error('Invalid GitHub URL');
  
  const [, owner, repo] = match;
  const branch = skill.branch || 'main';
  const skillPath = skill.path.replace(/\/SKILL\.md$/i, '');
  
  // 3. Download to temp directory
  const tempDir = `/tmp/skill-${Date.now()}`;
  await fs.mkdir(tempDir, { recursive: true });
  
  try {
    console.log(`⬇️  Downloading from GitHub...`);
    
    // Clone repository (sparse checkout for speed)
    await execAsync(
      `git clone --depth 1 --branch ${branch} https://github.com/${owner}/${repo}.git .`,
      { cwd: tempDir }
    );
    
    console.log(`✓ Downloaded\n`);
    
    // 4. Install to each platform
    console.log(`📂 Installing to platforms...`);
    
    for (const platform of platforms) {
      const config = PLATFORMS[platform as keyof typeof PLATFORMS];
      if (!config) {
        console.warn(`⚠️  Unknown platform: ${platform}`);
        continue;
      }
      
      const targetDir = global ? config.globalDir : config.projectDir;
      const skillDir = global 
        ? `${targetDir}/${skill.name}`
        : `${process.cwd()}/${targetDir}/${skill.name}`;
      
      await fs.mkdir(skillDir, { recursive: true });
      
      const sourceDir = skillPath ? `${tempDir}/${skillPath}` : tempDir;
      
      // Copy skill files recursively
      await execAsync(`cp -r "${sourceDir}"/* "${skillDir}/"`);
      
      console.log(`  ✓ ${config.name}: ${skillDir}`);
    }
    
    console.log(`\n✨ Successfully installed "${skill.name}" to ${platforms.length} platform(s)!`);
    
  } finally {
    // Cleanup temp directory
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function parseScopedName(input: string): [string | null, string] {
  const clean = input.replace(/^@/, '').trim();
  
  if (clean.includes('/')) {
    const [author, ...nameParts] = clean.split('/');
    return [author.trim(), nameParts.join('/').trim()];
  }
  
  return [null, clean];
}

// Example Usage:

// Install to default platforms (cursor, claude, opencode)
await installSkill('xlsx');

// Install to specific platforms
await installSkill('@anthropic/pdf', ['cursor', 'claude']);

// Install globally
await installSkill('python-expert', ['cursor'], true);

// Install to all platforms
await installSkill('web-scraper', Object.keys(PLATFORMS));
