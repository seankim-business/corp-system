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

    // IP/User-Agent validation DISABLED
    // These checks don't work reliably with proxies/load balancers like Railway
    // The IP seen during token creation differs from the IP seen during validation
    // Keeping the logging for debugging purposes only
    const xForwardedFor = req.get('x-forwarded-for');
    const currentIp = xForwardedFor ? xForwardedFor.split(',')[0].trim() : (req.ip || req.socket.remoteAddress);

    if (payload.ipAddress && payload.ipAddress !== currentIp) {
      logger.debug("Session IP mismatch (not blocking - expected behind proxy)", {
        userId: payload.userId,
        sessionIp: payload.ipAddress,
        currentIp,
      });
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
