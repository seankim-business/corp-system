import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { encrypt } from "../../utils/encryption";
import { checklistService } from "./checklist";
import { templateService } from "./templates";

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
  /**
   * Connect Google Workspace via OAuth
   */
  async connectGoogleWorkspace(
    organizationId: string,
    tokens: {
      accessToken: string;
      refreshToken?: string;
      expiresAt?: Date;
    },
    workspaceInfo?: GoogleWorkspaceInfo,
  ): Promise<{ connected: boolean; usersImported: number }> {
    try {
      // Store connection
      await prisma.driveConnection.upsert({
        where: { organizationId },
        create: {
          organizationId,
          accessToken: encrypt(tokens.accessToken),
          refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
          expiresAt: tokens.expiresAt,
        },
        update: {
          accessToken: encrypt(tokens.accessToken),
          refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
          expiresAt: tokens.expiresAt,
        },
      });

      // Update workspace domain if provided
      if (workspaceInfo?.domain) {
        const existingDomain = await prisma.workspaceDomain.findFirst({
          where: { organizationId, domain: workspaceInfo.domain },
        });

        if (!existingDomain) {
          await prisma.workspaceDomain.create({
            data: {
              organizationId,
              domain: workspaceInfo.domain,
              verified: true,
              verifiedAt: new Date(),
            },
          });
        }
      }

      // Import users if provided
      let usersImported = 0;
      if (workspaceInfo?.users && workspaceInfo.users.length > 0) {
        for (const userInfo of workspaceInfo.users) {
          try {
            // Check if user exists
            let user = await prisma.user.findUnique({
              where: { email: userInfo.email },
            });

            if (!user) {
              // Create user
              user = await prisma.user.create({
                data: {
                  email: userInfo.email,
                  displayName: userInfo.name,
                  avatarUrl: userInfo.photoUrl,
                  emailVerified: true,
                },
              });
            }

            // Check if membership exists
            const existingMembership = await prisma.membership.findUnique({
              where: {
                organizationId_userId: {
                  organizationId,
                  userId: user.id,
                },
              },
            });

            if (!existingMembership) {
              // Create membership
              await prisma.membership.create({
                data: {
                  organizationId,
                  userId: user.id,
                  role: "member",
                  joinedAt: new Date(),
                },
              });
              usersImported++;
            }
          } catch (error) {
            logger.warn("Failed to import user from Google Workspace", {
              email: userInfo.email,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      // Mark checklist item complete
      await checklistService.markComplete(organizationId, "connect_google", {
        domain: workspaceInfo?.domain,
        usersImported,
      });

      logger.info("Connected Google Workspace", {
        organizationId,
        domain: workspaceInfo?.domain,
        usersImported,
      });

      return { connected: true, usersImported };
    } catch (error) {
      logger.error("Failed to connect Google Workspace", {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Connect Slack via OAuth
   */
  async connectSlack(
    organizationId: string,
    tokens: {
      botToken: string;
      appToken?: string;
      signingSecret: string;
    },
    workspaceInfo: {
      workspaceId: string;
      workspaceName: string;
      botUserId?: string;
      scopes?: string[];
    },
    userId?: string,
  ): Promise<{ connected: boolean }> {
    try {
      await prisma.slackIntegration.upsert({
        where: { workspaceId: workspaceInfo.workspaceId },
        create: {
          organizationId,
          workspaceId: workspaceInfo.workspaceId,
          workspaceName: workspaceInfo.workspaceName,
          botToken: encrypt(tokens.botToken),
          appToken: tokens.appToken ? encrypt(tokens.appToken) : null,
          signingSecret: encrypt(tokens.signingSecret),
          botUserId: workspaceInfo.botUserId,
          scopes: workspaceInfo.scopes || [],
          installedBy: userId,
          enabled: true,
          healthStatus: "healthy",
        },
        update: {
          botToken: encrypt(tokens.botToken),
          appToken: tokens.appToken ? encrypt(tokens.appToken) : null,
          signingSecret: encrypt(tokens.signingSecret),
          botUserId: workspaceInfo.botUserId,
          scopes: workspaceInfo.scopes || [],
          enabled: true,
          healthStatus: "healthy",
        },
      });

      // Mark checklist item complete
      await checklistService.markComplete(organizationId, "connect_slack", {
        workspaceId: workspaceInfo.workspaceId,
        workspaceName: workspaceInfo.workspaceName,
      });

      logger.info("Connected Slack", {
        organizationId,
        workspaceId: workspaceInfo.workspaceId,
      });

      return { connected: true };
    } catch (error) {
      logger.error("Failed to connect Slack", {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Connect Notion via OAuth
   */
  async connectNotion(
    organizationId: string,
    apiKey: string,
    defaultDatabaseId?: string,
  ): Promise<{ connected: boolean }> {
    try {
      await prisma.notionConnection.upsert({
        where: { organizationId },
        create: {
          organizationId,
          apiKey: encrypt(apiKey),
          defaultDatabaseId,
        },
        update: {
          apiKey: encrypt(apiKey),
          defaultDatabaseId,
        },
      });

      // Mark checklist item complete
      await checklistService.markComplete(organizationId, "connect_notion", {
        hasDefaultDatabase: !!defaultDatabaseId,
      });

      logger.info("Connected Notion", { organizationId });

      return { connected: true };
    } catch (error) {
      logger.error("Failed to connect Notion", {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Apply a template to the organization
   */
  async applyTemplate(
    organizationId: string,
    templateId: string,
    customizations?: {
      enabledAgents?: string[];
      disabledAgents?: string[];
    },
  ): Promise<{
    createdAgents: string[];
    createdWorkflows: string[];
  }> {
    const result = await templateService.apply(organizationId, templateId, customizations);

    logger.info("Applied template during onboarding", {
      organizationId,
      templateId,
      ...result,
    });

    return {
      createdAgents: result.createdAgents,
      createdWorkflows: result.createdWorkflows,
    };
  }

  /**
   * Create first workflow for the organization
   */
  async createFirstWorkflow(
    organizationId: string,
    workflowData?: {
      name?: string;
      description?: string;
    },
  ): Promise<{ workflowId: string }> {
    const workflow = await prisma.workflow.create({
      data: {
        organizationId,
        name: workflowData?.name || "My First Workflow",
        description: workflowData?.description || "A simple automation workflow to get started",
        config: {
          trigger: "manual",
          steps: [
            {
              id: "step-1",
              type: "notification",
              config: {
                message: "Workflow started!",
              },
            },
          ],
        },
        enabled: true,
      },
    });

    logger.info("Created first workflow", {
      organizationId,
      workflowId: workflow.id,
    });

    return { workflowId: workflow.id };
  }

  /**
   * Send team invitations
   */
  async sendInvites(
    organizationId: string,
    invites: TeamInvite[],
    invitedByUserId?: string,
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    for (const invite of invites) {
      try {
        // Check if user already exists
        let user = await prisma.user.findUnique({
          where: { email: invite.email },
        });

        if (!user) {
          // Create pending user
          user = await prisma.user.create({
            data: {
              email: invite.email,
              emailVerified: false,
            },
          });
        }

        // Check for existing membership
        const existingMembership = await prisma.membership.findUnique({
          where: {
            organizationId_userId: {
              organizationId,
              userId: user.id,
            },
          },
        });

        if (existingMembership) {
          logger.info("User already a member", {
            email: invite.email,
            organizationId,
          });
          continue;
        }

        // Create membership (pending invitation)
        await prisma.membership.create({
          data: {
            organizationId,
            userId: user.id,
            role: invite.role || "member",
            invitedBy: invitedByUserId,
            invitedAt: new Date(),
          },
        });

        // TODO: Send actual invitation email
        // await emailService.sendInvitation(invite.email, organizationId, invite.message);

        sent++;
      } catch (error) {
        logger.warn("Failed to send invite", {
          email: invite.email,
          error: error instanceof Error ? error.message : String(error),
        });
        failed++;
      }
    }

    if (sent > 0) {
      // Mark checklist item complete
      await checklistService.markComplete(organizationId, "invite_team", {
        invitesSent: sent,
        invitesFailed: failed,
      });
    }

    logger.info("Sent team invites", {
      organizationId,
      sent,
      failed,
    });

    return { sent, failed };
  }

  /**
   * Update company profile
   */
  async updateCompanyProfile(
    organizationId: string,
    profile: {
      companyName: string;
      industry?: string;
      teamSize?: string;
      logoUrl?: string;
    },
  ): Promise<void> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });

    const existingSettings = (org?.settings as Record<string, unknown>) || {};

    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        name: profile.companyName,
        logoUrl: profile.logoUrl || undefined,
        settings: {
          ...existingSettings,
          industry: profile.industry,
          teamSize: profile.teamSize,
        },
      },
    });

    // Mark checklist item complete
    await checklistService.markComplete(organizationId, "company_profile", {
      industry: profile.industry,
      teamSize: profile.teamSize,
    });

    logger.info("Updated company profile", {
      organizationId,
      companyName: profile.companyName,
    });
  }

  /**
   * Record first agent interaction
   */
  async recordFirstAgentInteraction(
    organizationId: string,
    agentId: string,
  ): Promise<void> {
    await checklistService.markComplete(organizationId, "first_agent", {
      agentId,
      interactedAt: new Date(),
    });

    logger.info("Recorded first agent interaction", {
      organizationId,
      agentId,
    });
  }

  /**
   * Record first workflow execution
   */
  async recordFirstWorkflowExecution(
    organizationId: string,
    workflowId: string,
    executionId: string,
  ): Promise<void> {
    await checklistService.markComplete(organizationId, "first_workflow", {
      workflowId,
      executionId,
      executedAt: new Date(),
    });

    logger.info("Recorded first workflow execution", {
      organizationId,
      workflowId,
    });
  }
}

export const setupTasks = new SetupTasks();
