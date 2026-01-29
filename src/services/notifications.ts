import { withQueueConnection } from "../db/redis";
import { logger } from "../utils/logger";

/**
 * Notification types
 */
export type NotificationType =
  | "job_completed"
  | "job_failed"
  | "approval_required"
  | "approval_response"
  | "budget_warning"
  | "budget_exhausted"
  | "system_alert"
  | "agent_error"
  | "mention"
  | "task_update"
  | "workflow_update";

/**
 * Notification priority levels
 */
export type NotificationPriority = "low" | "normal" | "high" | "urgent";

/**
 * Notification payload
 */
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  timestamp: number;
  organizationId: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  actionUrl?: string;
  dismissible?: boolean;
  expiresAt?: number;
}

/**
 * Notification creation options
 */
export interface CreateNotificationOptions {
  type: NotificationType;
  title: string;
  message: string;
  organizationId: string;
  userId?: string;
  priority?: NotificationPriority;
  metadata?: Record<string, unknown>;
  actionUrl?: string;
  dismissible?: boolean;
  ttlSeconds?: number;
}

/**
 * Generate unique notification ID
 */
function generateNotificationId(): string {
  return `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create and emit a notification
 */
export async function createNotification(options: CreateNotificationOptions): Promise<Notification> {
  const notification: Notification = {
    id: generateNotificationId(),
    type: options.type,
    title: options.title,
    message: options.message,
    priority: options.priority || "normal",
    timestamp: Date.now(),
    organizationId: options.organizationId,
    userId: options.userId,
    metadata: options.metadata,
    actionUrl: options.actionUrl,
    dismissible: options.dismissible ?? true,
    expiresAt: options.ttlSeconds ? Date.now() + options.ttlSeconds * 1000 : undefined,
  };

  // Emit to SSE via Redis pub/sub
  await emitNotification(notification);

  logger.info("Notification created", {
    notificationId: notification.id,
    type: notification.type,
    priority: notification.priority,
    organizationId: notification.organizationId,
    userId: notification.userId,
  });

  return notification;
}

/**
 * Emit notification to Redis pub/sub for SSE delivery
 */
async function emitNotification(notification: Notification): Promise<void> {
  try {
    await withQueueConnection(async (client) => {
      await client.publish("notifications", JSON.stringify(notification));
    });
  } catch (error) {
    logger.error("Failed to emit notification", {
      notificationId: notification.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// =============================================================================
// Convenience Functions for Common Notifications
// =============================================================================

/**
 * Send job completion notification
 */
export async function notifyJobCompleted(
  organizationId: string,
  jobId: string,
  jobType: string,
  result: string,
  userId?: string,
): Promise<Notification> {
  return createNotification({
    type: "job_completed",
    title: `${jobType} Completed`,
    message: result,
    organizationId,
    userId,
    priority: "normal",
    metadata: { jobId, jobType },
    dismissible: true,
  });
}

/**
 * Send job failure notification
 */
export async function notifyJobFailed(
  organizationId: string,
  jobId: string,
  jobType: string,
  error: string,
  userId?: string,
): Promise<Notification> {
  return createNotification({
    type: "job_failed",
    title: `${jobType} Failed`,
    message: error,
    organizationId,
    userId,
    priority: "high",
    metadata: { jobId, jobType, error },
    dismissible: true,
  });
}

/**
 * Send approval required notification
 */
export async function notifyApprovalRequired(
  organizationId: string,
  approverId: string,
  approvalId: string,
  title: string,
  description: string,
): Promise<Notification> {
  return createNotification({
    type: "approval_required",
    title: "Approval Required",
    message: `${title}: ${description}`,
    organizationId,
    userId: approverId,
    priority: "high",
    metadata: { approvalId, originalTitle: title },
    actionUrl: `/approvals/${approvalId}`,
    dismissible: false,
  });
}

/**
 * Send approval response notification
 */
export async function notifyApprovalResponse(
  organizationId: string,
  requesterId: string,
  approvalId: string,
  approved: boolean,
  responderName: string,
): Promise<Notification> {
  return createNotification({
    type: "approval_response",
    title: approved ? "Request Approved" : "Request Rejected",
    message: `Your request was ${approved ? "approved" : "rejected"} by ${responderName}`,
    organizationId,
    userId: requesterId,
    priority: "normal",
    metadata: { approvalId, approved, responderName },
    dismissible: true,
  });
}

/**
 * Send budget warning notification
 */
export async function notifyBudgetWarning(
  organizationId: string,
  percentUsed: number,
  remainingCents: number,
): Promise<Notification> {
  return createNotification({
    type: "budget_warning",
    title: "Budget Warning",
    message: `Your organization has used ${percentUsed}% of its budget. $${(remainingCents / 100).toFixed(2)} remaining.`,
    organizationId,
    priority: "high",
    metadata: { percentUsed, remainingCents },
    actionUrl: "/settings/billing",
    dismissible: true,
  });
}

/**
 * Send budget exhausted notification
 */
export async function notifyBudgetExhausted(organizationId: string): Promise<Notification> {
  return createNotification({
    type: "budget_exhausted",
    title: "Budget Exhausted",
    message: "Your organization budget has been exhausted. Please increase your budget to continue using Nubabel.",
    organizationId,
    priority: "urgent",
    metadata: {},
    actionUrl: "/settings/billing",
    dismissible: false,
  });
}

/**
 * Send system alert notification
 */
export async function notifySystemAlert(
  organizationId: string,
  alertTitle: string,
  alertMessage: string,
  severity: "info" | "warning" | "error" = "info",
): Promise<Notification> {
  const priorityMap: Record<string, NotificationPriority> = {
    info: "low",
    warning: "normal",
    error: "high",
  };

  return createNotification({
    type: "system_alert",
    title: alertTitle,
    message: alertMessage,
    organizationId,
    priority: priorityMap[severity],
    metadata: { severity },
    dismissible: severity !== "error",
  });
}

/**
 * Send agent error notification
 */
export async function notifyAgentError(
  organizationId: string,
  agentId: string,
  errorMessage: string,
  userId?: string,
): Promise<Notification> {
  return createNotification({
    type: "agent_error",
    title: "Agent Error",
    message: `Agent ${agentId} encountered an error: ${errorMessage}`,
    organizationId,
    userId,
    priority: "high",
    metadata: { agentId, error: errorMessage },
    dismissible: true,
  });
}

/**
 * Send task update notification
 */
export async function notifyTaskUpdate(
  organizationId: string,
  taskId: string,
  taskTitle: string,
  updateType: "created" | "updated" | "completed" | "deleted",
  userId?: string,
): Promise<Notification> {
  const messages: Record<string, string> = {
    created: `Task "${taskTitle}" was created`,
    updated: `Task "${taskTitle}" was updated`,
    completed: `Task "${taskTitle}" was completed`,
    deleted: `Task "${taskTitle}" was deleted`,
  };

  return createNotification({
    type: "task_update",
    title: "Task Update",
    message: messages[updateType],
    organizationId,
    userId,
    priority: "low",
    metadata: { taskId, taskTitle, updateType },
    dismissible: true,
  });
}

/**
 * Send workflow update notification
 */
export async function notifyWorkflowUpdate(
  organizationId: string,
  workflowId: string,
  workflowName: string,
  status: "started" | "completed" | "failed" | "paused",
  userId?: string,
): Promise<Notification> {
  const priorityMap: Record<string, NotificationPriority> = {
    started: "low",
    completed: "normal",
    failed: "high",
    paused: "normal",
  };

  return createNotification({
    type: "workflow_update",
    title: `Workflow ${status.charAt(0).toUpperCase() + status.slice(1)}`,
    message: `Workflow "${workflowName}" ${status}`,
    organizationId,
    userId,
    priority: priorityMap[status],
    metadata: { workflowId, workflowName, status },
    dismissible: true,
  });
}
