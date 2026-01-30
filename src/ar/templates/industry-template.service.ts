/**
 * AR Industry Template Service
 *
 * Manages industry-specific organizational templates including built-in
 * templates and custom templates. Supports template CRUD operations,
 * seeding, and filtering.
 *
 * Multi-tenant: Templates can be global (built-in) or organization-specific
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { auditLogger } from "../../services/audit-logger";
import { IndustryType, CompanySize, GrowthStage } from "../types";
import { BUILT_IN_TEMPLATES } from "./data/built-in-templates";

// ============================================================================
// TYPES
// ============================================================================

export interface ARIndustryTemplateCreateInput {
  name: string;
  industry: IndustryType;
  companySize: CompanySize;
  growthStage: GrowthStage;
  description?: string;
  departments: any; // JSON structure
  keyRoles: any; // JSON structure
  bestPractices: any; // JSON structure
  antiPatterns: any; // JSON structure
  isBuiltIn?: boolean;
}

export interface TemplateFilters {
  industry?: IndustryType;
  companySize?: CompanySize;
  growthStage?: GrowthStage;
  isBuiltIn?: boolean;
  search?: string;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class IndustryTemplateService {
  // ==========================================================================
  // CRUD OPERATIONS
  // ==========================================================================

  /**
   * Create a new template
   */
  async create(
    data: ARIndustryTemplateCreateInput,
    actorId?: string,
  ): Promise<any> {
    try {
      const template = await prisma.aRIndustryTemplate.create({
        data: {
          name: data.name,
          industry: data.industry,
          companySize: data.companySize,
          growthStage: data.growthStage,
          departments: data.departments,
          keyRoles: data.keyRoles,
          bestPractices: data.bestPractices,
          antiPatterns: data.antiPatterns,
          isBuiltIn: data.isBuiltIn || false,
          usageCount: 0,
        },
      });

      // Audit log
      if (actorId) {
        await auditLogger.log({
          action: "admin.action",
          organizationId: "system",
          userId: actorId,
          resourceType: "ar_industry_template",
          resourceId: template.id,
          details: {
            operation: "create",
            name: template.name,
            industry: template.industry,
          },
          success: true,
        });
      }

      logger.info("Industry template created", {
        templateId: template.id,
        name: template.name,
        industry: template.industry,
      });

      return template;
    } catch (error) {
      logger.error(
        "Failed to create industry template",
        { name: data.name },
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  /**
   * Find template by ID
   */
  async findById(id: string): Promise<any | null> {
    try {
      const template = await prisma.aRIndustryTemplate.findUnique({
        where: { id },
        include: {
          teamConfigs: {
            take: 10,
            orderBy: { createdAt: "desc" },
          },
          recommendations: {
            take: 10,
            orderBy: { createdAt: "desc" },
          },
        },
      });

      return template;
    } catch (error) {
      logger.error(
        "Failed to find industry template",
        { id },
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  /**
   * Find templates by industry
   */
  async findByIndustry(industry: IndustryType): Promise<any[]> {
    try {
      const templates = await prisma.aRIndustryTemplate.findMany({
        where: { industry },
        orderBy: [{ isBuiltIn: "desc" }, { usageCount: "desc" }, { name: "asc" }],
      });

      return templates;
    } catch (error) {
      logger.error(
        "Failed to find templates by industry",
        { industry },
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  /**
   * Find all templates with optional filters
   */
  async findAll(filters?: TemplateFilters): Promise<any[]> {
    try {
      const where: any = {};

      if (filters?.industry) {
        where.industry = filters.industry;
      }

      if (filters?.companySize) {
        where.companySize = filters.companySize;
      }

      if (filters?.growthStage) {
        where.growthStage = filters.growthStage;
      }

      if (filters?.isBuiltIn !== undefined) {
        where.isBuiltIn = filters.isBuiltIn;
      }

      if (filters?.search) {
        where.OR = [
          {
            name: {
              contains: filters.search,
              mode: "insensitive",
            },
          },
          {
            description: {
              contains: filters.search,
              mode: "insensitive",
            },
          },
        ];
      }

      const templates = await prisma.aRIndustryTemplate.findMany({
        where,
        orderBy: [{ isBuiltIn: "desc" }, { usageCount: "desc" }, { name: "asc" }],
      });

      return templates;
    } catch (error) {
      logger.error(
        "Failed to find templates",
        { filters },
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  /**
   * Update a template
   */
  async update(
    id: string,
    data: Partial<ARIndustryTemplateCreateInput>,
    actorId?: string,
  ): Promise<any> {
    try {
      // Verify template exists
      const existing = await this.findById(id);
      if (!existing) {
        throw new Error(`Template ${id} not found`);
      }

      // Prevent modifying built-in templates
      if (existing.isBuiltIn) {
        throw new Error("Cannot modify built-in templates");
      }

      const updateData: any = {};

      if (data.name !== undefined) updateData.name = data.name;
      if (data.industry !== undefined) updateData.industry = data.industry;
      if (data.companySize !== undefined) updateData.companySize = data.companySize;
      if (data.growthStage !== undefined) updateData.growthStage = data.growthStage;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.departments !== undefined) updateData.departments = data.departments;
      if (data.keyRoles !== undefined) updateData.keyRoles = data.keyRoles;
      if (data.bestPractices !== undefined)
        updateData.bestPractices = data.bestPractices;
      if (data.antiPatterns !== undefined) updateData.antiPatterns = data.antiPatterns;

      const template = await prisma.aRIndustryTemplate.update({
        where: { id },
        data: updateData,
      });

      // Audit log
      if (actorId) {
        await auditLogger.log({
          action: "admin.action",
          organizationId: "system",
          userId: actorId,
          resourceType: "ar_industry_template",
          resourceId: template.id,
          details: {
            operation: "update",
            changes: updateData,
          },
          success: true,
        });
      }

      logger.info("Industry template updated", {
        templateId: template.id,
        name: template.name,
      });

      return template;
    } catch (error) {
      logger.error(
        "Failed to update industry template",
        { id },
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  /**
   * Delete a template
   */
  async delete(id: string, actorId?: string): Promise<void> {
    try {
      // Verify template exists
      const existing = await this.findById(id);
      if (!existing) {
        throw new Error(`Template ${id} not found`);
      }

      // Prevent deleting built-in templates
      if (existing.isBuiltIn) {
        throw new Error("Cannot delete built-in templates");
      }

      // Check for active team configurations using this template
      const activeConfigs = await prisma.aRTeamConfiguration.count({
        where: {
          templateId: id,
          status: "active",
        },
      });

      if (activeConfigs > 0) {
        throw new Error(
          `Cannot delete template with ${activeConfigs} active team configuration(s)`,
        );
      }

      await prisma.aRIndustryTemplate.delete({
        where: { id },
      });

      // Audit log
      if (actorId) {
        await auditLogger.log({
          action: "admin.action",
          organizationId: "system",
          userId: actorId,
          resourceType: "ar_industry_template",
          resourceId: id,
          details: {
            operation: "delete",
            name: existing.name,
          },
          success: true,
        });
      }

      logger.info("Industry template deleted", {
        templateId: id,
        name: existing.name,
      });
    } catch (error) {
      logger.error(
        "Failed to delete industry template",
        { id },
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  // ==========================================================================
  // BUILT-IN TEMPLATES
  // ==========================================================================

  /**
   * Seed built-in templates into the database
   */
  async seedBuiltInTemplates(): Promise<void> {
    try {
      logger.info("Seeding built-in templates", {
        count: BUILT_IN_TEMPLATES.length,
      });

      for (const templateData of BUILT_IN_TEMPLATES) {
        // Check if template already exists
        const existing = await prisma.aRIndustryTemplate.findFirst({
          where: {
            name: templateData.name,
            isBuiltIn: true,
          },
        });

        if (existing) {
          logger.info("Built-in template already exists, skipping", {
            name: templateData.name,
          });
          continue;
        }

        // Create template
        await this.create({
          name: templateData.name,
          industry: templateData.industry,
          companySize: templateData.companySize,
          growthStage: templateData.growthStage,
          description: templateData.description,
          departments: templateData.departments,
          keyRoles: templateData.keyRoles,
          bestPractices: templateData.bestPractices,
          antiPatterns: templateData.antiPatterns,
          isBuiltIn: true,
        });

        logger.info("Built-in template seeded", {
          name: templateData.name,
        });
      }

      logger.info("Built-in templates seeding complete");
    } catch (error) {
      logger.error(
        "Failed to seed built-in templates",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  /**
   * Get all built-in templates
   */
  async getBuiltInTemplates(): Promise<any[]> {
    try {
      const templates = await prisma.aRIndustryTemplate.findMany({
        where: { isBuiltIn: true },
        orderBy: [{ industry: "asc" }, { growthStage: "asc" }, { name: "asc" }],
      });

      return templates;
    } catch (error) {
      logger.error(
        "Failed to get built-in templates",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  // ==========================================================================
  // ANALYTICS
  // ==========================================================================

  /**
   * Increment usage count for a template
   */
  async incrementUsageCount(id: string): Promise<void> {
    try {
      await prisma.aRIndustryTemplate.update({
        where: { id },
        data: {
          usageCount: {
            increment: 1,
          },
        },
      });

      logger.info("Template usage count incremented", { templateId: id });
    } catch (error) {
      logger.error(
        "Failed to increment template usage count",
        { id },
        error instanceof Error ? error : new Error(String(error)),
      );
      // Don't throw - this is a non-critical operation
    }
  }

  /**
   * Update average rating for a template
   */
  async updateRating(id: string, rating: number): Promise<void> {
    try {
      const template = await this.findById(id);
      if (!template) {
        throw new Error(`Template ${id} not found`);
      }

      // Simple moving average
      const currentAvg = template.avgRating || 0;
      const currentCount = template.usageCount || 0;
      const newAvg =
        currentCount > 0
          ? (currentAvg * currentCount + rating) / (currentCount + 1)
          : rating;

      await prisma.aRIndustryTemplate.update({
        where: { id },
        data: {
          avgRating: newAvg,
        },
      });

      logger.info("Template rating updated", { templateId: id, newAvg });
    } catch (error) {
      logger.error(
        "Failed to update template rating",
        { id, rating },
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }
}

// Export singleton instance
export const industryTemplateService = new IndustryTemplateService();
