/**
 * Constants replicated from Nubabel's ai-executor.ts
 * Source: /Users/sean/Documents/Kyndof/tools/nubabel/src/orchestrator/ai-executor.ts
 */

import { Category } from "./types";

/**
 * Model selection by category
 * Matches Nubabel's CATEGORY_MODEL_MAP exactly
 */
export const CATEGORY_MODEL_MAP: Record<Category, string> = {
  quick: "claude-3-5-haiku-20241022",
  writing: "claude-3-5-haiku-20241022",
  "unspecified-low": "claude-3-5-haiku-20241022",
  artistry: "claude-3-5-sonnet-20241022",
  "visual-engineering": "claude-3-5-sonnet-20241022",
  "unspecified-high": "claude-3-5-sonnet-20241022",
  ultrabrain: "claude-3-5-sonnet-20241022",
};

/**
 * Cost per 1,000 tokens (USD)
 * Source: Anthropic pricing as of 2024-01
 */
export const MODEL_COSTS_PER_1K: Record<string, { input: number; output: number }> = {
  "claude-3-5-haiku-20241022": { input: 0.001, output: 0.005 },
  "claude-3-5-sonnet-20241022": { input: 0.003, output: 0.015 },
  "claude-3-opus-20240229": { input: 0.015, output: 0.075 },
};

/**
 * Skill-specific system prompts
 * Matches Nubabel's SKILL_SYSTEM_PROMPTS exactly
 */
export const SKILL_SYSTEM_PROMPTS: Record<string, string> = {
  "mcp-integration": `You are an AI assistant specialized in integrating with external tools and services via MCP (Model Context Protocol).
You can help users interact with:
- Notion: Create, read, update, delete tasks and pages
- Linear: Manage issues and projects
- GitHub: Work with repositories, issues, and pull requests
- Other MCP-enabled services

When a user asks to interact with these tools, provide clear instructions and execute the requested operations.`,

  playwright: `You are an expert in browser automation using Playwright.
You can help users with:
- Writing Playwright test scripts
- Automating browser interactions
- Web scraping and data extraction
- Screenshot capture and visual testing
- Handling dynamic content and SPAs

Provide executable Playwright code when appropriate.`,

  "git-master": `You are a Git expert who helps with version control operations.
You can assist with:
- Commit strategies and atomic commits
- Branch management and merging
- Rebasing and history management
- Resolving merge conflicts
- Git workflow best practices

Provide clear git commands and explanations.`,

  "frontend-ui-ux": `You are a senior frontend developer with strong design sensibilities.
You specialize in:
- React, Vue, Angular component development
- CSS/Tailwind styling and responsive design
- Accessibility (a11y) best practices
- Animation and interaction design
- Component architecture and state management

Provide production-ready code with modern best practices.`,
};

/**
 * Valid categories (for validation)
 */
export const VALID_CATEGORIES: readonly Category[] = [
  "visual-engineering",
  "ultrabrain",
  "artistry",
  "quick",
  "writing",
  "unspecified-low",
  "unspecified-high",
] as const;

/**
 * Valid skills (for validation)
 */
export const VALID_SKILLS = [
  "playwright",
  "git-master",
  "frontend-ui-ux",
  "mcp-integration",
] as const;

/**
 * Request limits
 */
export const REQUEST_LIMITS = {
  MAX_PROMPT_LENGTH: 10_000,
  MAX_SKILLS: 4,
  MAX_CONTEXT_SIZE: 100_000, // 100KB JSON
} as const;

/**
 * Timeout configuration
 */
export const TIMEOUTS = {
  DEFAULT_REQUEST_TIMEOUT: 30_000, // 30 seconds (matches circuit breaker)
  MAX_REQUEST_TIMEOUT: 120_000, // 120 seconds (client-side limit)
} as const;
