export enum Role {
  OWNER = "owner",
  ADMIN = "admin",
  MEMBER = "member",
}

export enum Permission {
  WORKFLOWS_READ = "workflows:read",
  WORKFLOWS_WRITE = "workflows:write",
  WORKFLOWS_DELETE = "workflows:delete",
  WORKFLOWS_EXECUTE = "workflows:execute",

  INTEGRATIONS_READ = "integrations:read",
  INTEGRATIONS_WRITE = "integrations:write",
  INTEGRATIONS_DELETE = "integrations:delete",

  MEMBERS_READ = "members:read",
  MEMBERS_WRITE = "members:write",
  MEMBERS_DELETE = "members:delete",

  SETTINGS_READ = "settings:read",
  SETTINGS_WRITE = "settings:write",

  AUDIT_READ = "audit:read",

  BILLING_READ = "billing:read",
  BILLING_WRITE = "billing:write",
}

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.OWNER]: [
    Permission.WORKFLOWS_READ,
    Permission.WORKFLOWS_WRITE,
    Permission.WORKFLOWS_DELETE,
    Permission.WORKFLOWS_EXECUTE,
    Permission.INTEGRATIONS_READ,
    Permission.INTEGRATIONS_WRITE,
    Permission.INTEGRATIONS_DELETE,
    Permission.MEMBERS_READ,
    Permission.MEMBERS_WRITE,
    Permission.MEMBERS_DELETE,
    Permission.SETTINGS_READ,
    Permission.SETTINGS_WRITE,
    Permission.AUDIT_READ,
    Permission.BILLING_READ,
    Permission.BILLING_WRITE,
  ],
  [Role.ADMIN]: [
    Permission.WORKFLOWS_READ,
    Permission.WORKFLOWS_WRITE,
    Permission.WORKFLOWS_DELETE,
    Permission.WORKFLOWS_EXECUTE,
    Permission.INTEGRATIONS_READ,
    Permission.INTEGRATIONS_WRITE,
    Permission.INTEGRATIONS_DELETE,
    Permission.MEMBERS_READ,
    Permission.SETTINGS_READ,
    Permission.AUDIT_READ,
  ],
  [Role.MEMBER]: [
    Permission.WORKFLOWS_READ,
    Permission.WORKFLOWS_EXECUTE,
    Permission.INTEGRATIONS_READ,
  ],
};

export function getRolePermissions(role: string): Permission[] {
  return ROLE_PERMISSIONS[role as Role] || [];
}

export function hasPermission(role: string, permission: Permission): boolean {
  const permissions = getRolePermissions(role);
  return permissions.includes(permission);
}

export function hasAnyPermission(role: string, permissions: Permission[]): boolean {
  const rolePermissions = getRolePermissions(role);
  return permissions.some((p) => rolePermissions.includes(p));
}

export function hasAllPermissions(role: string, permissions: Permission[]): boolean {
  const rolePermissions = getRolePermissions(role);
  return permissions.every((p) => rolePermissions.includes(p));
}
