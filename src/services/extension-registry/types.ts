import { z } from 'zod';

// Branded type for extension IDs
export type ExtensionId = string & { readonly __brand: 'ExtensionId' };
export type SkillId = ExtensionId;

export const ExtensionTypeEnum = z.enum(['extension', 'skill', 'mcp_server']);
export type ExtensionType = z.infer<typeof ExtensionTypeEnum>;

export const RuntimeTypeEnum = z.enum(['mcp', 'code', 'prompt', 'composite']);
export type RuntimeType = z.infer<typeof RuntimeTypeEnum>;

export const SkillParameterSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string(),
  required: z.boolean().default(false),
  default: z.unknown().optional(),
});

export const SkillOutputSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string(),
});

export const ExtensionDefinitionSchema = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  extensionType: ExtensionTypeEnum,
  category: z.string(),
  tags: z.array(z.string()).default([]),
  source: z.enum(['yaml', 'marketplace', 'generated', 'github', 'npm']).optional(),
  format: z.enum(['skill-md', 'openai-action', 'langchain-tool', 'native']).optional(),
  runtimeType: RuntimeTypeEnum.optional(),
  runtimeConfig: z.record(z.unknown()).optional(),
  triggers: z.array(z.string()).default([]),
  parameters: z.array(SkillParameterSchema).default([]),
  outputs: z.array(SkillOutputSchema).default([]),
  dependencies: z.array(z.string()).default([]),
  toolsRequired: z.array(z.string()).default([]),
  mcpProviders: z.array(z.string()).default([]),
  isPublic: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

export type ExtensionDefinition = z.infer<typeof ExtensionDefinitionSchema>;
export type SkillParameter = z.infer<typeof SkillParameterSchema>;
export type SkillOutput = z.infer<typeof SkillOutputSchema>;

export interface Extension extends ExtensionDefinition {
  id: ExtensionId;
  organizationId: string | null;
  publisherId: string | null;
  verified: boolean;
  downloads: number;
  rating: number | null;
  ratingCount: number;
  status: string;
  megaAppConfig?: MegaAppModuleConfig;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResolvedSkill {
  skill: Extension;
  score: number;
  matchedTriggers: string[];
}

export interface ListOptions {
  type?: ExtensionType;
  category?: string;
  enabled?: boolean;
  limit?: number;
  offset?: number;
}

export interface SearchOptions extends ListOptions {
  includeGlobal?: boolean;
}

// MegaApp Module Configuration
export interface MegaAppModuleConfig {
  moduleId: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  requiredInputs?: string[];
  optionalInputs?: string[];
  executorType: 'ai-agent' | 'workflow' | 'mcp-tool' | 'hybrid';
  dashboardComponent?: string;
  settingsComponent?: string;
}
