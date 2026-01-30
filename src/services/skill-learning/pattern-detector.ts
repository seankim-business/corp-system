import { PrismaClient } from '@prisma/client';
import { ExecutionPattern, GeneratedSkillSuggestion } from './types';

export class PatternDetector {
  private prisma: PrismaClient;
  private minFrequency = 3; // Minimum times pattern must occur

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Get patterns ready for skill generation
   */
  async getValidPatterns(organizationId: string): Promise<ExecutionPattern[]> {
    const patterns = await this.prisma.skillLearningPattern.findMany({
      where: {
        organizationId,
        status: 'detected',
        frequency: { gte: this.minFrequency },
      },
      orderBy: { frequency: 'desc' },
      take: 20,
    });

    return patterns.map((p: any) => ({
      id: p.id,
      organizationId: p.organizationId,
      patternHash: p.patternHash,
      patternType: p.patternType as ExecutionPattern['patternType'],
      steps: p.steps as any,
      frequency: p.frequency,
      triggerPhrases: p.triggerPhrases,
      contextTags: p.contextTags,
      status: p.status as ExecutionPattern['status'],
      firstSeenAt: p.firstSeenAt,
      lastSeenAt: p.lastSeenAt,
    }));
  }

  /**
   * Generate skill suggestions from patterns
   */
  async generateSuggestions(organizationId: string): Promise<GeneratedSkillSuggestion[]> {
    const patterns = await this.getValidPatterns(organizationId);
    const suggestions: GeneratedSkillSuggestion[] = [];

    for (const pattern of patterns) {
      const suggestion = this.patternToSuggestion(pattern);
      if (suggestion.confidence >= 0.5) {
        suggestions.push(suggestion);
      }
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  private patternToSuggestion(pattern: ExecutionPattern): GeneratedSkillSuggestion {
    const steps = pattern.steps;

    // Generate name from steps
    const toolNames: string[] = steps
      .map((s: any) => s.toolName || s.skillId)
      .filter((v: unknown): v is string => typeof v === 'string')
      .slice(0, 3);

    const suggestedName = toolNames.length > 0
      ? `auto-${toolNames.join('-')}`
      : `auto-pattern-${pattern.patternHash.slice(0, 8)}`;

    // Generate description
    const suggestedDescription = `Automatically generated skill that combines: ${toolNames.join(', ')}. ` +
      `This pattern was detected ${pattern.frequency} times.`;

    // Extract trigger phrases from context
    const suggestedTriggers = [
      ...pattern.contextTags,
      ...toolNames,
    ];

    // Calculate confidence based on frequency and consistency
    const confidence = Math.min(
      0.95,
      0.3 + (pattern.frequency * 0.1) + (steps.length > 2 ? 0.2 : 0)
    );

    return {
      pattern,
      suggestedName,
      suggestedDescription,
      suggestedTriggers: [...new Set(suggestedTriggers)],
      confidence,
    };
  }

  /**
   * Mark pattern as validated (ready for conversion)
   */
  async validatePattern(patternId: string): Promise<void> {
    await this.prisma.skillLearningPattern.update({
      where: { id: patternId },
      data: { status: 'validated' },
    });
  }

  /**
   * Dismiss a pattern (don't suggest again)
   */
  async dismissPattern(patternId: string): Promise<void> {
    await this.prisma.skillLearningPattern.update({
      where: { id: patternId },
      data: { status: 'dismissed' },
    });
  }
}
