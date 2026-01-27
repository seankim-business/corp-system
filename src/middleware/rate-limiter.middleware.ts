import rateLimit from "express-rate-limit";
import { Request, Response } from "express";

const createRateLimitHandler = (type: string) => (_req: Request, res: Response) => {
  res.status(429).json({
    error: "Too many requests",
    message: `Rate limit exceeded for ${type}. Please try again later.`,
    retryAfter: res.getHeader("Retry-After"),
  });
};

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: "Too many authentication attempts" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || "unknown",
  handler: createRateLimitHandler("authentication"),
});

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: "Too many API requests" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as any).user?.id;
    const orgId = (req as any).user?.organizationId;
    return userId ? `${orgId}:${userId}` : req.ip || "unknown";
  },
  handler: createRateLimitHandler("API"),
});

export const strictRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many requests for this operation" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as any).user?.id;
    return userId || req.ip || "unknown";
  },
  handler: createRateLimitHandler("sensitive operation"),
});

export const workflowExecuteRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: "Too many workflow executions" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const orgId = (req as any).user?.organizationId;
    return orgId || req.ip || "unknown";
  },
  handler: createRateLimitHandler("workflow execution"),
});
