// import { db } from "../../db/client"; // TODO: Uncomment when userFeedback table exists
import { logger } from "../../utils/logger";
// import { categorizeFeedback } from "./categorizer"; // TODO: Uncomment when categorizer exists
// import { recommendActions } from "./action-recommender"; // TODO: Uncomment when action-recommender exists

export type FeedbackCategory =
  | "wrong_agent"
  | "incomplete_response"
  | "incorrect_response"
  | "slow_response"
  | "format_issue"
  | "permission_issue"
  | "unclear_request"
  | "other";

export interface RootCause {
  type: "routing" | "prompt" | "knowledge" | "tool" | "unknown";
  description: string;
  confidence: number;
}

export interface ProcessedFeedback {
  feedbackId: string;
  sentiment: "positive" | "neutral" | "negative";
  category: FeedbackCategory;
  severity: "low" | "medium" | "high";
  rootCause?: RootCause;
  suggestedActions: string[];
}

export interface FeedbackPattern {
  category: FeedbackCategory;
  count: number;
  severity: "low" | "medium" | "high";
  examples: string[];
  trend: "improving" | "stable" | "worsening";
}

export async function processFeedback(feedbackId: string): Promise<ProcessedFeedback> {
  // TODO: Implement when userFeedback table exists in Prisma schema
  // const feedback = await db.userFeedback.findUnique({
  //   where: { id: feedbackId },
  // });

  logger.warn("processFeedback: userFeedback table not yet implemented", { feedbackId });

  // Return stub data
  return {
    feedbackId,
    sentiment: "neutral",
    category: "other",
    severity: "low",
    suggestedActions: [],
  };
}

export async function batchProcess(organizationId: string): Promise<ProcessedFeedback[]> {
  // TODO: Implement when userFeedback table exists in Prisma schema
  // const unprocessed = await db.userFeedback.findMany({
  //   where: {
  //     organizationId,
  //     processed: false,
  //   },
  //   take: 100,
  // });

  logger.warn("batchProcess: userFeedback table not yet implemented", { organizationId });
  return [];
}

export async function identifyPatterns(
  organizationId: string,
  agentId: string,
  days: number = 30
): Promise<FeedbackPattern[]> {
  // TODO: Implement when userFeedback table exists in Prisma schema
  // const since = new Date();
  // since.setDate(since.getDate() - days);
  //
  // const feedback = await db.userFeedback.findMany({
  //   where: {
  //     organizationId,
  //     agentId,
  //     createdAt: { gte: since },
  //     processed: true,
  //   },
  //   orderBy: { createdAt: "desc" },
  // });

  logger.warn("identifyPatterns: userFeedback table not yet implemented", { organizationId, agentId, days });
  return [];
}
