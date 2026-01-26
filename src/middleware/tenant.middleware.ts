import { Request, Response, NextFunction } from "express";
import { db } from "../db/client";
import { logger } from "../utils/logger";

export async function resolveTenant(req: Request, res: Response, next: NextFunction) {
  try {
    const subdomain = req.hostname.split(".")[0];
    const baseDomain = process.env.BASE_DOMAIN || "kyndof-corp.com";

    const reservedSubdomains = new Set(["www", "auth", "app", baseDomain.split(".")[0]]);

    if (reservedSubdomains.has(subdomain)) {
      req.organization = null;
      return next();
    }

    const organization = await db.organization.findUnique({
      where: { slug: subdomain },
    });

    if (!organization) {
      return res.status(404).json({ error: "Organization not found" });
    }

    req.organization = organization;
    next();
  } catch (error) {
    logger.error(
      "Tenant resolution error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({ error: "Internal server error" });
  }
}
