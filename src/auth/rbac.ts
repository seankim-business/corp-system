/**
 * RBAC (Role-Based Access Control) System
 *
 * Defines roles, permissions, and the permission matrix for the Nubabel platform.
 *
 * ROLE HIERARCHY:
 * - owner: Full access to all permissions including org deletion and billing
 * - admin: All permissions except org deletion and billing management
 * - member: CRUD on own resources, execute workflows
 * - viewer: Read-only access
 *
 * AGENT PERMISSIONS:
 * - Agents have resource-based permissions (read/write patterns)
 * - Agents have tool-level permissions (allowed MCP tools)
 * - Some operations require approval based on conditions
 *
 * DELEGATION:
 * - Users can delegate their permissions to other users
 * - Delegations are time-limited and scope-restricted
 * - Delegations are tracked in audit logs
 */

// =============================================================================
// ROLES
// =============================================================================

export enum Role {
  OWNER = "owner",
  ADMIN = "admin",
  MEMBER = "member",
  VIEWER = "viewer",
}

/** Array of all valid roles for validation */
export const ROLES = Object.values(Role) as string[];

/** Role hierarchy (higher index = higher privilege) */
export const ROLE_HIERARCHY: Record<Role, number> = {
  [Role.VIEWER]: 0,
  [Role.MEMBER]: 1,
  [Role.ADMIN]: 2,
  [Role.OWNER]: 3,
};

// =============================================================================
// PERMISSIONS
// =============================================================================

export enum Permission {
  // Workflow permissions
  WORKFLOW_CREATE = "workflow:create",
  WORKFLOW_READ = "workflow:read",
  WORKFLOW_UPDATE = "workflow:update",
  WORKFLOW_DELETE = "workflow:delete",
  WORKFLOW_EXECUTE = "workflow:execute",

  // Execution permissions
  EXECUTION_READ = "execution:read",

  // Member management permissions
  MEMBER_INVITE = "member:invite",
  MEMBER_REMOVE = "member:remove",
  MEMBER_UPDATE_ROLE = "member:update-role",
  MEMBER_READ = "member:read",

  // Settings permissions
  SETTINGS_READ = "settings:read",
  SETTINGS_UPDATE = "settings:update",

  // Integration permissions
  INTEGRATION_MANAGE = "integration:manage",
  INTEGRATION_READ = "integration:read",

  // Audit permissions
  AUDIT_READ = "audit:read",

  // AR (Agent Resource) Management permissions
  AR_READ = "ar:read",
  AR_WRITE = "ar:write",

  // Billing permissions (owner only)
  BILLING_READ = "billing:read",
  BILLING_MANAGE = "billing:manage",

  // Organization permissions (owner only)
  ORG_DELETE = "org:delete",

  // Approval permissions
  APPROVAL_CREATE = "approval:create",
  APPROVAL_READ = "approval:read",
  APPROVAL_RESPOND = "approval:respond",

  // Dashboard permissions
  DASHBOARD_READ = "dashboard:read",

  // Legacy permission mappings (for backwards compatibility)
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  WORKFLOWS_READ = "workflow:read",
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  WORKFLOWS_WRITE = "workflow:create",
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  WORKFLOWS_DELETE = "workflow:delete",
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  WORKFLOWS_EXECUTE = "workflow:execute",
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  INTEGRATIONS_READ = "integration:read",
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  INTEGRATIONS_WRITE = "integration:manage",
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  INTEGRATIONS_DELETE = "integration:manage",
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  MEMBERS_READ = "member:read",
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  MEMBERS_WRITE = "member:invite",
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  MEMBERS_DELETE = "member:remove",
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  SETTINGS_WRITE = "settings:update",
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  BILLING_WRITE = "billing:manage",
}

/** Array of all valid permissions for validation */
export const PERMISSIONS = Object.values(Permission).filter(
  (v, i, arr) => arr.indexOf(v) === i,
) as string[];

// =============================================================================
// ROLE-PERMISSION MATRIX
// =============================================================================

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.OWNER]: [
    // Full workflow access
    Permission.WORKFLOW_CREATE,
    Permission.WORKFLOW_READ,
    Permission.WORKFLOW_UPDATE,
    Permission.WORKFLOW_DELETE,
    Permission.WORKFLOW_EXECUTE,
    // Execution access
    Permission.EXECUTION_READ,
    // Full member management
    Permission.MEMBER_INVITE,
    Permission.MEMBER_REMOVE,
    Permission.MEMBER_UPDATE_ROLE,
    Permission.MEMBER_READ,
    // Full settings access
    Permission.SETTINGS_READ,
    Permission.SETTINGS_UPDATE,
    // Full integration management
    Permission.INTEGRATION_MANAGE,
    Permission.INTEGRATION_READ,
    // Audit access
    Permission.AUDIT_READ,
    // Billing (owner only)
    Permission.BILLING_READ,
    Permission.BILLING_MANAGE,
    // Org deletion (owner only)
    Permission.ORG_DELETE,
    // Approval permissions
    Permission.APPROVAL_CREATE,
    Permission.APPROVAL_READ,
    Permission.APPROVAL_RESPOND,
    // Dashboard access
    Permission.DASHBOARD_READ,
    // AR permissions
    Permission.AR_READ,
    Permission.AR_WRITE,
  ],

  [Role.ADMIN]: [
    // Full workflow access
    Permission.WORKFLOW_CREATE,
    Permission.WORKFLOW_READ,
    Permission.WORKFLOW_UPDATE,
    Permission.WORKFLOW_DELETE,
    Permission.WORKFLOW_EXECUTE,
    // Execution access
    Permission.EXECUTION_READ,
    // Member management (cannot update roles to owner)
    Permission.MEMBER_INVITE,
    Permission.MEMBER_REMOVE,
    Permission.MEMBER_UPDATE_ROLE,
    Permission.MEMBER_READ,
    // Settings access
    Permission.SETTINGS_READ,
    Permission.SETTINGS_UPDATE,
    // Full integration management
    Permission.INTEGRATION_MANAGE,
    Permission.INTEGRATION_READ,
    // Audit access
    Permission.AUDIT_READ,
    // Approval permissions
    Permission.APPROVAL_CREATE,
    Permission.APPROVAL_READ,
    Permission.APPROVAL_RESPOND,
    Permission.DASHBOARD_READ,
    // AR permissions
    Permission.AR_READ,
    Permission.AR_WRITE,
    // NO billing access
    // NO org deletion
  ],

  [Role.MEMBER]: [
    // Can create and manage own workflows
    Permission.WORKFLOW_CREATE,
    Permission.WORKFLOW_READ,
    Permission.WORKFLOW_UPDATE,
    Permission.WORKFLOW_EXECUTE,
    // Execution access
    Permission.EXECUTION_READ,
    // Can read members
    Permission.MEMBER_READ,
    // Can read settings
    Permission.SETTINGS_READ,
    // Can read integrations
    Permission.INTEGRATION_READ,
    // Approval permissions (can create and read, but only respond as designated approver)
    Permission.APPROVAL_CREATE,
    Permission.APPROVAL_READ,
    Permission.APPROVAL_RESPOND,
    Permission.DASHBOARD_READ,
    // AR permissions (read only for members)
    Permission.AR_READ,
    // NO workflow delete
    // NO member management
    // NO settings update
    // NO integration management
    // NO audit
    // NO billing
  ],

  [Role.VIEWER]: [
    // Read-only access
    Permission.WORKFLOW_READ,
    Permission.EXECUTION_READ,
    Permission.MEMBER_READ,
    Permission.SETTINGS_READ,
    Permission.INTEGRATION_READ,
    Permission.APPROVAL_READ,
    Permission.DASHBOARD_READ,
    // AR read-only
    Permission.AR_READ,
    // NO create/update/delete
    // NO execute
    // NO audit
    // NO billing
  ],
};

// =============================================================================
// PERMISSION CHECK FUNCTIONS
// =============================================================================

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: string): Permission[] {
  return ROLE_PERMISSIONS[role as Role] || [];
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: string, permission: Permission | string): boolean {
  const permissions = getRolePermissions(role);
  return permissions.includes(permission as Permission);
}

/**
 * Check if a role has any of the specified permissions
 */
export function hasAnyPermission(role: string, permissions: (Permission | string)[]): boolean {
  const rolePermissions = getRolePermissions(role);
  return permissions.some((p) => rolePermissions.includes(p as Permission));
}

/**
 * Check if a role has all of the specified permissions
 */
export function hasAllPermissions(role: string, permissions: (Permission | string)[]): boolean {
  const rolePermissions = getRolePermissions(role);
  return permissions.every((p) => rolePermissions.includes(p as Permission));
}

// =============================================================================
// ROLE VALIDATION
// =============================================================================

/**
 * Validate if a string is a valid role
 */
export function isValidRole(role: string): role is Role {
  return ROLES.includes(role);
}

/**
 * Validate role assignment - ensures role hierarchy is respected
 * @param assignerRole The role of the user assigning the role
 * @param targetRole The role being assigned
 * @returns true if assignment is allowed, false otherwise
 */
export function canAssignRole(assignerRole: string, targetRole: string): boolean {
  if (!isValidRole(assignerRole) || !isValidRole(targetRole)) {
    return false;
  }

  const assignerLevel = ROLE_HIERARCHY[assignerRole as Role];
  const targetLevel = ROLE_HIERARCHY[targetRole as Role];

  // Can only assign roles lower than or equal to own level
  // Special case: only owner can assign owner role
  if (targetRole === Role.OWNER) {
    return assignerRole === Role.OWNER;
  }

  return assignerLevel >= targetLevel;
}

/**
 * Check if a role change is allowed
 * @param actorRole The role of the user performing the change
 * @param currentRole The current role of the target user
 * @param newRole The new role to assign
 * @returns true if the role change is allowed
 */
export function canChangeRole(actorRole: string, currentRole: string, newRole: string): boolean {
  if (!isValidRole(actorRole) || !isValidRole(currentRole) || !isValidRole(newRole)) {
    return false;
  }

  const actorLevel = ROLE_HIERARCHY[actorRole as Role];
  const currentLevel = ROLE_HIERARCHY[currentRole as Role];
  const newLevel = ROLE_HIERARCHY[newRole as Role];

  // Cannot modify users with equal or higher role (except self-demotion)
  if (currentLevel >= actorLevel) {
    return false;
  }

  // Cannot promote to equal or higher role
  if (newLevel >= actorLevel) {
    return false;
  }

  // Special case: only owner can demote from admin
  if (currentRole === Role.ADMIN && actorRole !== Role.OWNER) {
    return false;
  }

  return true;
}

/**
 * Get default role for new members
 */
export function getDefaultRole(): Role {
  return Role.MEMBER;
}

/**
 * Check if role is at least the minimum required level
 */
export function isRoleAtLeast(role: string, minimumRole: Role): boolean {
  if (!isValidRole(role)) {
    return false;
  }
  return ROLE_HIERARCHY[role as Role] >= ROLE_HIERARCHY[minimumRole];
}

// =============================================================================
// AGENT PERMISSIONS
// =============================================================================

export interface ApprovalRequirement {
  pattern: string;
  condition?: string; // e.g., "amount > 1000000"
}

export interface AgentPermissions {
  agentId: string;
  organizationId: string;
  read: string[]; // Resource patterns (e.g., "workflow:*", "execution:own")
  write: string[]; // Resource patterns
  tools: string[]; // Allowed MCP tools (e.g., "notion:*", "slack:sendMessage")
  restricted: string[]; // Explicitly denied patterns (overrides read/write)
  approvalRequired: ApprovalRequirement[];
}

export const DEFAULT_AGENT_PERMISSIONS: Omit<AgentPermissions, "agentId" | "organizationId"> = {
  read: ["workflow:own", "execution:own"],
  write: [],
  tools: [],
  restricted: ["billing:*", "member:*", "org:*"],
  approvalRequired: [],
};

// =============================================================================
// DELEGATION
// =============================================================================

export interface DelegationScope {
  resourceTypes?: string[]; // e.g., ["workflow", "execution"]
  resourceIds?: string[]; // Specific resource IDs
  maxAmount?: number; // For budget-related delegations
  conditions?: Record<string, unknown>; // Custom conditions
}

export interface Delegation {
  id: string;
  organizationId: string;
  delegatorId: string; // Who is delegating
  delegateeId: string; // Who receives authority
  permissions: string[]; // Which permissions (e.g., ["approval:respond", "workflow:execute"])
  scope?: DelegationScope;
  validFrom: Date;
  validUntil: Date;
  reason: string;
  createdAt: Date;
  revokedAt?: Date;
  revokedBy?: string;
  revokedReason?: string;
}

// =============================================================================
// AGENT PERMISSION CHECKS
// =============================================================================

function matchesPattern(resource: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern === resource) return true;

  const patternParts = pattern.split(":");
  const resourceParts = resource.split(":");

  if (patternParts.length !== resourceParts.length) return false;

  return patternParts.every((part, i) => {
    if (part === "*") return true;
    return part === resourceParts[i];
  });
}

export function checkAgentResourcePermission(
  agentPermissions: AgentPermissions,
  resource: string,
  action: "read" | "write",
): boolean {
  // Check restricted patterns first (deny list)
  if (agentPermissions.restricted.some((pattern) => matchesPattern(resource, pattern))) {
    return false;
  }

  // Check allowed patterns
  const patterns = action === "read" ? agentPermissions.read : agentPermissions.write;
  return patterns.some((pattern) => matchesPattern(resource, pattern));
}

export function checkAgentToolPermission(
  agentPermissions: AgentPermissions,
  tool: string,
): boolean {
  // Check restricted patterns first
  if (agentPermissions.restricted.some((pattern) => matchesPattern(tool, pattern))) {
    return false;
  }

  return agentPermissions.tools.some((pattern) => matchesPattern(tool, pattern));
}

export function checkApprovalRequired(
  agentPermissions: AgentPermissions,
  resource: string,
  context?: Record<string, unknown>,
): ApprovalRequirement | null {
  for (const requirement of agentPermissions.approvalRequired) {
    if (matchesPattern(resource, requirement.pattern)) {
      // If there's a condition, evaluate it
      if (requirement.condition && context) {
        if (evaluateCondition(requirement.condition, context)) {
          return requirement;
        }
      } else if (!requirement.condition) {
        return requirement;
      }
    }
  }
  return null;
}

function evaluateCondition(condition: string, context: Record<string, unknown>): boolean {
  // Simple condition evaluator for expressions like "amount > 1000000"
  // Supports: >, <, >=, <=, ==, !=
  const operators = [">=", "<=", "!=", "==", ">", "<"];

  for (const op of operators) {
    if (condition.includes(op)) {
      const [field, valueStr] = condition.split(op).map((s) => s.trim());
      const contextValue = context[field];
      const compareValue = parseFloat(valueStr) || valueStr;

      if (contextValue === undefined) return false;

      switch (op) {
        case ">":
          return Number(contextValue) > Number(compareValue);
        case "<":
          return Number(contextValue) < Number(compareValue);
        case ">=":
          return Number(contextValue) >= Number(compareValue);
        case "<=":
          return Number(contextValue) <= Number(compareValue);
        case "==":
          return contextValue === compareValue;
        case "!=":
          return contextValue !== compareValue;
      }
    }
  }

  return false;
}

// =============================================================================
// DELEGATION CHECKS
// =============================================================================

export function isDelegationValid(delegation: Delegation): boolean {
  const now = new Date();
  return !delegation.revokedAt && delegation.validFrom <= now && delegation.validUntil > now;
}

export function checkDelegatedPermission(
  delegation: Delegation,
  permission: string,
  resource?: { type?: string; id?: string; amount?: number },
): boolean {
  // Check if delegation is still valid
  if (!isDelegationValid(delegation)) {
    return false;
  }

  // Check if the permission is delegated
  if (!delegation.permissions.includes(permission) && !delegation.permissions.includes("*")) {
    return false;
  }

  // Check scope restrictions if present
  if (delegation.scope && resource) {
    // Check resource type restriction
    if (
      delegation.scope.resourceTypes &&
      resource.type &&
      !delegation.scope.resourceTypes.includes(resource.type)
    ) {
      return false;
    }

    // Check resource ID restriction
    if (
      delegation.scope.resourceIds &&
      resource.id &&
      !delegation.scope.resourceIds.includes(resource.id)
    ) {
      return false;
    }

    // Check max amount restriction
    if (
      delegation.scope.maxAmount !== undefined &&
      resource.amount !== undefined &&
      resource.amount > delegation.scope.maxAmount
    ) {
      return false;
    }
  }

  return true;
}
