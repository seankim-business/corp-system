import * as path from 'path';
import * as os from 'os';

export interface PlatformConfig {
  name: string;
  projectDir: string;
  globalDir: string;
}

export const PLATFORMS: Record<string, PlatformConfig> = {
  cursor: {
    name: 'Cursor',
    projectDir: '.cursor/skills',
    globalDir: path.join(os.homedir(), '.cursor', 'skills'),
  },
  claude: {
    name: 'Claude Code',
    projectDir: '.claude/skills',
    globalDir: path.join(os.homedir(), '.claude', 'skills'),
  },
  opencode: {
    name: 'OpenCode',
    projectDir: '.opencode/skill',
    globalDir: path.join(os.homedir(), '.config', 'opencode', 'skill'),
  },
  copilot: {
    name: 'GitHub Copilot',
    projectDir: '.github/skills',
    globalDir: path.join(os.homedir(), '.github', 'skills'),
  },
  antigravity: {
    name: 'Antigravity',
    projectDir: '.agent/skills',
    globalDir: path.join(os.homedir(), '.gemini', 'antigravity', 'skills'),
  },
  amp: {
    name: 'Amp',
    projectDir: '.agents/skills',
    globalDir: path.join(os.homedir(), '.config', 'agents', 'skills'),
  },
  kilo: {
    name: 'Kilo Code',
    projectDir: '.kilocode/skills',
    globalDir: path.join(os.homedir(), '.kilocode', 'skills'),
  },
  roo: {
    name: 'Roo Code',
    projectDir: '.roo/skills',
    globalDir: path.join(os.homedir(), '.roo', 'skills'),
  },
  goose: {
    name: 'Goose',
    projectDir: '.goose/skills',
    globalDir: path.join(os.homedir(), '.config', 'goose', 'skills'),
  },
  codex: {
    name: 'OpenAI Codex',
    projectDir: '.codex/skills',
    globalDir: path.join(os.homedir(), '.codex', 'skills'),
  },
};

export function getPlatformConfig(platform: string): PlatformConfig | null {
  return PLATFORMS[platform.toLowerCase()] || null;
}

export function getAllPlatforms(): string[] {
  return Object.keys(PLATFORMS);
}
