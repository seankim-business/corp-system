# Complete User Workflows

## Workflow 1: Search and Install

**User Request:** "Find skills for working with Excel files and install the best one"

**Agent Steps:**

1. **Search for skills**
```bash
GET https://www.agentskills.in/api/skills?search=excel&sortBy=stars&limit=10
```

2. **Display results**
```
Found 234 skills matching "excel":

  xlsx ⭐1,234 @anthropic
    Work with Excel files - read, write, and manipulate .xlsx...
    
  excel-parser ⭐892 @openai
    Parse and analyze Excel spreadsheets with AI assistance...
    
  excel-formulas ⭐567 @microsoft
    Expert help with Excel formulas and functions...
```

3. **User selects "xlsx"**

4. **Fetch skill details**
```bash
GET https://www.agentskills.in/api/skills?search=xlsx&author=anthropic&limit=1
```

5. **Auto-detect platforms**
```typescript
const platforms = detectPlatforms();
// Returns: ['cursor', 'opencode'] (if those directories exist)
```

6. **Download from GitHub**
```bash
git clone --depth 1 --branch main \
  https://github.com/anthropics/skills.git /tmp/skill-123
```

7. **Install to platforms**
```bash
cp -r /tmp/skill-123/skills/xlsx .cursor/skills/xlsx/
cp -r /tmp/skill-123/skills/xlsx .opencode/skill/xlsx/
```

8. **Report completion**
```
✓ Installed xlsx to cursor, opencode
  - .cursor/skills/xlsx/SKILL.md
  - .opencode/skill/xlsx/SKILL.md
```

---

## Workflow 2: Install Specific Skill

**User Request:** "Install @anthropic/pdf skill to Claude Code globally"

**Agent Steps:**

1. **Parse request**
```typescript
{
  author: 'anthropic',
  name: 'pdf',
  platforms: ['claude'],
  global: true
}
```

2. **Search skill**
```bash
GET https://www.agentskills.in/api/skills?search=pdf&author=anthropic&limit=1
```

3. **Download skill**
```bash
git clone --depth 1 https://github.com/anthropics/skills.git /tmp/skill-456
```

4. **Install globally**
```bash
mkdir -p ~/.claude/skills/pdf
cp -r /tmp/skill-456/skills/pdf/* ~/.claude/skills/pdf/
```

5. **Report**
```
✓ Installed @anthropic/pdf globally
  Location: ~/.claude/skills/pdf/
  
  To use: Open Claude Code and the skill will be available
```

---

## Workflow 3: Browse Top Skills

**User Request:** "Show me the top 20 skills by stars"

**Agent Steps:**

1. **Fetch top skills**
```bash
GET https://www.agentskills.in/api/skills?sortBy=stars&limit=20
```

2. **Display formatted**
```
🌟 Top 20 Skills on SkillsMP:

 1. python-expert ⭐2,456 @anthropic
    Expert Python coding with best practices and optimization
    
 2. react-master ⭐2,123 @facebook
    Master React development with hooks, context, and patterns
    
 3. web-scraper ⭐1,987 @openai
    Intelligent web scraping with BeautifulSoup and Selenium
    
 4. sql-wizard ⭐1,834 @microsoft
    Expert SQL query writing and database optimization
    
 5. api-builder ⭐1,672 @vercel
    Build REST and GraphQL APIs with best practices
    
...

Showing 20 of 67,234 total skills
Use "install" command to download any skill
```

---

## Workflow 4: Batch Install

**User Request:** "Install these skills: xlsx, pdf, python-expert to Cursor and OpenCode"

**Agent Steps:**

1. **Parse skill list**
```typescript
const skills = ['xlsx', 'pdf', 'python-expert'];
const platforms = ['cursor', 'opencode'];
```

2. **Search all skills (parallel)**
```typescript
const results = await Promise.all(
  skills.map(name => 
    fetch(`https://www.agentskills.in/api/skills?search=${name}&limit=1`)
  )
);
```

3. **Download all (parallel)**
```typescript
await Promise.all(
  results.map(skill => downloadSkill(skill, platforms))
);
```

4. **Report**
```
📦 Installing 3 skills...

  ✓ xlsx → cursor, opencode
  ✓ pdf → cursor, opencode
  ✓ python-expert → cursor, opencode

✨ Successfully installed 3 skills to 2 platforms (6 total installations)
```

---

## Workflow 5: Search by Author

**User Request:** "Show me all skills by Anthropic"

**Agent Steps:**

1. **Fetch by author**
```bash
GET https://www.agentskills.in/api/skills?author=anthropic&sortBy=stars&limit=50
```

2. **Display**
```
📦 Skills by @anthropic (42 total):

  python-expert ⭐2,456
    Expert Python coding assistance
    
  typescript-pro ⭐1,892
    TypeScript development with advanced patterns
    
  pdf ⭐1,234
    Work with PDF files
    
  xlsx ⭐1,234
    Excel file manipulation
    
  web-scraper ⭐987
    Intelligent web scraping
    
... (showing 50 of 42)

Install any skill with: "install @anthropic/skill-name"
```

---

## Workflow 6: Error Handling

**User Request:** "Install nonexistent-skill-12345"

**Agent Steps:**

1. **Search**
```bash
GET https://www.agentskills.in/api/skills?search=nonexistent-skill-12345
```

2. **Handle not found**
```
❌ No skills found matching "nonexistent-skill-12345"

Suggestions:
  - Check spelling
  - Try broader search terms
  - Browse marketplace: https://agentskills.in/
  - Search by category: "search python" or "search web scraping"
```

---

## Workflow 7: Platform Detection

**User Request:** "Install xlsx skill"

**Agent Steps:**

1. **Auto-detect platforms**
```typescript
const cwd = process.cwd();
const platforms = [];

if (fs.existsSync(`${cwd}/.cursor`)) platforms.push('cursor');
if (fs.existsSync(`${cwd}/.claude`)) platforms.push('claude');
if (fs.existsSync(`${cwd}/.opencode`)) platforms.push('opencode');
// ...
```

2. **If none detected, ask user**
```
No AI agent platforms detected in current directory.

Which platforms should I install to?
  [x] Cursor
  [x] Claude Code
  [x] OpenCode
  [ ] GitHub Copilot
  [ ] Antigravity
```

3. **User selects → Install**

---

## Workflow 8: Update Check (Future)

**User Request:** "Check if my installed skills have updates"

**Agent Steps:**

1. **List installed skills**
```bash
ls -d .cursor/skills/*/ | xargs -n1 basename
# xlsx
# pdf
# python-expert
```

2. **Check each on API**
```bash
GET https://www.agentskills.in/api/skills?search=xlsx&limit=1
# Compare version or last_updated timestamp
```

3. **Report**
```
📦 Checking for updates...

  ✓ xlsx - Up to date (v1.2.3)
  ⚠️  pdf - Update available (v1.0.0 → v1.1.0)
  ✓ python-expert - Up to date

Update command: "update pdf"
```

---

These workflows cover all common use cases for the SkillsMP Downloader skill.
