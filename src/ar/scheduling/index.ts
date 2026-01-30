/**
 * AR Scheduling Module
 *
 * Exports all scheduling services and types for managing availability,
 * capacity, meetings, and leave requests.
 */

export * from './types';
export * from './availability.service';
export * from './capacity.service';
export * from './meeting-scheduler.service';
export * from './leave-manager.service';

// Calendar Sync - rename CalendarEvent to avoid collision with types.ts
export {
  CalendarSyncService,
  calendarSyncService,
  type CalendarEvent as CalendarSyncEvent,
  type AvailabilitySlot,
  type SyncResult,
  type SyncConfig,
} from './calendar-sync.service';

// Project Date Optimizer
export {
  ProjectDateOptimizerService,
  projectDateOptimizerService,
  type ProjectTimeline,
  type MilestoneTimeline,
  type ResourceAllocation,
  type ResourceConflict,
  type TimelineRisk,
  type OptimizationConstraints,
  type OptimizationResult,
} from './project-date-optimizer.service';
