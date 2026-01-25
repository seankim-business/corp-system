import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true,
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const message = isAppError ? err.message : "Internal server error";
  const isOperational = isAppError ? err.isOperational : false;

  logger.error(
    "Request error",
    {
      path: req.path,
      method: req.method,
      statusCode,
      message,
      isOperational,
      userId: (req as any).user?.id,
      organizationId: (req as any).organization?.id,
    },
    err,
  );

  if (process.env.NODE_ENV === "production" && !isOperational) {
    res.status(500).json({
      error: "Internal server error",
      message: "An unexpected error occurred",
    });
  } else {
    res.status(statusCode).json({
      error: message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
