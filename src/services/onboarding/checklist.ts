import { Prisma } from "@prisma/client";
import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";

export type ChecklistItemStatus = "pending" | "in_progress" | "completed" | "skipped";

export interface ChecklistItem {
  id: string;
  title: string;
  titleKo: string;
  description: string;
  descriptionKo: string;
  status: ChecklistItemStatus;
  required: boolean;
  order: number;
  action?: {
    type: "link" | "modal" | "api";
    target: string;
    label?: string;
  };
  completedAt?: Date | null;
  metadata?: Record<string, unknown>;
}

export interface ChecklistProgress {
  completed: number;
  total: number;
  percentage: number;
  requiredCompleted: number;
  requiredTotal: number;
}

// Default checklist items
const DEFAULT_CHECKLIST_ITEMS: Omit<ChecklistItem, "status" | "completedAt" | "metadata">[] = [
  {
    id: "company_profile",
    title: "Complete Company Profile",
    titleKo: "회사 프로필 완성",
    description: "Set up your company name, logo, and basic information",
    descriptionKo: "회사 이름, 로고, 기본 정보를 설정하세요",
    required: true,
    order: 1,
    action: {
      type: "link",
      target: "/settings",
      label: "Go to Settings",
    },
  },
  {
    id: "connect_google",
    title: "Connect Google Workspace",
    titleKo: "Google Workspace 연결",
    description: "Automatically add team members from your Google Workspace",
    descriptionKo: "Google 계정으로 팀원을 자동으로 추가하세요",
    required: false,
    order: 2,
    action: {
      type: "link",
      target: "/settings/integrations",
      label: "Connect Google",
    },
  },
  {
    id: "connect_slack",
    title: "Connect Slack",
    titleKo: "Slack 연결",
    description: "Use agents directly in Slack channels",
    descriptionKo: "Slack에서 에이전트를 사용하세요",
    required: false,
    order: 3,
    action: {
      type: "link",
      target: "/settings/slack",
      label: "Connect Slack",
    },
  },
  {
    id: "connect_notion",
    title: "Connect Notion",
    titleKo: "Notion 연결",
    description: "Sync tasks and documents with Notion",
    descriptionKo: "Notion과 작업 및 문서를 동기화하세요",
    required: false,
    order: 4,
    action: {
      type: "link",
      target: "/settings/notion",
      label: "Connect Notion",
    },
  },
  {
    id: "first_agent",
    title: "Try Your First Agent",
    titleKo: "첫 에이전트 사용해보기",
    description: "Send your first request to an AI agent",
    descriptionKo: "에이전트에게 첫 번째 요청을 해보세요",
    required: true,
    order: 5,
    action: {
      type: "link",
      target: "/activity",
      label: "Chat with Agent",
    },
  },
  {
    id: "invite_team",
    title: "Invite Team Members",
    titleKo: "팀원 초대",
    description: "Invite colleagues to collaborate with you",
    descriptionKo: "함께 사용할 팀원을 초대하세요",
    required: false,
    order: 6,
    action: {
      type: "link",
      target: "/settings/members",
      label: "Invite Members",
    },
  },
  {
    id: "first_workflow",
    title: "Run Your First Workflow",
    titleKo: "첫 워크플로우 실행",
    description: "Execute an automated workflow",
    descriptionKo: "자동화된 워크플로우를 실행해보세요",
    required: true,
    order: 7,
    action: {
      type: "link",
      target: "/workflows",
      label: "View Workflows",
    },
  },
  {
    id: "explore_dashboard",
    title: "Explore the Dashboard",
    titleKo: "대시보드 둘러보기",
    description: "Learn how to monitor your AI operations",
    descriptionKo: "AI 운영 현황을 모니터링하는 방법을 알아보세요",
    required: false,
    order: 8,
    action: {
      type: "link",
      target: "/dashboard",
      label: "Go to Dashboard",
    },
  },
];

export class ChecklistService {
  /**
   * Get checklist for an organization
   */
  async getChecklist(organizationId: string): Promise<ChecklistItem[]> {
    // Get existing checklist items from database
    const existingItems = await prisma.onboardingChecklistItem.findMany({
      where: { organizationId },
    });

    const existingMap = new Map(existingItems.map((item) => [item.itemId, item]));

    // Merge with default items
    const checklist: ChecklistItem[] = DEFAULT_CHECKLIST_ITEMS.map((defaultItem) => {
      const existing = existingMap.get(defaultItem.id);

      return {
        ...defaultItem,
        status: (existing?.status as ChecklistItemStatus) || "pending",
        completedAt: existing?.completedAt || null,
        metadata: (existing?.metadata as Record<string, unknown>) || undefined,
      };
    });

    // Sort by order
    return checklist.sort((a, b) => a.order - b.order);
  }

  /**
   * Mark a checklist item as complete
   */
  async markComplete(
    organizationId: string,
    itemId: string,
    metadata?: Record<string, unknown>,
  ): Promise<ChecklistItem | null> {
    const defaultItem = DEFAULT_CHECKLIST_ITEMS.find((item) => item.id === itemId);
    if (!defaultItem) {
      logger.warn("Unknown checklist item", { itemId });
      return null;
    }

    const updated = await prisma.onboardingChecklistItem.upsert({
      where: {
        organizationId_itemId: {
          organizationId,
          itemId,
        },
      },
      create: {
        organizationId,
        itemId,
        status: "completed",
        completedAt: new Date(),
        metadata: (metadata || {}) as Prisma.InputJsonValue,
      },
      update: {
        status: "completed",
        completedAt: new Date(),
        metadata: (metadata || {}) as Prisma.InputJsonValue,
      },
    });

    logger.info("Checklist item completed", {
      organizationId,
      itemId,
    });

    return {
      ...defaultItem,
      status: updated.status as ChecklistItemStatus,
      completedAt: updated.completedAt,
      metadata: (updated.metadata as Record<string, unknown>) || undefined,
    };
  }

  /**
   * Mark a checklist item as skipped
   */
  async markSkipped(organizationId: string, itemId: string): Promise<ChecklistItem | null> {
    const defaultItem = DEFAULT_CHECKLIST_ITEMS.find((item) => item.id === itemId);
    if (!defaultItem) {
      return null;
    }

    if (defaultItem.required) {
      throw new Error(`Item ${itemId} is required and cannot be skipped`);
    }

    const updated = await prisma.onboardingChecklistItem.upsert({
      where: {
        organizationId_itemId: {
          organizationId,
          itemId,
        },
      },
      create: {
        organizationId,
        itemId,
        status: "skipped",
      },
      update: {
        status: "skipped",
      },
    });

    logger.info("Checklist item skipped", {
      organizationId,
      itemId,
    });

    return {
      ...defaultItem,
      status: updated.status as ChecklistItemStatus,
      completedAt: null,
    };
  }

  /**
   * Get completion progress
   */
  async getProgress(organizationId: string): Promise<ChecklistProgress> {
    const checklist = await this.getChecklist(organizationId);

    const completed = checklist.filter(
      (item) => item.status === "completed" || item.status === "skipped",
    ).length;
    const total = checklist.length;

    const requiredItems = checklist.filter((item) => item.required);
    const requiredCompleted = requiredItems.filter((item) => item.status === "completed").length;

    return {
      completed,
      total,
      percentage: Math.round((completed / total) * 100),
      requiredCompleted,
      requiredTotal: requiredItems.length,
    };
  }

  /**
   * Check if all required items are complete
   */
  async isRequiredComplete(organizationId: string): Promise<boolean> {
    const progress = await this.getProgress(organizationId);
    return progress.requiredCompleted === progress.requiredTotal;
  }

  /**
   * Reset checklist (for testing/admin)
   */
  async reset(organizationId: string): Promise<void> {
    await prisma.onboardingChecklistItem.deleteMany({
      where: { organizationId },
    });

    logger.info("Checklist reset", { organizationId });
  }

  /**
   * Auto-complete items based on organization state
   */
  async autoComplete(organizationId: string): Promise<string[]> {
    const completed: string[] = [];

    // Check company profile
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, logoUrl: true },
    });
    if (org?.name && org.name !== "New Organization") {
      await this.markComplete(organizationId, "company_profile");
      completed.push("company_profile");
    }

    // Check Google connection
    const driveConnection = await prisma.driveConnection.findUnique({
      where: { organizationId },
    });
    if (driveConnection) {
      await this.markComplete(organizationId, "connect_google");
      completed.push("connect_google");
    }

    // Check Slack connection
    const slackIntegration = await prisma.slackIntegration.findFirst({
      where: { organizationId, enabled: true },
    });
    if (slackIntegration) {
      await this.markComplete(organizationId, "connect_slack");
      completed.push("connect_slack");
    }

    // Check Notion connection
    const notionConnection = await prisma.notionConnection.findUnique({
      where: { organizationId },
    });
    if (notionConnection) {
      await this.markComplete(organizationId, "connect_notion");
      completed.push("connect_notion");
    }

    // Check team invites
    const memberCount = await prisma.membership.count({
      where: { organizationId },
    });
    if (memberCount > 1) {
      await this.markComplete(organizationId, "invite_team");
      completed.push("invite_team");
    }

    // Check first workflow
    const workflowExecution = await prisma.workflowExecution.findFirst({
      where: {
        workflow: { organizationId },
        status: "success",
      },
    });
    if (workflowExecution) {
      await this.markComplete(organizationId, "first_workflow");
      completed.push("first_workflow");
    }

    // Check first agent interaction
    const orchestratorExecution = await prisma.orchestratorExecution.findFirst({
      where: {
        organizationId,
        status: "success",
      },
    });
    if (orchestratorExecution) {
      await this.markComplete(organizationId, "first_agent");
      completed.push("first_agent");
    }

    if (completed.length > 0) {
      logger.info("Auto-completed checklist items", {
        organizationId,
        items: completed,
      });
    }

    return completed;
  }
}

export const checklistService = new ChecklistService();
