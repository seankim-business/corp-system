---
name: skillsmp-downloader
description: Download and install AI agent skills from multiple marketplaces (100,000+ skills total). Integrates with SkillsMP, Anthropic Skills, and more. Supports Cursor, Claude Code, GitHub Copilot, OpenCode, and 6 other platforms.
license: MIT
metadata:
  author: skillsmp-community
  version: "2.0"
  compatibility: "All AI agents (Cursor, Claude Code, OpenCode, Copilot, etc.)"
  tags: [skills, marketplace, download, installer, skillsmp, agentskills, anthropic, multi-marketplace]
---

# Multi-Marketplace Skills Downloader

Download and install AI agent skills from **multiple marketplaces** with a unified interface:
- **SkillsMP** (agentskills.in) - 107,805 skills
- **Anthropic Official Skills** (GitHub) - 50+ curated skills
- **More marketplaces coming soon** (SkillsLLM, Agent-Skills.md, etc.)

## When to use this skill

Use this skill when the user wants to:
- **Search for skills across multiple marketplaces** (SkillsMP, Anthropic, etc.)
- Install skills to their AI agent platform (Cursor, Claude Code, OpenCode, etc.)
- Browse available skills with star counts and descriptions from ALL marketplaces
- Download skills directly from GitHub repositories
- Manage multiple platform installations
- Find official skills from Anthropic alongside community skills

## Usage

This skill is now production-ready with TypeScript implementation. When the user asks:

```
"Search for Python skills on SkillsMP"
"Install xlsx skill to Cursor"
"Download @anthropic/pdf skill"
"Show me top 20 skills"
```

The skill will automatically:
1. Parse the user's request
2. Call the appropriate command (search or install)
3. Execute the action using agentskills.in API
4. Display results or install confirmation

### Implementation

```typescript
import { handleUserRequest } from 'skillsmp-downloader';

const response = await handleUserRequest("Search for Python skills");
console.log(response);
```

## API & Data Sources

This skill uses a **multi-marketplace provider architecture** to search across all available skill sources.

### Marketplace 1: SkillsMP (agentskills.in)
```
Base URL: https://www.agentskills.in/api/skills
Skills: 107,805
```

**Endpoints:**
- `GET /api/skills` - List/search skills
- Query parameters:
  - `search` - Search query string
  - `author` - Filter by author
  - `category` - Filter by category
  - `limit` - Results per page (default: 50)
  - `offset` - Pagination offset
  - `sortBy` - Sort order: 'stars' | 'recent' | 'name'

### Marketplace 2: Anthropic Official Skills
```
Source: github.com/anthropics/skills
Skills: 50+ official curated skills
```

**Access Method:**
- GitHub API: `https://api.github.com/repos/anthropics/skills/contents/skills`
- Direct download via raw URLs

### Marketplace 3+: Coming Soon
- **Agent-Skills.md** (6,910 skills)
- **SkillsLLM** (881 skills)
- **AI Agent Skills** (1,300+ skills)
- More...

### Unified Search
The skill automatically **searches all enabled marketplaces in parallel** and:
- ✅ Deduplicates results by author/name
- ✅ Sorts by stars/relevance
- ✅ Shows which marketplace each skill came from
- ✅ Falls back gracefully if any marketplace is unavailable

**Response Format:**
```json
{
  "skills": [
    {
      "id": "uuid",
      "name": "skill-name",
      "author": "author-name",
      "scoped_name": "author/skill-name",
      "description": "Skill description",
      "stars": 42,
      "forks": 7,
      "github_url": "https://github.com/owner/repo/tree/main/path",
      "raw_url": "https://raw.githubusercontent.com/owner/repo/main/path/SKILL.md",
      "repo_full_name": "owner/repo",
      "path": "skills/skill-name",
      "branch": "main",
      "author_avatar": "https://avatars.githubusercontent.com/...",
      "has_assets": true,
      "assets": []
    }
  ],
  "total": 67000
}
```

### Fallback: GitHub API
When agentskills.in is unavailable, fall back to:
```
https://api.github.com/repos/{owner}/{repo}/contents/{path}
```

## Platform Installation Paths

### Supported Platforms (10)

| Platform | Project Dir | Global Dir | Flag |
|----------|-------------|------------|------|
| **Cursor** | `.cursor/skills/` | `~/.cursor/skills/` | `cursor` |
| **Claude Code** | `.claude/skills/` | `~/.claude/skills/` | `claude` |
| **GitHub Copilot** | `.github/skills/` | `~/.github/skills/` | `copilot` |
| **OpenAI Codex** | `.codex/skills/` | `~/.codex/skills/` | `codex` |
| **Antigravity** | `.agent/skills/` | `~/.gemini/antigravity/skills/` | `antigravity` |
| **OpenCode** | `.opencode/skill/` | `~/.config/opencode/skill/` | `opencode` |
| **Amp** | `.agents/skills/` | `~/.config/agents/skills/` | `amp` |
| **Kilo Code** | `.kilocode/skills/` | `~/.kilocode/skills/` | `kilo` |
| **Roo Code** | `.roo/skills/` | `~/.roo/skills/` | `roo` |
| **Goose** | `.goose/skills/` | `~/.config/goose/skills/` | `goose` |

## Installation Flow

### Step 1: Search Skills

```bash
# Example API call
curl "https://www.agentskills.in/api/skills?search=python&sortBy=stars&limit=20"
```

Parse response and display:
```
Found 1,234 skills matching "python":

  python-expert ⭐1,245 @anthropic
    Expert Python coding assistance with best practices
  
  python-debug ⭐892 @openai
    Advanced Python debugging and profiling
```

### Step 2: Parse GitHub URL

Extract from skill object:
```javascript
const { github_url, raw_url, branch, path } = skill;

// Parse GitHub URL
const match = github_url.match(/github\.com\/([^/]+)\/([^/]+)/);
const [, owner, repo] = match;
const skillPath = path.replace(/\/SKILL\.md$/i, '');
```

### Step 3: Download Skill

**Option A: Direct SKILL.md Download (Fast)**
```bash
curl -o SKILL.md "https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}/SKILL.md"
```

**Option B: Full Repository Clone (For assets)**
```bash
# Create temp directory
mkdir -p /tmp/skill-{timestamp}
cd /tmp/skill-{timestamp}

# Sparse checkout (only skill directory)
git init
git remote add origin https://github.com/{owner}/{repo}.git
git config core.sparseCheckout true
echo "{skillPath}" > .git/info/sparse-checkout
git fetch --depth=1 origin {branch}
git checkout {branch}
```

### Step 4: Install to Platforms

```bash
# For each selected platform:
for platform in cursor claude opencode; do
  # Determine install directory
  if [[ $GLOBAL == true ]]; then
    dir="${platform_global_dir}/${skill_name}"
  else
    dir="${platform_project_dir}/${skill_name}"
  fi
  
  # Create directory
  mkdir -p "$dir"
  
  # Copy skill files
  cp -r /tmp/skill-*/path/to/skill/* "$dir/"
done
```

### Step 5: Verify Installation

```bash
# Check SKILL.md exists
test -f .cursor/skills/skill-name/SKILL.md && echo "✓ Installed"

# Validate skill format (optional)
cat .cursor/skills/skill-name/SKILL.md | grep -E "^---" && echo "✓ Valid frontmatter"
```

## Implementation Instructions

### 1. Search Command

When user asks: "Search for Python skills" or "Find skills about web scraping"

```typescript
async function searchSkills(query: string, limit = 20) {
  const url = `https://www.agentskills.in/api/skills?search=${encodeURIComponent(query)}&sortBy=stars&limit=${limit}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    console.log(`Found ${data.total.toLocaleString()} skills:`);
    
    for (const skill of data.skills) {
      console.log(`\n  ${skill.name} ${skill.stars ? `⭐${skill.stars}` : ''}`);
      console.log(`    ${skill.description.slice(0, 60)}...`);
      console.log(`    by ${skill.author}`);
    }
    
    return data.skills;
  } catch (error) {
    console.error('Failed to fetch from agentskills.in:', error);
    // Fallback to GitHub API if needed
  }
}
```

### 2. Install Command

When user asks: "Install the xlsx skill" or "Download @anthropic/pdf skill to Cursor"

```typescript
async function installSkill(
  scopedName: string,  // e.g., "@anthropic/xlsx" or "xlsx"
  platforms: string[],  // e.g., ["cursor", "claude", "opencode"]
  global = false
) {
  // 1. Search for skill
  const [author, name] = parseScopedName(scopedName);
  const searchUrl = `https://www.agentskills.in/api/skills?search=${name}${author ? `&author=${author}` : ''}&sortBy=stars&limit=5`;
  
  const response = await fetch(searchUrl);
  const { skills } = await response.json();
  
  const skill = skills.find(s => 
    s.name === name && (!author || s.author === author)
  ) || skills[0];
  
  if (!skill) {
    throw new Error(`Skill not found: ${scopedName}`);
  }
  
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
    // Clone repository
    await execAsync(
      `git clone --depth 1 --branch ${branch} https://github.com/${owner}/${repo}.git .`,
      { cwd: tempDir }
    );
    
    // 4. Install to each platform
    for (const platform of platforms) {
      const config = PLATFORM_CONFIG[platform];
      const targetDir = global ? config.globalDir : config.projectDir;
      const skillDir = `${targetDir}/${skill.name}`;
      
      await fs.mkdir(skillDir, { recursive: true });
      
      const sourceDir = skillPath ? `${tempDir}/${skillPath}` : tempDir;
      await fs.cp(sourceDir, skillDir, { recursive: true });
      
      console.log(`✓ Installed to ${platform}: ${skillDir}`);
    }
    
    return { success: true, skill: skill.name };
    
  } finally {
    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
```

### 3. Platform Auto-Detection

```typescript
function detectPlatforms(): string[] {
  const cwd = process.cwd();
  const detected: string[] = [];
  
  if (fs.existsSync(`${cwd}/.cursor`)) detected.push('cursor');
  if (fs.existsSync(`${cwd}/.claude`)) detected.push('claude');
  if (fs.existsSync(`${cwd}/.opencode`)) detected.push('opencode');
  if (fs.existsSync(`${cwd}/.github`)) detected.push('copilot');
  if (fs.existsSync(`${cwd}/.agent`)) detected.push('antigravity');
  
  return detected;
}
```

### 4. Scoped Name Parsing

```typescript
function parseScopedName(input: string): [author: string | null, name: string] {
  // Remove @ prefix if present
  const clean = input.replace(/^@/, '').trim();
  
  if (clean.includes('/')) {
    const [author, ...nameParts] = clean.split('/');
    return [author.trim(), nameParts.join('/').trim()];
  }
  
  return [null, clean];
}
```

## Example User Workflows

### Workflow 1: Search and Install

**User:** "Find skills for working with Excel files"

**Agent Steps:**
1. Call API: `GET /api/skills?search=excel&sortBy=stars&limit=10`
2. Display results with star counts
3. User selects: "xlsx"
4. Call API: `GET /api/skills?search=xlsx&limit=1`
5. Download from GitHub
6. Auto-detect platforms (or ask user)
7. Install to `.cursor/skills/xlsx/`, `.claude/skills/xlsx/`, etc.
8. Report: "✓ Installed xlsx to cursor, claude, opencode"

### Workflow 2: Install Specific Skill

**User:** "Install @anthropic/pdf skill to Claude Code globally"

**Agent Steps:**
1. Parse: author="anthropic", name="pdf", platform="claude", global=true
2. Call API: `GET /api/skills?search=pdf&author=anthropic&limit=1`
3. Download from GitHub
4. Install to `~/.claude/skills/pdf/`
5. Report: "✓ Installed @anthropic/pdf to ~/.claude/skills/pdf"

### Workflow 3: Browse Marketplace

**User:** "Show me the top 20 skills by stars"

**Agent Steps:**
1. Call API: `GET /api/skills?sortBy=stars&limit=20`
2. Display formatted list with stars, author, description
3. Report: "Showing 20 of 67,000+ skills. Use 'install' to download."

## Error Handling

### API Unavailable
```typescript
try {
  const response = await fetch('https://www.agentskills.in/api/skills?...');
  // ...
} catch (error) {
  console.warn('agentskills.in API unavailable, falling back to GitHub search');
  // Fall back to GitHub API or local cache
}
```

### Skill Not Found
```typescript
if (!skills.length) {
  console.error(`No skills found matching "${query}"`);
  console.log('Try broader search terms or check https://skillsmp.com/');
  return;
}
```

### Git Clone Failure
```typescript
try {
  await execAsync('git clone ...');
} catch (error) {
  console.error('Git clone failed. Trying direct download...');
  // Fall back to direct SKILL.md download via raw_url
  const response = await fetch(skill.raw_url);
  const content = await response.text();
  await fs.writeFile(`${targetDir}/SKILL.md`, content);
}
```

## Best Practices

### 1. Always Use agentskills.in API First
- 67,000+ skills indexed
- Fast search with star rankings
- Cached metadata

### 2. Batch Installations
```typescript
// Install multiple skills in parallel
await Promise.all(
  selectedSkills.map(skill => installSkill(skill, platforms))
);
```

### 3. Verify Before Install
```typescript
// Check if skill already exists
const existing = fs.existsSync(`${targetDir}/${skillName}`);
if (existing) {
  console.warn(`Skill ${skillName} already installed. Overwrite? (y/n)`);
  // Ask user or skip
}
```

### 4. Clean Temporary Files
```typescript
// Always cleanup temp directories in finally block
try {
  await downloadAndInstall();
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
```

### 5. Show Progress
```typescript
console.log(`📦 Installing ${skillName}...`);
console.log(`⬇️  Downloading from GitHub...`);
console.log(`📂 Installing to ${platforms.join(', ')}...`);
console.log(`✓ Done! Installed to ${platforms.length} platform(s)`);
```

## Skill Format Reference

### SKILL.md Structure
```markdown
---
name: skill-name
description: Brief description
license: MIT
metadata:
  author: author-name
  version: "1.0"
  tags: [tag1, tag2]
---

# Skill Title

## When to use this skill
...

## Instructions
...
```

### Directory Structure
```
skill-name/
├── SKILL.md          # Required: Skill instructions
├── scripts/          # Optional: Helper scripts
├── references/       # Optional: Reference files
└── assets/           # Optional: Assets (images, data)
```

## Reference Implementation

See the official agent-skills-cli for full implementation:
- **GitHub:** https://github.com/Karanjot786/agent-skills-cli
- **npm:** https://www.npmjs.com/package/agent-skills-cli
- **Website:** https://agentskills.in

**Key Files to Reference:**
- `src/core/skillsdb.ts` - API client
- `src/core/marketplace.ts` - GitHub integration
- `src/cli/index.ts` - Command implementations

## Testing

### Verify Installation
```bash
# Check if skill exists
ls -la .cursor/skills/skill-name/

# Verify SKILL.md format
head -20 .cursor/skills/skill-name/SKILL.md

# Test skill in Cursor
# (Open Cursor and use the skill)
```

### API Test
```bash
# Test search
curl "https://www.agentskills.in/api/skills?search=python&limit=5"

# Test specific skill lookup
curl "https://www.agentskills.in/api/skills?search=xlsx&author=anthropic&limit=1"
```

## Troubleshooting

### Cloudflare 403 Error
skillsmp.com has Cloudflare protection. Use agentskills.in API instead:
```
❌ https://skillsmp.com/  (blocked)
✅ https://www.agentskills.in/api/skills  (works)
```

### Rate Limiting
GitHub API has rate limits. Use authenticated requests:
```bash
git config --global credential.helper store
# Or use GITHUB_TOKEN env variable
```

### Missing Dependencies
Ensure git is installed:
```bash
which git || echo "Install git first: brew install git"
```

---

**End of Skill**

This skill enables seamless integration with the SkillsMP/agentskills.in marketplace, allowing users to discover and install any of 67,000+ AI agent skills with a single command.
