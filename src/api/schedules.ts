import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { validate, uuidParamSchema } from "../middleware/validation.middleware";
import { z } from "zod";
import {
  createScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  getScheduledTask,
  getScheduledTasksForOrg,
} from "../services/scheduled-tasks";
import { scheduledTaskQueue } from "../queue/scheduled-task.queue";
import { logger } from "../utils/logger";
import { createAuditLog } from "../services/audit-logger";

const router = Router();

// Validation schemas
const scheduleFrequencySchema = z.enum(["hourly", "daily", "weekly", "monthly", "custom"]);

const scheduleConfigSchema = z.object({
  frequency: scheduleFrequencySchema,
  cronExpression: z.string().optional(),
  timezone: z.string().default("UTC"),
  hour: z.number().int().min(0).max(23).optional(),
  minute: z.number().int().min(0).max(59).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
});

const createScheduleSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  taskType: z.enum(["workflow", "briefing", "report", "cleanup", "custom"]),
  workflowId: z.string().uuid().optional(),
  config: scheduleConfigSchema,
  payload: z.record(z.unknown()).default({}),
  enabled: z.boolean().default(true),
});

const updateScheduleSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  config: scheduleConfigSchema.optional(),
  payload: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;

// GET /api/schedules - List all schedules for current organization
router.get(
  "/schedules",
  requireAuth,
  requirePermission(Permission.WORKFLOW_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;

      const schedules = await getScheduledTasksForOrg(organizationId);
      const activeSchedules = await scheduledTaskQueue.getActiveSchedules();

      // Enhance schedules with next run time from BullMQ
      const schedulesWithStatus = schedules.map((schedule) => {
        const bullSchedule = activeSchedules.find((s) => s.id === `sched-${schedule.id}`);
        return {
          ...schedule,
          nextRun: bullSchedule?.next || schedule.nextRun,
          status: schedule.enabled ? "active" : "paused",
        };
      });

      logger.info("Fetched schedules", {
        organizationId,
        userId,
        count: schedulesWithStatus.length,
      });

      return res.json({ schedules: schedulesWithStatus });
    } catch (error) {
      logger.error(
        "List schedules error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to fetch schedules" });
    }
  },
);

// GET /api/schedules/:id - Get single schedule
router.get(
  "/schedules/:id",
  requireAuth,
  requirePermission(Permission.WORKFLOW_READ),
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const scheduleId = String(req.params.id);

      const schedule = await getScheduledTask(organizationId, scheduleId);

      if (!schedule) {
        return res.status(404).json({ error: "Schedule not found" });
      }

      const activeSchedules = await scheduledTaskQueue.getActiveSchedules();
      const bullSchedule = activeSchedules.find((s) => s.id === `sched-${schedule.id}`);

      logger.info("Fetched schedule", {
        organizationId,
        userId,
        scheduleId,
      });

      return res.json({
        schedule: {
          ...schedule,
          nextRun: bullSchedule?.next || schedule.nextRun,
          status: schedule.enabled ? "active" : "paused",
        },
      });
    } catch (error) {
      logger.error(
        "Get schedule error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to fetch schedule" });
    }
  },
);

// POST /api/schedules - Create new schedule
router.post(
  "/schedules",
  requireAuth,
  requirePermission(Permission.WORKFLOW_CREATE),
  validate({ body: createScheduleSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const data = req.body as CreateScheduleInput;

      // Validate workflow exists if workflowId provided
      if (data.workflowId) {
        const { db } = await import("../db/client");
        const workflow = await db.workflow.findFirst({
          where: {
            id: data.workflowId,
            organizationId,
          },
        });

        if (!workflow) {
          return res.status(404).json({ error: "Workflow not found" });
        }
      }

      // Validate cron expression if custom frequency
      if (data.config.frequency === "custom" && !data.config.cronExpression) {
        return res
          .status(400)
          .json({ error: "cronExpression is required for custom frequency" });
      }

      const schedule = await createScheduledTask(organizationId, {
        name: data.name,
        description: data.description,
        taskType: data.taskType,
        workflowId: data.workflowId,
        config: data.config,
        payload: data.payload,
        enabled: data.enabled,
        createdBy: userId,
      });

      await createAuditLog({
        organizationId,
        action: "schedule.created",
        userId,
        resourceType: "Schedule",
        resourceId: schedule.id,
        details: {
          name: data.name,
          taskType: data.taskType,
          frequency: data.config.frequency,
        },
      });

      logger.info("Created schedule", {
        organizationId,
        userId,
        scheduleId: schedule.id,
        name: data.name,
      });

      return res.status(201).json({ schedule });
    } catch (error) {
      logger.error(
        "Create schedule error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to create schedule" });
    }
  },
);

// PATCH /api/schedules/:id - Update schedule
router.patch(
  "/schedules/:id",
  requireAuth,
  requirePermission(Permission.WORKFLOW_UPDATE),
  validate({ params: uuidParamSchema, body: updateScheduleSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const scheduleId = String(req.params.id);
      const updates = req.body as UpdateScheduleInput;

      // Check ownership
      const existing = await getScheduledTask(organizationId, scheduleId);
      if (!existing) {
        return res.status(404).json({ error: "Schedule not found" });
      }

      // Validate at least one field provided
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "At least one field must be provided" });
      }

      // Validate cron expression if custom frequency
      if (
        updates.config?.frequency === "custom" &&
        !updates.config.cronExpression &&
        !existing.config.cronExpression
      ) {
        return res
          .status(400)
          .json({ error: "cronExpression is required for custom frequency" });
      }

      const schedule = await updateScheduledTask(organizationId, scheduleId, updates);

      if (!schedule) {
        return res.status(404).json({ error: "Schedule not found" });
      }

      await createAuditLog({
        organizationId,
        action: "schedule.updated",
        userId,
        resourceType: "Schedule",
        resourceId: schedule.id,
        details: {
          updates: Object.keys(updates),
          enabled: schedule.enabled,
        },
      });

      logger.info("Updated schedule", {
        organizationId,
        userId,
        scheduleId,
        updates: Object.keys(updates),
      });

      return res.json({ schedule });
    } catch (error) {
      logger.error(
        "Update schedule error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to update schedule" });
    }
  },
);

// DELETE /api/schedules/:id - Delete schedule
router.delete(
  "/schedules/:id",
  requireAuth,
  requirePermission(Permission.WORKFLOW_DELETE),
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId, id: userId } = req.user!;
      const scheduleId = String(req.params.id);

      // Check ownership
      const existing = await getScheduledTask(organizationId, scheduleId);
      if (!existing) {
        return res.status(404).json({ error: "Schedule not found" });
      }

      const success = await deleteScheduledTask(organizationId, scheduleId);

      if (!success) {
        return res.status(404).json({ error: "Schedule not found" });
      }

      await createAuditLog({
        organizationId,
        action: "schedule.deleted",
        userId,
        resourceType: "Schedule",
        resourceId: scheduleId,
        details: {
          name: existing.name,
          taskType: existing.taskType,
        },
      });

      logger.info("Deleted schedule", {
        organizationId,
        userId,
        scheduleId,
      });

      return res.status(204).send();
    } catch (error) {
      logger.error(
        "Delete schedule error",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ error: "Failed to delete schedule" });
    }
  },
);

export default router;
