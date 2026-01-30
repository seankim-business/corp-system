export * from "./types";
export * from "./github-source";
export * from "./npm-source";
export * from "./mcp-registry-source";
export * from "./smithery-source";

import { SkillSource } from "./types";
import { GitHubSkillSource } from "./github-source";
import { NpmSkillSource } from "./npm-source";
import { MCPRegistrySource } from "./mcp-registry-source";
import { SmitherySource } from "./smithery-source";

export function createSourceRegistry(): Map<string, SkillSource> {
  const registry = new Map<string, SkillSource>();

  registry.set("github", new GitHubSkillSource());
  registry.set("npm", new NpmSkillSource());
  registry.set("mcp-registry", new MCPRegistrySource());
  registry.set("smithery", new SmitherySource());

  return registry;
}
