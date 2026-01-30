/**
 * AR Template Import/Export Service
 *
 * Provides functionality to export and import AR templates for:
 * - Sharing templates between organizations
 * - Backing up custom templates
 * - Migrating templates between environments
 * - Template marketplace/library support
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { auditLogger } from "../../services/audit-logger";
import { IndustryType, CompanySize, GrowthStage } from "../types";
import { z } from "zod";

// =============================================================================
// TYPES
// =============================================================================

export interface ExportedTemplate {
  version: string;
  exportedAt: string;
  name: string;
  industry: IndustryType;
  companySize: CompanySize;
  growthStage: GrowthStage;
  departments: DepartmentDefinition[];
  keyRoles: RoleDefinition[];
  bestPractices: string[];
  antiPatterns: string[];
  metadata?: Record<string, unknown>;
}

export interface DepartmentDefinition {
  name: string;
  description?: string;
  positions: PositionDefinition[];
  subDepartments?: DepartmentDefinition[];
}

export interface PositionDefinition {
  title: string;
  description?: string;
  requiredSkills: string[];
  optionalSkills?: string[];
  modelTier?: 'haiku' | 'sonnet' | 'opus';
  headcount?: number;
}

export interface RoleDefinition {
  title: string;
  level: 1 | 2 | 3 | 4 | 5;
  skills: string[];
  responsibilities?: string[];
}

export interface ExportOptions {
  includeMetadata?: boolean;
  format?: 'json' | 'yaml';
  pretty?: boolean;
}

export interface ImportOptions {
  overwrite?: boolean;
  validate?: boolean;
  dryRun?: boolean;
  skipExisting?: boolean;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: Array<{
    name: string;
    error: string;
  }>;
  templates: Array<{
    id: string;
    name: string;
    action: 'created' | 'updated' | 'skipped';
  }>;
}

export interface ExportResult {
  success: boolean;
  templates: ExportedTemplate[];
  count: number;
  exportedAt: string;
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const positionSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  requiredSkills: z.array(z.string()),
  optionalSkills: z.array(z.string()).optional(),
  modelTier: z.enum(['haiku', 'sonnet', 'opus']).optional(),
  headcount: z.number().positive().optional(),
});

const departmentSchema: z.ZodType<DepartmentDefinition> = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  positions: z.array(positionSchema),
  subDepartments: z.array(z.lazy(() => departmentSchema)).optional(),
});

const roleSchema = z.object({
  title: z.string().min(1),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  skills: z.array(z.string()),
  responsibilities: z.array(z.string()).optional(),
});

const templateSchema = z.object({
  version: z.string(),
  exportedAt: z.string().optional(),
  name: z.string().min(1).max(255),
  industry: z.enum(['technology', 'fashion', 'ecommerce', 'manufacturing', 'finance', 'healthcare']),
  companySize: z.enum(['startup', 'smb', 'enterprise']),
  growthStage: z.enum(['seed', 'growth', 'mature']),
  departments: z.array(departmentSchema),
  keyRoles: z.array(roleSchema),
  bestPractices: z.array(z.string()),
  antiPatterns: z.array(z.string()),
  metadata: z.record(z.unknown()).optional(),
});

// =============================================================================
// CONSTANTS
// =============================================================================

const EXPORT_VERSION = '1.0.0';

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class TemplateImportExportService {
  // ==========================================================================
  // EXPORT OPERATIONS
  // ==========================================================================

  /**
   * Export a single template by ID
   */
  async exportTemplate(
    templateId: string,
    options: ExportOptions = {}
  ): Promise<ExportedTemplate> {
    try {
      const template = await prisma.aRIndustryTemplate.findUnique({
        where: { id: templateId },
      });

      if (!template) {
        throw new Error(`Template ${templateId} not found`);
      }

      return this.mapToExportedTemplate(template, options);
    } catch (error) {
      logger.error("Failed to export template", {
        templateId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Export multiple templates
   */
  async exportTemplates(
    templateIds: string[],
    options: ExportOptions = {}
  ): Promise<ExportResult> {
    try {
      const templates = await prisma.aRIndustryTemplate.findMany({
        where: { id: { in: templateIds } },
      });

      const exported = templates.map(t => this.mapToExportedTemplate(t, options));

      logger.info("Templates exported", { count: exported.length });

      return {
        success: true,
        templates: exported,
        count: exported.length,
        exportedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("Failed to export templates", {
        count: templateIds.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Export all templates with optional filters
   */
  async exportAllTemplates(
    filters?: {
      industry?: IndustryType;
      companySize?: CompanySize;
      growthStage?: GrowthStage;
      includeBuiltIn?: boolean;
    },
    options: ExportOptions = {}
  ): Promise<ExportResult> {
    try {
      const where: Record<string, unknown> = {};

      if (filters?.industry) where.industry = filters.industry;
      if (filters?.companySize) where.companySize = filters.companySize;
      if (filters?.growthStage) where.growthStage = filters.growthStage;
      if (filters?.includeBuiltIn === false) where.isBuiltIn = false;

      const templates = await prisma.aRIndustryTemplate.findMany({ where });
      const exported = templates.map(t => this.mapToExportedTemplate(t, options));

      logger.info("All templates exported", {
        count: exported.length,
        filters,
      });

      return {
        success: true,
        templates: exported,
        count: exported.length,
        exportedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("Failed to export all templates", {
        filters,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Export template as JSON string
   */
  async exportToJson(
    templateId: string,
    options: ExportOptions = {}
  ): Promise<string> {
    const template = await this.exportTemplate(templateId, options);
    return JSON.stringify(template, null, options.pretty ? 2 : undefined);
  }

  /**
   * Export multiple templates as JSON string
   */
  async exportManyToJson(
    templateIds: string[],
    options: ExportOptions = {}
  ): Promise<string> {
    const result = await this.exportTemplates(templateIds, options);
    return JSON.stringify(result, null, options.pretty ? 2 : undefined);
  }

  // ==========================================================================
  // IMPORT OPERATIONS
  // ==========================================================================

  /**
   * Import a single template from exported format
   */
  async importTemplate(
    data: ExportedTemplate,
    organizationId: string | null,
    actorId: string,
    options: ImportOptions = {}
  ): Promise<{ id: string; action: 'created' | 'updated' | 'skipped' }> {
    try {
      // Validate if enabled
      if (options.validate !== false) {
        const validation = templateSchema.safeParse(data);
        if (!validation.success) {
          throw new Error(`Validation failed: ${validation.error.message}`);
        }
      }

      // Check for existing template
      const existing = await prisma.aRIndustryTemplate.findFirst({
        where: { name: data.name },
      });

      if (existing) {
        if (options.skipExisting) {
          return { id: existing.id, action: 'skipped' };
        }

        if (!options.overwrite) {
          throw new Error(`Template "${data.name}" already exists. Use overwrite option to replace.`);
        }

        if (existing.isBuiltIn) {
          throw new Error(`Cannot overwrite built-in template "${data.name}"`);
        }

        // Dry run - don't actually update
        if (options.dryRun) {
          return { id: existing.id, action: 'updated' };
        }

        // Update existing
        const updated = await prisma.aRIndustryTemplate.update({
          where: { id: existing.id },
          data: {
            industry: data.industry,
            companySize: data.companySize,
            growthStage: data.growthStage,
            departments: data.departments as unknown as object,
            keyRoles: data.keyRoles as unknown as object,
            bestPractices: data.bestPractices as unknown as object,
            antiPatterns: data.antiPatterns as unknown as object,
          },
        });

        await this.logImportAction(organizationId, actorId, updated.id, 'updated', data.name);

        return { id: updated.id, action: 'updated' };
      }

      // Dry run - don't actually create
      if (options.dryRun) {
        return { id: 'dry-run-id', action: 'created' };
      }

      // Create new template
      const created = await prisma.aRIndustryTemplate.create({
        data: {
          name: data.name,
          industry: data.industry,
          companySize: data.companySize,
          growthStage: data.growthStage,
          departments: data.departments as unknown as object,
          keyRoles: data.keyRoles as unknown as object,
          bestPractices: data.bestPractices as unknown as object,
          antiPatterns: data.antiPatterns as unknown as object,
          isBuiltIn: false,
          usageCount: 0,
        },
      });

      await this.logImportAction(organizationId, actorId, created.id, 'created', data.name);

      return { id: created.id, action: 'created' };
    } catch (error) {
      logger.error("Failed to import template", {
        name: data.name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Import multiple templates
   */
  async importTemplates(
    templates: ExportedTemplate[],
    organizationId: string | null,
    actorId: string,
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      imported: 0,
      skipped: 0,
      errors: [],
      templates: [],
    };

    for (const template of templates) {
      try {
        const importResult = await this.importTemplate(
          template,
          organizationId,
          actorId,
          options
        );

        result.templates.push({
          id: importResult.id,
          name: template.name,
          action: importResult.action,
        });

        if (importResult.action === 'skipped') {
          result.skipped++;
        } else {
          result.imported++;
        }
      } catch (error) {
        result.errors.push({
          name: template.name,
          error: error instanceof Error ? error.message : String(error),
        });
        result.success = false;
      }
    }

    logger.info("Templates import completed", {
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors.length,
    });

    return result;
  }

  /**
   * Import from JSON string
   */
  async importFromJson(
    json: string,
    organizationId: string | null,
    actorId: string,
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    try {
      const data = JSON.parse(json);

      // Handle single template or array
      if (Array.isArray(data)) {
        return this.importTemplates(data, organizationId, actorId, options);
      }

      // Handle export result format
      if (data.templates && Array.isArray(data.templates)) {
        return this.importTemplates(data.templates, organizationId, actorId, options);
      }

      // Single template
      const result = await this.importTemplate(data, organizationId, actorId, options);

      return {
        success: true,
        imported: result.action !== 'skipped' ? 1 : 0,
        skipped: result.action === 'skipped' ? 1 : 0,
        errors: [],
        templates: [{
          id: result.id,
          name: data.name,
          action: result.action,
        }],
      };
    } catch (error) {
      logger.error("Failed to import from JSON", {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        imported: 0,
        skipped: 0,
        errors: [{
          name: 'unknown',
          error: error instanceof Error ? error.message : String(error),
        }],
        templates: [],
      };
    }
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  /**
   * Validate template data without importing
   */
  validateTemplate(data: unknown): {
    valid: boolean;
    errors: string[];
  } {
    const result = templateSchema.safeParse(data);

    if (result.success) {
      return { valid: true, errors: [] };
    }

    const errors = result.error.issues.map(issue =>
      `${issue.path.join('.')}: ${issue.message}`
    );

    return { valid: false, errors };
  }

  /**
   * Validate multiple templates
   */
  validateTemplates(templates: unknown[]): {
    valid: boolean;
    results: Array<{
      index: number;
      name?: string;
      valid: boolean;
      errors: string[];
    }>;
  } {
    const results = templates.map((template, index) => {
      const validation = this.validateTemplate(template);
      return {
        index,
        name: (template as ExportedTemplate)?.name,
        valid: validation.valid,
        errors: validation.errors,
      };
    });

    return {
      valid: results.every(r => r.valid),
      results,
    };
  }

  // ==========================================================================
  // CLONE OPERATIONS
  // ==========================================================================

  /**
   * Clone a template with a new name
   */
  async cloneTemplate(
    templateId: string,
    newName: string,
    actorId: string
  ): Promise<string> {
    try {
      const exported = await this.exportTemplate(templateId);

      exported.name = newName;
      delete exported.metadata;

      const result = await this.importTemplate(
        exported,
        null,
        actorId,
        { validate: true, overwrite: false }
      );

      logger.info("Template cloned", {
        sourceId: templateId,
        newId: result.id,
        newName,
      });

      return result.id;
    } catch (error) {
      logger.error("Failed to clone template", {
        templateId,
        newName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Map database template to exported format
   */
  private mapToExportedTemplate(
    template: {
      name: string;
      industry: string;
      companySize: string;
      growthStage: string;
      departments: unknown;
      keyRoles: unknown;
      bestPractices: unknown;
      antiPatterns: unknown;
      createdAt: Date;
      updatedAt: Date;
      usageCount: number;
      avgRating: number | null;
    },
    options: ExportOptions
  ): ExportedTemplate {
    const exported: ExportedTemplate = {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      name: template.name,
      industry: template.industry as IndustryType,
      companySize: template.companySize as CompanySize,
      growthStage: template.growthStage as GrowthStage,
      departments: template.departments as DepartmentDefinition[],
      keyRoles: template.keyRoles as RoleDefinition[],
      bestPractices: template.bestPractices as string[],
      antiPatterns: template.antiPatterns as string[],
    };

    if (options.includeMetadata) {
      exported.metadata = {
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
        usageCount: template.usageCount,
        avgRating: template.avgRating,
      };
    }

    return exported;
  }

  /**
   * Log import action to audit log
   */
  private async logImportAction(
    organizationId: string | null,
    actorId: string,
    templateId: string,
    action: 'created' | 'updated',
    templateName: string
  ): Promise<void> {
    try {
      await auditLogger.log({
        action: 'data.import',
        organizationId: organizationId || 'system',
        userId: actorId,
        resourceType: 'ar_industry_template',
        resourceId: templateId,
        details: {
          importAction: action,
          templateName,
        },
        success: true,
      });
    } catch (error) {
      logger.warn("Failed to log import action", {
        templateId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const templateImportExportService = new TemplateImportExportService();

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Quick export a template to JSON
 */
export async function exportTemplateToJson(
  templateId: string,
  pretty = true
): Promise<string> {
  return templateImportExportService.exportToJson(templateId, { pretty });
}

/**
 * Quick import from JSON
 */
export async function importTemplateFromJson(
  json: string,
  actorId: string,
  options: ImportOptions = {}
): Promise<ImportResult> {
  return templateImportExportService.importFromJson(json, null, actorId, options);
}
