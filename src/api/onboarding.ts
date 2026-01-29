import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware";
import { logger } from "../utils/logger";
import {
  onboardingWizard,
  templateService,
  checklistService,
  setupTasks,
  type OnboardingStep,
  type OnboardingData,
} from "../services/onboarding";

const router = Router();

// Validation schemas
const completeStepSchema = z.object({
  data: z.record(z.unknown()).optional(),
});

const applyTemplateSchema = z.object({
  customizations: z
    .object({
      enabledAgents: z.array(z.string()).optional(),
      disabledAgents: z.array(z.string()).optional(),
    })
    .optional(),
});

const updateProfileSchema = z.object({
  companyName: z.string().min(1).max(255),
  industry: z.string().optional(),
  teamSize: z.string().optional(),
  logoUrl: z.string().url().optional().nullable(),
});

const sendInvitesSchema = z.object({
  invites: z.array(
    z.object({
      email: z.string().email(),
      role: z.enum(["admin", "member"]).optional(),
      message: z.string().optional(),
    }),
  ),
});

// ========================================
// Wizard State Endpoints
// ========================================

/**
 * GET /onboarding/state
 * Get current onboarding state for the organization
 */
router.get("/onboarding/state", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { organizationId } = req.user!;

    const state = await onboardingWizard.getState(organizationId);

    if (!state) {
      res.json({
        success: true,
        data: null,
        message: "Onboarding not started",
      });
      return;
    }

    res.json({
      success: true,
      data: {
        ...state,
        progress: onboardingWizard.getProgress(state),
        isComplete: onboardingWizard.isComplete(state),
      },
    });
  } catch (error) {
    logger.error(
      "Failed to get onboarding state",
      { organizationId: req.user?.organizationId },
      error instanceof Error ? error : new Error(String(error)),
    );
    res.status(500).json({
      success: false,
      error: "Failed to get onboarding state",
    });
  }
});

/**
 * POST /onboarding/start
 * Start the onboarding wizard
 */
router.post(
  "/onboarding/start",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.user!;

      const state = await onboardingWizard.start(organizationId);

      res.json({
        success: true,
        data: {
          ...state,
          progress: onboardingWizard.getProgress(state),
        },
      });
    } catch (error) {
      logger.error(
        "Failed to start onboarding",
        { organizationId: req.user?.organizationId },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to start onboarding",
      });
    }
  },
);

/**
 * POST /onboarding/step/:step/complete
 * Complete a step in the wizard
 */
router.post(
  "/onboarding/step/:step/complete",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.user!;
      const step = req.params.step as OnboardingStep;
      const { data } = completeStepSchema.parse(req.body);

      const state = await onboardingWizard.completeStep(
        organizationId,
        step,
        (data as Partial<OnboardingData>) || {},
      );

      res.json({
        success: true,
        data: {
          ...state,
          progress: onboardingWizard.getProgress(state),
          isComplete: onboardingWizard.isComplete(state),
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: "Validation error",
          details: error.errors,
        });
        return;
      }

      logger.error(
        "Failed to complete onboarding step",
        { organizationId: req.user?.organizationId, step: req.params.step },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to complete step",
      });
    }
  },
);

/**
 * POST /onboarding/step/:step/skip
 * Skip a step in the wizard
 */
router.post(
  "/onboarding/step/:step/skip",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.user!;
      const step = req.params.step as OnboardingStep;

      if (!onboardingWizard.canSkip(step)) {
        res.status(400).json({
          success: false,
          error: `Step ${step} is required and cannot be skipped`,
        });
        return;
      }

      const state = await onboardingWizard.skipStep(organizationId, step);

      res.json({
        success: true,
        data: {
          ...state,
          progress: onboardingWizard.getProgress(state),
          isComplete: onboardingWizard.isComplete(state),
        },
      });
    } catch (error) {
      logger.error(
        "Failed to skip onboarding step",
        { organizationId: req.user?.organizationId, step: req.params.step },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to skip step",
      });
    }
  },
);

/**
 * POST /onboarding/step/:step/goto
 * Navigate to a specific step
 */
router.post(
  "/onboarding/step/:step/goto",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.user!;
      const step = req.params.step as OnboardingStep;

      const state = await onboardingWizard.goToStep(organizationId, step);

      res.json({
        success: true,
        data: {
          ...state,
          progress: onboardingWizard.getProgress(state),
        },
      });
    } catch (error) {
      logger.error(
        "Failed to navigate to step",
        { organizationId: req.user?.organizationId, step: req.params.step },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to navigate to step",
      });
    }
  },
);

// ========================================
// Template Endpoints
// ========================================

/**
 * GET /onboarding/templates
 * List available onboarding templates
 */
router.get(
  "/onboarding/templates",
  requireAuth,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const templates = templateService.list();

      res.json({
        success: true,
        data: templates,
      });
    } catch (error) {
      logger.error(
        "Failed to list templates",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to list templates",
      });
    }
  },
);

/**
 * GET /onboarding/templates/:id
 * Get a specific template
 */
router.get(
  "/onboarding/templates/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const templateId = req.params.id as string;
      const template = templateService.get(templateId);

      if (!template) {
        res.status(404).json({
          success: false,
          error: "Template not found",
        });
        return;
      }

      res.json({
        success: true,
        data: template,
      });
    } catch (error) {
      logger.error(
        "Failed to get template",
        { templateId: req.params.id },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to get template",
      });
    }
  },
);

/**
 * GET /onboarding/templates/:id/preview
 * Preview what a template will create
 */
router.get(
  "/onboarding/templates/:id/preview",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const templateId = req.params.id as string;
      const preview = templateService.preview(templateId);

      if (!preview) {
        res.status(404).json({
          success: false,
          error: "Template not found",
        });
        return;
      }

      res.json({
        success: true,
        data: preview,
      });
    } catch (error) {
      logger.error(
        "Failed to preview template",
        { templateId: req.params.id },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to preview template",
      });
    }
  },
);

/**
 * POST /onboarding/templates/:id/apply
 * Apply a template to the organization
 */
router.post(
  "/onboarding/templates/:id/apply",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.user!;
      const templateId = req.params.id as string;
      const { customizations } = applyTemplateSchema.parse(req.body);

      const result = await setupTasks.applyTemplate(organizationId, templateId, customizations);

      // Update onboarding state with template selection
      await onboardingWizard.completeStep(organizationId, "select_template", {
        templateId,
        selectedAgents: customizations?.enabledAgents,
        disabledAgents: customizations?.disabledAgents,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: "Validation error",
          details: error.errors,
        });
        return;
      }

      logger.error(
        "Failed to apply template",
        { organizationId: req.user?.organizationId, templateId: req.params.id },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to apply template",
      });
    }
  },
);

// ========================================
// Checklist Endpoints
// ========================================

/**
 * GET /onboarding/checklist
 * Get the onboarding checklist
 */
router.get(
  "/onboarding/checklist",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.user!;

      const [checklist, progress] = await Promise.all([
        checklistService.getChecklist(organizationId),
        checklistService.getProgress(organizationId),
      ]);

      res.json({
        success: true,
        data: {
          items: checklist,
          progress,
        },
      });
    } catch (error) {
      logger.error(
        "Failed to get checklist",
        { organizationId: req.user?.organizationId },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to get checklist",
      });
    }
  },
);

/**
 * POST /onboarding/checklist/:itemId/complete
 * Mark a checklist item as complete
 */
router.post(
  "/onboarding/checklist/:itemId/complete",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.user!;
      const itemId = req.params.itemId as string;
      const metadata = req.body.metadata;

      const item = await checklistService.markComplete(organizationId, itemId, metadata);

      if (!item) {
        res.status(404).json({
          success: false,
          error: "Checklist item not found",
        });
        return;
      }

      const progress = await checklistService.getProgress(organizationId);

      res.json({
        success: true,
        data: {
          item,
          progress,
        },
      });
    } catch (error) {
      logger.error(
        "Failed to complete checklist item",
        { organizationId: req.user?.organizationId, itemId: req.params.itemId },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to complete checklist item",
      });
    }
  },
);

/**
 * POST /onboarding/checklist/:itemId/skip
 * Skip a checklist item
 */
router.post(
  "/onboarding/checklist/:itemId/skip",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.user!;
      const itemId = req.params.itemId as string;

      const item = await checklistService.markSkipped(organizationId, itemId);

      if (!item) {
        res.status(404).json({
          success: false,
          error: "Checklist item not found",
        });
        return;
      }

      const progress = await checklistService.getProgress(organizationId);

      res.json({
        success: true,
        data: {
          item,
          progress,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("required")) {
        res.status(400).json({
          success: false,
          error: error.message,
        });
        return;
      }

      logger.error(
        "Failed to skip checklist item",
        { organizationId: req.user?.organizationId, itemId: req.params.itemId },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to skip checklist item",
      });
    }
  },
);

/**
 * POST /onboarding/checklist/auto-complete
 * Auto-complete checklist items based on org state
 */
router.post(
  "/onboarding/checklist/auto-complete",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.user!;

      const completed = await checklistService.autoComplete(organizationId);
      const progress = await checklistService.getProgress(organizationId);

      res.json({
        success: true,
        data: {
          completedItems: completed,
          progress,
        },
      });
    } catch (error) {
      logger.error(
        "Failed to auto-complete checklist",
        { organizationId: req.user?.organizationId },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to auto-complete checklist",
      });
    }
  },
);

// ========================================
// Setup Task Endpoints
// ========================================

/**
 * POST /onboarding/setup/profile
 * Update company profile
 */
router.post(
  "/onboarding/setup/profile",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.user!;
      const profile = updateProfileSchema.parse(req.body);

      await setupTasks.updateCompanyProfile(organizationId, {
        ...profile,
        logoUrl: profile.logoUrl || undefined,
      });

      // Complete the company_info step
      await onboardingWizard.completeStep(organizationId, "company_info", {
        companyName: profile.companyName,
        industry: profile.industry,
        teamSize: profile.teamSize,
        logoUrl: profile.logoUrl ?? undefined,
      });

      res.json({
        success: true,
        message: "Profile updated successfully",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: "Validation error",
          details: error.errors,
        });
        return;
      }

      logger.error(
        "Failed to update profile",
        { organizationId: req.user?.organizationId },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to update profile",
      });
    }
  },
);

/**
 * POST /onboarding/setup/invite
 * Send team invitations
 */
router.post(
  "/onboarding/setup/invite",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationId, id: userId } = req.user!;
      const { invites } = sendInvitesSchema.parse(req.body);

      const result = await setupTasks.sendInvites(organizationId, invites, userId);

      // Complete the invite_team step if at least one invite sent
      if (result.sent > 0) {
        await onboardingWizard.completeStep(organizationId, "invite_team", {
          invitedEmails: invites.map((i) => i.email),
        });
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: "Validation error",
          details: error.errors,
        });
        return;
      }

      logger.error(
        "Failed to send invites",
        { organizationId: req.user?.organizationId },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to send invites",
      });
    }
  },
);

/**
 * POST /onboarding/setup/first-workflow
 * Create the first workflow
 */
router.post(
  "/onboarding/setup/first-workflow",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.user!;
      const { name, description } = req.body;

      const result = await setupTasks.createFirstWorkflow(organizationId, { name, description });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error(
        "Failed to create first workflow",
        { organizationId: req.user?.organizationId },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to create first workflow",
      });
    }
  },
);

/**
 * POST /onboarding/reset
 * Reset onboarding (admin/testing only)
 */
router.post(
  "/onboarding/reset",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { organizationId } = req.user!;
      const membership = req.membership;

      // Only admins can reset
      if (!membership || !["owner", "admin"].includes(membership.role)) {
        res.status(403).json({
          success: false,
          error: "Only admins can reset onboarding",
        });
        return;
      }

      const state = await onboardingWizard.reset(organizationId);
      await checklistService.reset(organizationId);

      res.json({
        success: true,
        data: state,
      });
    } catch (error) {
      logger.error(
        "Failed to reset onboarding",
        { organizationId: req.user?.organizationId },
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        success: false,
        error: "Failed to reset onboarding",
      });
    }
  },
);

export default router;
