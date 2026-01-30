/**
 * AR Scheduling - Meeting Scheduler Service
 *
 * Intelligent meeting scheduling with optimal slot finding, scoring algorithms,
 * and automatic calendar integration.
 */

import { db } from '../../db/client';
import { ARError } from '../errors';
import {
  TimeSlot,
  SchedulingPreferences,
  ARMeetingCreateInput,
  SchedulingContext,
  RuleResult,
} from './types';
import { SchedulingRule, EntityType, SchedulingScore } from '../types';
import { AvailabilityService } from './availability.service';

export class MeetingSchedulerService {
  private availabilityService: AvailabilityService;

  constructor() {
    this.availabilityService = new AvailabilityService();
  }

  /**
   * Find optimal time slots for a meeting
   */
  async findOptimalSlot(
    participants: string[],
    duration: number,
    preferences?: SchedulingPreferences,
  ): Promise<TimeSlot[]> {
    if (participants.length === 0) {
      throw new ARError('INVALID_INPUT', 'At least one participant is required');
    }

    // Get user's organization from first participant
    const firstUser = await db.user.findUnique({
      where: { id: participants[0] },
      select: {
        memberships: {
          select: { organizationId: true },
          take: 1,
        },
      },
    });

    const organizationId = firstUser?.memberships?.[0]?.organizationId;
    if (!organizationId) {
      throw new ARError('USER_NOT_FOUND', `User ${participants[0]} not found or has no organization`);
    }

    // Get scheduling rules for organization
    const rules = await this.getSchedulingRules(organizationId);

    // Generate candidate slots for next 14 days
    const now = new Date();
    const endDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const candidateSlots = this.generateCandidateSlots(
      now,
      endDate,
      duration,
      preferences,
    );

    // Build scheduling context
    const context: SchedulingContext = {
      organizationId,
      participants: participants.map((userId) => ({
        userId,
        entityType: 'human' as EntityType,
      })),
      duration,
      preferences,
      rules,
      existingMeetings: [], // TODO: Fetch from ARMeeting table
      availability: [], // TODO: Fetch from HumanAvailability
    };

    // Score each candidate slot
    const scoredSlots = await Promise.all(
      candidateSlots.map(async (slot) => ({
        slot,
        score: await this.calculateSlotScore(slot, context),
      })),
    );

    // Filter feasible slots and sort by score
    const feasibleSlots = scoredSlots
      .filter((s) => s.score.feasible && s.score.totalScore > 0)
      .sort((a, b) => b.score.totalScore - a.score.totalScore)
      .slice(0, 5) // Return top 5 options
      .map((s) => s.slot);

    return feasibleSlots;
  }

  /**
   * Schedule a meeting
   */
  async scheduleMeeting(meeting: ARMeetingCreateInput): Promise<any> {
    // Validate participants availability
    const slot: TimeSlot = {
      start: meeting.scheduledAt,
      end: new Date(
        meeting.scheduledAt.getTime() + meeting.durationMinutes * 60 * 1000,
      ),
    };

    const availability = await this.availabilityService.checkAvailability(
      meeting.humanParticipants,
      slot,
    );

    if (!availability.allAvailable) {
      const unavailable = availability.available
        .filter((a) => !a.isAvailable)
        .map((a) => a.userId);
      throw new ARError(
        'PARTICIPANTS_UNAVAILABLE',
        `Participants unavailable: ${unavailable.join(', ')}`,
      );
    }

    // Create meeting record
    const createdMeeting = await db.aRMeeting.create({
      data: {
        organizationId: meeting.organizationId,
        title: meeting.title,
        description: meeting.description,
        meetingType: meeting.meetingType,
        humanParticipants: meeting.humanParticipants,
        agentParticipants: meeting.agentParticipants,
        scheduledAt: meeting.scheduledAt,
        durationMinutes: meeting.durationMinutes,
        timezone: meeting.timezone,
        isRecurring: meeting.isRecurring || false,
        recurrenceRule: meeting.recurrenceRule,
        googleEventId: meeting.calendarEventId,
        status: 'scheduled',
      },
    });

    return createdMeeting;
  }

  /**
   * Reschedule an existing meeting
   */
  async rescheduleMeeting(meetingId: string, newSlot: TimeSlot): Promise<any> {
    const meeting = await db.aRMeeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      throw new ARError('MEETING_NOT_FOUND', `Meeting ${meetingId} not found`);
    }

    // Check availability for new slot
    const availability = await this.availabilityService.checkAvailability(
      meeting.humanParticipants,
      newSlot,
    );

    if (!availability.allAvailable) {
      throw new ARError(
        'PARTICIPANTS_UNAVAILABLE',
        'Not all participants are available for the new time slot',
      );
    }

    // Update meeting
    const updated = await db.aRMeeting.update({
      where: { id: meetingId },
      data: {
        scheduledAt: newSlot.start,
        durationMinutes: Math.round(
          (newSlot.end.getTime() - newSlot.start.getTime()) / 60000,
        ),
      },
    });

    return updated;
  }

  /**
   * Cancel a meeting
   */
  async cancelMeeting(meetingId: string, _reason?: string): Promise<void> {
    const meeting = await db.aRMeeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      throw new ARError('MEETING_NOT_FOUND', `Meeting ${meetingId} not found`);
    }

    await db.aRMeeting.update({
      where: { id: meetingId },
      data: {
        status: 'cancelled',
      },
    });
  }

  /**
   * Calculate scoring for a time slot (implements Addendum A algorithm)
   */
  private async calculateSlotScore(
    slot: TimeSlot,
    context: SchedulingContext,
  ): Promise<SchedulingScore> {
    let totalScore = 100; // Start with perfect score
    const participantScores: SchedulingScore['participantScores'] = [];
    const ruleApplications: SchedulingScore['ruleApplications'] = [];
    let feasible = true;

    // Check each participant's availability
    for (const participant of context.participants) {
      const conflicts: string[] = [];
      const preferences: string[] = [];
      let participantScore = 100;

      // Check against existing meetings
      const userMeetings =
        context.existingMeetings.find((m) => m.userId === participant.userId)
          ?.meetings || [];

      for (const existing of userMeetings) {
        if (this.slotsOverlap(slot, existing)) {
          conflicts.push('Overlaps with existing meeting');
          participantScore -= 50;
          feasible = false;
        }
      }

      // Check availability data
      const userAvail =
        context.availability.find((a) => a.userId === participant.userId)
          ?.slots || [];

      const slotDate = slot.start.toISOString().split('T')[0];
      const dayAvail = userAvail.find(
        (a) => a.date.toISOString().split('T')[0] === slotDate,
      );

      if (dayAvail) {
        const slotStart = slot.start.toTimeString().slice(0, 5);
        const slotEnd = slot.end.toTimeString().slice(0, 5);

        if (
          slotStart < dayAvail.availableFrom ||
          slotEnd > dayAvail.availableUntil
        ) {
          conflicts.push('Outside available hours');
          participantScore -= 30;
        }

        // Check blocked slots
        for (const blocked of dayAvail.blockedSlots) {
          if (!(slotEnd <= blocked.from || slotStart >= blocked.to)) {
            conflicts.push(blocked.reason || 'Blocked slot');
            participantScore -= 40;
            feasible = false;
          }
        }
      }

      participantScores.push({
        entityId: participant.userId,
        entityType: participant.entityType,
        score: Math.max(0, participantScore),
        conflicts,
        preferences,
      });

      totalScore += participantScore;
    }

    // Apply scheduling rules
    for (const rule of context.rules) {
      if (!rule.enabled) continue;

      const result = this.applySchedulingRule(slot, rule);
      if (result.passed) {
        totalScore += result.score;
      } else {
        totalScore += result.score; // Score is negative for penalties
      }

      ruleApplications.push({
        ruleId: result.ruleId,
        ruleName: result.ruleName,
        impact: result.score,
      });
    }

    // Apply preference bonuses
    if (context.preferences) {
      const prefs = context.preferences;
      const slotStart = slot.start.toTimeString().slice(0, 5);
      const dayOfWeek = slot.start.getDay();

      if (prefs.preferredStartTime && slotStart === prefs.preferredStartTime) {
        totalScore += 20;
      }

      if (prefs.preferredDays && prefs.preferredDays.includes(dayOfWeek)) {
        totalScore += 10;
      }
    }

    return {
      timeSlot: slot,
      totalScore: Math.max(0, totalScore),
      participantScores,
      ruleApplications,
      feasible,
    };
  }

  /**
   * Apply a scheduling rule to a time slot
   */
  private applySchedulingRule(slot: TimeSlot, rule: SchedulingRule): RuleResult {
    let score = 0;
    let passed = true;
    let reason: string | undefined;

    const slotStart = slot.start.toTimeString().slice(0, 5);
    const slotEnd = slot.end.toTimeString().slice(0, 5);
    const dayOfWeek = slot.start.getDay();

    // Check time range conditions
    if (rule.conditions.timeRanges) {
      const inPreferredRange = rule.conditions.timeRanges.some(
        (range) => slotStart >= range.start && slotEnd <= range.end,
      );

      if (inPreferredRange && rule.scoring.preferredTimes) {
        score += rule.scoring.preferredTimes;
        reason = 'In preferred time range';
      } else if (!inPreferredRange && rule.scoring.avoidTimes) {
        score -= rule.scoring.avoidTimes;
        passed = false;
        reason = 'Outside preferred time range';
      }
    }

    // Check day of week conditions
    if (rule.conditions.daysOfWeek) {
      if (!rule.conditions.daysOfWeek.includes(dayOfWeek)) {
        score -= 10;
        passed = false;
        reason = 'Not on preferred day of week';
      }
    }

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      passed,
      score,
      reason,
    };
  }

  /**
   * Generate candidate time slots within a date range
   */
  private generateCandidateSlots(
    start: Date,
    end: Date,
    durationMinutes: number,
    preferences?: SchedulingPreferences,
  ): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const workHourStart = preferences?.preferredStartTime || '09:00';
    const workHourEnd = preferences?.preferredEndTime || '18:00';

    for (
      let d = new Date(start);
      d <= end;
      d.setDate(d.getDate() + 1)
    ) {
      const dayOfWeek = d.getDay();

      // Skip weekends by default unless specified
      if (
        !preferences?.preferredDays ||
        preferences.preferredDays.includes(dayOfWeek)
      ) {
        // Skip weekends if no preference specified
        if (!preferences?.preferredDays && (dayOfWeek === 0 || dayOfWeek === 6)) {
          continue;
        }

        // Generate slots every 30 minutes within work hours
        const [startHour, startMin] = workHourStart.split(':').map(Number);
        const [endHour, endMin] = workHourEnd.split(':').map(Number);

        for (let hour = startHour; hour < endHour; hour++) {
          for (let min = 0; min < 60; min += 30) {
            if (hour === startHour && min < startMin) continue;
            if (hour === endHour - 1 && min + durationMinutes > endMin) break;

            const slotStart = new Date(d);
            slotStart.setHours(hour, min, 0, 0);

            const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);

            slots.push({ start: slotStart, end: slotEnd });
          }
        }
      }
    }

    return slots;
  }

  /**
   * Check if two time slots overlap
   */
  private slotsOverlap(slot1: TimeSlot, slot2: TimeSlot): boolean {
    return slot1.start < slot2.end && slot1.end > slot2.start;
  }

  /**
   * Get active scheduling rules for an organization
   */
  private async getSchedulingRules(
    _organizationId: string,
  ): Promise<SchedulingRule[]> {
    // For now, return empty array. This would fetch from a SchedulingRule table
    // that doesn't exist yet in the schema
    return [];
  }
}
