export interface PermissionScope {
  agentId?: string;
  roleId?: string;
  teamId?: string;
  organizationId: string;
}

export interface ResolvedPermission {
  canExecute: boolean;
  canConfigure: boolean;
  canInstall: boolean;
  allowedTools: string[];
  deniedTools: string[];
  source: 'agent' | 'role' | 'team' | 'org' | 'default';
  cached: boolean;
}

export interface PermissionCheckRequest {
  organizationId: string;
  extensionId: string;
  agentId?: string;
  roleId?: string;
  teamId?: string;
  tool?: string;
}
