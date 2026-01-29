/**
 * Onboarding Setup Tasks Service (Stub)
 *
 * TODO: Implement when onboarding tables are properly added to Prisma schema
 */

import { logger } from "../../utils/logger";

export interface GoogleWorkspaceInfo {
  domain: string;
  users: Array<{
    email: string;
    name: string;
    photoUrl?: string;
  }>;
}

export interface TeamInvite {
  email: string;
  role?: string;
  message?: string;
}

export class SetupTasks {
  async connectGoogleWorkspace(
    _organizationId: string,
    _tokens: {
      accessToken: string;
      refreshToken?: string;
      expiresAt?: Date;
    },
    _workspaceInfo?: GoogleWorkspaceInfo,
  ): Promise<{ connected: boolean; usersImported: number }> {
    logger.warn("SetupTasks.connectGoogleWorkspace called (stub)");
    return { connected: false, usersImported: 0 };
  }

  async connectSlack(
    _organizationId: string,
    _tokens: {
      accessToken: string;
      teamId: string;
      teamName: string;
    },
  ): Promise<{ connected: boolean }> {
    logger.warn("SetupTasks.connectSlack called (stub)");
    return { connected: false };
  }

  async inviteTeamMembers(
    _organizationId: string,
    _invites: TeamInvite[],
    _invitedBy: string,
  ): Promise<{ sent: number; failed: number }> {
    logger.warn("SetupTasks.inviteTeamMembers called (stub)");
    return { sent: 0, failed: 0 };
  }

  async createFirstWorkflow(
    _organizationId: string,
    _userId: string,
    _workflowType?: string,
  ): Promise<{ workflowId: string } | null> {
    logger.warn("SetupTasks.createFirstWorkflow called (stub)");
    return null;
  }

  async updateCompanyProfile(
    _organizationId: string,
    _profile: {
      name?: string;
      domain?: string;
      logoUrl?: string;
      industry?: string;
      teamSize?: string;
    },
  ): Promise<boolean> {
    logger.warn("SetupTasks.updateCompanyProfile called (stub)");
    return false;
  }

  async getSetupStatus(_organizationId: string): Promise<{
    googleConnected: boolean;
    slackConnected: boolean;
    notionConnected: boolean;
    teamMembersCount: number;
    workflowsCount: number;
    profileComplete: boolean;
  }> {
    logger.debug("SetupTasks.getSetupStatus called (stub)");
    return {
      googleConnected: false,
      slackConnected: false,
      notionConnected: false,
      teamMembersCount: 1,
      workflowsCount: 0,
      profileComplete: false,
    };
  }
}

export const setupTasks = new SetupTasks();
