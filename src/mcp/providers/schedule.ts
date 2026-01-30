/**
 * Schedule MCP Provider
 *
 * Provides MCP tools for managing scheduled tasks.
 * Agents can create, list, update, delete, pause, and resume scheduled tasks.
 */

import { MCPTool, CallContext, ToolCallResult } from "../types";
import {
  createScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  getScheduledTask,
  getScheduledTasksForOrg,
  enableScheduledTask,
  disableScheduledTask,
  getUpcomingSchedules,
  ScheduledTask,
  ScheduleConfig,
} from "../../services/scheduled-tasks";
import { scheduledTaskQueue } from "../../queue/scheduled-task.queue";
import { logger } from "../../utils/logger";

const TOOLS: MCPTool[] = [
  {
    name: "schedule__list",
    description: "List all scheduled tasks in the organization",
    inputSchema: {
      type: "object",
      properties: {
        enabled: {
          type: "boolean",
          description: "Filter by enabled status (optional)",
        },
        taskType: {
          type: "string",
          description: "Filter by task type (optional)",
          enum: ["workflow", "briefing", "report", "cleanup", "custom"],
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      properties: {
        schedules: {
          type: "array",
          items: { type: "object" },
        },
      },
    },
    provider: "schedule",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "schedule__get",
    description: "Get a specific scheduled task by ID",
    inputSchema: {
      type: "object",
      properties: {
        scheduleId: {
          type: "string",
          description: "The schedule ID to retrieve",
        },
      },
      required: ["scheduleId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        schedule: { type: "object" },
      },
    },
    provider: "schedule",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "schedule__create",
    description: "Create a new scheduled task",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Schedule name",
        },
        description: {
          type: "string",
          description: "Schedule description (optional)",
        },
        taskType: {
          type: "string",
          description: "Type of task to schedule",
          enum: ["workflow", "briefing", "report", "cleanup", "custom"],
        },
        workflowId: {
          type: "string",
          description: "Workflow ID (required for workflow taskType)",
        },
        frequency: {
          type: "string",
          description: "Schedule frequency",
          enum: ["hourly", "daily", "weekly", "monthly", "custom"],
        },
        cronExpression: {
          type: "string",
          description: "Cron expression (required for custom frequency)",
        },
        timezone: {
          type: "string",
          description: "Timezone (default UTC)",
        },
        hour: {
          type: "number",
          description: "Hour to run (0-23, for daily/weekly/monthly)",
        },
        minute: {
          type: "number",
          description: "Minute to run (0-59)",
        },
        dayOfWeek: {
          type: "number",
          description: "Day of week (0-6, for weekly)",
        },
        dayOfMonth: {
          type: "number",
          description: "Day of month (1-31, for monthly)",
        },
        payload: {
          type: "object",
          description: "Custom payload to pass to the task",
        },
        enabled: {
          type: "boolean",
          description: "Whether the schedule is enabled (default true)",
        },
      },
      required: ["name", "taskType", "frequency"],
    },
    outputSchema: {
      type: "object",
      properties: {
        schedule: { type: "object" },
      },
    },
    provider: "schedule",
    requiresAuth: false,
    permissions: {
      allowedAgents: ["all"],
      requiresApproval: {
        condition: "always",
        approver: "admin",
      },
    },
  },
  {
    name: "schedule__update",
    description: "Update an existing scheduled task",
    inputSchema: {
      type: "object",
      properties: {
        scheduleId: {
          type: "string",
          description: "The schedule ID to update",
        },
        name: {
          type: "string",
          description: "New schedule name (optional)",
        },
        description: {
          type: "string",
          description: "New description (optional)",
        },
        frequency: {
          type: "string",
          description: "New frequency (optional)",
          enum: ["hourly", "daily", "weekly", "monthly", "custom"],
        },
        cronExpression: {
          type: "string",
          description: "New cron expression (optional)",
        },
        timezone: {
          type: "string",
          description: "New timezone (optional)",
        },
        hour: {
          type: "number",
          description: "New hour (optional)",
        },
        minute: {
          type: "number",
          description: "New minute (optional)",
        },
        dayOfWeek: {
          type: "number",
          description: "New day of week (optional)",
        },
        dayOfMonth: {
          type: "number",
          description: "New day of month (optional)",
        },
        payload: {
          type: "object",
          description: "New payload (optional)",
        },
        enabled: {
          type: "boolean",
          description: "Enable/disable schedule (optional)",
        },
      },
      required: ["scheduleId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        schedule: { type: "object" },
      },
    },
    provider: "schedule",
    requiresAuth: false,
    permissions: {
      allowedAgents: ["all"],
      requiresApproval: {
        condition: "always",
        approver: "admin",
      },
    },
  },
  {
    name: "schedule__delete",
    description: "Delete a scheduled task",
    inputSchema: {
      type: "object",
      properties: {
        scheduleId: {
          type: "string",
          description: "The schedule ID to delete",
        },
      },
      required: ["scheduleId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
      },
    },
    provider: "schedule",
    requiresAuth: false,
    permissions: {
      allowedAgents: ["all"],
      requiresApproval: {
        condition: "always",
        approver: "admin",
      },
    },
  },
  {
    name: "schedule__pause",
    description: "Pause a scheduled task (disable it temporarily)",
    inputSchema: {
      type: "object",
      properties: {
        scheduleId: {
          type: "string",
          description: "The schedule ID to pause",
        },
      },
      required: ["scheduleId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
      },
    },
    provider: "schedule",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "schedule__resume",
    description: "Resume a paused scheduled task",
    inputSchema: {
      type: "object",
      properties: {
        scheduleId: {
          type: "string",
          description: "The schedule ID to resume",
        },
      },
      required: ["scheduleId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
      },
    },
    provider: "schedule",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "schedule__upcoming",
    description: "Get upcoming scheduled task runs",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of upcoming runs to return (default 10)",
        },
      },
      required: [],
    },
    outputSchema: {
      type: "object",
      properties: {
        upcoming: {
          type: "array",
          items: { type: "object" },
        },
      },
    },
    provider: "schedule",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
];

interface ListArgs {
  enabled?: boolean;
  taskType?: "workflow" | "briefing" | "report" | "cleanup" | "custom";
}

interface GetArgs {
  scheduleId: string;
}

interface CreateArgs {
  name: string;
  description?: string;
  taskType: "workflow" | "briefing" | "report" | "cleanup" | "custom";
  workflowId?: string;
  frequency: "hourly" | "daily" | "weekly" | "monthly" | "custom";
  cronExpression?: string;
  timezone?: string;
  hour?: number;
  minute?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  payload?: Record<string, unknown>;
  enabled?: boolean;
}

interface UpdateArgs {
  scheduleId: string;
  name?: string;
  description?: string;
  frequency?: "hourly" | "daily" | "weekly" | "monthly" | "custom";
  cronExpression?: string;
  timezone?: string;
  hour?: number;
  minute?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  payload?: Record<string, unknown>;
  enabled?: boolean;
}

interface DeleteArgs {
  scheduleId: string;
}

interface PauseResumeArgs {
  scheduleId: string;
}

interface UpcomingArgs {
  limit?: number;
}

export function createScheduleProvider() {
  return {
    name: "schedule",

    getTools(): MCPTool[] {
      return TOOLS;
    },

    async executeTool(
      toolName: string,
      args: Record<string, unknown>,
      context: CallContext,
    ): Promise<ToolCallResult> {
      const startTime = Date.now();

      try {
        let result: unknown;
        const actualToolName = toolName.replace("schedule__", "");

        switch (actualToolName) {
          case "list":
            result = await listSchedules(args as any, context.organizationId);
            break;
          case "get":
            result = await getSchedule(args as any, context.organizationId);
            break;
          case "create":
            result = await createSchedule(args as any, context);
            break;
          case "update":
            result = await updateSchedule(args as any, context.organizationId);
            break;
          case "delete":
            result = await deleteSchedule(args as any, context.organizationId);
            break;
          case "pause":
            result = await pauseSchedule(args as any, context.organizationId);
            break;
          case "resume":
            result = await resumeSchedule(args as any, context.organizationId);
            break;
          case "upcoming":
            result = await getUpcoming(args as any, context.organizationId);
            break;
          default:
            throw new Error(`Unknown tool: ${toolName}`);
        }

        return {
          success: true,
          data: result,
          metadata: {
            duration: Date.now() - startTime,
            cached: false,
          },
        };
      } catch (error) {
        logger.error(
          "Schedule tool execution failed",
          { toolName, organizationId: context.organizationId },
          error as Error,
        );
        return {
          success: false,
          error: {
            code: "EXECUTION_ERROR",
            message: (error as Error).message,
          },
          metadata: {
            duration: Date.now() - startTime,
            cached: false,
          },
        };
      }
    },
  };
}

async function listSchedules(
  args: ListArgs,
  organizationId: string,
): Promise<{ schedules: ScheduledTask[] }> {
  const { enabled, taskType } = args;

  let schedules = await getScheduledTasksForOrg(organizationId);
  const activeSchedules = await scheduledTaskQueue.getActiveSchedules();

  // Apply filters
  if (enabled !== undefined) {
    schedules = schedules.filter((s) => s.enabled === enabled);
  }
  if (taskType) {
    schedules = schedules.filter((s) => s.taskType === taskType);
  }

  // Enhance with next run time from BullMQ
  const schedulesWithStatus = schedules.map((schedule) => {
    const bullSchedule = activeSchedules.find((s) => s.id === `sched-${schedule.id}`);
    return {
      ...schedule,
      nextRun: bullSchedule?.next || schedule.nextRun,
      status: schedule.enabled ? "active" : "paused",
    };
  });

  return { schedules: schedulesWithStatus };
}

async function getSchedule(
  args: GetArgs,
  organizationId: string,
): Promise<{ schedule: ScheduledTask & { status: string } }> {
  const { scheduleId } = args;

  const schedule = await getScheduledTask(organizationId, scheduleId);

  if (!schedule) {
    throw new Error("Schedule not found");
  }

  const activeSchedules = await scheduledTaskQueue.getActiveSchedules();
  const bullSchedule = activeSchedules.find((s) => s.id === `sched-${schedule.id}`);

  return {
    schedule: {
      ...schedule,
      nextRun: bullSchedule?.next || schedule.nextRun,
      status: schedule.enabled ? "active" : "paused",
    },
  };
}

async function createSchedule(
  args: CreateArgs,
  context: CallContext,
): Promise<{ schedule: ScheduledTask }> {
  const {
    name,
    description,
    taskType,
    workflowId,
    frequency,
    cronExpression,
    timezone = "UTC",
    hour,
    minute,
    dayOfWeek,
    dayOfMonth,
    payload = {},
    enabled = true,
  } = args;

  // Validate workflow exists if workflowId provided
  if (taskType === "workflow" && workflowId) {
    const { db: prisma } = await import("../../db/client");
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: workflowId,
        organizationId: context.organizationId,
      },
    });

    if (!workflow) {
      throw new Error("Workflow not found");
    }
  }

  // Validate cron expression for custom frequency
  if (frequency === "custom" && !cronExpression) {
    throw new Error("cronExpression is required for custom frequency");
  }

  const config: ScheduleConfig = {
    frequency,
    cronExpression,
    timezone,
    hour,
    minute,
    dayOfWeek,
    dayOfMonth,
  };

  const schedule = await createScheduledTask(context.organizationId, {
    name,
    description,
    taskType,
    workflowId,
    config,
    payload,
    enabled,
    createdBy: context.userId,
  });

  logger.info("Schedule created via MCP", {
    scheduleId: schedule.id,
    organizationId: context.organizationId,
    taskType,
    agentId: context.agentId,
  });

  return { schedule };
}

async function updateSchedule(
  args: UpdateArgs,
  organizationId: string,
): Promise<{ schedule: ScheduledTask }> {
  const {
    scheduleId,
    name,
    description,
    frequency,
    cronExpression,
    timezone,
    hour,
    minute,
    dayOfWeek,
    dayOfMonth,
    payload,
    enabled,
  } = args;

  // Build config updates if any schedule config fields provided
  const hasConfigUpdates =
    frequency !== undefined ||
    cronExpression !== undefined ||
    timezone !== undefined ||
    hour !== undefined ||
    minute !== undefined ||
    dayOfWeek !== undefined ||
    dayOfMonth !== undefined;

  const existing = await getScheduledTask(organizationId, scheduleId);
  if (!existing) {
    throw new Error("Schedule not found");
  }

  // Validate cron expression if switching to custom
  if (frequency === "custom" && !cronExpression && !existing.config.cronExpression) {
    throw new Error("cronExpression is required for custom frequency");
  }

  const updates: any = {};

  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (payload !== undefined) updates.payload = payload;
  if (enabled !== undefined) updates.enabled = enabled;

  if (hasConfigUpdates) {
    updates.config = {
      ...existing.config,
      ...(frequency !== undefined && { frequency }),
      ...(cronExpression !== undefined && { cronExpression }),
      ...(timezone !== undefined && { timezone }),
      ...(hour !== undefined && { hour }),
      ...(minute !== undefined && { minute }),
      ...(dayOfWeek !== undefined && { dayOfWeek }),
      ...(dayOfMonth !== undefined && { dayOfMonth }),
    };
  }

  const schedule = await updateScheduledTask(organizationId, scheduleId, updates);

  if (!schedule) {
    throw new Error("Failed to update schedule");
  }

  logger.info("Schedule updated via MCP", {
    scheduleId,
    organizationId,
  });

  return { schedule };
}

async function deleteSchedule(
  args: DeleteArgs,
  organizationId: string,
): Promise<{ success: boolean }> {
  const { scheduleId } = args;

  const success = await deleteScheduledTask(organizationId, scheduleId);

  if (!success) {
    throw new Error("Schedule not found");
  }

  logger.info("Schedule deleted via MCP", {
    scheduleId,
    organizationId,
  });

  return { success: true };
}

async function pauseSchedule(
  args: PauseResumeArgs,
  organizationId: string,
): Promise<{ success: boolean }> {
  const { scheduleId } = args;

  const success = await disableScheduledTask(organizationId, scheduleId);

  if (!success) {
    throw new Error("Schedule not found or already paused");
  }

  logger.info("Schedule paused via MCP", {
    scheduleId,
    organizationId,
  });

  return { success: true };
}

async function resumeSchedule(
  args: PauseResumeArgs,
  organizationId: string,
): Promise<{ success: boolean }> {
  const { scheduleId } = args;

  const success = await enableScheduledTask(organizationId, scheduleId);

  if (!success) {
    throw new Error("Schedule not found or already active");
  }

  logger.info("Schedule resumed via MCP", {
    scheduleId,
    organizationId,
  });

  return { success: true };
}

async function getUpcoming(
  args: UpcomingArgs,
  organizationId: string,
): Promise<{ upcoming: Array<{ task: ScheduledTask; nextRun: Date }> }> {
  const { limit = 10 } = args;

  const upcoming = await getUpcomingSchedules(organizationId, Math.min(limit, 50));

  return { upcoming };
}
