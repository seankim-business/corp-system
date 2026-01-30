/**
 * AR Scheduling - Type Definitions
 *
 * Additional types for scheduling services that complement the main AR types.
 */

import {
  AvailabilityStatus,
  EntityType,
  LeaveType,
  MeetingType,
  SchedulingRule,
} from '../types';

// =============================================================================
// Time and Date Types
// =============================================================================

export interface DateRange {
  start: Date;
  end: Date;
}

export interface TimeSlot {
  start: Date;
  end: Date;
  timezone?: string;
}

export interface BlockedSlot {
  from: string; // HH:mm format
  to: string; // HH:mm format
  reason?: string;
}

// =============================================================================
// Availability Types
// =============================================================================

export interface AvailabilityMatrix {
  slot: TimeSlot;
  available: {
    userId: string;
    isAvailable: boolean;
    status: AvailabilityStatus;
    conflicts: string[];
  }[];
  allAvailable: boolean;
}

// =============================================================================
// Meeting Scheduling Types
// =============================================================================

export interface SchedulingPreferences {
  preferredStartTime?: string; // HH:mm format
  preferredEndTime?: string; // HH:mm format
  preferredDays?: number[]; // 0-6 (Sunday-Saturday)
  avoidBackToBack?: boolean;
  bufferMinutes?: number; // Buffer time between meetings
  prioritizeParticipants?: string[]; // User IDs to prioritize
  timezone?: string;
}

export interface ARMeetingCreateInput {
  organizationId: string;
  title: string;
  description?: string;
  meetingType: MeetingType;
  humanParticipants: string[]; // User IDs
  agentParticipants: string[]; // Agent IDs
  scheduledAt: Date;
  durationMinutes: number;
  timezone: string;
  isRecurring?: boolean;
  recurrenceRule?: string; // RRULE format
  location?: string;
  calendarEventId?: string;
  metadata?: Record<string, any>;
}

export interface SchedulingContext {
  organizationId: string;
  participants: {
    userId: string;
    entityType: EntityType;
    role?: string;
    priority?: number;
  }[];
  duration: number; // minutes
  preferences?: SchedulingPreferences;
  rules: SchedulingRule[];
  existingMeetings: {
    userId: string;
    meetings: TimeSlot[];
  }[];
  availability: {
    userId: string;
    slots: {
      date: Date;
      availableFrom: string;
      availableUntil: string;
      blockedSlots: BlockedSlot[];
    }[];
  }[];
}

export interface RuleResult {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  score: number;
  reason?: string;
}

// =============================================================================
// Leave Management Types
// =============================================================================

export interface LeaveRequestInput {
  organizationId: string;
  entityId: string;
  entityType: EntityType;
  leaveType: LeaveType;
  startDate: Date;
  endDate: Date;
  reason?: string;
}

// =============================================================================
// Calendar Sync Types
// =============================================================================

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  attendees?: { email: string; name?: string }[];
  status: 'confirmed' | 'tentative' | 'cancelled';
}

export interface CalendarSyncResult {
  userId: string;
  syncedAt: Date;
  eventsImported: number;
  availabilityUpdated: boolean;
  errors: string[];
}
