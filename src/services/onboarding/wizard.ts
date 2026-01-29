/**
 * Onboarding Wizard Service (Stub)
 *
 * TODO: Implement when onboarding tables are properly added to Prisma schema
 */

import { logger } from "../../utils/logger";

export type OnboardingStep =
  | "company_info"
  | "google_workspace"
  | "select_template"
  | "customize_agents"
  | "connect_slack"
  | "invite_team"
  | "first_workflow"
  | "completed";

export interface OnboardingData {
  companyName?: string;
  industry?: string;
  teamSize?: string;
  logoUrl?: string;
  templateId?: string;
  selectedAgents?: string[];
  disabledAgents?: string[];
  googleConnected?: boolean;
  slackConnected?: boolean;
  notionConnected?: boolean;
  invitedEmails?: string[];
  firstWorkflowId?: string;
  firstWorkflowCompleted?: boolean;
}

export interface OnboardingState {
  id: string;
  organizationId: string;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  skippedSteps: OnboardingStep[];
  data: OnboardingData;
  templateId: string | null;
  startedAt: Date;
  completedAt: Date | null;
  lastActivityAt: Date;
}

const STEP_ORDER: OnboardingStep[] = [
  "company_info",
  "google_workspace",
  "select_template",
  "customize_agents",
  "connect_slack",
  "invite_team",
  "first_workflow",
  "completed",
];

export class OnboardingWizard {
  async getState(_organizationId: string): Promise<OnboardingState | null> {
    logger.debug("OnboardingWizard.getState called (stub)");
    return null;
  }

  async getOrCreateState(
    organizationId: string,
    _userId: string,
  ): Promise<OnboardingState> {
    logger.debug("OnboardingWizard.getOrCreateState called (stub)");
    const now = new Date();
    return {
      id: `stub-${Date.now()}`,
      organizationId,
      currentStep: "company_info",
      completedSteps: [],
      skippedSteps: [],
      data: {},
      templateId: null,
      startedAt: now,
      completedAt: null,
      lastActivityAt: now,
    };
  }

  async updateStep(
    _organizationId: string,
    step: OnboardingStep,
    _data?: Partial<OnboardingData>,
  ): Promise<OnboardingState | null> {
    logger.warn("OnboardingWizard.updateStep called (stub)", { step });
    return null;
  }

  async completeStep(
    _organizationId: string,
    step: OnboardingStep,
    _data?: Partial<OnboardingData>,
  ): Promise<OnboardingState | null> {
    logger.warn("OnboardingWizard.completeStep called (stub)", { step });
    return null;
  }

  async skipStep(
    _organizationId: string,
    step: OnboardingStep,
  ): Promise<OnboardingState | null> {
    logger.warn("OnboardingWizard.skipStep called (stub)", { step });
    return null;
  }

  async goToStep(
    _organizationId: string,
    step: OnboardingStep,
  ): Promise<OnboardingState | null> {
    logger.warn("OnboardingWizard.goToStep called (stub)", { step });
    return null;
  }

  async complete(_organizationId: string): Promise<OnboardingState | null> {
    logger.warn("OnboardingWizard.complete called (stub)");
    return null;
  }

  async reset(_organizationId: string, _userId: string): Promise<OnboardingState> {
    logger.warn("OnboardingWizard.reset called (stub)");
    return this.getOrCreateState(_organizationId, _userId);
  }

  getNextStep(currentStep: OnboardingStep): OnboardingStep | null {
    const idx = STEP_ORDER.indexOf(currentStep);
    if (idx === -1 || idx >= STEP_ORDER.length - 1) return null;
    return STEP_ORDER[idx + 1];
  }

  getPreviousStep(currentStep: OnboardingStep): OnboardingStep | null {
    const idx = STEP_ORDER.indexOf(currentStep);
    if (idx <= 0) return null;
    return STEP_ORDER[idx - 1];
  }

  isStepCompleted(state: OnboardingState, step: OnboardingStep): boolean {
    return state.completedSteps.includes(step);
  }

  getProgress(state: OnboardingState): { completed: number; total: number; percentage: number } {
    const total = STEP_ORDER.length - 1; // Exclude "completed"
    const completed = state.completedSteps.length;
    return {
      completed,
      total,
      percentage: Math.round((completed / total) * 100),
    };
  }
}

export const onboardingWizard = new OnboardingWizard();
