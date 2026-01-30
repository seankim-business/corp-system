/**
 * AR Scheduling - Leave Manager Service
 *
 * Manages leave requests for humans and agents, including approval workflows,
 * coverage assignment, and automatic availability updates.
 */

import { db } from '../../db/client';
import { ARError } from '../errors';
import { LeaveRequestInput, DateRange } from './types';
import { EntityType } from '../types';
import { AvailabilityService } from './availability.service';

export class LeaveManagerService {
  private availabilityService: AvailabilityService;

  constructor() {
    this.availabilityService = new AvailabilityService();
  }

  /**
   * Submit a leave request
   */
  async requestLeave(request: LeaveRequestInput): Promise<any> {
    // Validate dates
    if (request.startDate > request.endDate) {
      throw new ARError(
        'INVALID_DATE_RANGE',
        'Start date must be before or equal to end date',
      );
    }

    // Check if entity exists
    if (request.entityType === 'human') {
      const user = await db.user.findUnique({
        where: { id: request.entityId },
      });
      if (!user) {
        throw new ARError('USER_NOT_FOUND', `User ${request.entityId} not found`);
      }
    } else if (request.entityType === 'agent') {
      const agent = await db.agent.findUnique({
        where: { id: request.entityId },
      });
      if (!agent) {
        throw new ARError('AGENT_NOT_FOUND', `Agent ${request.entityId} not found`);
      }
    }

    // Check for overlapping leave requests
    const overlapping = await db.aRLeaveRequest.findFirst({
      where: {
        organizationId: request.organizationId,
        entityId: request.entityId,
        entityType: request.entityType,
        status: {
          in: ['pending', 'approved'],
        },
        OR: [
          {
            startDate: { lte: request.endDate },
            endDate: { gte: request.startDate },
          },
        ],
      },
    });

    if (overlapping) {
      throw new ARError(
        'OVERLAPPING_LEAVE',
        `Leave request overlaps with existing request ${overlapping.id}`,
      );
    }

    // Create leave request
    const leaveRequest = await db.aRLeaveRequest.create({
      data: {
        organizationId: request.organizationId,
        entityId: request.entityId,
        entityType: request.entityType,
        leaveType: request.leaveType,
        startDate: request.startDate,
        endDate: request.endDate,
        reason: request.reason,
        status: 'pending',
      },
    });

    return leaveRequest;
  }

  /**
   * Approve a leave request
   */
  async approveLeave(requestId: string, approvalId: string): Promise<any> {
    const leaveRequest = await db.aRLeaveRequest.findUnique({
      where: { id: requestId },
    });

    if (!leaveRequest) {
      throw new ARError('LEAVE_REQUEST_NOT_FOUND', `Leave request ${requestId} not found`);
    }

    if (leaveRequest.status !== 'pending') {
      throw new ARError(
        'INVALID_STATUS',
        `Leave request is already ${leaveRequest.status}`,
      );
    }

    // Update leave request status
    const updated = await db.aRLeaveRequest.update({
      where: { id: requestId },
      data: {
        status: 'approved',
        approvalId,
      },
    });

    // Update availability for humans
    if (updated.entityType === 'human') {
      await this.updateAvailabilityForLeave(
        updated.entityId,
        updated.startDate,
        updated.endDate,
        updated.leaveType,
      );
    }

    // TODO: If it's an agent, update AgentCapacity records

    return updated;
  }

  /**
   * Reject a leave request
   */
  async rejectLeave(
    requestId: string,
    approvalId: string,
    _reason: string,
  ): Promise<any> {
    const leaveRequest = await db.aRLeaveRequest.findUnique({
      where: { id: requestId },
    });

    if (!leaveRequest) {
      throw new ARError('LEAVE_REQUEST_NOT_FOUND', `Leave request ${requestId} not found`);
    }

    if (leaveRequest.status !== 'pending') {
      throw new ARError(
        'INVALID_STATUS',
        `Leave request is already ${leaveRequest.status}`,
      );
    }

    const updated = await db.aRLeaveRequest.update({
      where: { id: requestId },
      data: {
        status: 'rejected',
        approvalId,
      },
    });

    return updated;
  }

  /**
   * Assign coverage for a leave request
   */
  async assignCoverage(
    requestId: string,
    coveringEntityId: string,
    coveringType: EntityType,
  ): Promise<any> {
    const leaveRequest = await db.aRLeaveRequest.findUnique({
      where: { id: requestId },
    });

    if (!leaveRequest) {
      throw new ARError('LEAVE_REQUEST_NOT_FOUND', `Leave request ${requestId} not found`);
    }

    // Validate covering entity exists
    if (coveringType === 'human') {
      const user = await db.user.findUnique({
        where: { id: coveringEntityId },
      });
      if (!user) {
        throw new ARError('USER_NOT_FOUND', `User ${coveringEntityId} not found`);
      }
    } else if (coveringType === 'agent') {
      const agent = await db.agent.findUnique({
        where: { id: coveringEntityId },
      });
      if (!agent) {
        throw new ARError('AGENT_NOT_FOUND', `Agent ${coveringEntityId} not found`);
      }
    }

    // Check if covering entity is available during the leave period
    if (coveringType === 'human') {
      const coveringLeaves = await db.aRLeaveRequest.findMany({
        where: {
          entityId: coveringEntityId,
          entityType: 'human',
          status: 'approved',
          OR: [
            {
              startDate: { lte: leaveRequest.endDate },
              endDate: { gte: leaveRequest.startDate },
            },
          ],
        },
      });

      if (coveringLeaves.length > 0) {
        throw new ARError(
          'COVERING_ENTITY_UNAVAILABLE',
          `Covering entity is on leave during this period`,
        );
      }
    }

    // Update leave request with coverage assignment
    const updated = await db.aRLeaveRequest.update({
      where: { id: requestId },
      data: {
        coveringEntity: coveringEntityId,
        coveringType,
      },
    });

    return updated;
  }

  /**
   * Get upcoming leave requests for an organization
   */
  async getUpcomingLeaves(
    organizationId: string,
    dateRange: DateRange,
  ): Promise<any[]> {
    const leaves = await db.aRLeaveRequest.findMany({
      where: {
        organizationId,
        status: {
          in: ['pending', 'approved'],
        },
        OR: [
          {
            startDate: { lte: dateRange.end },
            endDate: { gte: dateRange.start },
          },
        ],
      },
      orderBy: {
        startDate: 'asc',
      },
    });

    return leaves;
  }

  /**
   * Update availability records for approved leave
   */
  private async updateAvailabilityForLeave(
    userId: string,
    startDate: Date,
    endDate: Date,
    leaveType: string,
  ): Promise<void> {
    const status =
      leaveType === 'vacation'
        ? 'vacation'
        : leaveType === 'sick'
          ? 'sick'
          : 'busy';

    // Update availability for each day in the leave period
    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setDate(d.getDate() + 1)
    ) {
      await this.availabilityService.setAvailability(
        userId,
        new Date(d),
        status as any,
      );
    }
  }
}
