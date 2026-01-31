import { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs/promises";
import { AuthService } from "../../../auth/auth.service";
import { db } from "../../../db/client";
import { redis } from "../../../db/redis";
import { logger } from "../../../utils/logger";

const authService = new AuthService();

export interface OmcBridgeAuthContext {
  userId: string;
  organizationId: string;
  role: string;
  workspacePath: string;
}

/**
 * Verify JWT token and extract authentication context
 */
export async function verifyOmcBridgeAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      res.status(401).json({ error: "Unauthorized - Missing token" });
      return;
    }

    // Check if token is blacklisted
    const isBlacklisted = await redis.get(`token_blacklist:${token}`);
    if (isBlacklisted) {
      res.status(401).json({ error: "Token revoked" });
      return;
    }

    // Verify the JWT token
    const payload = authService.verifySessionToken(token);

    // Extract organization context
    const context = await extractOrganizationContext(payload.userId, payload.organizationId);

    if (!context) {
      res.status(403).json({ error: "Organization context not found" });
      return;
    }

    // Resolve workspace path
    const workspacePath = await resolveWorkspacePath(context.organizationId);

    if (!workspacePath) {
      res.status(403).json({ error: "Workspace not configured" });
      return;
    }

    // Attach auth context to request
    req.omcBridgeAuth = {
      userId: context.userId,
      organizationId: context.organizationId,
      role: context.role,
      workspacePath,
    };

    next();
  } catch (error) {
    logger.error(
      "OMC Bridge authentication error",
      {},
      error instanceof Error ? error : new Error(String(error))
    );
    res.status(401).json({ error: "Invalid token" });
  }
}

/**
 * Extract organization context from database
 */
export async function extractOrganizationContext(
  userId: string,
  organizationId: string
): Promise<{ userId: string; organizationId: string; role: string } | null> {
  try {
    const membership = await db.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
      include: {
        organization: true,
        user: true,
      },
    });

    if (!membership) {
      logger.warn("Membership not found", { userId, organizationId });
      return null;
    }

    return {
      userId: membership.userId,
      organizationId: membership.organizationId,
      role: membership.role,
    };
  } catch (error) {
    logger.error(
      "Failed to extract organization context",
      { userId, organizationId },
      error instanceof Error ? error : new Error(String(error))
    );
    return null;
  }
}

/**
 * Resolve workspace path for an organization
 * Maps organizationId to a filesystem path where workspace files are stored
 */
export async function resolveWorkspacePath(organizationId: string): Promise<string | null> {
  try {
    // Get organization settings from database
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true, slug: true },
    });

    if (!org) {
      logger.warn("Organization not found", { organizationId });
      return null;
    }

    // Check if workspace path is configured in settings
    const settings = org.settings as Record<string, unknown>;
    if (settings?.workspacePath && typeof settings.workspacePath === "string") {
      return settings.workspacePath;
    }

    // Default workspace path based on organization slug
    const baseWorkspacePath = process.env.OMC_WORKSPACES_ROOT || "/var/data/workspaces";
    const workspacePath = path.join(baseWorkspacePath, org.slug);

    // Create workspace directory if it doesn't exist
    try {
      await fs.mkdir(workspacePath, { recursive: true });
    } catch (mkdirError) {
      logger.error(
        "Failed to create workspace directory",
        { workspacePath },
        mkdirError instanceof Error ? mkdirError : new Error(String(mkdirError))
      );
      return null;
    }

    return workspacePath;
  } catch (error) {
    logger.error(
      "Failed to resolve workspace path",
      { organizationId },
      error instanceof Error ? error : new Error(String(error))
    );
    return null;
  }
}

/**
 * Validate that a requested path is within the allowed workspace
 * Prevents directory traversal attacks
 */
export function validateWorkspaceAccess(
  requestedPath: string,
  workspacePath: string
): { valid: boolean; error?: string; resolvedPath?: string } {
  try {
    // Resolve the absolute path
    const resolvedPath = path.resolve(workspacePath, requestedPath);

    // Check if resolved path is within workspace
    if (!resolvedPath.startsWith(workspacePath)) {
      logger.warn("Path traversal attempt detected", {
        requestedPath,
        workspacePath,
        resolvedPath,
      });
      return {
        valid: false,
        error: "Access denied - path outside workspace",
      };
    }

    return {
      valid: true,
      resolvedPath,
    };
  } catch (error) {
    logger.error(
      "Failed to validate workspace access",
      { requestedPath, workspacePath },
      error instanceof Error ? error : new Error(String(error))
    );
    return {
      valid: false,
      error: "Invalid path",
    };
  }
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      omcBridgeAuth?: OmcBridgeAuthContext;
    }
  }
}
