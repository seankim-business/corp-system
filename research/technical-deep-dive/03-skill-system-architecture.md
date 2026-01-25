# Skill System - Architecture & Implementation Guide

> **작성일**: 2026-01-26  
> **목적**: OhMyOpenCode Skill System의 상세 분석 및 Custom Skill 개발 가이드

---

## 🎯 Skill System Overview

### What are Skills?

**Skills** = Domain expertise injection into AI agents

Think of skills as **plugins** that teach the agent how to perform specific tasks:

- **`mcp-integration`**: How to load and use MCP tools
- **`playwright`**: How to automate browsers
- **`git-master`**: How to perform Git operations
- **`frontend-ui-ux`**: How to design beautiful UI/UX

---

## 📚 Built-in Skills

### 1. `mcp-integration` (Most Important for Nubabel)

**Purpose**: Enable agents to discover and use MCP tools dynamically

**Location**: `.opencode/skills/mcp-integration/SKILL.md`

**Key Capabilities**:

```typescript
// Without skill:
Agent doesn't know Notion/Linear/Jira tools exist

// With skill:
Agent:
1. Queries available MCPs via context
2. Loads tools dynamically (notion__getTasks, etc.)
3. Calls tools with correct parameters
4. Handles errors (MCP server down, invalid auth, etc.)
```

**Skill Injection Pattern**:

```typescript
// Context passed to agent
const context = {
  availableMCPs: [
    { provider: "notion", name: "Workspace 1", enabled: true },
    { provider: "linear", name: "Engineering Team", enabled: true },
  ],
  organizationId: "org_123",
  userId: "user_456",
};

// Agent with mcp-integration skill knows to:
// 1. Read context.availableMCPs
// 2. Load tools from each provider
// 3. Execute user request using appropriate tools
```

**Error Handling** (Critical for Production):

```markdown
# In SKILL.md

## Error Handling

When MCP connection fails:

1. Check if provider is in availableMCPs
2. If missing → inform user to connect provider first
3. If present but fails → retry once, then graceful degradation
4. Never crash - always provide user-friendly error message

Example:

- ❌ "Error: ECONNREFUSED notion:3000"
- ✅ "Notion connection is not responding. Please check your Notion MCP settings or try again later."
```

---

### 2. `playwright` (Browser Automation)

**Purpose**: Screenshot, navigate, fill forms, scrape data

**Use Cases**:

- "Screenshot this Figma design"
- "Verify the deployed website looks correct"
- "Fill out this form automatically"

**Key Instructions** (from SKILL.md):

```markdown
# playwright skill

Use Playwright for browser automation tasks.

## Common Patterns

1. Screenshot a webpage:
   - Launch browser
   - Navigate to URL
   - Take screenshot
   - Save to file
   - Return file path

2. Fill form:
   - Navigate to page
   - Find input by label/placeholder
   - Type text
   - Click submit
   - Wait for navigation

## Error Handling

- Always use headless mode
- Set timeout to 30s
- Handle navigation failures gracefully
```

---

### 3. `git-master` (Git Operations)

**Purpose**: Commits, rebases, history search, blame

**Use Cases**:

- "Commit these changes with a proper message"
- "Who wrote this function?"
- "Find the commit that introduced this bug"

**Critical Rules** (from SKILL.md):

```markdown
# NEVER run git commands without user confirmation for:

- push --force
- reset --hard
- rebase (unless user explicitly requested)

# ALWAYS:

- Write atomic, semantic commit messages
- Follow conventional commits format (feat:, fix:, docs:, etc.)
- Run git status before committing

# Hook handling:

- If pre-commit hook fails → fix issues, create NEW commit
- NEVER use --no-verify unless user explicitly requests it
```

---

### 4. `frontend-ui-ux` (UI/UX Design)

**Purpose**: Design beautiful, accessible, responsive interfaces

**Use Cases**:

- "Design a dashboard component with dark mode"
- "Create a responsive navigation bar"
- "Improve the accessibility of this form"

**Design Principles** (from SKILL.md):

```markdown
# Design System First

1. Check if project has design system (Tailwind config, theme, etc.)
2. Use existing colors, typography, spacing
3. Only propose new tokens if necessary

# Accessibility

- WCAG 2.1 AA minimum
- Color contrast ratios
- Keyboard navigation
- Screen reader support

# Responsive by Default

- Mobile-first approach
- Breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)
- Test at all breakpoints
```

---

## 🔧 Custom Skill Development

### Creating `mcp-integration` Skill for Nubabel

**File**: `.opencode/skills/mcp-integration/SKILL.md`

```markdown
# MCP Integration Skill

> **Purpose**: Enable dynamic MCP tool loading and execution in multi-tenant environment

---

## Overview

This skill teaches agents how to:

1. Discover available MCP connections for an organization
2. Load tools from active MCP servers
3. Execute tools with proper error handling
4. Handle multi-tenant isolation

---

## Context Structure

You receive context with available MCPs:

\`\`\`typescript
{
availableMCPs: Array<{
provider: string; // 'notion', 'linear', 'jira', etc.
name: string; // User-friendly name
enabled: boolean; // Whether connection is active
}>,
organizationId: string, // Current organization
userId: string, // Current user
}
\`\`\`

---

## Tool Discovery

### Step 1: Check Available Providers

\`\`\`typescript
// Check if required provider is available
const notionAvailable = context.availableMCPs.find(
mcp => mcp.provider === 'notion' && mcp.enabled
);

if (!notionAvailable) {
return "Notion is not connected. Please add a Notion connection in Settings.";
}
\`\`\`

### Step 2: Load Tools

Available tools follow naming convention: \`{provider}\_\_{toolName}\`

**Notion Tools**:

- \`notion\_\_getTasks\` - Get tasks from Notion database
- \`notion\_\_createTask\` - Create new task
- \`notion\_\_updateTask\` - Update existing task
- \`notion\_\_deleteTask\` - Delete task

**Linear Tools** (coming soon):

- \`linear\_\_getIssues\`
- \`linear\_\_createIssue\`
- \`linear\_\_updateIssue\`

---

## Execution Patterns

### Pattern 1: Simple Task Creation

\`\`\`typescript
// User: "Create task in Notion: Implement auth"

// 1. Verify Notion is available
if (!context.availableMCPs.some(m => m.provider === 'notion')) {
return "Please connect Notion first";
}

// 2. Call tool
const result = await callTool('notion\_\_createTask', {
title: 'Implement auth',
properties: {
Status: 'Todo',
Priority: 'High',
},
});

// 3. Return user-friendly message
return `Created task: ${result.title} (${result.url})`;
\`\`\`

### Pattern 2: Cross-Tool Workflow

\`\`\`typescript
// User: "Get Notion tasks and create Linear issues for them"

// 1. Get Notion tasks
const tasks = await callTool('notion\_\_getTasks', {
filter: { Status: 'Todo' },
});

// 2. Create Linear issues
const issues = [];
for (const task of tasks) {
const issue = await callTool('linear\_\_createIssue', {
title: task.title,
description: task.description,
});
issues.push(issue);
}

// 3. Summary
return `Migrated ${issues.length} tasks from Notion to Linear`;
\`\`\`

---

## Error Handling

### Connection Errors

\`\`\`typescript
try {
const result = await callTool('notion\_\_getTasks', {});
} catch (error) {
if (error.code === 'ECONNREFUSED') {
return "Notion MCP server is not responding. Please check your connection settings.";
}

if (error.code === 'UNAUTHORIZED') {
return "Notion authentication failed. Please re-authorize your Notion connection.";
}

throw error; // Unknown error, let it bubble up
}
\`\`\`

### Invalid Arguments

\`\`\`typescript
try {
await callTool('notion\_\_createTask', { title: 'Test' });
} catch (error) {
if (error.message.includes('required field')) {
// Extract field name and inform user
return `Missing required field: ${error.field}. Please provide: ${error.requiredFields.join(', ')}`;
}
}
\`\`\`

### Provider Not Available

\`\`\`typescript
function ensureProviderAvailable(provider: string): boolean {
const available = context.availableMCPs.some(
mcp => mcp.provider === provider && mcp.enabled
);

if (!available) {
return `${provider} is not connected for this organization. Please go to Settings → Integrations to connect ${provider}.`;
}

return true;
}

// Usage
const check = ensureProviderAvailable('notion');
if (typeof check === 'string') return check; // Error message

// Continue with tool call...
\`\`\`

---

## Multi-Tenant Isolation

**CRITICAL**: Never expose data across organizations

\`\`\`typescript
// ❌ BAD: Hardcoded organization
await callTool('notion\_\_getTasks', {
organizationId: 'org_123', // NEVER DO THIS
});

// ✅ GOOD: Use context
await callTool('notion\_\_getTasks', {
organizationId: context.organizationId, // From context
});
\`\`\`

**Backend automatically enforces**:

- PostgreSQL Row-Level Security (RLS)
- MCP connection filtering by organizationId
- Tool calls scoped to organization's credentials

---

## Testing Checklist

Before using MCP tools, verify:

- [ ] Provider is in \`context.availableMCPs\`
- [ ] Provider is \`enabled: true\`
- [ ] Tool name follows \`provider\_\_toolName\` convention
- [ ] All required parameters provided
- [ ] Error handling for connection failures
- [ ] User-friendly error messages
- [ ] Multi-tenant isolation (use context.organizationId)

---

## Examples

### Example 1: Get Notion Tasks

\`\`\`typescript
// User: "Show me my Notion tasks"

// Check availability
if (!context.availableMCPs.some(m => m.provider === 'notion' && m.enabled)) {
return "Notion is not connected. Connect it in Settings → Integrations.";
}

// Get tasks
const tasks = await callTool('notion\_\_getTasks', {
filter: { assignee: context.userId },
});

// Format response
return `You have ${tasks.length} tasks:\n` +
tasks.map(t => `- ${t.title} (${t.status})`).join('\n');
\`\`\`

### Example 2: Create Task with Validation

\`\`\`typescript
// User: "Create task: Fix bug in auth"

// Validate
if (!context.availableMCPs.some(m => m.provider === 'notion')) {
return "Notion connection required. Add it in Settings.";
}

// Extract task details
const title = "Fix bug in auth";
const properties = {
Status: "Todo",
Priority: "High",
Assignee: context.userId,
};

// Create
try {
const task = await callTool('notion\_\_createTask', {
title,
properties,
});

return `✅ Created: "${task.title}" in Notion (${task.url})`;
} catch (error) {
if (error.code === 'UNAUTHORIZED') {
return "❌ Notion auth expired. Please re-authorize in Settings.";
}

return `❌ Failed to create task: ${error.message}`;
}
\`\`\`

---

## Advanced: Tool Result Caching

\`\`\`typescript
// For expensive operations (fetching large datasets)
const cacheKey = \`notion*tasks*\${context.organizationId}\_\${context.userId}\`;
const cached = await redis.get(cacheKey);

if (cached) {
return JSON.parse(cached);
}

const tasks = await callTool('notion\_\_getTasks', {});

await redis.setex(cacheKey, 300, JSON.stringify(tasks)); // 5 min cache

return tasks;
\`\`\`

---

**Skill Version**: 1.0.0  
**Last Updated**: 2026-01-26  
**Maintained By**: Nubabel Engineering
```

---

## 🎨 Skill Combination Strategies

### Common Combinations

| Task Type        | Category             | Skills                          | Example                                      |
| ---------------- | -------------------- | ------------------------------- | -------------------------------------------- |
| Task automation  | `quick`              | `mcp-integration`               | "Create task in Notion"                      |
| Testing          | `visual-engineering` | `playwright`, `mcp-integration` | "Screenshot Figma and verify implementation" |
| Implementation   | `visual-engineering` | `frontend-ui-ux`, `git-master`  | "Design component and commit"                |
| Documentation    | `writing`            | `git-master`                    | "Write README and commit"                    |
| Complex workflow | `unspecified-high`   | `mcp-integration`, `git-master` | "Sync Notion → Linear → Git commit"          |

---

## 📊 Skill Loading Performance

### Load Time Analysis

```typescript
interface SkillLoadMetrics {
  skill: string;
  loadTime: number; // ms
  injectionSize: number; // characters
  cacheable: boolean;
}

const SKILL_METRICS: SkillLoadMetrics[] = [
  {
    skill: "mcp-integration",
    loadTime: 50,
    injectionSize: 3500, // ~3.5KB of instructions
    cacheable: true,
  },
  {
    skill: "playwright",
    loadTime: 30,
    injectionSize: 2000,
    cacheable: true,
  },
  {
    skill: "git-master",
    loadTime: 40,
    injectionSize: 2500,
    cacheable: true,
  },
  {
    skill: "frontend-ui-ux",
    loadTime: 35,
    injectionSize: 2200,
    cacheable: true,
  },
];

// Total overhead for 2 skills: ~100ms + 5.5KB context
// Negligible compared to LLM latency (2-30s)
```

**Optimization**: Skills are cached in memory after first load

---

## 🔒 Security Considerations

### Skill Sandboxing

```typescript
// Skills should NEVER:
// 1. Access files outside project directory
// 2. Execute arbitrary shell commands
// 3. Expose credentials
// 4. Bypass multi-tenant isolation

// Example from mcp-integration skill:
// ❌ BAD
await db.mcpConnection.findMany(); // Fetches ALL orgs

// ✅ GOOD
await db.mcpConnection.findMany({
  where: { organizationId: context.organizationId }, // Scoped
});
```

---

## 📈 Skill Usage Analytics

### Tracking Skill Effectiveness

```typescript
interface SkillMetrics {
  skill: string;
  totalUses: number;
  avgTaskDuration: number;
  successRate: number;
  commonCombinations: Array<{
    skills: string[];
    count: number;
  }>;
}

async function trackSkillUsage(
  skills: string[],
  duration: number,
  success: boolean,
) {
  for (const skill of skills) {
    await db.skillMetrics.upsert({
      where: { skill },
      update: {
        totalUses: { increment: 1 },
        totalDuration: { increment: duration },
        successCount: success ? { increment: 1 } : {},
      },
      create: {
        skill,
        totalUses: 1,
        totalDuration: duration,
        successCount: success ? 1 : 0,
      },
    });
  }

  // Track combination
  if (skills.length > 1) {
    await db.skillCombinations.upsert({
      where: { skills: skills.sort().join("+") },
      update: { count: { increment: 1 } },
      create: { skills: skills.sort().join("+"), count: 1 },
    });
  }
}
```

---

**작성일**: 2026-01-26  
**버전**: 1.0.0  
**다음 단계**: MCP Registry implementation guide 작성
