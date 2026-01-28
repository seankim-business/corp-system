/**
 * Member Management API Routes
 *
 * Endpoints:
 * - GET    /api/organizations/:orgId/members
 * - POST   /api/organizations/:orgId/members/invite
 * - PUT    /api/organizations/:orgId/members/:userId/role
 * - DELETE /api/organizations/:orgId/members/:userId
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission, Role, canAssignRole, canChangeRole, isValidRole } from "../auth/rbac";
import { validate } from "../middleware/validation.middleware";
import { logger } from "../utils/logger";

async function sendInviteNotification(params: {
  email: string;
  organizationName: string;
  inviterName: string;
  role: string;
  organizationId: string;
}): Promise<void> {
  const { email, organizationName, inviterName, role, organizationId } = params;
  const inviteUrl = `${process.env.BASE_URL}/accept-invite?org=${organizationId}`;

  logger.info("Member invite notification", {
    email,
    organizationId,
    organizationName,
    inviterName,
    role,
    inviteUrl,
    emailStatus: "pending_email_service_integration",
  });
}

const router = Router();

const orgIdParamSchema = z.object({
  orgId: z.string().uuid("Invalid organization ID"),
});

const memberParamsSchema = z.object({
  orgId: z.string().uuid("Invalid organization ID"),
  userId: z.string().uuid("Invalid user ID"),
});

const inviteMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["admin", "member", "viewer"]).default("member"),
});

const updateRoleSchema = z.object({
  role: z.enum(["owner", "admin", "member", "viewer"]),
});

function verifyOrgAccess(req: Request, res: Response, orgId: string): boolean {
  const { organizationId } = req.user!;
  if (organizationId !== orgId) {
    res.status(403).json({ error: "Access denied: Cross-organization access not allowed" });
    return false;
  }
  return true;
}

router.get(
  "/organizations/:orgId/members",
  requireAuth,
  requirePermission(Permission.MEMBER_READ),
  validate({ params: orgIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const orgId = String(req.params.orgId);

      if (!verifyOrgAccess(req, res, orgId)) return;

      const memberships = await prisma.membership.findMany({
        where: { organizationId: orgId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      });

      const members = [];
      for (const m of memberships) {
        members.push({
          id: m.id,
          userId: m.userId,
          email: m.user.email,
          name: m.user.displayName || m.user.email,
          avatarUrl: m.user.avatarUrl,
          role: m.role,
          invitedAt: m.invitedAt,
          joinedAt: m.joinedAt,
          status: m.joinedAt ? ("active" as const) : ("pending" as const),
        });
      }

      return res.json({ members });
    } catch (error) {
      logger.error(
        "List members error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to fetch members" });
    }
  },
);

router.post(
  "/organizations/:orgId/members/invite",
  requireAuth,
  requirePermission(Permission.MEMBER_INVITE),
  validate({ params: orgIdParamSchema, body: inviteMemberSchema }),
  async (req: Request, res: Response) => {
    try {
      const orgId = String(req.params.orgId);
      const { email, role } = req.body;
      const inviterId = req.user!.id;
      const inviterRole = req.membership!.role;

      if (!verifyOrgAccess(req, res, orgId)) return;

      if (!isValidRole(role)) {
        return res.status(400).json({ error: "Invalid role specified" });
      }

      if (!canAssignRole(inviterRole, role)) {
        logger.warn("Role assignment denied", {
          organizationId: orgId,
          inviterRole,
          targetRole: role,
          inviterId,
        });
        return res.status(403).json({
          error: `Cannot invite member with role '${role}'. Insufficient permissions.`,
        });
      }

      let user = await prisma.user.findUnique({
        where: { email },
      });

      if (user) {
        const existingMembership = await prisma.membership.findUnique({
          where: {
            organizationId_userId: {
              organizationId: orgId,
              userId: user.id,
            },
          },
        });

        if (existingMembership) {
          return res.status(400).json({
            error: existingMembership.joinedAt
              ? "User is already a member of this organization"
              : "User already has a pending invitation",
          });
        }
      }

      if (!user) {
        user = await prisma.user.create({
          data: {
            email,
            emailVerified: false,
          },
        });
      }

      const membership = await prisma.membership.create({
        data: {
          organizationId: orgId,
          userId: user.id,
          role,
          invitedBy: inviterId,
          invitedAt: new Date(),
          joinedAt: null,
        },
      });

      const inviter = await prisma.user.findUnique({ where: { id: inviterId } });
      const organization = await prisma.organization.findUnique({ where: { id: orgId } });

      await sendInviteNotification({
        email,
        organizationName: organization?.name || "Unknown Organization",
        inviterName: inviter?.displayName || inviter?.email || "A team member",
        role,
        organizationId: orgId,
      });

      logger.info("Member invitation created", {
        organizationId: orgId,
        invitedEmail: email,
        invitedBy: inviterId,
        role,
      });

      return res.status(201).json({
        success: true,
        membership: {
          id: membership.id,
          userId: user.id,
          email: user.email,
          role: membership.role,
          status: "pending",
          invitedAt: membership.invitedAt,
        },
      });
    } catch (error) {
      logger.error(
        "Invite member error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to invite member" });
    }
  },
);

router.put(
  "/organizations/:orgId/members/:userId/role",
  requireAuth,
  requirePermission(Permission.MEMBER_UPDATE_ROLE),
  validate({ params: memberParamsSchema, body: updateRoleSchema }),
  async (req: Request, res: Response) => {
    try {
      const orgId = String(req.params.orgId);
      const userId = String(req.params.userId);
      const { role: newRole } = req.body;
      const currentUserId = req.user!.id;
      const actorRole = req.membership!.role;

      if (!verifyOrgAccess(req, res, orgId)) return;

      if (!isValidRole(newRole)) {
        return res.status(400).json({ error: "Invalid role specified" });
      }

      const targetMembership = await prisma.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: orgId,
            userId: userId,
          },
        },
      });

      if (!targetMembership) {
        return res.status(404).json({ error: "Member not found" });
      }

      if (userId === currentUserId) {
        return res.status(400).json({ error: "Cannot change your own role" });
      }

      if (!canChangeRole(actorRole, targetMembership.role, newRole)) {
        logger.warn("Role change denied", {
          organizationId: orgId,
          actorRole,
          currentRole: targetMembership.role,
          newRole,
          actorId: currentUserId,
          targetId: userId,
        });
        return res.status(403).json({
          error: "Insufficient permissions to change this member's role",
        });
      }

      if (targetMembership.role === Role.OWNER && newRole !== Role.OWNER) {
        const ownerCount = await prisma.membership.count({
          where: {
            organizationId: orgId,
            role: Role.OWNER,
          },
        });

        if (ownerCount <= 1) {
          return res.status(400).json({
            error: "Cannot demote the only owner. Transfer ownership first.",
          });
        }
      }

      const updated = await prisma.membership.update({
        where: { id: targetMembership.id },
        data: { role: newRole },
        include: {
          user: {
            select: {
              email: true,
              displayName: true,
            },
          },
        },
      });

      logger.info("Member role updated", {
        organizationId: orgId,
        targetUserId: userId,
        oldRole: targetMembership.role,
        newRole,
        updatedBy: currentUserId,
      });

      return res.json({
        success: true,
        member: {
          id: updated.id,
          userId: updated.userId,
          email: updated.user.email,
          name: updated.user.displayName,
          role: updated.role,
        },
      });
    } catch (error) {
      logger.error(
        "Update member role error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to update member role" });
    }
  },
);

router.delete(
  "/organizations/:orgId/members/:userId",
  requireAuth,
  requirePermission(Permission.MEMBER_REMOVE),
  validate({ params: memberParamsSchema }),
  async (req: Request, res: Response) => {
    try {
      const orgId = String(req.params.orgId);
      const userId = String(req.params.userId);
      const currentUserId = req.user!.id;
      const actorRole = req.membership!.role;

      if (!verifyOrgAccess(req, res, orgId)) return;

      if (userId === currentUserId) {
        return res.status(400).json({
          error: "Cannot remove yourself. Leave the organization instead.",
        });
      }

      const targetMembership = await prisma.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: orgId,
            userId: userId,
          },
        },
      });

      if (!targetMembership) {
        return res.status(404).json({ error: "Member not found" });
      }

      if (targetMembership.role === Role.OWNER) {
        const ownerCount = await prisma.membership.count({
          where: {
            organizationId: orgId,
            role: Role.OWNER,
          },
        });

        if (ownerCount <= 1) {
          return res.status(400).json({
            error: "Cannot remove the only owner. Transfer ownership first.",
          });
        }
      }

      if (targetMembership.role === Role.OWNER && actorRole !== Role.OWNER) {
        logger.warn("Member removal denied: Cannot remove owner", {
          organizationId: orgId,
          actorRole,
          targetRole: targetMembership.role,
          actorId: currentUserId,
          targetId: userId,
        });
        return res.status(403).json({
          error: "Only owners can remove other owners",
        });
      }

      if (targetMembership.role === Role.ADMIN && actorRole !== Role.OWNER) {
        logger.warn("Member removal denied: Cannot remove admin", {
          organizationId: orgId,
          actorRole,
          targetRole: targetMembership.role,
          actorId: currentUserId,
          targetId: userId,
        });
        return res.status(403).json({
          error: "Only owners can remove admins",
        });
      }

      await prisma.membership.delete({
        where: { id: targetMembership.id },
      });

      logger.info("Member removed", {
        organizationId: orgId,
        removedUserId: userId,
        removedBy: currentUserId,
      });

      return res.json({ success: true });
    } catch (error) {
      logger.error(
        "Remove member error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to remove member" });
    }
  },
);

export default router;
