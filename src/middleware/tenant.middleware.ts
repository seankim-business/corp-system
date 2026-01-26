import { Request, Response, NextFunction } from "express";
import { db } from "../db/client";

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
    console.error("Tenant resolution error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
