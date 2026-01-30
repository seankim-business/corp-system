/**
 * AR Coach Meta-Agent
 *
 * Provides personalized development guidance, feedback, and growth
 * recommendations for agents. Focuses on skill development, performance
 * improvement, and career progression.
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { redis } from "../../db/redis";

// =============================================================================
// TYPES
// =============================================================================

export interface SkillAssessment {
  skill: string;
  currentLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  targetLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  gap: number;
  priority: 'low' | 'medium' | 'high';
  resources: string[];
}

export interface DevelopmentGoal {
  id: string;
  title: string;
  description: string;
  category: 'skill' | 'performance' | 'leadership' | 'specialization';
  targetDate: Date;
  progress: number;
  milestones: {
    title: string;
    completed: boolean;
    completedAt?: Date;
  }[];
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked';
}

export interface PerformanceFeedback {
  id: string;
  period: {
    start: Date;
    end: Date;
  };
  overallRating: number;
  strengths: string[];
  areasForImprovement: string[];
  achievements: string[];
  actionItems: {
    action: string;
    priority: 'low' | 'medium' | 'high';
    deadline?: Date;
  }[];
}

export interface DevelopmentPlan {
  agentId: string;
  agentName: string;
  currentPosition: string;
  createdAt: Date;
  updatedAt: Date;
  skillAssessments: SkillAssessment[];
  developmentGoals: DevelopmentGoal[];
  recentFeedback: PerformanceFeedback[];
  careerPath: {
    currentLevel: number;
    nextPosition?: string;
    requirements: string[];
    readiness: number;
  };
  recommendations: string[];
}

export interface CoachingSession {
  id: string;
  agentId: string;
  scheduledAt: Date;
  duration: number;
  type: 'performance_review' | 'skill_development' | 'career_planning' | 'goal_setting';
  topics: string[];
  outcomes?: string[];
  nextSteps?: string[];
  status: 'scheduled' | 'completed' | 'cancelled';
}

// =============================================================================
// SERVICE
// =============================================================================

export class ARCoachAgent {
  private organizationId: string;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
  }

  /**
   * Generate development plan for an agent
   */
  async generateDevelopmentPlan(agentId: string): Promise<DevelopmentPlan> {
    logger.info("AR Coach: Generating development plan", {
      organizationId: this.organizationId,
      agentId,
    });

    const assignment = await prisma.agentAssignment.findFirst({
      where: {
        organizationId: this.organizationId,
        agentId,
        status: 'active',
      },
      include: {
        agent: true,
        position: {
          include: {
            department: true,
          },
        },
      },
    });

    if (!assignment) {
      throw new Error(`No active assignment found for agent ${agentId}`);
    }

    // Assess skills
    const skillAssessments = await this.assessSkills(
      assignment.agent,
      assignment.position
    );

    // Generate development goals
    const developmentGoals = this.generateDevelopmentGoals(
      skillAssessments,
      assignment.position.level
    );

    // Get recent feedback (if any)
    const recentFeedback = await this.getRecentFeedback(agentId);

    // Analyze career path
    const careerPath = await this.analyzeCareerPath(
      assignment.agent,
      assignment.position
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      skillAssessments,
      developmentGoals,
      careerPath,
      recentFeedback
    );

    const plan: DevelopmentPlan = {
      agentId,
      agentName: assignment.agent.name,
      currentPosition: assignment.position.title,
      createdAt: new Date(),
      updatedAt: new Date(),
      skillAssessments,
      developmentGoals,
      recentFeedback,
      careerPath,
      recommendations,
    };

    // Cache plan
    const cacheKey = `ar:dev-plan:${agentId}`;
    await redis.set(cacheKey, JSON.stringify(plan), 604800); // 7 days

    return plan;
  }

  /**
   * Assess agent's skills against position requirements
   */
  private async assessSkills(
    agent: { skills: string[] },
    position: { requiredSkills: string[]; level: number }
  ): Promise<SkillAssessment[]> {
    const assessments: SkillAssessment[] = [];
    const agentSkills = new Set(agent.skills.map(s => s.toLowerCase()));

    // Level mappings
    const levelToSkillLevel = (level: number): SkillAssessment['targetLevel'] => {
      if (level <= 1) return 'beginner';
      if (level <= 2) return 'intermediate';
      if (level <= 4) return 'advanced';
      return 'expert';
    };

    for (const requiredSkill of position.requiredSkills) {
      const hasSkill = agentSkills.has(requiredSkill.toLowerCase());
      const targetLevel = levelToSkillLevel(position.level);

      // Simplified skill level assessment
      // In production, this would be more sophisticated
      let currentLevel: SkillAssessment['currentLevel'] = 'beginner';
      if (hasSkill) {
        // If agent has the skill, assume intermediate as base
        currentLevel = position.level <= 2 ? 'intermediate' : 'advanced';
      }

      const levelValues = { beginner: 1, intermediate: 2, advanced: 3, expert: 4 };
      const gap = levelValues[targetLevel] - levelValues[currentLevel];

      assessments.push({
        skill: requiredSkill,
        currentLevel,
        targetLevel,
        gap: Math.max(0, gap),
        priority: gap >= 2 ? 'high' : gap >= 1 ? 'medium' : 'low',
        resources: this.getSkillResources(requiredSkill, currentLevel, targetLevel),
      });
    }

    return assessments;
  }

  /**
   * Get learning resources for a skill
   */
  private getSkillResources(
    skill: string,
    _currentLevel: SkillAssessment['currentLevel'],
    targetLevel: SkillAssessment['targetLevel']
  ): string[] {
    // Simplified resource recommendations
    // In production, this would pull from a learning management system
    const resources: string[] = [];

    if (targetLevel === 'intermediate' || targetLevel === 'advanced') {
      resources.push(`${skill} fundamentals documentation`);
      resources.push(`Practice projects for ${skill}`);
    }

    if (targetLevel === 'advanced' || targetLevel === 'expert') {
      resources.push(`Advanced ${skill} patterns and techniques`);
      resources.push(`${skill} certification program`);
    }

    if (targetLevel === 'expert') {
      resources.push(`${skill} thought leadership content`);
      resources.push(`Mentorship with ${skill} expert`);
    }

    return resources;
  }

  /**
   * Generate development goals based on assessments
   */
  private generateDevelopmentGoals(
    skillAssessments: SkillAssessment[],
    currentLevel: number
  ): DevelopmentGoal[] {
    const goals: DevelopmentGoal[] = [];
    const now = new Date();

    // Skill development goals
    const prioritySkills = skillAssessments.filter(s => s.gap > 0);
    for (const skill of prioritySkills.slice(0, 3)) {
      goals.push({
        id: `goal-skill-${skill.skill}-${Date.now()}`,
        title: `Develop ${skill.skill} to ${skill.targetLevel} level`,
        description: `Close the skill gap in ${skill.skill} through focused learning and practice`,
        category: 'skill',
        targetDate: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000), // 90 days
        progress: 0,
        milestones: [
          { title: 'Complete foundational training', completed: false },
          { title: 'Apply skills in project', completed: false },
          { title: 'Achieve target proficiency', completed: false },
        ],
        status: 'not_started',
      });
    }

    // Performance goal
    goals.push({
      id: `goal-perf-${Date.now()}`,
      title: 'Maintain high performance rating',
      description: 'Consistently deliver high-quality work and meet deadlines',
      category: 'performance',
      targetDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days
      progress: 0,
      milestones: [
        { title: 'Complete all assigned tasks on time', completed: false },
        { title: 'Receive positive feedback from collaborators', completed: false },
        { title: 'Zero critical errors', completed: false },
      ],
      status: 'not_started',
    });

    // Leadership goal for senior positions
    if (currentLevel >= 3) {
      goals.push({
        id: `goal-lead-${Date.now()}`,
        title: 'Develop leadership capabilities',
        description: 'Build skills in mentoring, decision-making, and team coordination',
        category: 'leadership',
        targetDate: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000), // 180 days
        progress: 0,
        milestones: [
          { title: 'Mentor a junior agent', completed: false },
          { title: 'Lead a cross-functional initiative', completed: false },
          { title: 'Complete leadership training', completed: false },
        ],
        status: 'not_started',
      });
    }

    return goals;
  }

  /**
   * Get recent feedback for an agent
   */
  private async getRecentFeedback(agentId: string): Promise<PerformanceFeedback[]> {
    // In production, this would fetch from a feedback/review system
    // For now, generate based on current assignment data
    const assignment = await prisma.agentAssignment.findFirst({
      where: { agentId, status: 'active' },
    });

    if (!assignment || assignment.performanceScore === null) {
      return [];
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const feedback: PerformanceFeedback = {
      id: `feedback-${Date.now()}`,
      period: {
        start: thirtyDaysAgo,
        end: now,
      },
      overallRating: assignment.performanceScore,
      strengths: [],
      areasForImprovement: [],
      achievements: [],
      actionItems: [],
    };

    // Generate feedback based on score
    if (assignment.performanceScore >= 80) {
      feedback.strengths.push('Consistently high-quality output');
      feedback.strengths.push('Reliable task completion');
      feedback.achievements.push('Maintained excellent performance rating');
    } else if (assignment.performanceScore >= 60) {
      feedback.strengths.push('Solid performance');
      feedback.areasForImprovement.push('Opportunity to increase output quality');
    } else {
      feedback.areasForImprovement.push('Performance below expectations');
      feedback.areasForImprovement.push('Task completion rate needs improvement');
      feedback.actionItems.push({
        action: 'Schedule performance improvement meeting',
        priority: 'high',
      });
    }

    // Add workload feedback
    if (assignment.workload >= 0.9) {
      feedback.areasForImprovement.push('Managing heavy workload');
      feedback.actionItems.push({
        action: 'Review task prioritization',
        priority: 'medium',
      });
    } else if (assignment.workload < 0.4) {
      feedback.areasForImprovement.push('Capacity underutilization');
      feedback.actionItems.push({
        action: 'Explore additional responsibilities',
        priority: 'low',
      });
    }

    return [feedback];
  }

  /**
   * Analyze career path and progression
   */
  private async analyzeCareerPath(
    agent: { id: string; skills: string[] },
    currentPosition: { level: number; departmentId: string; requiredSkills: string[] }
  ): Promise<DevelopmentPlan['careerPath']> {
    // Find potential next positions
    const nextPositions = await prisma.agentPosition.findMany({
      where: {
        organizationId: this.organizationId,
        departmentId: currentPosition.departmentId,
        level: currentPosition.level + 1,
      },
      take: 3,
    });

    const nextPosition = nextPositions[0];
    const requirements: string[] = [];
    let readiness = 0;

    if (nextPosition) {
      // Calculate readiness based on skill match
      const agentSkills = new Set(agent.skills.map(s => s.toLowerCase()));
      const requiredSkills = nextPosition.requiredSkills || [];

      let matchedSkills = 0;
      for (const skill of requiredSkills) {
        if (agentSkills.has(skill.toLowerCase())) {
          matchedSkills++;
        } else {
          requirements.push(`Develop ${skill} skill`);
        }
      }

      readiness = requiredSkills.length > 0
        ? Math.round((matchedSkills / requiredSkills.length) * 100)
        : 50;

      // Add generic requirements
      requirements.push(`Demonstrate ${nextPosition.title} level responsibilities`);
      requirements.push('Build leadership and mentoring capabilities');
    }

    return {
      currentLevel: currentPosition.level,
      nextPosition: nextPosition?.title,
      requirements,
      readiness,
    };
  }

  /**
   * Generate personalized recommendations
   */
  private generateRecommendations(
    skillAssessments: SkillAssessment[],
    developmentGoals: DevelopmentGoal[],
    careerPath: DevelopmentPlan['careerPath'],
    feedback: PerformanceFeedback[]
  ): string[] {
    const recommendations: string[] = [];

    // Skill-based recommendations
    const highPrioritySkills = skillAssessments.filter(s => s.priority === 'high');
    if (highPrioritySkills.length > 0) {
      recommendations.push(
        `Focus on developing: ${highPrioritySkills.map(s => s.skill).join(', ')}`
      );
    }

    // Goal-based recommendations
    const unstarted = developmentGoals.filter(g => g.status === 'not_started');
    if (unstarted.length > 0) {
      recommendations.push(
        `Begin work on: ${unstarted[0].title}`
      );
    }

    // Career-based recommendations
    if (careerPath.nextPosition && careerPath.readiness < 70) {
      recommendations.push(
        `To progress to ${careerPath.nextPosition}, focus on: ${careerPath.requirements.slice(0, 2).join(', ')}`
      );
    } else if (careerPath.readiness >= 70) {
      recommendations.push(
        `Ready for promotion consideration to ${careerPath.nextPosition}`
      );
    }

    // Feedback-based recommendations
    const recentFeedback = feedback[0];
    if (recentFeedback && recentFeedback.actionItems.length > 0) {
      for (const item of recentFeedback.actionItems.filter(i => i.priority === 'high')) {
        recommendations.push(item.action);
      }
    }

    // Generic recommendations if none yet
    if (recommendations.length === 0) {
      recommendations.push('Continue building expertise in current role');
      recommendations.push('Seek opportunities for cross-functional collaboration');
    }

    return recommendations.slice(0, 5);
  }

  /**
   * Schedule a coaching session
   */
  async scheduleCoachingSession(
    agentId: string,
    type: CoachingSession['type'],
    topics: string[]
  ): Promise<CoachingSession> {
    const session: CoachingSession = {
      id: `session-${Date.now()}`,
      agentId,
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      duration: 30, // 30 minutes
      type,
      topics,
      status: 'scheduled',
    };

    // Cache session
    const cacheKey = `ar:coaching-session:${session.id}`;
    await redis.set(cacheKey, JSON.stringify(session), 604800);

    logger.info("AR Coach: Session scheduled", {
      sessionId: session.id,
      agentId,
      type,
    });

    return session;
  }

  /**
   * Complete a coaching session with outcomes
   */
  async completeCoachingSession(
    sessionId: string,
    outcomes: string[],
    nextSteps: string[]
  ): Promise<CoachingSession | null> {
    const cacheKey = `ar:coaching-session:${sessionId}`;
    const cached = await redis.get(cacheKey);

    if (!cached) {
      return null;
    }

    const session: CoachingSession = JSON.parse(cached);
    session.status = 'completed';
    session.outcomes = outcomes;
    session.nextSteps = nextSteps;

    await redis.set(cacheKey, JSON.stringify(session), 604800);

    logger.info("AR Coach: Session completed", {
      sessionId,
      outcomes: outcomes.length,
      nextSteps: nextSteps.length,
    });

    return session;
  }

  /**
   * Get development plan for an agent (from cache if available)
   */
  async getDevelopmentPlan(agentId: string): Promise<DevelopmentPlan | null> {
    const cacheKey = `ar:dev-plan:${agentId}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    return null;
  }

  /**
   * Update goal progress
   */
  async updateGoalProgress(
    agentId: string,
    goalId: string,
    progress: number,
    completedMilestones?: number[]
  ): Promise<DevelopmentPlan | null> {
    const plan = await this.getDevelopmentPlan(agentId);
    if (!plan) {
      return null;
    }

    const goal = plan.developmentGoals.find(g => g.id === goalId);
    if (!goal) {
      return null;
    }

    goal.progress = progress;
    if (progress > 0) {
      goal.status = 'in_progress';
    }
    if (progress >= 100) {
      goal.status = 'completed';
    }

    if (completedMilestones) {
      for (const idx of completedMilestones) {
        if (goal.milestones[idx]) {
          goal.milestones[idx].completed = true;
          goal.milestones[idx].completedAt = new Date();
        }
      }
    }

    plan.updatedAt = new Date();

    const cacheKey = `ar:dev-plan:${agentId}`;
    await redis.set(cacheKey, JSON.stringify(plan), 604800);

    return plan;
  }

  /**
   * Get coaching recommendations for all agents in organization
   */
  async getOrganizationCoachingNeeds(): Promise<{
    needsImmediate: string[];
    needsRegular: string[];
    onTrack: string[];
  }> {
    const assignments = await prisma.agentAssignment.findMany({
      where: {
        organizationId: this.organizationId,
        status: 'active',
      },
      include: {
        agent: true,
      },
    });

    const needsImmediate: string[] = [];
    const needsRegular: string[] = [];
    const onTrack: string[] = [];

    for (const assignment of assignments) {
      const score = assignment.performanceScore;

      if (score !== null && score < 50) {
        needsImmediate.push(assignment.agent.name);
      } else if (score !== null && score < 70) {
        needsRegular.push(assignment.agent.name);
      } else {
        onTrack.push(assignment.agent.name);
      }
    }

    return { needsImmediate, needsRegular, onTrack };
  }
}

// Factory function
export function createARCoach(organizationId: string): ARCoachAgent {
  return new ARCoachAgent(organizationId);
}
