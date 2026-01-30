/**
 * Onboarding Checklist Service (Stub)
 *
 * NOTE: Requires onboarding tables in Prisma schema (ChecklistItem, etc.)
 */

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

const DEFAULT_CHECKLIST_ITEMS: Omit<ChecklistItem, "status" | "completedAt" | "metadata">[] = [
  {
    id: "company_profile",
    title: "Complete Company Profile",
    titleKo: "회사 프로필 완성",
    description: "Set up your company name, logo, and basic information",
    descriptionKo: "회사 이름, 로고, 기본 정보를 설정하세요",
    required: true,
    order: 1,
    action: { type: "link", target: "/settings", label: "Go to Settings" },
  },
  {
    id: "connect_google",
    title: "Connect Google Workspace",
    titleKo: "Google Workspace 연결",
    description: "Enable Google Calendar, Drive, and Gmail integrations",
    descriptionKo: "Google 캘린더, 드라이브, Gmail 연동을 활성화하세요",
    required: false,
    order: 2,
    action: { type: "link", target: "/settings/google-calendar" },
  },
  {
    id: "connect_slack",
    title: "Connect Slack",
    titleKo: "Slack 연결",
    description: "Enable Slack notifications and commands",
    descriptionKo: "Slack 알림 및 명령을 활성화하세요",
    required: false,
    order: 3,
    action: { type: "link", target: "/settings/slack" },
  },
  {
    id: "create_workflow",
    title: "Create Your First Workflow",
    titleKo: "첫 번째 워크플로우 만들기",
    description: "Set up an automated workflow",
    descriptionKo: "자동화된 워크플로우를 설정하세요",
    required: true,
    order: 4,
    action: { type: "link", target: "/workflows" },
  },
];

export class ChecklistService {
  async getChecklist(_organizationId: string): Promise<ChecklistItem[]> {
    logger.debug("ChecklistService.getChecklist called (stub)");
    return DEFAULT_CHECKLIST_ITEMS.map((item) => ({
      ...item,
      status: "pending" as ChecklistItemStatus,
      completedAt: null,
      metadata: {},
    }));
  }

  async getProgress(_organizationId: string): Promise<ChecklistProgress> {
    logger.debug("ChecklistService.getProgress called (stub)");
    return {
      completed: 0,
      total: DEFAULT_CHECKLIST_ITEMS.length,
      percentage: 0,
      requiredCompleted: 0,
      requiredTotal: DEFAULT_CHECKLIST_ITEMS.filter((i) => i.required).length,
    };
  }

  async updateItemStatus(
    _organizationId: string,
    _itemId: string,
    _status: ChecklistItemStatus,
  ): Promise<ChecklistItem | null> {
    logger.warn("ChecklistService.updateItemStatus called (stub)");
    return null;
  }

  async markCompleted(
    _organizationId: string,
    _itemId: string,
  ): Promise<ChecklistItem | null> {
    logger.warn("ChecklistService.markCompleted called (stub)");
    return null;
  }

  async resetChecklist(_organizationId: string): Promise<void> {
    logger.warn("ChecklistService.resetChecklist called (stub)");
  }
}

export const checklistService = new ChecklistService();
