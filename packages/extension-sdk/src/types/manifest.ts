/**
 * Extension Manifest Types
 *
 * Defines the structure of extension.yaml manifest files.
 */

import { Permission } from "./permissions";

/**
 * Extension manifest schema
 */
export interface ExtensionManifest {
  /**
   * Unique extension identifier
   */
  id: string;

  /**
   * Human-readable name
   */
  name: string;

  /**
   * Semantic version
   */
  version: string;

  /**
   * Extension description
   */
  description: string;

  /**
   * Extension category
   */
  category: ExtensionCategory;

  /**
   * Author information
   */
  author: AuthorInfo;

  /**
   * Repository URL
   */
  repository?: string;

  /**
   * Homepage URL
   */
  homepage?: string;

  /**
   * License identifier
   */
  license: string;

  /**
   * Extension icon (relative path or URL)
   */
  icon?: string;

  /**
   * Screenshots for marketplace
   */
  screenshots?: string[];

  /**
   * Required permissions
   */
  permissions: Permission[];

  /**
   * Extension components
   */
  components: ExtensionComponents;

  /**
   * Configuration schema
   */
  config?: ConfigSchema;

  /**
   * Secrets required by the extension
   */
  secrets?: SecretDefinition[];

  /**
   * Minimum platform version
   */
  platformVersion?: string;

  /**
   * Keywords for search
   */
  keywords?: string[];

  /**
   * Pricing information
   */
  pricing?: PricingInfo;

  /**
   * Support information
   */
  support?: SupportInfo;
}

export type ExtensionCategory =
  | "industry" // Industry-specific (healthcare, legal, etc.)
  | "integration" // Third-party integrations
  | "utility" // General utilities
  | "theme" // UI themes
  | "analytics" // Analytics and reporting
  | "automation" // Workflow automation
  | "ai" // AI/ML extensions
  | "security"; // Security tools

export interface AuthorInfo {
  name: string;
  email?: string;
  url?: string;
  organization?: string;
}

export interface ExtensionComponents {
  /**
   * Agent definitions
   */
  agents?: AgentComponent[];

  /**
   * Skill definitions
   */
  skills?: SkillComponent[];

  /**
   * MCP tool definitions
   */
  mcpTools?: MCPToolComponent[];

  /**
   * UI components
   */
  uiComponents?: UIComponent[];

  /**
   * Workflow definitions
   */
  workflows?: WorkflowComponent[];

  /**
   * Hook handlers
   */
  hooks?: HookComponent[];
}

export interface AgentComponent {
  /**
   * Agent ID (unique within extension)
   */
  id: string;

  /**
   * Agent display name
   */
  name: string;

  /**
   * Agent description
   */
  description: string;

  /**
   * Functional area
   */
  function: string;

  /**
   * Skills this agent can use
   */
  skills: string[];

  /**
   * MCP tools this agent can use
   */
  tools: string[];

  /**
   * Routing keywords
   */
  routingKeywords: string[];

  /**
   * Path to agent configuration file
   */
  configPath: string;
}

export interface SkillComponent {
  /**
   * Skill ID
   */
  id: string;

  /**
   * Skill name
   */
  name: string;

  /**
   * Description
   */
  description: string;

  /**
   * Skill category
   */
  category: string;

  /**
   * Trigger keywords
   */
  triggers: string[];

  /**
   * Path to skill definition
   */
  configPath: string;
}

export interface MCPToolComponent {
  /**
   * Tool ID
   */
  id: string;

  /**
   * Tool name
   */
  name: string;

  /**
   * Description
   */
  description: string;

  /**
   * Input schema (JSON Schema)
   */
  inputSchema: JSONSchema;

  /**
   * Output schema (JSON Schema)
   */
  outputSchema?: JSONSchema;

  /**
   * Path to tool implementation
   */
  handlerPath: string;

  /**
   * Handler export name
   */
  handlerExport?: string;
}

export interface UIComponent {
  /**
   * Component ID
   */
  id: string;

  /**
   * Component name
   */
  name: string;

  /**
   * Component type
   */
  type: UIComponentType;

  /**
   * Description
   */
  description?: string;

  /**
   * Path to component implementation
   */
  componentPath: string;

  /**
   * Component export name
   */
  componentExport?: string;

  /**
   * Where the component should be rendered
   */
  placement?: UIPlacement;
}

export type UIComponentType =
  | "dashboard-widget"
  | "settings-panel"
  | "sidebar-item"
  | "modal"
  | "page"
  | "toolbar-action";

export interface UIPlacement {
  location: string;
  order?: number;
  conditions?: Record<string, unknown>;
}

export interface WorkflowComponent {
  /**
   * Workflow ID
   */
  id: string;

  /**
   * Workflow name
   */
  name: string;

  /**
   * Description
   */
  description: string;

  /**
   * Trigger configuration
   */
  trigger: WorkflowTrigger;

  /**
   * Path to workflow definition
   */
  configPath: string;
}

export interface WorkflowTrigger {
  type: "manual" | "schedule" | "event" | "webhook";
  config: Record<string, unknown>;
}

export interface HookComponent {
  /**
   * Hook ID
   */
  id: string;

  /**
   * Hook name
   */
  name: string;

  /**
   * Events to hook into
   */
  events: string[];

  /**
   * Hook timing
   */
  timing: "pre" | "post";

  /**
   * Priority (lower = earlier)
   */
  priority?: number;

  /**
   * Path to hook handler
   */
  handlerPath: string;

  /**
   * Handler export name
   */
  handlerExport?: string;
}

export interface ConfigSchema {
  /**
   * JSON Schema for configuration
   */
  schema: JSONSchema;

  /**
   * Default values
   */
  defaults?: Record<string, unknown>;

  /**
   * UI hints for configuration form
   */
  ui?: ConfigUIHints;
}

export interface ConfigUIHints {
  order?: string[];
  groups?: Array<{
    name: string;
    fields: string[];
  }>;
  fieldHints?: Record<
    string,
    {
      label?: string;
      description?: string;
      placeholder?: string;
      inputType?: string;
    }
  >;
}

export interface SecretDefinition {
  /**
   * Secret key
   */
  key: string;

  /**
   * Description
   */
  description: string;

  /**
   * Whether required
   */
  required: boolean;
}

export interface PricingInfo {
  /**
   * Pricing model
   */
  model: "free" | "one-time" | "subscription" | "usage-based";

  /**
   * Price in cents (for one-time or subscription)
   */
  price?: number;

  /**
   * Billing period for subscriptions
   */
  period?: "monthly" | "yearly";

  /**
   * Free trial days
   */
  trialDays?: number;
}

export interface SupportInfo {
  /**
   * Support email
   */
  email?: string;

  /**
   * Documentation URL
   */
  docs?: string;

  /**
   * Issues URL
   */
  issues?: string;

  /**
   * Discord/Slack community URL
   */
  community?: string;
}

export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: unknown[];
  default?: unknown;
  description?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  additionalProperties?: boolean | JSONSchema;
  oneOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  allOf?: JSONSchema[];
  $ref?: string;
}
