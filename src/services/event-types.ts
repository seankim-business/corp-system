import { sseManager } from "../api/sse";
import { logger } from "../utils/logger";

// ---------------------------------------------------------------------------
// Event type union
// ---------------------------------------------------------------------------

export type EventType =
  | "job:started"
  | "job:completed"
  | "job:failed"
  | "job:progress"
  | "status:change"
  | "notification"
  | "approval:request"
  | "approval:response"
  | "session:update"
  | "error";

// ---------------------------------------------------------------------------
// Payload interfaces
// ---------------------------------------------------------------------------

export interface JobEventPayload {
  jobId: string;
  sessionId: string;
  skillId?: string;
  status: string;
  timestamp: string;
}

export interface ProgressEventPayload {
  jobId: string;
  sessionId: string;
  progress: number; // 0–100
  message?: string;
  timestamp: string;
}

export interface StatusChangePayload {
  entityType: string;
  entityId: string;
  oldStatus: string;
  newStatus: string;
  changedBy?: string;
  timestamp: string;
}

export interface NotificationPayload {
  userId: string;
  title: string;
  body: string;
  priority: "low" | "medium" | "high" | "critical";
  actionUrl?: string;
  timestamp: string;
}

export interface ApprovalPayload {
  approvalId: string;
  description: string;
  requestedBy: string;
  expiresAt: string;
  status: string;
}

export interface SessionUpdatePayload {
  sessionId: string;
  status: string;
  data?: unknown;
  timestamp: string;
}

export interface ErrorEventPayload {
  code: string;
  message: string;
  source: string;
  sessionId?: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function now(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Emitter functions
// ---------------------------------------------------------------------------

export function emitJobStarted(
  orgId: string,
  payload: Omit<JobEventPayload, "status" | "timestamp">,
): void {
  const event: EventType = "job:started";
  const data: JobEventPayload = { ...payload, status: "started", timestamp: now() };
  logger.debug("SSE emit", { event, orgId, jobId: payload.jobId });
  sseManager.sendToOrganization(orgId, event, data);
}

export function emitJobCompleted(
  orgId: string,
  payload: Omit<JobEventPayload, "status" | "timestamp">,
): void {
  const event: EventType = "job:completed";
  const data: JobEventPayload = { ...payload, status: "completed", timestamp: now() };
  logger.debug("SSE emit", { event, orgId, jobId: payload.jobId });
  sseManager.sendToOrganization(orgId, event, data);
}

export function emitJobFailed(
  orgId: string,
  payload: Omit<JobEventPayload, "status" | "timestamp"> & { error?: string },
): void {
  const event: EventType = "job:failed";
  const { error: errorMsg, ...rest } = payload;
  const data: JobEventPayload & { error?: string } = {
    ...rest,
    status: "failed",
    timestamp: now(),
    ...(errorMsg !== undefined ? { error: errorMsg } : {}),
  };
  logger.debug("SSE emit", { event, orgId, jobId: payload.jobId });
  sseManager.sendToOrganization(orgId, event, data);
}

export function emitJobProgress(
  orgId: string,
  payload: Omit<ProgressEventPayload, "timestamp">,
): void {
  const event: EventType = "job:progress";
  const data: ProgressEventPayload = { ...payload, timestamp: now() };
  logger.debug("SSE emit", { event, orgId, jobId: payload.jobId, progress: payload.progress });
  sseManager.sendToOrganization(orgId, event, data);
}

export function emitStatusChange(
  orgId: string,
  payload: Omit<StatusChangePayload, "timestamp">,
): void {
  const event: EventType = "status:change";
  const data: StatusChangePayload = { ...payload, timestamp: now() };
  logger.debug("SSE emit", { event, orgId, entityType: payload.entityType, entityId: payload.entityId });
  sseManager.sendToOrganization(orgId, event, data);
}

export function emitNotification(
  orgId: string,
  payload: Omit<NotificationPayload, "timestamp">,
): void {
  const event: EventType = "notification";
  const data: NotificationPayload = { ...payload, timestamp: now() };
  logger.debug("SSE emit", { event, orgId, userId: payload.userId, priority: payload.priority });
  sseManager.sendToOrganization(orgId, event, data);
}

export function emitApprovalRequest(
  orgId: string,
  payload: Omit<ApprovalPayload, "status">,
): void {
  const event: EventType = "approval:request";
  const data: ApprovalPayload = { ...payload, status: "pending" };
  logger.debug("SSE emit", { event, orgId, approvalId: payload.approvalId });
  sseManager.sendToOrganization(orgId, event, data);
}

export function emitApprovalResponse(
  orgId: string,
  payload: ApprovalPayload,
): void {
  const event: EventType = "approval:response";
  logger.debug("SSE emit", { event, orgId, approvalId: payload.approvalId, status: payload.status });
  sseManager.sendToOrganization(orgId, event, payload);
}

export function emitSessionUpdate(
  orgId: string,
  payload: Omit<SessionUpdatePayload, "timestamp">,
): void {
  const event: EventType = "session:update";
  const data: SessionUpdatePayload = { ...payload, timestamp: now() };
  logger.debug("SSE emit", { event, orgId, sessionId: payload.sessionId });
  sseManager.sendToOrganization(orgId, event, data);
}

export function emitError(
  orgId: string,
  payload: Omit<ErrorEventPayload, "timestamp">,
): void {
  const event: EventType = "error";
  const data: ErrorEventPayload = { ...payload, timestamp: now() };
  logger.debug("SSE emit", { event, orgId, code: payload.code, source: payload.source });
  sseManager.sendToOrganization(orgId, event, data);
}
