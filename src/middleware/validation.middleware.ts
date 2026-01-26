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

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;
export type ExecuteWorkflowInput = z.infer<typeof executeWorkflowSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SwitchOrganizationInput = z.infer<typeof switchOrganizationSchema>;
export type NotionSettingsInput = z.infer<typeof notionSettingsSchema>;
export type CreateMcpConnectionInput = z.infer<typeof createMcpConnectionSchema>;
export type UpdateMcpConnectionInput = z.infer<typeof updateMcpConnectionSchema>;
