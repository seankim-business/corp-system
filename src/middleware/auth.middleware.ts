import { Request, Response, NextFunction } from "express";
import { AuthService } from "../auth/auth.service";
import { db } from "../db/client";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";
import { setSentryUser } from "../services/sentry";
import { asyncLocalStorage } from "../utils/async-context";

const authService = new AuthService();

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies.session || req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const isBlacklisted = await redis.get(`token_blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({ error: "Token revoked" });
    }

    const payload = authService.verifySessionToken(token);

    const currentIp = req.ip || req.socket.remoteAddress;
    const currentUserAgent = req.get("user-agent");

    if (payload.ipAddress && payload.ipAddress !== currentIp) {
      logger.warn("Session hijacking attempt detected: IP mismatch", {
        userId: payload.userId,
        sessionIp: payload.ipAddress,
        currentIp,
      });
      return res.status(401).json({ error: "Session invalid: IP mismatch" });
    }

    if (payload.userAgent && currentUserAgent && payload.userAgent !== currentUserAgent) {
      logger.warn("Session hijacking attempt detected: User-Agent mismatch", {
        userId: payload.userId,
        sessionUserAgent: payload.userAgent,
        currentUserAgent,
      });
      return res.status(401).json({ error: "Session invalid: User-Agent mismatch" });
    }

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

    if (user && payload.organizationId) {
      setSentryUser(user.id, payload.organizationId, user.email ?? undefined);
    }

    // Store organization context in AsyncLocalStorage for RLS middleware
    return asyncLocalStorage.run(
      {
        organizationId: payload.organizationId,
        userId: payload.userId,
        role: membership.role,
      },
      () => next(),
    );
  } catch (error) {
    logger.error(
      "Authentication error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  return next();
}

export function requireOrganization(req: Request, res: Response, next: NextFunction) {
  if (!req.organization) {
    return res.status(400).json({ error: "Organization required" });
  }
  return next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (!req.membership) {
    return res.status(403).json({ error: "Membership required" });
  }

  const role = req.membership.role;
  if (role !== "owner" && role !== "admin") {
    return res.status(403).json({ error: "Admin role required" });
  }

  return next();
}
