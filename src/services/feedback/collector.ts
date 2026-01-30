/**
 * Feedback Collector
 * Collects user feedback from various sources (ratings, reactions, corrections)
 *
 * NOTE: Requires userFeedback table in Prisma schema. Currently returns stub data.
 * Uncomment db imports and implementations when schema is ready.
 */

// import { db } from "../../db/client";
import { logger } from "../../utils/logger";

export interface ImplicitSignal {
  responseTime?: number;
  retryCount?: number;
  editCount?: number;
}

export interface CorrectionData {
  original: string;
  corrected: string;
  field: string;
}

export interface CollectFeedbackParams {
  organizationId: string;
  userId: string;
  executionId: string;
  agentId: string;
  type: "rating" | "reaction" | "correction" | "comment";
  originalRequest: string;
  agentResponse: string;
  rating?: number;
  reaction?: "positive" | "negative";
  correction?: CorrectionData;
  comment?: string;
  implicitSignals?: ImplicitSignal;
}

export async function collectFeedback(params: CollectFeedbackParams): Promise<string> {
  // Database implementation commented out - requires userFeedback table
  // const feedback = await db.userFeedback.create({
  //   data: {
  //     organizationId: params.organizationId,
  //     userId: params.userId,
  //     executionId: params.executionId,
  //     agentId: params.agentId,
  //     type: params.type,
  //     rating: params.rating,
  //     reaction: params.reaction,
  //     correction: params.correction || undefined,
  //     comment: params.comment,
  //     originalRequest: params.originalRequest,
  //     agentResponse: params.agentResponse,
  //     implicitSignals: params.implicitSignals || undefined,
  //   },
  // });

  logger.warn("collectFeedback: userFeedback table not yet implemented", { type: params.type });
  const stubId = `stub-${Date.now()}`;
  return stubId;
}

export async function collectRating(
  executionId: string,
  organizationId: string,
  userId: string,
  agentId: string,
  rating: number,
  originalRequest: string,
  agentResponse: string
): Promise<string> {
  return collectFeedback({
    organizationId,
    userId,
    executionId,
    agentId,
    type: "rating",
    rating,
    originalRequest,
    agentResponse,
  });
}

export async function collectReaction(
  executionId: string,
  organizationId: string,
  userId: string,
  agentId: string,
  reaction: "positive" | "negative",
  originalRequest: string,
  agentResponse: string
): Promise<string> {
  return collectFeedback({
    organizationId,
    userId,
    executionId,
    agentId,
    type: "reaction",
    reaction,
    originalRequest,
    agentResponse,
  });
}

export async function collectCorrection(
  executionId: string,
  organizationId: string,
  userId: string,
  agentId: string,
  correction: CorrectionData,
  originalRequest: string,
  agentResponse: string
): Promise<string> {
  return collectFeedback({
    organizationId,
    userId,
    executionId,
    agentId,
    type: "correction",
    correction,
    originalRequest,
    agentResponse,
  });
}

export async function recordImplicitSignal(
  executionId: string,
  signal: ImplicitSignal
): Promise<void> {
  // Database implementation commented out - requires userFeedback table
  // await db.userFeedback.updateMany({
  //   where: { executionId },
  //   data: {
  //     implicitSignals: signal,
  //   },
  // });

  logger.warn("recordImplicitSignal: userFeedback table not yet implemented", { executionId, signal });
}

export async function handleSlackReaction(
  workspaceId: string,
  channelId: string,
  messageTs: string,
  reaction: string,
  slackUserId: string
): Promise<void> {
  // This function is now handled by the reaction_added event handler in slack.ts
  // which uses the feedback-capture.service.ts
  logger.debug("Slack reaction handling delegated to event handler", {
    workspaceId,
    channelId,
    messageTs,
    reaction,
    slackUserId,
  });
}
