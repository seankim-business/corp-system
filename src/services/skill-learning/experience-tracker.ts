import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { createHash } from 'crypto';
import { ExecutionStep } from './types';
import { logger } from '../../utils/logger';

export class ExperienceTracker {
  private prisma: PrismaClient;
  private redis: Redis | null;
  private bufferKey = 'skill:exp:buffer:';
  private bufferSize = 100;

  constructor(prisma: PrismaClient, redis?: Redis) {
    this.prisma = prisma;
    this.redis = redis || null;
  }

  /**
   * Track an execution step for pattern learning
   */
  async trackExecution(
    organizationId: string,
    sessionId: string,
    step: ExecutionStep
  ): Promise<void> {
    const key = `${this.bufferKey}${organizationId}:${sessionId}`;

    if (this.redis) {
      // Add to session buffer
      await this.redis.rpush(key, JSON.stringify(step));
      await this.redis.expire(key, 3600); // 1 hour TTL

      // Check buffer size
      const size = await this.redis.llen(key);
      if (size >= this.bufferSize) {
        await this.flushBuffer(organizationId, sessionId);
      }
    }
  }

  /**
   * Mark session complete and analyze patterns
   */
  async completeSession(organizationId: string, sessionId: string): Promise<void> {
    await this.flushBuffer(organizationId, sessionId);
  }

  private async flushBuffer(organizationId: string, sessionId: string): Promise<void> {
    if (!this.redis) return;

    const key = `${this.bufferKey}${organizationId}:${sessionId}`;
    const items = await this.redis.lrange(key, 0, -1);

    if (items.length < 2) {
      await this.redis.del(key);
      return;
    }

    const steps: ExecutionStep[] = items.map(item => JSON.parse(item));

    // Detect patterns in the execution sequence
    await this.detectPatterns(organizationId, steps);

    // Clear buffer
    await this.redis.del(key);
  }

  private async detectPatterns(organizationId: string, steps: ExecutionStep[]): Promise<void> {
    // Look for sequences of 2+ successful steps
    const sequences = this.findSequences(steps);

    for (const sequence of sequences) {
      const patternHash = this.hashPattern(sequence);

      try {
        // Upsert pattern
        await this.prisma.skillLearningPattern.upsert({
          where: {
            organizationId_patternHash: {
              organizationId,
              patternHash,
            },
          },
          create: {
            organizationId,
            patternHash,
            patternType: sequence.length > 2 ? 'composite' : 'sequence',
            steps: sequence as any,
            frequency: 1,
            triggerPhrases: [],
            contextTags: this.extractTags(sequence),
            status: 'detected',
          },
          update: {
            frequency: { increment: 1 },
            lastSeenAt: new Date(),
            contextTags: this.extractTags(sequence),
          },
        });
      } catch (error) {
        logger.error('Failed to save pattern', { organizationId, patternHash }, error as Error);
      }
    }
  }

  private findSequences(steps: ExecutionStep[]): ExecutionStep[][] {
    const sequences: ExecutionStep[][] = [];
    let current: ExecutionStep[] = [];

    for (const step of steps) {
      if (step.success) {
        current.push(step);
      } else {
        if (current.length >= 2) {
          sequences.push([...current]);
        }
        current = [];
      }
    }

    if (current.length >= 2) {
      sequences.push(current);
    }

    return sequences;
  }

  private hashPattern(steps: ExecutionStep[]): string {
    const signature = steps.map(s =>
      `${s.skillId || s.toolName}:${Object.keys(s.input).sort().join(',')}`
    ).join('|');

    return createHash('sha256').update(signature).digest('hex').slice(0, 16);
  }

  private extractTags(steps: ExecutionStep[]): string[] {
    const tags = new Set<string>();

    for (const step of steps) {
      if (step.provider) tags.add(step.provider);
      if (step.skillId) tags.add(step.skillId);
      if (step.toolName) tags.add(step.toolName.split('__')[0]);
    }

    return Array.from(tags);
  }
}
