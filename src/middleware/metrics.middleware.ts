import { Request, Response, NextFunction } from "express";
import { recordHttpRequest } from "../services/metrics";

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    recordHttpRequest({
      method: req.method,
      path: req.route?.path || req.path,
      statusCode: res.statusCode,
      duration,
    });
  });

  next();
}
