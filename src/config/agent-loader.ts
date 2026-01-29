import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { z } from "zod";

// Define Zod Schema for Agent Configuration
const AgentPermissionsSchema = z.object({
  read: z.array(z.string()),
  write: z.array(z.string()),
});

export const AgentConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  function: z.string(),
  description: z.string(),
  skills: z.array(z.string()),
  tools: z.array(z.string()),
  routing_keywords: z.array(z.string()),
  permissions: AgentPermissionsSchema,
  sops: z.array(z.string()).optional(),
  fallback: z.boolean().optional().default(false),
  emoji: z.string().optional().default("🤖"),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// Directory where agent YAML files are stored
// Assuming this code runs from src/config, we go up two levels to root, then to config/agents
const AGENTS_DIR = path.resolve(__dirname, "../../config/agents");

/**
 * Loads all agent configurations from the YAML files.
 * Validates each file against the schema.
 */
export function loadAgents(): AgentConfig[] {
  if (!fs.existsSync(AGENTS_DIR)) {
    console.warn(`Agents directory not found: ${AGENTS_DIR}`);
    return [];
  }

  const files = fs
    .readdirSync(AGENTS_DIR)
    .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"));
  const agents: AgentConfig[] = [];

  for (const file of files) {
    const filePath = path.join(AGENTS_DIR, file);
    try {
      const fileContent = fs.readFileSync(filePath, "utf8");
      const parsed = yaml.load(fileContent);
      const agent = AgentConfigSchema.parse(parsed);
      agents.push(agent);
    } catch (error) {
      console.error(`Failed to load agent config from ${file}:`, error);
      // We might want to throw here if strict startup validation is required,
      // but logging error allows other valid agents to load.
      // For now, let's rethrow to fail fast during development/testing
      throw new Error(`Invalid agent configuration in ${file}: ${(error as Error).message}`);
    }
  }

  return agents;
}

/**
 * Map of agent ID to AgentConfig for easy lookup
 */
let agentMapCache: Record<string, AgentConfig> | null = null;

export function getAgentsMap(): Record<string, AgentConfig> {
  if (agentMapCache) return agentMapCache;

  const agents = loadAgents();
  agentMapCache = agents.reduce(
    (acc, agent) => {
      acc[agent.id] = agent;
      return acc;
    },
    {} as Record<string, AgentConfig>,
  );

  return agentMapCache;
}

export function getAgentById(id: string): AgentConfig | undefined {
  return getAgentsMap()[id];
}
