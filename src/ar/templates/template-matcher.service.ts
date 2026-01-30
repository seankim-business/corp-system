/**
 * Template Matcher Service
 *
 * Matches organizations to industry templates based on characteristics
 * like industry, size, growth stage, and organizational needs.
 * Uses multi-factor scoring for optimal template recommendations.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { redis } from "../../db/redis";
import { IndustryType, CompanySize, GrowthStage } from "../types";

// =============================================================================
// TYPES
// =============================================================================

export interface OrganizationProfile {
  organizationId: string;
  industry: IndustryType;
  companySize: CompanySize;
  growthStage: GrowthStage;
  currentAgentCount: number;
  currentDepartmentCount: number;
  goals?: string[];
  challenges?: string[];
  preferences?: {
    flatStructure?: boolean;
    maxHierarchyDepth?: number;
    prioritizeSpecialization?: boolean;
  };
}

export interface TemplateMatchScore {
  templateId: string;
  templateName: string;
  industry: IndustryType;
  companySize: CompanySize;
  growthStage: GrowthStage;
  overallScore: number;
  factors: {
    industryMatch: number;
    sizeMatch: number;
    stageMatch: number;
    goalsAlignment: number;
    popularityScore: number;
  };
  strengths: string[];
  considerations: string[];
  isRecommended: boolean;
}

export interface MatchResult {
  organizationId: string;
  matchedAt: Date;
  profile: OrganizationProfile;
  matches: TemplateMatchScore[];
  topRecommendation: TemplateMatchScore | null;
  insights: string[];
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const MATCH_WEIGHTS = {
  industry: 0.35,      // Industry match is most important
  companySize: 0.25,   // Size affects structure significantly
  growthStage: 0.20,   // Growth stage impacts team composition
  goals: 0.10,         // Goals alignment
  popularity: 0.10,    // How successful others found it
};

const SIZE_COMPATIBILITY: Record<CompanySize, CompanySize[]> = {
  startup: ['startup', 'smb'],
  smb: ['startup', 'smb', 'enterprise'],
  enterprise: ['smb', 'enterprise'],
};

const STAGE_COMPATIBILITY: Record<GrowthStage, GrowthStage[]> = {
  seed: ['seed', 'growth'],
  growth: ['seed', 'growth', 'mature'],
  mature: ['growth', 'mature'],
};

// =============================================================================
// SERVICE
// =============================================================================

export class TemplateMatcherService {
  /**
   * Match organization to best templates
   */
  async matchTemplates(
    profile: OrganizationProfile,
    options?: {
      limit?: number;
      includePartialMatches?: boolean;
    }
  ): Promise<MatchResult> {
    const startTime = Date.now();
    logger.info("Matching templates for organization", {
      organizationId: profile.organizationId,
      industry: profile.industry,
    });

    // Check cache first
    const cacheKey = `ar:template-match:${profile.organizationId}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Return cache if profile hasn't changed significantly
      if (this.profileMatchesCache(profile, parsed.profile)) {
        return parsed;
      }
    }

    // Get all available templates
    const templates = await prisma.aRIndustryTemplate.findMany({
      where: {
        // Don't filter by industry here - we want to score all and rank
      },
      orderBy: [
        { usageCount: 'desc' },
        { avgRating: 'desc' },
      ],
    });

    // Score each template
    const matches: TemplateMatchScore[] = [];

    for (const template of templates) {
      const score = this.calculateTemplateScore(profile, template);

      // Only include if meets minimum threshold or partial matches allowed
      if (score.overallScore >= 50 || options?.includePartialMatches) {
        matches.push(score);
      }
    }

    // Sort by overall score
    matches.sort((a, b) => b.overallScore - a.overallScore);

    // Limit results
    const limitedMatches = matches.slice(0, options?.limit || 5);

    // Generate insights
    const insights = this.generateInsights(profile, limitedMatches);

    const result: MatchResult = {
      organizationId: profile.organizationId,
      matchedAt: new Date(),
      profile,
      matches: limitedMatches,
      topRecommendation: limitedMatches[0] || null,
      insights,
    };

    // Cache result
    await redis.set(cacheKey, JSON.stringify(result), 3600);

    logger.info("Template matching complete", {
      organizationId: profile.organizationId,
      matchesFound: limitedMatches.length,
      topScore: limitedMatches[0]?.overallScore || 0,
      durationMs: Date.now() - startTime,
    });

    return result;
  }

  /**
   * Calculate match score for a single template
   */
  private calculateTemplateScore(
    profile: OrganizationProfile,
    template: any
  ): TemplateMatchScore {
    const factors = {
      industryMatch: this.calculateIndustryMatch(profile.industry, template.industry),
      sizeMatch: this.calculateSizeMatch(profile.companySize, template.companySize),
      stageMatch: this.calculateStageMatch(profile.growthStage, template.growthStage),
      goalsAlignment: this.calculateGoalsAlignment(profile.goals, template),
      popularityScore: this.calculatePopularityScore(template),
    };

    // Calculate weighted overall score
    const overallScore = Math.round(
      factors.industryMatch * MATCH_WEIGHTS.industry +
      factors.sizeMatch * MATCH_WEIGHTS.companySize +
      factors.stageMatch * MATCH_WEIGHTS.growthStage +
      factors.goalsAlignment * MATCH_WEIGHTS.goals +
      factors.popularityScore * MATCH_WEIGHTS.popularity
    );

    // Identify strengths and considerations
    const { strengths, considerations } = this.identifyStrengthsAndConsiderations(
      profile,
      template,
      factors
    );

    return {
      templateId: template.id,
      templateName: template.name,
      industry: template.industry,
      companySize: template.companySize,
      growthStage: template.growthStage,
      overallScore,
      factors,
      strengths,
      considerations,
      isRecommended: overallScore >= 75,
    };
  }

  /**
   * Calculate industry match score
   */
  private calculateIndustryMatch(
    orgIndustry: IndustryType,
    templateIndustry: string
  ): number {
    if (orgIndustry === templateIndustry) {
      return 100;
    }

    // Related industries score partial match
    const relatedIndustries: Record<IndustryType, IndustryType[]> = {
      technology: ['finance', 'healthcare'],
      fashion: ['ecommerce'],
      ecommerce: ['fashion', 'manufacturing'],
      manufacturing: ['ecommerce', 'technology'],
      finance: ['technology'],
      healthcare: ['technology'],
    };

    const related = relatedIndustries[orgIndustry] || [];
    if (related.includes(templateIndustry as IndustryType)) {
      return 70;
    }

    return 30; // Base score for any template
  }

  /**
   * Calculate company size match score
   */
  private calculateSizeMatch(
    orgSize: CompanySize,
    templateSize: string
  ): number {
    if (orgSize === templateSize) {
      return 100;
    }

    const compatible = SIZE_COMPATIBILITY[orgSize] || [];
    if (compatible.includes(templateSize as CompanySize)) {
      return 70;
    }

    return 30;
  }

  /**
   * Calculate growth stage match score
   */
  private calculateStageMatch(
    orgStage: GrowthStage,
    templateStage: string
  ): number {
    if (orgStage === templateStage) {
      return 100;
    }

    const compatible = STAGE_COMPATIBILITY[orgStage] || [];
    if (compatible.includes(templateStage as GrowthStage)) {
      return 70;
    }

    return 30;
  }

  /**
   * Calculate goals alignment score
   */
  private calculateGoalsAlignment(
    goals: string[] | undefined,
    template: any
  ): number {
    if (!goals || goals.length === 0) {
      return 50; // Neutral score if no goals specified
    }

    const bestPractices = template.bestPractices || [];
    const keyRoles = template.keyRoles || [];

    // Check how many goals align with template best practices and key roles
    let alignedGoals = 0;

    for (const goal of goals) {
      const goalLower = goal.toLowerCase();

      // Check against best practices
      for (const practice of bestPractices) {
        if (typeof practice === 'string' && practice.toLowerCase().includes(goalLower)) {
          alignedGoals++;
          break;
        }
      }

      // Check against key roles
      for (const role of keyRoles) {
        if (typeof role === 'string' && role.toLowerCase().includes(goalLower)) {
          alignedGoals++;
          break;
        }
      }
    }

    const alignmentRatio = alignedGoals / goals.length;
    return Math.round(50 + alignmentRatio * 50);
  }

  /**
   * Calculate popularity score based on usage and ratings
   */
  private calculatePopularityScore(template: any): number {
    const usageScore = Math.min(template.usageCount * 2, 50);
    const ratingScore = template.avgRating ? (template.avgRating / 5) * 50 : 25;

    return Math.round(usageScore + ratingScore);
  }

  /**
   * Identify strengths and considerations for a template
   */
  private identifyStrengthsAndConsiderations(
    profile: OrganizationProfile,
    template: any,
    factors: TemplateMatchScore['factors']
  ): { strengths: string[]; considerations: string[] } {
    const strengths: string[] = [];
    const considerations: string[] = [];

    // Industry match
    if (factors.industryMatch === 100) {
      strengths.push('Perfect industry match');
    } else if (factors.industryMatch >= 70) {
      strengths.push('Related industry with applicable practices');
    } else {
      considerations.push('Different industry - verify applicability');
    }

    // Size match
    if (factors.sizeMatch === 100) {
      strengths.push('Designed for your company size');
    } else if (factors.sizeMatch >= 70) {
      strengths.push('Adaptable to your company size');
    } else {
      considerations.push('May need significant scaling adjustments');
    }

    // Stage match
    if (factors.stageMatch === 100) {
      strengths.push('Optimized for your growth stage');
    } else {
      considerations.push('Consider growth trajectory alignment');
    }

    // Popularity
    if (template.usageCount > 50) {
      strengths.push(`Proven by ${template.usageCount}+ organizations`);
    }

    if (template.avgRating && template.avgRating >= 4.0) {
      strengths.push(`Highly rated (${template.avgRating.toFixed(1)}/5)`);
    }

    // Check departments
    const departments = template.departments || [];
    if (departments.length > profile.currentDepartmentCount * 2) {
      considerations.push('More complex structure than current setup');
    }

    return { strengths, considerations };
  }

  /**
   * Generate insights from match results
   */
  private generateInsights(
    profile: OrganizationProfile,
    matches: TemplateMatchScore[]
  ): string[] {
    const insights: string[] = [];

    if (matches.length === 0) {
      insights.push('No templates closely match your profile. Consider creating a custom template.');
      return insights;
    }

    const topMatch = matches[0];

    if (topMatch.overallScore >= 90) {
      insights.push(`Excellent match found: "${topMatch.templateName}" is highly aligned with your organization.`);
    } else if (topMatch.overallScore >= 75) {
      insights.push(`Good match found: "${topMatch.templateName}" should work well with minor adaptations.`);
    } else if (topMatch.overallScore >= 60) {
      insights.push(`Moderate match: "${topMatch.templateName}" may require customization for optimal fit.`);
    } else {
      insights.push('Limited matches found. A hybrid approach combining multiple templates may be beneficial.');
    }

    // Industry-specific insights
    const sameIndustryMatches = matches.filter(m => m.factors.industryMatch === 100);
    if (sameIndustryMatches.length > 1) {
      insights.push(`${sameIndustryMatches.length} templates are specifically designed for your industry.`);
    }

    // Size-related insights
    if (profile.companySize === 'startup' && profile.growthStage === 'growth') {
      insights.push('Consider templates that support scaling, as your organization is in growth mode.');
    }

    // Diversity insight
    if (matches.length >= 3) {
      const avgScore = matches.reduce((sum, m) => sum + m.overallScore, 0) / matches.length;
      if (avgScore >= 70) {
        insights.push('Multiple good options available - consider your specific priorities when choosing.');
      }
    }

    return insights;
  }

  /**
   * Check if cached profile still matches current profile
   */
  private profileMatchesCache(
    current: OrganizationProfile,
    cached: OrganizationProfile
  ): boolean {
    return (
      current.industry === cached.industry &&
      current.companySize === cached.companySize &&
      current.growthStage === cached.growthStage &&
      current.currentAgentCount === cached.currentAgentCount
    );
  }

  /**
   * Build organization profile from database
   */
  async buildOrganizationProfile(organizationId: string): Promise<OrganizationProfile> {
    const [org, agentCount, deptCount] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: organizationId },
      }),
      prisma.agentAssignment.count({
        where: {
          organizationId,
          status: 'active',
        },
      }),
      prisma.agentDepartment.count({
        where: {
          organizationId,
          status: 'active',
        },
      }),
    ]);

    if (!org) {
      throw new Error(`Organization not found: ${organizationId}`);
    }

    const settings = org.settings as Record<string, unknown> | null;

    return {
      organizationId,
      industry: (settings?.industry as IndustryType) || 'other',
      companySize: (settings?.companySize as CompanySize) || 'startup',
      growthStage: (settings?.growthStage as GrowthStage) || 'seed',
      currentAgentCount: agentCount,
      currentDepartmentCount: deptCount,
      goals: settings?.arGoals as string[] | undefined,
      challenges: settings?.arChallenges as string[] | undefined,
    };
  }
}

// Export singleton instance
export const templateMatcherService = new TemplateMatcherService();
