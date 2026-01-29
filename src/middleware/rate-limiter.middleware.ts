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
  max: 300, // Increased from 100 for better SPA UX
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

export const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: "Too many webhook requests" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const orgId = (req as any).user?.organizationId;
    return orgId || req.ip || "unknown";
  },
  handler: createRateLimitHandler("webhook"),
});

export const sidecarRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  message: { error: "Too many sidecar requests" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: () => "sidecar",
  handler: createRateLimitHandler("sidecar"),
});

export const gdprExportRateLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 1,
  message: { error: "Data export limit reached. You can export your data once per 24 hours." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as any).user?.id;
    return userId ? `gdpr-export:${userId}` : req.ip || "unknown";
  },
  handler: createRateLimitHandler("data export"),
});

export const gdprDeleteRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: "Too many account deletion attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as any).user?.id;
    return userId ? `gdpr-delete:${userId}` : req.ip || "unknown";
  },
  handler: createRateLimitHandler("account deletion"),
});
