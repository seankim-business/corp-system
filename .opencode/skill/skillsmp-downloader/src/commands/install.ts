import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { Skill } from '../api/client';
import { marketplaceManager } from '../api/marketplace-manager';
import { getPlatformConfig } from '../platforms/config';

const execAsync = promisify(exec);

export interface InstallOptions {
  platforms?: string[];
  global?: boolean;
}

export async function installSkill(
  scopedName: string,
  options: InstallOptions = {}
): Promise<void> {
  const { platforms = ['cursor', 'claude', 'opencode'], global = false } = options;

  console.log(`📦 Installing "${scopedName}"...\n`);

  const [author, name] = parseScopedName(scopedName);

  const skill = await marketplaceManager.getSkillByName(name, author || undefined);

  if (!skill) {
    throw new Error(`Skill not found: ${scopedName}`);
  }

  console.log(`Found: ${skill.name} by ${skill.author}`);
  console.log(`GitHub: ${skill.github_url}\n`);

  const githubUrl = skill.github_url;
  const match = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) {
    throw new Error('Invalid GitHub URL');
  }

  const [, owner, repo] = match;

  const branch = skill.branch || 'main';
  const skillPath = skill.path.replace(/\/SKILL\.md$/i, '');

  const tempDir = `/tmp/skill-${Date.now()}`;
  await fs.mkdir(tempDir, { recursive: true });

  try {
    console.log(`⬇️  Downloading from GitHub...`);

    await execAsync(
      `git clone --depth 1 --branch ${branch} https://github.com/${owner}/${repo}.git .`,
      { cwd: tempDir }
    );

    console.log(`✓ Downloaded\n`);

    console.log(`📂 Installing to platforms...`);

    for (const platform of platforms) {
      const config = getPlatformConfig(platform);
      if (!config) {
        console.warn(`⚠️  Unknown platform: ${platform}`);
        continue;
      }

      const targetBase = global ? config.globalDir : path.join(process.cwd(), config.projectDir);
      const skillDir = path.join(targetBase, skill.name);

      await fs.mkdir(skillDir, { recursive: true });

      const sourceDir = skillPath ? path.join(tempDir, skillPath) : tempDir;

      await execAsync(`cp -r "${sourceDir}"/* "${skillDir}/"`);

      console.log(`  ✓ ${config.name}: ${skillDir}`);
    }

    console.log(
      `\n✨ Successfully installed "${skill.name}" to ${platforms.length} platform(s)!`
    );
  } finally {
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
