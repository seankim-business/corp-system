import * as Sentry from "@sentry/node";
import { Request, Response, NextFunction } from "express";
import { setSentryUser } from "../services/sentry";

export function sentryRequestHandler() {
  const handlers = (Sentry as any).Handlers;
  if (handlers?.requestHandler) {
    return handlers.requestHandler({
      user: ["id", "email"],
    });
  }

  return (_req: Request, _res: Response, next: NextFunction) => next();
}

export function sentryTracingHandler() {
  const handlers = (Sentry as any).Handlers;
  if (handlers?.tracingHandler) {
    return handlers.tracingHandler();
  }

  return (_req: Request, _res: Response, next: NextFunction) => next();
}

export function sentryErrorHandler() {
  const handlers = (Sentry as any).Handlers;
  if (handlers?.errorHandler) {
    return handlers.errorHandler({
      shouldHandleError() {
        return true;
      },
    });
  }

  return (err: Error, _req: Request, _res: Response, next: NextFunction) => next(err);
}

export function sentryUserContext(req: Request, _res: Response, next: NextFunction) {
  const user = (req as any).user;
  const organizationId = (req as any).currentOrganizationId;

  if (user && organizationId) {
    setSentryUser(user.id, organizationId, user.email);
  }

  next();
}
