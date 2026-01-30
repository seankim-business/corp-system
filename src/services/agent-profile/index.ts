/**
 * Agent Profile Service
 * Manages agent orchestration configuration - wraps existing Agent model
 */

import { PrismaClient, Agent, Prisma } from "@prisma/client";
import { logger } from "../../utils/logger";

const prisma = new PrismaClient();

// ============================================================================
// Types
// ============================================================================

export interface CreateAgentDTO {
  name: string;
  type: "permanent" | "temporary" | "contractor";
  role: string;
  managerId?: string;
  teamId?: string;
  skills?: string[];
  // Orchestration fields
  displayName?: string;
  avatar?: string;
  position?: string;
  department?: string;
  permissionLevel?: "owner" | "admin" | "member" | "viewer" | "restricted";
  claudeMdContent?: string;
  mcpConfigJson?: Record<string, unknown>;
  toolAllowlist?: string[];
  toolDenylist?: string[];
  preferredModel?: string;
  maxTokenBudget?: number;
  maxConcurrency?: number;
}

export interface UpdateAgentDTO extends Partial<CreateAgentDTO> {}

export interface OrgChartNode {
  id: string;
  name: string;
  displayName: string | null;
  position: string | null;
  department: string | null;
  status: string;
  avatar: string | null;
  subordinates: OrgChartNode[];
}

export interface EffectivePermissions {
  level: string;
  canDelegate: boolean;
  canEscalate: boolean;
  canAccessMCP: string[];
  canUseTools: string[];
  deniedTools: string[];
}

// ============================================================================
// Agent Profile Service
// ============================================================================

export class AgentProfileService {
  // CRUD Operations

  async createAgent(organizationId: string, data: CreateAgentDTO): Promise<Agent> {
    logger.info("Creating agent", { organizationId, name: data.name });

    return prisma.agent.create({
      data: {
        organizationId,
        name: data.name,
        type: data.type,
        role: data.role,
        managerId: data.managerId,
        teamId: data.teamId,
        skills: data.skills || [],
        displayName: data.displayName,
        avatar: data.avatar,
        position: data.position,
        department: data.department,
        permissionLevel: data.permissionLevel || "member",
        claudeMdContent: data.claudeMdContent,
        mcpConfigJson: data.mcpConfigJson as Prisma.InputJsonValue,
        toolAllowlist: data.toolAllowlist || [],
        toolDenylist: data.toolDenylist || [],
        preferredModel: data.preferredModel,
        maxTokenBudget: data.maxTokenBudget,
        maxConcurrency: data.maxConcurrency || 1,
      },
    });
  }

  async getAgent(agentId: string): Promise<Agent | null> {
    return prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        manager: true,
        subordinates: true,
        team: true,
        credentials: true,
        mcpAssignments: {
          include: { mcpConnection: true },
        },
      },
    });
  }

  async getOrgAgents(organizationId: string): Promise<Agent[]> {
    return prisma.agent.findMany({
      where: { organizationId, status: { not: "archived" } },
      include: {
        manager: true,
        subordinates: true,
        team: true,
      },
      orderBy: [{ department: "asc" }, { name: "asc" }],
    });
  }

  async updateAgent(agentId: string, data: UpdateAgentDTO): Promise<Agent> {
    logger.info("Updating agent", { agentId });

    return prisma.agent.update({
      where: { id: agentId },
      data: {
        ...data,
        mcpConfigJson: data.mcpConfigJson as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });
  }

  async archiveAgent(agentId: string): Promise<void> {
    logger.info("Archiving agent", { agentId });

    await prisma.agent.update({
      where: { id: agentId },
      data: { status: "archived", updatedAt: new Date() },
    });
  }

  // Hierarchy Operations

  async getOrgChart(organizationId: string): Promise<OrgChartNode[]> {
    const agents = await prisma.agent.findMany({
      where: { organizationId, status: "active" },
      include: { subordinates: true },
    });

    // Build tree from root agents (no manager)
    const rootAgents = agents.filter((a) => !a.managerId);

    const buildNode = (agent: Agent & { subordinates: Agent[] }): OrgChartNode => ({
      id: agent.id,
      name: agent.name,
      displayName: agent.displayName,
      position: agent.position,
      department: agent.department,
      status: agent.status,
      avatar: agent.avatar,
      subordinates: agent.subordinates
        .map((sub) => {
          const fullSub = agents.find((a) => a.id === sub.id);
          return fullSub ? buildNode(fullSub as Agent & { subordinates: Agent[] }) : null;
        })
        .filter((n): n is OrgChartNode => n !== null),
    });

    return rootAgents.map((a) => buildNode(a as Agent & { subordinates: Agent[] }));
  }

  async getSubordinates(agentId: string): Promise<Agent[]> {
    return prisma.agent.findMany({
      where: { managerId: agentId, status: "active" },
    });
  }

  async getManager(agentId: string): Promise<Agent | null> {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: { manager: true },
    });
    return agent?.manager || null;
  }

  async reassignManager(agentId: string, newManagerId: string | null): Promise<Agent> {
    // Prevent circular hierarchy
    if (newManagerId) {
      const isDescendant = await this.isDescendantOf(newManagerId, agentId);
      if (isDescendant) {
        throw new Error("Cannot assign an agent to report to its own subordinate");
      }
    }

    return prisma.agent.update({
      where: { id: agentId },
      data: { managerId: newManagerId, updatedAt: new Date() },
    });
  }

  private async isDescendantOf(potentialDescendantId: string, ancestorId: string): Promise<boolean> {
    const subordinates = await this.getSubordinates(ancestorId);

    for (const sub of subordinates) {
      if (sub.id === potentialDescendantId) return true;
      if (await this.isDescendantOf(potentialDescendantId, sub.id)) return true;
    }

    return false;
  }

  // Configuration Operations

  async generateClaudeMd(agentId: string): Promise<string> {
    const agent = await this.getAgent(agentId);
    if (!agent) throw new Error("Agent not found");

    let content = `# Agent: ${agent.displayName || agent.name}

## Role
${agent.role}

## Position
${agent.position || "Team Member"}

## Department
${agent.department || "General"}

## Skills
${agent.skills.join(", ") || "None specified"}

## Permissions
Level: ${agent.permissionLevel}
`;

    // Append custom CLAUDE.md content if exists
    if (agent.claudeMdContent) {
      content += `\n---\n\n${agent.claudeMdContent}`;
    }

    return content;
  }

  async generateMCPConfig(agentId: string): Promise<Record<string, unknown>> {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        mcpAssignments: {
          where: { enabled: true },
          include: { mcpConnection: true },
        },
      },
    });

    if (!agent) throw new Error("Agent not found");

    // Start with agent's base MCP config
    const config: Record<string, unknown> = {
      mcpServers: agent.mcpConfigJson || {},
    };

    // Merge in assigned MCP connections
    for (const assignment of agent.mcpAssignments || []) {
      // Add to mcpServers if not already present
      // (actual implementation would merge configs)
      void assignment.mcpConnection;
    }

    return config;
  }

  async resolveEffectivePermissions(agentId: string): Promise<EffectivePermissions> {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        mcpAssignments: {
          where: { enabled: true },
          include: { mcpConnection: true },
        },
      },
    });

    if (!agent) throw new Error("Agent not found");

    const permissionLevels: Record<string, { canDelegate: boolean; canEscalate: boolean }> = {
      owner: { canDelegate: true, canEscalate: false },
      admin: { canDelegate: true, canEscalate: true },
      member: { canDelegate: false, canEscalate: true },
      viewer: { canDelegate: false, canEscalate: true },
      restricted: { canDelegate: false, canEscalate: false },
    };

    const perms = permissionLevels[agent.permissionLevel] || permissionLevels.member;

    return {
      level: agent.permissionLevel,
      canDelegate: perms.canDelegate,
      canEscalate: perms.canEscalate,
      canAccessMCP: (agent.mcpAssignments || []).map((a) => a.mcpConnection.provider),
      canUseTools: agent.toolAllowlist,
      deniedTools: agent.toolDenylist,
    };
  }

  // Activity tracking

  async markActive(agentId: string): Promise<void> {
    await prisma.agent.update({
      where: { id: agentId },
      data: { lastActiveAt: new Date() },
    });
  }
}

// Singleton export
export const agentProfileService = new AgentProfileService();
export default agentProfileService;
