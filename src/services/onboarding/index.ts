/**
 * Onboarding Service
 *
 * Provides self-service onboarding functionality for new organizations:
 * - Multi-step wizard for guided setup
 * - Industry templates for quick configuration
 * - Setup tasks for connecting integrations
 * - Progress checklist tracking
 */

export {
  OnboardingWizard,
  onboardingWizard,
  type OnboardingState,
  type OnboardingStep,
  type OnboardingData,
} from "./wizard";

export {
  TemplateService,
  templateService,
  ONBOARDING_TEMPLATES,
  type OnboardingTemplate,
  type AgentTemplate,
  type WorkflowTemplate,
  type SOPTemplate,
  type TemplatePreview,
} from "./templates";

export {
  ChecklistService,
  checklistService,
  type ChecklistItem,
  type ChecklistItemStatus,
  type ChecklistProgress,
} from "./checklist";

export {
  SetupTasks,
  setupTasks,
  type GoogleWorkspaceInfo,
  type TeamInvite,
} from "./setup-tasks";
