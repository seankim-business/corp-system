import { Prisma } from "@prisma/client";
import { db as prisma } from "../../db/client";
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
  // Company info
  companyName?: string;
  industry?: string;
  teamSize?: string;
  logoUrl?: string;

  // Template selection
  templateId?: string;

  // Customization
  selectedAgents?: string[];
  disabledAgents?: string[];

  // Integrations
  googleConnected?: boolean;
  slackConnected?: boolean;
  notionConnected?: boolean;

  // Team
  invitedEmails?: string[];

  // First workflow
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

// Step order for the wizard
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

// Required steps (cannot be skipped)
const REQUIRED_STEPS: OnboardingStep[] = ["company_info", "select_template"];

// Optional steps (can be skipped)
const OPTIONAL_STEPS: OnboardingStep[] = [
  "google_workspace",
  "customize_agents",
  "connect_slack",
  "invite_team",
  "first_workflow",
];

export class OnboardingWizard {
  /**
   * Start onboarding for an organization
   */
  async start(organizationId: string): Promise<OnboardingState> {
    // Check if onboarding already exists
    const existing = await prisma.onboardingState.findUnique({
      where: { organizationId },
    });

    if (existing) {
      logger.info("Resuming existing onboarding", { organizationId });
      return this.mapToState(existing);
    }

    // Create new onboarding state
    const state = await prisma.onboardingState.create({
      data: {
        organizationId,
        currentStep: "company_info",
        completedSteps: [],
        skippedSteps: [],
        data: {},
        lastActivityAt: new Date(),
      },
    });

    logger.info("Started new onboarding", { organizationId });
    return this.mapToState(state);
  }

  /**
   * Get current onboarding state
   */
  async getState(organizationId: string): Promise<OnboardingState | null> {
    const state = await prisma.onboardingState.findUnique({
      where: { organizationId },
    });

    if (!state) {
      return null;
    }

    return this.mapToState(state);
  }

  /**
   * Complete a step and move to the next
   */
  async completeStep(
    organizationId: string,
    step: OnboardingStep,
    data: Partial<OnboardingData>,
  ): Promise<OnboardingState> {
    const state = await prisma.onboardingState.findUnique({
      where: { organizationId },
    });

    if (!state) {
      throw new Error("Onboarding not started");
    }

    const currentData = (state.data as OnboardingData) || {};
    const completedSteps = [...(state.completedSteps as OnboardingStep[])];

    // Add step to completed if not already
    if (!completedSteps.includes(step)) {
      completedSteps.push(step);
    }

    // Merge data
    const newData: OnboardingData = {
      ...currentData,
      ...data,
    };

    // Get next step
    const nextStep = this.getNextStep(step, completedSteps, state.skippedSteps as OnboardingStep[]);

    // Check if onboarding is complete
    const isComplete = nextStep === "completed";

    const updated = await prisma.onboardingState.update({
      where: { organizationId },
      data: {
        currentStep: nextStep,
        completedSteps,
        data: newData as Prisma.InputJsonValue,
        templateId: data.templateId || state.templateId,
        lastActivityAt: new Date(),
        completedAt: isComplete ? new Date() : null,
      },
    });

    // Update organization with company info if provided
    if (step === "company_info" && data.companyName) {
      await prisma.organization.update({
        where: { id: organizationId },
        data: {
          name: data.companyName,
          logoUrl: data.logoUrl || undefined,
          settings: {
            ...(await this.getOrgSettings(organizationId)),
            industry: data.industry,
            teamSize: data.teamSize,
          },
        },
      });
    }

    logger.info("Completed onboarding step", {
      organizationId,
      step,
      nextStep,
      isComplete,
    });

    return this.mapToState(updated);
  }

  /**
   * Skip a step (only for optional steps)
   */
  async skipStep(organizationId: string, step: OnboardingStep): Promise<OnboardingState> {
    if (REQUIRED_STEPS.includes(step)) {
      throw new Error(`Step ${step} is required and cannot be skipped`);
    }

    const state = await prisma.onboardingState.findUnique({
      where: { organizationId },
    });

    if (!state) {
      throw new Error("Onboarding not started");
    }

    const skippedSteps = [...(state.skippedSteps as OnboardingStep[])];

    if (!skippedSteps.includes(step)) {
      skippedSteps.push(step);
    }

    const nextStep = this.getNextStep(
      step,
      state.completedSteps as OnboardingStep[],
      skippedSteps,
    );

    const isComplete = nextStep === "completed";

    const updated = await prisma.onboardingState.update({
      where: { organizationId },
      data: {
        currentStep: nextStep,
        skippedSteps,
        lastActivityAt: new Date(),
        completedAt: isComplete ? new Date() : null,
      },
    });

    logger.info("Skipped onboarding step", {
      organizationId,
      step,
      nextStep,
    });

    return this.mapToState(updated);
  }

  /**
   * Go back to a previous step
   */
  async goToStep(organizationId: string, step: OnboardingStep): Promise<OnboardingState> {
    const state = await prisma.onboardingState.findUnique({
      where: { organizationId },
    });

    if (!state) {
      throw new Error("Onboarding not started");
    }

    const updated = await prisma.onboardingState.update({
      where: { organizationId },
      data: {
        currentStep: step,
        lastActivityAt: new Date(),
      },
    });

    logger.info("Navigated to onboarding step", {
      organizationId,
      step,
    });

    return this.mapToState(updated);
  }

  /**
   * Get the next step in the wizard
   */
  getNextStep(
    currentStep: OnboardingStep,
    completedSteps: OnboardingStep[],
    skippedSteps: OnboardingStep[],
  ): OnboardingStep {
    const currentIndex = STEP_ORDER.indexOf(currentStep);

    if (currentIndex === -1 || currentIndex === STEP_ORDER.length - 1) {
      return "completed";
    }

    // Find next uncompleted and unskipped step
    for (let i = currentIndex + 1; i < STEP_ORDER.length; i++) {
      const step = STEP_ORDER[i];
      if (!completedSteps.includes(step) && !skippedSteps.includes(step)) {
        return step;
      }
    }

    return "completed";
  }

  /**
   * Check if onboarding is complete
   */
  isComplete(state: OnboardingState): boolean {
    return state.currentStep === "completed" || state.completedAt !== null;
  }

  /**
   * Check if a step can be skipped
   */
  canSkip(step: OnboardingStep): boolean {
    return OPTIONAL_STEPS.includes(step);
  }

  /**
   * Get progress percentage
   */
  getProgress(state: OnboardingState): number {
    const totalSteps = STEP_ORDER.length - 1; // Exclude 'completed'
    const doneSteps = state.completedSteps.length + state.skippedSteps.length;
    return Math.round((doneSteps / totalSteps) * 100);
  }

  /**
   * Reset onboarding (for testing/admin)
   */
  async reset(organizationId: string): Promise<OnboardingState> {
    const updated = await prisma.onboardingState.upsert({
      where: { organizationId },
      create: {
        organizationId,
        currentStep: "company_info",
        completedSteps: [],
        skippedSteps: [],
        data: {},
        lastActivityAt: new Date(),
      },
      update: {
        currentStep: "company_info",
        completedSteps: [],
        skippedSteps: [],
        data: {},
        templateId: null,
        completedAt: null,
        lastActivityAt: new Date(),
      },
    });

    logger.info("Reset onboarding", { organizationId });
    return this.mapToState(updated);
  }

  /**
   * Map database record to OnboardingState
   */
  private mapToState(record: any): OnboardingState {
    return {
      id: record.id,
      organizationId: record.organizationId,
      currentStep: record.currentStep as OnboardingStep,
      completedSteps: (record.completedSteps || []) as OnboardingStep[],
      skippedSteps: (record.skippedSteps || []) as OnboardingStep[],
      data: (record.data || {}) as OnboardingData,
      templateId: record.templateId,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      lastActivityAt: record.lastActivityAt,
    };
  }

  /**
   * Get organization settings
   */
  private async getOrgSettings(organizationId: string): Promise<Record<string, unknown>> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    return (org?.settings as Record<string, unknown>) || {};
  }
}

export const onboardingWizard = new OnboardingWizard();
