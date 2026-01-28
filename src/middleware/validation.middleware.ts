import { Request, Response, NextFunction } from "express";
import { z, ZodError, ZodSchema } from "zod";

interface ValidationSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

export function validate(schemas: ValidationSchemas) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.params) {
        req.params = (await schemas.params.parseAsync(req.params)) as any;
      }
      if (schemas.query) {
        req.query = (await schemas.query.parseAsync(req.query)) as any;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          path: err.path.join("."),
          message: err.message,
          code: err.code,
        }));

        res.status(400).json({
          error: "Validation failed",
          details: formattedErrors,
        });
        return;
      }
      next(error);
    }
  };
}

export const uuidParamSchema = z.object({
  id: z.string().uuid("Invalid ID format"),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createWorkflowSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(1000).optional().nullable(),
  config: z.record(z.unknown()).optional().default({}),
  enabled: z.boolean().optional().default(true),
});

export const updateWorkflowSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(1000).optional().nullable(),
    config: z.record(z.unknown()).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const executeWorkflowSchema = z.object({
  inputData: z.record(z.unknown()).optional().nullable(),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const switchOrganizationSchema = z.object({
  organizationId: z.string().uuid("Invalid organization ID"),
});

export const notionSettingsSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  defaultDatabaseId: z.string().optional(),
});

export const notionTestSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
});

export const createMcpConnectionSchema = z.object({
  provider: z.enum(["notion", "linear", "jira", "asana", "airtable", "github", "slack"]),
  name: z.string().min(1).max(255),
  config: z.record(z.unknown()),
  enabled: z.boolean().optional().default(true),
});

export const updateMcpConnectionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

export const createApprovalSchema = z.object({
  approverId: z.string().uuid("Invalid approver ID"),
  fallbackApproverId: z.string().uuid("Invalid fallback approver ID").optional().nullable(),
  type: z.enum(["budget", "deployment", "content"]),
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().min(1, "Description is required"),
  context: z.record(z.unknown()).optional().nullable(),
  expiresInHours: z.coerce.number().int().min(1).max(168).default(24),
  notifyViaSlack: z.boolean().optional().default(true),
});

export const respondApprovalSchema = z.object({
  action: z.enum(["approved", "rejected"]),
  responseNote: z.string().max(1000).optional().nullable(),
});

export const listApprovalsQuerySchema = z.object({
  status: z
    .enum(["pending", "approved", "rejected", "expired", "all"])
    .optional()
    .default("pending"),
  type: z.enum(["budget", "deployment", "content", "all"]).optional().default("all"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;
export type ExecuteWorkflowInput = z.infer<typeof executeWorkflowSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SwitchOrganizationInput = z.infer<typeof switchOrganizationSchema>;
export type NotionSettingsInput = z.infer<typeof notionSettingsSchema>;
export type CreateMcpConnectionInput = z.infer<typeof createMcpConnectionSchema>;
export type UpdateMcpConnectionInput = z.infer<typeof updateMcpConnectionSchema>;
export type CreateApprovalInput = z.infer<typeof createApprovalSchema>;
export type RespondApprovalInput = z.infer<typeof respondApprovalSchema>;
export type ListApprovalsQuery = z.infer<typeof listApprovalsQuerySchema>;

export const sopStepSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  type: z.enum(["manual", "automated", "approval", "mcp_call"]),
  config: z.record(z.unknown()).optional(),
  requiredApprovers: z.array(z.string().uuid()).optional(),
  timeoutMinutes: z.number().int().min(1).optional(),
  skippable: z.boolean().optional().default(true),
});

export const configureSopSchema = z.object({
  sopEnabled: z.boolean(),
  sopSteps: z.array(sopStepSchema).optional(),
});

export const skipStepSchema = z.object({
  reason: z.string().min(1, "Skip reason is required").max(500),
});

export const modifyStepSchema = z.object({
  modifications: z.record(z.unknown()),
});

export const approveStepSchema = z.object({
  note: z.string().max(500).optional(),
});

export const stepIndexParamSchema = z.object({
  id: z.string().uuid("Invalid execution ID"),
  stepIndex: z.coerce.number().int().min(0),
});

export type SopStepInput = z.infer<typeof sopStepSchema>;
export type ConfigureSopInput = z.infer<typeof configureSopSchema>;
export type SkipStepInput = z.infer<typeof skipStepSchema>;
export type ModifyStepInput = z.infer<typeof modifyStepSchema>;
export type ApproveStepInput = z.infer<typeof approveStepSchema>;

export const githubConnectionSchema = z.object({
  accessToken: z.string().min(1, "Access token is required"),
  name: z.string().max(255).optional(),
});

export const updateGithubConnectionSchema = z
  .object({
    accessToken: z.string().min(1).optional(),
    name: z.string().max(255).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const driveConnectionSchema = z.object({
  accessToken: z.string().min(1, "Access token is required"),
  refreshToken: z.string().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  defaultFolderId: z.string().optional().nullable(),
});

export const updateDriveConnectionSchema = z
  .object({
    accessToken: z.string().min(1).optional(),
    refreshToken: z.string().optional().nullable(),
    expiresAt: z.string().datetime().optional().nullable(),
    defaultFolderId: z.string().optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const googleCalendarConnectionSchema = z.object({
  accessToken: z.string().min(1, "Access token is required"),
  refreshToken: z.string().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  calendarId: z.string().optional().nullable(),
});

export const updateGoogleCalendarConnectionSchema = z
  .object({
    accessToken: z.string().min(1).optional(),
    refreshToken: z.string().optional().nullable(),
    expiresAt: z.string().datetime().optional().nullable(),
    calendarId: z.string().optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const featureFlagSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+$/, "Key must be lowercase alphanumeric with underscores"),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional().nullable(),
  enabled: z.boolean().optional().default(false),
});

export const updateFeatureFlagSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(1000).optional().nullable(),
    enabled: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const featureFlagRuleSchema = z.object({
  type: z.enum(["ALLOWLIST", "BLOCKLIST", "PERCENTAGE"]),
  organizationIds: z.array(z.string().uuid()).optional().default([]),
  percentage: z.number().int().min(0).max(100).optional().default(0),
  priority: z.number().int().optional().default(100),
  enabled: z.boolean().optional().default(true),
});

export const featureFlagOverrideSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().max(1000).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});

export const webhookEventSchema = z.object({
  provider: z.string().min(1).max(50),
  eventType: z.string().min(1).max(100),
  payload: z.record(z.unknown()),
});

export const okrObjectiveSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional().nullable(),
  quarter: z.string().regex(/^\d{4}-Q[1-4]$/, "Quarter must be in format YYYY-Q1"),
  ownerId: z.string().uuid(),
  status: z.enum(["on_track", "at_risk", "behind"]).optional().default("on_track"),
});

export const updateOkrObjectiveSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(2000).optional().nullable(),
    status: z.enum(["on_track", "at_risk", "behind"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const keyResultSchema = z.object({
  title: z.string().min(1).max(500),
  target: z.number(),
  current: z.number().optional().default(0),
  unit: z.string().min(1).max(50),
  ownerId: z.string().uuid().optional().nullable(),
});

export const updateKeyResultSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    target: z.number().optional(),
    current: z.number().optional(),
    unit: z.string().min(1).max(50).optional(),
    ownerId: z.string().uuid().optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type GithubConnectionInput = z.infer<typeof githubConnectionSchema>;
export type UpdateGithubConnectionInput = z.infer<typeof updateGithubConnectionSchema>;
export type DriveConnectionInput = z.infer<typeof driveConnectionSchema>;
export type UpdateDriveConnectionInput = z.infer<typeof updateDriveConnectionSchema>;
export type GoogleCalendarConnectionInput = z.infer<typeof googleCalendarConnectionSchema>;
export type UpdateGoogleCalendarConnectionInput = z.infer<
  typeof updateGoogleCalendarConnectionSchema
>;
export type FeatureFlagInput = z.infer<typeof featureFlagSchema>;
export type UpdateFeatureFlagInput = z.infer<typeof updateFeatureFlagSchema>;
export type FeatureFlagRuleInput = z.infer<typeof featureFlagRuleSchema>;
export type FeatureFlagOverrideInput = z.infer<typeof featureFlagOverrideSchema>;
export type WebhookEventInput = z.infer<typeof webhookEventSchema>;
export type OkrObjectiveInput = z.infer<typeof okrObjectiveSchema>;
export type UpdateOkrObjectiveInput = z.infer<typeof updateOkrObjectiveSchema>;
export type KeyResultInput = z.infer<typeof keyResultSchema>;
export type UpdateKeyResultInput = z.infer<typeof updateKeyResultSchema>;

export const delegationScopeSchema = z.object({
  resourceTypes: z.array(z.string()).optional(),
  resourceIds: z.array(z.string().uuid()).optional(),
  maxAmount: z.number().positive().optional(),
  conditions: z.record(z.unknown()).optional(),
});

export const createDelegationSchema = z.object({
  delegateeId: z.string().uuid("Invalid delegatee ID"),
  permissions: z.array(z.string().min(1)).min(1, "At least one permission is required"),
  scope: delegationScopeSchema.optional().nullable(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime(),
  reason: z.string().min(1, "Reason is required").max(1000),
});

export const revokeDelegationSchema = z.object({
  reason: z.string().max(1000).optional().nullable(),
});

export const listDelegationsQuerySchema = z.object({
  role: z.enum(["delegator", "delegatee", "both"]).optional().default("both"),
  includeExpired: z.coerce.boolean().optional().default(false),
  includeRevoked: z.coerce.boolean().optional().default(false),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type DelegationScopeInput = z.infer<typeof delegationScopeSchema>;
export type CreateDelegationInput = z.infer<typeof createDelegationSchema>;
export type RevokeDelegationInput = z.infer<typeof revokeDelegationSchema>;
export type ListDelegationsQuery = z.infer<typeof listDelegationsQuerySchema>;
