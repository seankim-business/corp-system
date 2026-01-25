import { Request, Response, NextFunction } from "express";
import { AuthService } from "../auth/auth.service";
import { db } from "../db/client";

const authService = new AuthService();

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const token =
      req.cookies.session || req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const payload = authService.verifySessionToken(token);

    const user = await db.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    const membership = await db.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: payload.organizationId,
          userId: payload.userId,
        },
      },
      include: {
        organization: true,
      },
    });

    if (!membership) {
      return res.status(403).json({ error: "Membership not found" });
    }

    req.user = { ...user, organizationId: payload.organizationId };
    req.organization = membership.organization;
    req.membership = membership;
    req.currentOrganizationId = payload.organizationId;

    return next();
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  return next();
}

export function requireOrganization(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.organization) {
    return res.status(400).json({ error: "Organization required" });
  }
  return next();
}
