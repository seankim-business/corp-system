/**
 * Extension Permission Types
 *
 * Defines the permission system for extensions.
 */

/**
 * All available permissions
 */
export type Permission =
  // Notion permissions
  | "read:notion"
  | "write:notion"

  // Google Drive permissions
  | "read:drive"
  | "write:drive"

  // GitHub permissions
  | "read:github"
  | "write:github"

  // Slack permissions
  | "read:slack"
  | "send:slack"

  // Calendar permissions
  | "read:calendar"
  | "write:calendar"

  // Email permissions
  | "read:email"
  | "send:email"

  // Organization permissions
  | "read:organization"
  | "manage:organization"

  // User permissions
  | "read:users"
  | "manage:users"

  // Workflow permissions
  | "execute:workflows"
  | "manage:workflows"

  // Storage permissions
  | "storage:read"
  | "storage:write"

  // Network permissions
  | "network:internal"
  | "network:external"

  // Secrets permissions
  | "secrets:read"
  | "secrets:write";

/**
 * Permission category
 */
export type PermissionCategory =
  | "integrations"
  | "organization"
  | "workflows"
  | "storage"
  | "network"
  | "secrets";

/**
 * Permission metadata
 */
export interface PermissionInfo {
  /**
   * Permission identifier
   */
  id: Permission;

  /**
   * Human-readable name
   */
  name: string;

  /**
   * Description of what the permission allows
   */
  description: string;

  /**
   * Permission category
   */
  category: PermissionCategory;

  /**
   * Risk level
   */
  riskLevel: "low" | "medium" | "high";

  /**
   * Whether this permission requires admin approval
   */
  requiresApproval: boolean;
}

/**
 * All permission definitions
 */
export const PERMISSIONS: Record<Permission, PermissionInfo> = {
  "read:notion": {
    id: "read:notion",
    name: "Read Notion",
    description: "Read data from Notion databases and pages",
    category: "integrations",
    riskLevel: "low",
    requiresApproval: false,
  },
  "write:notion": {
    id: "write:notion",
    name: "Write Notion",
    description: "Create, update, and delete Notion pages and databases",
    category: "integrations",
    riskLevel: "medium",
    requiresApproval: false,
  },
  "read:drive": {
    id: "read:drive",
    name: "Read Google Drive",
    description: "Read files from Google Drive",
    category: "integrations",
    riskLevel: "low",
    requiresApproval: false,
  },
  "write:drive": {
    id: "write:drive",
    name: "Write Google Drive",
    description: "Upload, update, and delete files in Google Drive",
    category: "integrations",
    riskLevel: "medium",
    requiresApproval: false,
  },
  "read:github": {
    id: "read:github",
    name: "Read GitHub",
    description: "Read repositories, issues, and pull requests from GitHub",
    category: "integrations",
    riskLevel: "low",
    requiresApproval: false,
  },
  "write:github": {
    id: "write:github",
    name: "Write GitHub",
    description: "Create issues, pull requests, and modify repositories",
    category: "integrations",
    riskLevel: "medium",
    requiresApproval: true,
  },
  "read:slack": {
    id: "read:slack",
    name: "Read Slack",
    description: "Read messages and channel information from Slack",
    category: "integrations",
    riskLevel: "low",
    requiresApproval: false,
  },
  "send:slack": {
    id: "send:slack",
    name: "Send Slack Messages",
    description: "Send messages to Slack channels and users",
    category: "integrations",
    riskLevel: "low",
    requiresApproval: false,
  },
  "read:calendar": {
    id: "read:calendar",
    name: "Read Calendar",
    description: "Read calendar events",
    category: "integrations",
    riskLevel: "low",
    requiresApproval: false,
  },
  "write:calendar": {
    id: "write:calendar",
    name: "Write Calendar",
    description: "Create, update, and delete calendar events",
    category: "integrations",
    riskLevel: "medium",
    requiresApproval: false,
  },
  "read:email": {
    id: "read:email",
    name: "Read Email",
    description: "Read email messages",
    category: "integrations",
    riskLevel: "medium",
    requiresApproval: true,
  },
  "send:email": {
    id: "send:email",
    name: "Send Email",
    description: "Send email messages on behalf of users",
    category: "integrations",
    riskLevel: "high",
    requiresApproval: true,
  },
  "read:organization": {
    id: "read:organization",
    name: "Read Organization",
    description: "Read organization settings and information",
    category: "organization",
    riskLevel: "low",
    requiresApproval: false,
  },
  "manage:organization": {
    id: "manage:organization",
    name: "Manage Organization",
    description: "Modify organization settings",
    category: "organization",
    riskLevel: "high",
    requiresApproval: true,
  },
  "read:users": {
    id: "read:users",
    name: "Read Users",
    description: "Read user information within the organization",
    category: "organization",
    riskLevel: "low",
    requiresApproval: false,
  },
  "manage:users": {
    id: "manage:users",
    name: "Manage Users",
    description: "Invite, remove, and modify user roles",
    category: "organization",
    riskLevel: "high",
    requiresApproval: true,
  },
  "execute:workflows": {
    id: "execute:workflows",
    name: "Execute Workflows",
    description: "Trigger and execute workflows",
    category: "workflows",
    riskLevel: "medium",
    requiresApproval: false,
  },
  "manage:workflows": {
    id: "manage:workflows",
    name: "Manage Workflows",
    description: "Create, update, and delete workflows",
    category: "workflows",
    riskLevel: "medium",
    requiresApproval: false,
  },
  "storage:read": {
    id: "storage:read",
    name: "Read Storage",
    description: "Read data from extension storage",
    category: "storage",
    riskLevel: "low",
    requiresApproval: false,
  },
  "storage:write": {
    id: "storage:write",
    name: "Write Storage",
    description: "Write data to extension storage",
    category: "storage",
    riskLevel: "low",
    requiresApproval: false,
  },
  "network:internal": {
    id: "network:internal",
    name: "Internal Network",
    description: "Make requests to internal Nubabel APIs",
    category: "network",
    riskLevel: "low",
    requiresApproval: false,
  },
  "network:external": {
    id: "network:external",
    name: "External Network",
    description: "Make requests to external APIs and services",
    category: "network",
    riskLevel: "medium",
    requiresApproval: false,
  },
  "secrets:read": {
    id: "secrets:read",
    name: "Read Secrets",
    description: "Read secrets from the extension's secret store",
    category: "secrets",
    riskLevel: "medium",
    requiresApproval: false,
  },
  "secrets:write": {
    id: "secrets:write",
    name: "Write Secrets",
    description: "Store secrets in the extension's secret store",
    category: "secrets",
    riskLevel: "medium",
    requiresApproval: false,
  },
};

/**
 * Check if a permission is granted
 */
export function hasPermission(
  grantedPermissions: Permission[],
  requiredPermission: Permission
): boolean {
  return grantedPermissions.includes(requiredPermission);
}

/**
 * Check if all permissions are granted
 */
export function hasAllPermissions(
  grantedPermissions: Permission[],
  requiredPermissions: Permission[]
): boolean {
  return requiredPermissions.every((p) => grantedPermissions.includes(p));
}

/**
 * Get permissions by category
 */
export function getPermissionsByCategory(
  category: PermissionCategory
): PermissionInfo[] {
  return Object.values(PERMISSIONS).filter((p) => p.category === category);
}

/**
 * Get high-risk permissions
 */
export function getHighRiskPermissions(
  permissions: Permission[]
): PermissionInfo[] {
  return permissions
    .map((p) => PERMISSIONS[p])
    .filter((p) => p.riskLevel === "high");
}
