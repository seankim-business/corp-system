import { Request } from "express";
import { db } from "../db/client";
import { logger } from "../utils/logger";

export interface SessionContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface HijackingCheckResult {
  isValid: boolean;
  mismatchType?: "ip_mismatch" | "user_agent_mismatch" | "both";
  shouldBlock: boolean;
  reason?: string;
}

export class SessionHijackingService {
  private mode: "warn" | "block" =
    (process.env.SESSION_HIJACKING_MODE as "warn" | "block") || "warn";

  extractSessionContext(req: Request): SessionContext {
    const ipAddress = this.extractIpAddress(req);
    const userAgent = req.get("user-agent");

    return {
      ipAddress,
      userAgent,
    };
  }

  private extractIpAddress(req: Request): string | undefined {
    const xForwardedFor = req.get("x-forwarded-for");
    if (xForwardedFor) {
      return xForwardedFor.split(",")[0].trim();
    }
    return req.ip || req.socket.remoteAddress;
  }

  async checkSessionValidity(
    sessionId: string,
    userId: string,
    organizationId: string,
    currentContext: SessionContext,
    storedContext: SessionContext,
  ): Promise<HijackingCheckResult> {
    const mismatches: string[] = [];
    let mismatchType: "ip_mismatch" | "user_agent_mismatch" | "both" | undefined;

    const ipMismatch =
      storedContext.ipAddress && storedContext.ipAddress !== currentContext.ipAddress;
    const userAgentMismatch =
      storedContext.userAgent && storedContext.userAgent !== currentContext.userAgent;

    if (ipMismatch) {
      mismatches.push("ip");
    }
    if (userAgentMismatch) {
      mismatches.push("user_agent");
    }

    if (mismatches.length === 0) {
      return { isValid: true, shouldBlock: false };
    }

    if (mismatches.length === 2) {
      mismatchType = "both";
    } else if (ipMismatch) {
      mismatchType = "ip_mismatch";
    } else {
      mismatchType = "user_agent_mismatch";
    }

    const shouldBlock = this.mode === "block";

    await this.logHijackingAttempt({
      sessionId,
      userId,
      organizationId,
      mismatchType,
      originalIp: storedContext.ipAddress,
      attemptedIp: currentContext.ipAddress,
      originalAgent: storedContext.userAgent,
      attemptedAgent: currentContext.userAgent,
      blocked: shouldBlock,
    });

    const reason = `Session ${mismatchType} detected. Expected: ${mismatches.map((m) => `${m}=${m === "ip" ? storedContext.ipAddress : storedContext.userAgent}`).join(", ")}`;

    logger.warn("Session hijacking attempt detected", {
      userId,
      sessionId,
      mismatchType,
      expectedIp: storedContext.ipAddress,
      actualIp: currentContext.ipAddress,
      mode: this.mode,
    });

    return {
      isValid: !shouldBlock,
      mismatchType,
      shouldBlock,
      reason,
    };
  }

  private async logHijackingAttempt(data: {
    sessionId: string;
    userId: string;
    organizationId: string;
    mismatchType: string;
    originalIp?: string;
    attemptedIp?: string;
    originalAgent?: string;
    attemptedAgent?: string;
    blocked: boolean;
  }) {
    try {
      await db.sessionHijackingAttempt.create({
        data: {
          sessionId: data.sessionId,
          userId: data.userId,
          organizationId: data.organizationId,
          type: data.mismatchType,
          mismatchType: data.mismatchType,
          originalIp: data.originalIp,
          attemptedIp: data.attemptedIp,
          originalAgent: data.originalAgent,
          attemptedAgent: data.attemptedAgent,
          blocked: data.blocked,
        },
      });
    } catch (error) {
      logger.error(
        "Failed to log hijacking attempt",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  setMode(mode: "warn" | "block") {
    this.mode = mode;
  }

  getMode(): "warn" | "block" {
    return this.mode;
  }
}

export const sessionHijackingService = new SessionHijackingService();
