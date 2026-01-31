/**
 * Agent Converter
 *
 * Bidirectional conversion between OMC (markdown) and Nubabel (YAML) agent formats
 * using the AgentIR as an intermediate representation.
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import {
  AgentIR,
  AgentSource,
  ModelTier,
  OMC_MODEL_TO_TIER,
  TIER_TO_OMC_MODEL,
  inferTierFromName,
  inferCostFromTier,
  normalizeAgentId,
  validateAgentIR,
} from "./agent-ir";
import { AgentConfig, AgentConfigSchema } from "../config/agent-loader";

/**
 * OMC Agent frontmatter structure
 */
interface OMCFrontmatter {
  name: string;
  description?: string;
  model?: string;
  disallowedTools?: string | string[];
}

/**
 * Parse YAML frontmatter from markdown content
 * Using gray-matter pattern without the dependency
 */
function parseFrontmatter(content: string): {
  data: Record<string, unknown>;
  content: string;
} {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { data: {}, content };
  }

  try {
    const data = yaml.load(match[1]) as Record<string, unknown>;
    return { data: data || {}, content: match[2] };
  } catch {
    return { data: {}, content };
  }
}

/**
 * Generate YAML frontmatter string
 */
function generateFrontmatter(data: Record<string, unknown>): string {
  const yamlContent = yaml.dump(data, { lineWidth: -1 }).trim();
  return `---\n${yamlContent}\n---\n`;
}

/**
 * Extract denied tools from OMC frontmatter
 */
function extractDeniedTools(frontmatter: OMCFrontmatter): string[] {
  if (!frontmatter.disallowedTools) return [];
  if (Array.isArray(frontmatter.disallowedTools)) {
    return frontmatter.disallowedTools;
  }
  // Handle comma-separated string
  return frontmatter.disallowedTools.split(",").map((t) => t.trim());
}

/**
 * Infer category from OMC agent name
 */
function inferCategoryFromOMCName(name: string): string {
  const baseName = name.replace(/-(?:low|medium|high)$/, "");

  const categoryMap: Record<string, string> = {
    executor: "execution",
    architect: "analysis",
    explore: "search",
    researcher: "research",
    designer: "frontend",
    writer: "documentation",
    vision: "visual",
    planner: "planning",
    critic: "review",
    analyst: "analysis",
    "qa-tester": "testing",
    "security-reviewer": "security",
    "build-fixer": "build",
    "tdd-guide": "testing",
    "code-reviewer": "review",
    scientist: "data-science",
  };

  return categoryMap[baseName] || "general";
}

/**
 * Convert OMC agent markdown file to AgentIR
 */
export function omcToIR(markdownPath: string): AgentIR {
  const content = fs.readFileSync(markdownPath, "utf-8");
  const { data, content: body } = parseFrontmatter(content);
  const frontmatter = data as unknown as OMCFrontmatter;

  // Extract name, defaulting to filename without extension
  const filename = path.basename(markdownPath, ".md");
  const name = frontmatter.name || filename;

  // Determine tier from model field or name suffix
  let tier: ModelTier = "medium";
  if (frontmatter.model && OMC_MODEL_TO_TIER[frontmatter.model]) {
    tier = OMC_MODEL_TO_TIER[frontmatter.model];
  } else {
    tier = inferTierFromName(name);
  }

  // Extract denied tools
  const deniedTools = extractDeniedTools(frontmatter);

  // Generate ID from name (lowercase, hyphens)
  const id = normalizeAgentId(name.toLowerCase().replace(/\s+/g, "-"), "omc");

  const ir: AgentIR = {
    id,
    name,
    description: frontmatter.description || "",
    source: "omc",
    model: {
      tier,
      originalModel: frontmatter.model,
    },
    systemPrompt: body.trim(),
    tools: {
      allowed: [], // OMC agents typically have access to all tools except denied
      denied: deniedTools.length > 0 ? deniedTools : undefined,
    },
    metadata: {
      category: inferCategoryFromOMCName(name),
      keywords: extractKeywordsFromContent(body),
      estimatedCost: inferCostFromTier(tier),
      sourcePath: markdownPath,
    },
  };

  return ir;
}

/**
 * Extract keywords from markdown content for routing
 */
function extractKeywordsFromContent(content: string): string[] {
  const keywords: string[] = [];

  // Look for role/mission indicators
  if (content.includes("executor") || content.includes("execute")) {
    keywords.push("execute", "implement", "code");
  }
  if (content.includes("architect") || content.includes("analysis")) {
    keywords.push("analyze", "debug", "architecture");
  }
  if (content.includes("search") || content.includes("find")) {
    keywords.push("search", "find", "explore");
  }
  if (content.includes("design") || content.includes("UI")) {
    keywords.push("design", "ui", "frontend", "styling");
  }
  if (content.includes("test") || content.includes("QA")) {
    keywords.push("test", "qa", "verify");
  }
  if (content.includes("security")) {
    keywords.push("security", "vulnerability", "audit");
  }
  if (content.includes("documentation") || content.includes("writing")) {
    keywords.push("documentation", "docs", "write");
  }

  return [...new Set(keywords)];
}

/**
 * Convert Nubabel YAML config to AgentIR
 */
export function nubabelToIR(config: AgentConfig): AgentIR {
  // Infer tier from skills/tools or default to medium
  const tier = inferTierFromNubabelConfig(config);

  const ir: AgentIR = {
    id: normalizeAgentId(config.id, "nubabel"),
    name: config.name,
    description: config.description,
    source: "nubabel",
    model: {
      tier,
    },
    systemPrompt: generateNubabelSystemPrompt(config),
    tools: {
      allowed: config.tools,
    },
    permissions: {
      read: config.permissions.read,
      write: config.permissions.write,
    },
    metadata: {
      category: inferCategoryFromNubabelConfig(config),
      keywords: config.routing_keywords,
      estimatedCost: inferCostFromTier(tier),
      emoji: config.emoji,
      enabled: config.enabled,
      fallback: config.fallback,
      skills: config.skills,
      sops: config.sops,
      function: config.function,
    },
  };

  return ir;
}

/**
 * Infer tier from Nubabel config characteristics
 */
function inferTierFromNubabelConfig(config: AgentConfig): ModelTier {
  // Complex agents with many tools/skills -> high tier
  const complexityScore =
    config.tools.length + config.skills.length + (config.sops?.length || 0);

  if (complexityScore > 8) return "high";
  if (complexityScore > 4) return "medium";
  return "low";
}

/**
 * Infer category from Nubabel config
 */
function inferCategoryFromNubabelConfig(config: AgentConfig): string {
  // Map from id patterns to categories
  if (config.id.includes("dev")) return "development";
  if (config.id.includes("data")) return "data-analysis";
  if (config.id.includes("hr")) return "human-resources";
  if (config.id.includes("finance")) return "finance";
  if (config.id.includes("cs")) return "customer-support";
  if (config.id.includes("product")) return "product";
  if (config.id.includes("brand")) return "marketing";
  if (config.id.includes("ops")) return "operations";
  if (config.id.includes("general")) return "general";
  if (config.id.includes("meta")) return "orchestration";

  return "general";
}

/**
 * Generate a system prompt from Nubabel config
 */
function generateNubabelSystemPrompt(config: AgentConfig): string {
  const lines: string[] = [];

  lines.push(`# ${config.name}`);
  lines.push("");
  lines.push(`**Function**: ${config.function}`);
  lines.push("");
  lines.push(`**Description**: ${config.description}`);
  lines.push("");
  lines.push("## Skills");
  config.skills.forEach((skill) => lines.push(`- ${skill}`));
  lines.push("");
  lines.push("## Available Tools");
  config.tools.forEach((tool) => lines.push(`- ${tool}`));
  lines.push("");
  lines.push("## Permissions");
  lines.push("### Read Access");
  config.permissions.read.forEach((perm) => lines.push(`- ${perm}`));
  lines.push("### Write Access");
  config.permissions.write.forEach((perm) => lines.push(`- ${perm}`));

  if (config.sops && config.sops.length > 0) {
    lines.push("");
    lines.push("## Standard Operating Procedures");
    config.sops.forEach((sop) => lines.push(`- ${sop}`));
  }

  return lines.join("\n");
}

/**
 * Convert AgentIR to OMC markdown format
 */
export function irToOmc(ir: AgentIR): string {
  const errors = validateAgentIR(ir);
  if (errors.length > 0) {
    throw new Error(`Invalid AgentIR: ${errors.join(", ")}`);
  }

  // Build frontmatter
  const frontmatter: OMCFrontmatter = {
    name: ir.name,
    description: ir.description || undefined,
    model: ir.model.originalModel || TIER_TO_OMC_MODEL[ir.model.tier],
  };

  // Add disallowed tools if present
  if (ir.tools.denied && ir.tools.denied.length > 0) {
    frontmatter.disallowedTools = ir.tools.denied.join(", ");
  }

  // Clean undefined values
  Object.keys(frontmatter).forEach((key) => {
    if (frontmatter[key as keyof OMCFrontmatter] === undefined) {
      delete frontmatter[key as keyof OMCFrontmatter];
    }
  });

  // Generate markdown
  const frontmatterStr = generateFrontmatter(
    frontmatter as unknown as Record<string, unknown>
  );
  const body = ir.systemPrompt || generateOMCSystemPrompt(ir);

  return frontmatterStr + "\n" + body;
}

/**
 * Generate a system prompt for OMC format from IR
 */
function generateOMCSystemPrompt(ir: AgentIR): string {
  const lines: string[] = [];

  lines.push(`<Role>`);
  lines.push(ir.name);
  if (ir.description) {
    lines.push(ir.description);
  }
  lines.push(`</Role>`);
  lines.push("");

  if (ir.metadata.category) {
    lines.push(`<Category>${ir.metadata.category}</Category>`);
    lines.push("");
  }

  if (ir.tools.allowed.length > 0) {
    lines.push(`<Tools>`);
    ir.tools.allowed.forEach((tool) => lines.push(`- ${tool}`));
    lines.push(`</Tools>`);
    lines.push("");
  }

  if (ir.permissions) {
    lines.push(`<Permissions>`);
    lines.push(`Read: ${ir.permissions.read.join(", ")}`);
    lines.push(`Write: ${ir.permissions.write.join(", ")}`);
    lines.push(`</Permissions>`);
    lines.push("");
  }

  if (ir.metadata.keywords && ir.metadata.keywords.length > 0) {
    lines.push(`<Keywords>${ir.metadata.keywords.join(", ")}</Keywords>`);
  }

  return lines.join("\n");
}

/**
 * Convert AgentIR to Nubabel YAML config
 */
export function irToNubabel(ir: AgentIR): AgentConfig {
  const errors = validateAgentIR(ir);
  if (errors.length > 0) {
    throw new Error(`Invalid AgentIR: ${errors.join(", ")}`);
  }

  const config: AgentConfig = {
    id: ir.id,
    name: ir.name,
    function: ir.metadata.function || ir.description || ir.name,
    description: ir.description || ir.name,
    emoji: ir.metadata.emoji || inferEmojiFromCategory(ir.metadata.category),
    skills: ir.metadata.skills || inferSkillsFromIR(ir),
    tools: ir.tools.allowed.length > 0 ? ir.tools.allowed : ["slack"],
    routing_keywords:
      ir.metadata.keywords || inferKeywordsFromCategory(ir.metadata.category),
    permissions: ir.permissions || {
      read: ["*"],
      write: [],
    },
    sops: ir.metadata.sops,
    enabled: ir.metadata.enabled ?? true,
    fallback: ir.metadata.fallback ?? false,
  };

  // Validate against schema
  return AgentConfigSchema.parse(config);
}

/**
 * Infer emoji from category
 */
function inferEmojiFromCategory(category?: string): string {
  const emojiMap: Record<string, string> = {
    execution: "⚡",
    analysis: "🔍",
    search: "🔎",
    research: "📚",
    frontend: "🎨",
    documentation: "📝",
    visual: "👁️",
    planning: "📋",
    review: "✅",
    testing: "🧪",
    security: "🔒",
    build: "🔧",
    "data-science": "📊",
    development: "💻",
    "data-analysis": "📊",
    "human-resources": "👥",
    finance: "💰",
    "customer-support": "🎧",
    product: "📦",
    marketing: "📣",
    operations: "⚙️",
    orchestration: "🎭",
    general: "🤖",
  };

  return emojiMap[category || "general"] || "🤖";
}

/**
 * Infer skills from AgentIR
 */
function inferSkillsFromIR(ir: AgentIR): string[] {
  const skills: string[] = [];

  const category = ir.metadata.category || "";

  if (category.includes("execution") || category.includes("development")) {
    skills.push("code-execution", "implementation");
  }
  if (category.includes("analysis")) {
    skills.push("code-analysis", "debugging");
  }
  if (category.includes("search")) {
    skills.push("codebase-search", "pattern-matching");
  }
  if (category.includes("testing")) {
    skills.push("testing", "quality-assurance");
  }
  if (category.includes("security")) {
    skills.push("security-review", "vulnerability-detection");
  }
  if (category.includes("documentation")) {
    skills.push("technical-writing", "documentation");
  }
  if (category.includes("design") || category.includes("frontend")) {
    skills.push("ui-design", "frontend-development");
  }

  return skills.length > 0 ? skills : ["general-assistance"];
}

/**
 * Infer keywords from category
 */
function inferKeywordsFromCategory(category?: string): string[] {
  const keywordMap: Record<string, string[]> = {
    execution: ["execute", "implement", "code", "build"],
    analysis: ["analyze", "debug", "investigate", "review"],
    search: ["search", "find", "locate", "explore"],
    research: ["research", "study", "investigate", "learn"],
    frontend: ["ui", "ux", "design", "frontend", "styling"],
    documentation: ["docs", "documentation", "write", "readme"],
    testing: ["test", "qa", "verify", "validate"],
    security: ["security", "vulnerability", "audit", "scan"],
    "data-science": ["data", "analysis", "statistics", "ml"],
    development: ["dev", "code", "programming", "software"],
    general: ["help", "assist", "general"],
  };

  return keywordMap[category || "general"] || keywordMap["general"];
}

/**
 * Load and convert an OMC agent from file path
 */
export function loadOMCAgent(filePath: string): AgentIR {
  if (!fs.existsSync(filePath)) {
    throw new Error(`OMC agent file not found: ${filePath}`);
  }
  return omcToIR(filePath);
}

/**
 * Load and convert a Nubabel agent from file path
 */
export function loadNubabelAgent(filePath: string): AgentIR {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Nubabel agent file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const config = yaml.load(content) as AgentConfig;
  const validatedConfig = AgentConfigSchema.parse(config);

  return nubabelToIR(validatedConfig);
}

/**
 * Save AgentIR as OMC markdown file
 */
export function saveAsOMC(ir: AgentIR, outputPath: string): void {
  const markdown = irToOmc(ir);
  fs.writeFileSync(outputPath, markdown, "utf-8");
}

/**
 * Save AgentIR as Nubabel YAML file
 */
export function saveAsNubabel(ir: AgentIR, outputPath: string): void {
  const config = irToNubabel(ir);
  const yamlContent = yaml.dump(config, { lineWidth: 120, noRefs: true });
  fs.writeFileSync(outputPath, yamlContent, "utf-8");
}

/**
 * Convert between formats
 */
export function convertAgent(
  sourcePath: string,
  targetFormat: AgentSource,
  outputPath?: string
): AgentIR {
  // Detect source format
  const ext = path.extname(sourcePath).toLowerCase();
  let ir: AgentIR;

  if (ext === ".md") {
    ir = loadOMCAgent(sourcePath);
  } else if (ext === ".yaml" || ext === ".yml") {
    ir = loadNubabelAgent(sourcePath);
  } else {
    throw new Error(`Unknown file format: ${ext}`);
  }

  // If output path provided, save in target format
  if (outputPath) {
    if (targetFormat === "omc") {
      saveAsOMC(ir, outputPath);
    } else {
      saveAsNubabel(ir, outputPath);
    }
  }

  return ir;
}
