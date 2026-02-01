/**
 * Daily Briefing Service (US-001)
 * Generates and sends daily briefings to users via Slack DM.
 * Aggregates: pending approvals, recent executions, workflow stats.
 */

import { WebClient } from "@slack/web-api";
import { db as prisma } from "../db/client";
import { logger } from "../utils/logger";
import { runWithoutRLS } from "../utils/async-context";
import { getSlackIntegrationByOrg } from "../api/slack-integration";
import { getActiveAlerts, ProactiveAlert } from "./proactive-monitor";
import { getLearningInsights, LearningInsight } from "./learning-system";
// TODO: Re-enable when google-calendar tools are restored
// import { getTodayEventsTool } from "../mcp-servers/google-calendar/tools/listEvents";
// import { CalendarEvent } from "../mcp-servers/google-calendar/types";

interface CalendarEvent {
  title: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  location?: string;
}

export interface DailyBriefingData {
  pendingApprovals: {
    total: number;
    items: Array<{
      id: string;
      type: string;
      title: string;
      requesterName: string;
      expiresAt: Date;
    }>;
  };
  recentExecutions: {
    total: number;
    successful: number;
    failed: number;
    items: Array<{
      id: string;
      category: string;
      status: string;
      createdAt: Date;
    }>;
  };
  workflowStats: {
    totalWorkflows: number;
    enabledWorkflows: number;
    executionsToday: number;
    successRate: number;
  };
  proactiveAlerts: {
    total: number;
    items: Array<{
      type: string;
      severity: string;
      title: string;
      suggestedActions: string[];
    }>;
  };
  learningInsights: {
    total: number;
    items: Array<{
      insight: string;
      suggestedAutomation?: string;
    }>;
  };
  calendarEvents: {
    total: number;
    items: Array<{
      title: string;
      startTime: string;
      endTime: string;
      isAllDay: boolean;
      location?: string;
    }>;
  };
}

interface ApprovalItem {
  id: string;
  type: string;
  title: string;
  requesterId: string;
  expiresAt: Date;
}

interface ExecutionItem {
  id: string;
  category: string;
  status: string;
  createdAt: Date;
}

interface MembershipBriefing {
  userId: string;
  organizationId: string;
  dailyBriefingTimezone: string;
}

export async function generateDailyBriefing(
  userId: string,
  organizationId: string,
): Promise<DailyBriefingData> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Fetch approvals with requester data in a single optimized query
  const pendingApprovalsWithRequesters = await prisma.$queryRaw<
    Array<{
      id: string;
      type: string;
      title: string;
      requesterId: string;
      expiresAt: Date;
      requesterDisplayName: string | null;
      requesterEmail: string;
    }>
  >`
     SELECT 
       a.id,
       a.type,
       a.title,
       a.requester_id as "requesterId",
       a.expires_at as "expiresAt",
       u.display_name as "requesterDisplayName",
       u.email as "requesterEmail"
     FROM approvals a
     LEFT JOIN users u ON a.requester_id = u.id
     WHERE a.organization_id = ${organizationId}::uuid
       AND a.status = 'pending'
       AND (a.approver_id = ${userId}::uuid OR a.fallback_approver_id = ${userId}::uuid)
     ORDER BY a.expires_at ASC
     LIMIT 5
   `;

  const requesterMap = new Map(
    pendingApprovalsWithRequesters.map((a: any) => [
      a.requesterId,
      a.requesterDisplayName || a.requesterEmail || "Unknown",
    ]),
  );

  const pendingApprovals = pendingApprovalsWithRequesters.map((a: any) => ({
    id: a.id,
    type: a.type,
    title: a.title,
    requesterId: a.requesterId,
    expiresAt: a.expiresAt,
  }));

  const recentExecutions = await prisma.orchestratorExecution.findMany({
    where: {
      organizationId,
      userId,
      createdAt: { gte: last24Hours },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const successfulExecutions = recentExecutions.filter(
    (e: ExecutionItem) => e.status === "completed",
  ).length;
  const failedExecutions = recentExecutions.filter(
    (e: ExecutionItem) => e.status === "failed",
  ).length;

  const [totalWorkflows, enabledWorkflows, executionsToday] = await Promise.all([
    prisma.workflow.count({ where: { organizationId } }),
    prisma.workflow.count({ where: { organizationId, enabled: true } }),
    prisma.workflowExecution.count({
      where: {
        workflow: { organizationId },
        createdAt: { gte: todayStart },
      },
    }),
  ]);

  const [successfulWorkflowExecutions, totalWorkflowExecutionsToday] = await Promise.all([
    prisma.workflowExecution.count({
      where: {
        workflow: { organizationId },
        createdAt: { gte: todayStart },
        status: "success",
      },
    }),
    prisma.workflowExecution.count({
      where: {
        workflow: { organizationId },
        createdAt: { gte: todayStart },
      },
    }),
  ]);

  const successRate =
    totalWorkflowExecutionsToday > 0
      ? Math.round((successfulWorkflowExecutions / totalWorkflowExecutionsToday) * 100)
      : 100;

  const totalPendingApprovals = await prisma.approval.count({
    where: {
      organizationId,
      status: "pending",
      OR: [{ approverId: userId }, { fallbackApproverId: userId }],
    },
  });

  const [alerts, insights] = await Promise.all([
    getActiveAlerts(organizationId),
    getLearningInsights(organizationId),
  ]);

  const unacknowledgedAlerts = alerts.filter((a: ProactiveAlert) => !a.acknowledgedAt);

  // TODO: Re-enable when google-calendar tools are restored
  const calendarEvents: CalendarEvent[] = [];
  // Calendar events temporarily disabled - tools not implemented

  return {
    pendingApprovals: {
      total: totalPendingApprovals,
      items: pendingApprovals.map((a: ApprovalItem) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        requesterName: requesterMap.get(a.requesterId) || "Unknown",
        expiresAt: a.expiresAt,
      })),
    },
    recentExecutions: {
      total: recentExecutions.length,
      successful: successfulExecutions,
      failed: failedExecutions,
      items: recentExecutions.slice(0, 5).map((e: ExecutionItem) => ({
        id: e.id,
        category: e.category,
        status: e.status,
        createdAt: e.createdAt,
      })),
    },
    workflowStats: {
      totalWorkflows,
      enabledWorkflows,
      executionsToday,
      successRate,
    },
    proactiveAlerts: {
      total: unacknowledgedAlerts.length,
      items: unacknowledgedAlerts.slice(0, 5).map((a: ProactiveAlert) => ({
        type: a.type,
        severity: a.severity,
        title: a.title,
        suggestedActions: a.suggestedActions,
      })),
    },
    learningInsights: {
      total: insights.length,
      items: insights.slice(0, 3).map((i: LearningInsight) => ({
        insight: i.insight,
        suggestedAutomation: i.suggestedAutomation,
      })),
    },
    calendarEvents: {
      total: calendarEvents.length,
      items: calendarEvents.slice(0, 10).map((e: CalendarEvent) => ({
        title: e.title,
        startTime: e.startTime,
        endTime: e.endTime,
        isAllDay: e.isAllDay,
        location: e.location,
      })),
    },
  };
}

export function formatDailyBriefingBlocks(
  data: DailyBriefingData,
  userName: string,
): { text: string; blocks: any[] } {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const blocks: any[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Good morning, ${userName}!`,
        emoji: true,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Your daily briefing for *${dateStr}*`,
        },
      ],
    },
    { type: "divider" },
  ];

  if (data.calendarEvents.total > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:calendar: *오늘 일정* (${data.calendarEvents.total})`,
      },
    });

    const eventLines = data.calendarEvents.items.map((event, index) => {
      const isLast = index === data.calendarEvents.items.length - 1;
      const prefix = isLast ? "└─" : "├─";
      const timeStr = event.isAllDay ? "종일" : formatEventTime(event.startTime);
      const locationStr = event.location ? ` @ ${event.location}` : "";
      return `${prefix} ${timeStr} ${event.title}${locationStr}`;
    });

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: eventLines.join("\n"),
      },
    });

    blocks.push({ type: "divider" });
  }

  if (data.pendingApprovals.total > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Pending Approvals* (${data.pendingApprovals.total})`,
      },
    });

    for (const approval of data.pendingApprovals.items) {
      const expiresIn = formatTimeUntil(approval.expiresAt);
      const typeEmoji = getTypeEmoji(approval.type);
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${typeEmoji} *${approval.title}*\nFrom: ${approval.requesterName} | Expires: ${expiresIn}`,
        },
      });
    }

    if (data.pendingApprovals.total > 5) {
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `_...and ${data.pendingApprovals.total - 5} more pending approvals_`,
          },
        ],
      });
    }

    blocks.push({ type: "divider" });
  }

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Recent Activity* (Last 24 hours)`,
    },
  });

  if (data.recentExecutions.total > 0) {
    const statusText = [];
    if (data.recentExecutions.successful > 0) {
      statusText.push(`${data.recentExecutions.successful} completed`);
    }
    if (data.recentExecutions.failed > 0) {
      statusText.push(`${data.recentExecutions.failed} failed`);
    }

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${data.recentExecutions.total} orchestrator executions (${statusText.join(", ")})`,
      },
    });
  } else {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `_No orchestrator activity in the last 24 hours_`,
      },
    });
  }

  blocks.push({ type: "divider" });

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Workflow Overview*`,
    },
  });

  blocks.push({
    type: "section",
    fields: [
      {
        type: "mrkdwn",
        text: `*Total Workflows:*\n${data.workflowStats.totalWorkflows}`,
      },
      {
        type: "mrkdwn",
        text: `*Enabled:*\n${data.workflowStats.enabledWorkflows}`,
      },
      {
        type: "mrkdwn",
        text: `*Executions Today:*\n${data.workflowStats.executionsToday}`,
      },
      {
        type: "mrkdwn",
        text: `*Success Rate:*\n${data.workflowStats.successRate}%`,
      },
    ],
  });

  if (data.proactiveAlerts.total > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Proactive Alerts* (${data.proactiveAlerts.total})`,
      },
    });

    for (const alert of data.proactiveAlerts.items) {
      const severityEmoji = alert.severity === "critical" ? ":rotating_light:" : ":warning:";
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${severityEmoji} *${alert.title}*\n_Suggested: ${alert.suggestedActions[0] || "Review the issue"}_`,
        },
      });
    }
  }

  if (data.learningInsights.total > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Learning Insights* :bulb:`,
      },
    });

    for (const insight of data.learningInsights.items) {
      let text = `• ${insight.insight}`;
      if (insight.suggestedAutomation) {
        text += `\n  _Suggestion: ${insight.suggestedAutomation}_`;
      }
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text,
        },
      });
    }
  }

  blocks.push({ type: "divider" });
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `_This briefing was generated at ${now.toLocaleTimeString()}. Manage your preferences in Settings._`,
      },
    ],
  });

  const alertText = data.proactiveAlerts.total > 0 ? `, ${data.proactiveAlerts.total} alerts` : "";
  const calendarText =
    data.calendarEvents.total > 0 ? `, ${data.calendarEvents.total} calendar events` : "";
  const summaryText = `Daily briefing: ${data.pendingApprovals.total} pending approvals, ${data.recentExecutions.total} recent executions, ${data.workflowStats.executionsToday} workflow runs today${alertText}${calendarText}.`;

  return { text: summaryText, blocks };
}

export async function sendDailyBriefing(
  userId: string,
  organizationId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Wrap in runWithoutRLS since this is called from scheduled job
    const user = await runWithoutRLS(() =>
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, displayName: true },
      })
    );

    if (!user) {
      return { success: false, error: "User not found" };
    }

    const integration = await getSlackIntegrationByOrg(organizationId);
    if (!integration) {
      return { success: false, error: "No Slack integration configured" };
    }

    const client = new WebClient(integration.botToken);

    const slackUser = await findSlackUserByEmail(client, user.email);
    if (!slackUser) {
      return { success: false, error: "Could not find Slack user" };
    }

    const briefingData = await generateDailyBriefing(userId, organizationId);

    const userName = user.displayName || user.email.split("@")[0];
    const { text, blocks } = formatDailyBriefingBlocks(briefingData, userName);

    const dmResponse = await client.conversations.open({
      users: slackUser,
    });

    if (!dmResponse.ok || !dmResponse.channel?.id) {
      return { success: false, error: "Failed to open DM channel" };
    }

    const messageResponse = await client.chat.postMessage({
      channel: dmResponse.channel.id,
      text,
      blocks,
    });

    if (!messageResponse.ok) {
      return { success: false, error: "Failed to send message" };
    }

    logger.info("Daily briefing sent successfully", {
      userId,
      organizationId,
      messageTs: messageResponse.ts,
    });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to send daily briefing", { userId, organizationId, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

export async function getUsersForBriefing(
  currentHour: number,
  currentMinute: number,
): Promise<
  Array<{
    userId: string;
    organizationId: string;
    timezone: string;
  }>
> {
  const timeStr = `${currentHour.toString().padStart(2, "0")}:${currentMinute.toString().padStart(2, "0")}`;

  // Wrap in runWithoutRLS to bypass circuit breaker for scheduled job queries
  // This query runs every minute and must not count towards circuit breaker failures
  const memberships = await runWithoutRLS(() =>
    prisma.membership.findMany({
      where: {
        dailyBriefingEnabled: true,
        dailyBriefingTime: timeStr,
      },
      select: {
        userId: true,
        organizationId: true,
        dailyBriefingTimezone: true,
      },
    })
  );

  return memberships.map((m: MembershipBriefing) => ({
    userId: m.userId,
    organizationId: m.organizationId,
    timezone: m.dailyBriefingTimezone,
  }));
}

async function findSlackUserByEmail(client: WebClient, email: string): Promise<string | null> {
  try {
    const response = await client.users.lookupByEmail({ email });
    return response.user?.id || null;
  } catch {
    return null;
  }
}

function formatTimeUntil(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();

  if (diff < 0) {
    return "expired";
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? "s" : ""}`;
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? "s" : ""}`;
  }
  return `${minutes} minute${minutes > 1 ? "s" : ""}`;
}

function getTypeEmoji(type: string): string {
  switch (type) {
    case "budget":
      return ":moneybag:";
    case "deployment":
      return ":rocket:";
    case "content":
      return ":memo:";
    default:
      return ":clipboard:";
  }
}

function formatEventTime(isoString: string): string {
  const date = new Date(isoString);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}
