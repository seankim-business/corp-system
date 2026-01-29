// TODO: Uncomment when feedbackAction table exists in Prisma schema
// import { db } from "../../db/client";
import { logger } from "../../utils/logger";
import type { ProcessedFeedback, FeedbackCategory } from "./processor";

export interface FeedbackAction {
  id: string;
  type: "routing_update" | "prompt_update" | "knowledge_add" | "sop_update" | "escalate";
  priority: "low" | "medium" | "high";
  description: string;
  details: Record<string, unknown>;
  autoApplicable: boolean;
  requiresHumanReview: boolean;
  estimatedImpact: {
    affectedRequests: number;
    expectedImprovement: number;
  };
}

const categoryToAction: Record<FeedbackCategory, FeedbackAction["type"]> = {
  wrong_agent: "routing_update",
  incomplete_response: "knowledge_add",
  incorrect_response: "knowledge_add",
  slow_response: "escalate",
  format_issue: "prompt_update",
  permission_issue: "escalate",
  unclear_request: "prompt_update",
  other: "escalate",
};

export async function recommendActions(
  processedFeedback: ProcessedFeedback[]
): Promise<FeedbackAction[]> {
  const actions: FeedbackAction[] = [];

  // Group by category
  const byCategory = new Map<FeedbackCategory, ProcessedFeedback[]>();
  for (const pf of processedFeedback) {
    if (!byCategory.has(pf.category)) {
      byCategory.set(pf.category, []);
    }
    byCategory.get(pf.category)!.push(pf);
  }

  for (const [category, items] of byCategory) {
    const actionType = categoryToAction[category];
    const highSeverity = items.filter(i => i.severity === "high").length;
    const priority: FeedbackAction["priority"] =
      highSeverity > 2 ? "high" : highSeverity > 0 ? "medium" : "low";

    const action: FeedbackAction = {
      id: `action_${Date.now()}_${category}`,
      type: actionType,
      priority,
      description: getActionDescription(category, items.length),
      details: {
        category,
        feedbackCount: items.length,
        feedbackIds: items.map(i => i.feedbackId),
        rootCauses: items.map(i => i.rootCause).filter(Boolean),
      },
      autoApplicable: actionType === "routing_update" && priority !== "high",
      requiresHumanReview: priority === "high" || actionType === "escalate",
      estimatedImpact: {
        affectedRequests: items.length * 10, // Estimate
        expectedImprovement: priority === "high" ? 0.3 : priority === "medium" ? 0.2 : 0.1,
      },
    };

    actions.push(action);
  }

  return prioritizeActions(actions);
}

function getActionDescription(category: FeedbackCategory, count: number): string {
  const descriptions: Record<FeedbackCategory, string> = {
    wrong_agent: `Update routing rules - ${count} requests routed to wrong agent`,
    incomplete_response: `Add knowledge entries - ${count} incomplete responses reported`,
    incorrect_response: `Review and update knowledge base - ${count} incorrect responses`,
    slow_response: `Investigate performance issues - ${count} slow response reports`,
    format_issue: `Update response formatting prompts - ${count} format issues`,
    permission_issue: `Review permission configuration - ${count} access issues`,
    unclear_request: `Improve clarification prompts - ${count} unclear requests`,
    other: `Review miscellaneous issues - ${count} reports`,
  };
  return descriptions[category];
}

export function prioritizeActions(actions: FeedbackAction[]): FeedbackAction[] {
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return actions.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.estimatedImpact.affectedRequests - a.estimatedImpact.affectedRequests;
  });
}

export async function saveRecommendedActions(
  _organizationId: string, // TODO: Use when feedbackAction table exists
  actions: FeedbackAction[]
): Promise<string[]> {
  const ids: string[] = [];

  // TODO: Implement when feedbackAction table exists in Prisma schema
  for (const action of actions) {
    // const saved = await db.feedbackAction.create({
    //   data: {
    //     organizationId,
    //     feedbackIds: action.details.feedbackIds as string[],
    //     type: action.type,
    //     priority: action.priority,
    //     description: action.description,
    //     details: action.details,
    //     autoApplicable: action.autoApplicable,
    //     requiresHumanReview: action.requiresHumanReview,
    //     estimatedImpact: action.estimatedImpact,
    //   },
    // });
    // ids.push(saved.id);
    ids.push(`stub-${action.type}-${Date.now()}`);
  }

  logger.info("Saved recommended actions", { count: ids.length });
  return ids;
}
