import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../../db/client";
import { logger } from "../../utils/logger";
import { n8nProvisioner } from "../../services/n8n/instance-provisioner";
import "../../admin/middleware/admin-auth"; // Import for type augmentation

const router = Router();

// Require admin role middleware
const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.adminUser || !['super_admin', 'support', 'analyst'].includes(req.adminUser.role)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  return next();
};

// GET /api/admin/n8n-instances - List all n8n instances
router.get("/", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const instances = await n8nProvisioner.listInstances();
    return res.json({ data: instances });
  } catch (error) {
    logger.error("Failed to list n8n instances", { error });
    return res.status(500).json({ error: "Failed to list instances" });
  }
});

// GET /api/admin/n8n-instances/organizations/available - List orgs without n8n
router.get("/organizations/available", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const orgsWithN8n = await db.n8nInstance.findMany({
      select: { organizationId: true },
    });
    const orgIdsWithN8n = orgsWithN8n.map((i: any) => i.organizationId);

    const availableOrgs = await db.organization.findMany({
      where: { id: { notIn: orgIdsWithN8n } },
      select: { id: true, name: true, slug: true },
    });

    return res.json({ data: availableOrgs });
  } catch (error) {
    logger.error("Failed to list available organizations", { error });
    return res.status(500).json({ error: "Failed to list organizations" });
  }
});

// GET /api/admin/n8n-instances/:id - Get instance details
router.get("/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const instanceId = String(req.params.id);
    const instance = await db.n8nInstance.findUnique({
      where: { id: instanceId },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        _count: { select: { workflows: true, credentials: true } },
      },
    });

    if (!instance) {
      return res.status(404).json({ error: "Instance not found" });
    }

    return res.json(instance);
  } catch (error) {
    logger.error("Failed to get n8n instance", { error });
    return res.status(500).json({ error: "Failed to get instance" });
  }
});

// POST /api/admin/n8n-instances - Provision new instance
const ProvisionSchema = z.object({
  organizationId: z.string().uuid(),
});

router.post("/", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { organizationId } = ProvisionSchema.parse(req.body);

    // Get org slug
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, slug: true, name: true },
    });

    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    const result = await n8nProvisioner.provisionInstance({
      organizationId,
      orgSlug: org.slug,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    logger.info("N8n instance provisioned via admin API", {
      instanceId: result.instanceId,
      organizationId
    });

    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    logger.error("Failed to provision n8n instance", { error });
    return res.status(500).json({ error: "Failed to provision instance" });
  }
});

// POST /api/admin/n8n-instances/:id/health-check - Trigger health check
router.post("/:id/health-check", requireAdmin, async (req: Request, res: Response) => {
  try {
    const instanceId = String(req.params.id);
    const isHealthy = await n8nProvisioner.performHealthCheck(instanceId);
    return res.json({ healthy: isHealthy });
  } catch (error) {
    logger.error("Failed to perform health check", { error });
    return res.status(500).json({ error: "Failed to perform health check" });
  }
});

// POST /api/admin/n8n-instances/:id/stop - Stop instance
router.post("/:id/stop", requireAdmin, async (req: Request, res: Response) => {
  try {
    const instanceId = String(req.params.id);
    await n8nProvisioner.stopInstance(instanceId);
    return res.json({ success: true });
  } catch (error) {
    logger.error("Failed to stop n8n instance", { error });
    return res.status(500).json({ error: "Failed to stop instance" });
  }
});

// DELETE /api/admin/n8n-instances/:id - Deprovision instance
router.delete("/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const instanceId = String(req.params.id);
    await n8nProvisioner.deprovisionInstance(instanceId);
    logger.info("N8n instance deprovisioned via admin API", { instanceId });
    return res.status(204).send();
  } catch (error) {
    logger.error("Failed to deprovision n8n instance", { error });
    return res.status(500).json({ error: "Failed to deprovision instance" });
  }
});

export default router;
