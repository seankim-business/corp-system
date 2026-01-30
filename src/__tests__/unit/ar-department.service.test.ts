/**
 * AR Department Service - Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ARDepartmentService } from '../../ar/organization/ar-department.service';
import { ARNotFoundError, ARValidationError, ARConflictError } from '../../ar/errors';

// Mock dependencies
vi.mock('../../db/client', () => ({
  db: {
    agentDepartment: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    aRCostEntry: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../services/audit-logger', () => ({
  auditLogger: {
    log: vi.fn(),
  },
}));

describe('ARDepartmentService', () => {
  let service: ARDepartmentService;

  beforeEach(() => {
    service = new ARDepartmentService();
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create a department with valid data', async () => {
      const mockDepartment = {
        id: 'dept-1',
        organizationId: 'org-1',
        name: 'Engineering',
        code: 'ENGINEERING',
        description: 'Engineering department',
        parentId: null,
        headAgentId: null,
        headHumanId: null,
        budgetCents: 100000,
        costCenter: null,
        status: 'active',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const { db } = await import('../../db/client');
      vi.mocked(db.agentDepartment.findFirst).mockResolvedValue(null);
      vi.mocked(db.agentDepartment.create).mockResolvedValue(mockDepartment);

      const result = await service.create('org-1', {
        name: 'Engineering',
        description: 'Engineering department',
      });

      expect(result).toEqual(mockDepartment);
      expect(db.agentDepartment.create).toHaveBeenCalled();
    });

    it('should throw conflict error for duplicate code', async () => {
      const existingDepartment = {
        id: 'dept-1',
        organizationId: 'org-1',
        name: 'Engineering',
        code: 'ENGINEERING',
        description: 'Engineering department',
        parentId: null,
        headAgentId: null,
        headHumanId: null,
        budgetCents: 100000,
        costCenter: null,
        status: 'active',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const { db } = await import('../../db/client');
      vi.mocked(db.agentDepartment.findFirst).mockResolvedValue(existingDepartment);

      await expect(
        service.create('org-1', {
          name: 'Engineering',
          description: 'Engineering department',
        })
      ).rejects.toThrow(ARConflictError);
    });
  });

  describe('findById', () => {
    it('should find department by ID', async () => {
      const mockDepartment = {
        id: 'dept-1',
        organizationId: 'org-1',
        name: 'Engineering',
        code: 'ENGINEERING',
        description: 'Engineering department',
        parentId: null,
        headAgentId: null,
        headHumanId: null,
        budgetCents: 100000,
        costCenter: null,
        status: 'active',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const { db } = await import('../../db/client');
      vi.mocked(db.agentDepartment.findUnique).mockResolvedValue(mockDepartment);

      const result = await service.findById('dept-1');

      expect(result).toEqual(mockDepartment);
      expect(db.agentDepartment.findUnique).toHaveBeenCalledWith({
        where: { id: 'dept-1' },
      });
    });

    it('should return null for non-existent department', async () => {
      const { db } = await import('../../db/client');
      vi.mocked(db.agentDepartment.findUnique).mockResolvedValue(null);

      const result = await service.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update department successfully', async () => {
      const existingDepartment = {
        id: 'dept-1',
        organizationId: 'org-1',
        name: 'Engineering',
        code: 'ENGINEERING',
        description: 'Engineering department',
        parentId: null,
        headAgentId: null,
        headHumanId: null,
        budgetCents: 100000,
        costCenter: null,
        status: 'active',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedDepartment = {
        ...existingDepartment,
        name: 'Engineering & Design',
      };

      const { db } = await import('../../db/client');
      vi.mocked(db.agentDepartment.findUnique).mockResolvedValue(existingDepartment);
      vi.mocked(db.agentDepartment.update).mockResolvedValue(updatedDepartment);

      const result = await service.update('dept-1', {
        name: 'Engineering & Design',
      });

      expect(result.name).toBe('Engineering & Design');
      expect(db.agentDepartment.update).toHaveBeenCalled();
    });

    it('should throw not found error for non-existent department', async () => {
      const { db } = await import('../../db/client');
      vi.mocked(db.agentDepartment.findUnique).mockResolvedValue(null);

      await expect(
        service.update('non-existent', { name: 'New Name' })
      ).rejects.toThrow(ARNotFoundError);
    });
  });

  describe('delete', () => {
    it('should soft delete department by archiving', async () => {
      const mockDepartment = {
        id: 'dept-1',
        organizationId: 'org-1',
        name: 'Engineering',
        code: 'ENGINEERING',
        description: 'Engineering department',
        parentId: null,
        headAgentId: null,
        headHumanId: null,
        budgetCents: 100000,
        costCenter: null,
        status: 'active',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const { db } = await import('../../db/client');
      vi.mocked(db.agentDepartment.findUnique).mockResolvedValue(mockDepartment);
      vi.mocked(db.agentDepartment.findMany).mockResolvedValue([]);
      vi.mocked(db.agentDepartment.update).mockResolvedValue({
        ...mockDepartment,
        status: 'archived',
      });

      await service.delete('dept-1');

      expect(db.agentDepartment.update).toHaveBeenCalledWith({
        where: { id: 'dept-1' },
        data: { status: 'archived' },
      });
    });

    it('should throw validation error when deleting department with children', async () => {
      const mockDepartment = {
        id: 'dept-1',
        organizationId: 'org-1',
        name: 'Engineering',
        code: 'ENGINEERING',
        description: 'Engineering department',
        parentId: null,
        headAgentId: null,
        headHumanId: null,
        budgetCents: 100000,
        costCenter: null,
        status: 'active',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const childDepartment = {
        ...mockDepartment,
        id: 'dept-2',
        name: 'Frontend',
        code: 'FRONTEND',
        parentId: 'dept-1',
      };

      const { db } = await import('../../db/client');
      vi.mocked(db.agentDepartment.findUnique).mockResolvedValue(mockDepartment);
      vi.mocked(db.agentDepartment.findMany).mockResolvedValue([childDepartment]);

      await expect(service.delete('dept-1')).rejects.toThrow(ARValidationError);
    });
  });

  describe('updateBudget', () => {
    it('should update department budget', async () => {
      const mockDepartment = {
        id: 'dept-1',
        organizationId: 'org-1',
        name: 'Engineering',
        code: 'ENGINEERING',
        description: 'Engineering department',
        parentId: null,
        headAgentId: null,
        headHumanId: null,
        budgetCents: 100000,
        costCenter: null,
        status: 'active',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedDepartment = {
        ...mockDepartment,
        budgetCents: 200000,
      };

      const { db } = await import('../../db/client');
      vi.mocked(db.agentDepartment.findUnique).mockResolvedValue(mockDepartment);
      vi.mocked(db.agentDepartment.update).mockResolvedValue(updatedDepartment);

      const result = await service.updateBudget('dept-1', 200000);

      expect(result.budgetCents).toBe(200000);
      expect(db.agentDepartment.update).toHaveBeenCalledWith({
        where: { id: 'dept-1' },
        data: { budgetCents: 200000 },
      });
    });

    it('should throw validation error for negative budget', async () => {
      await expect(service.updateBudget('dept-1', -1000)).rejects.toThrow(
        ARValidationError
      );
    });
  });

  describe('getHierarchy', () => {
    it('should build department hierarchy tree', async () => {
      const departments = [
        {
          id: 'dept-1',
          organizationId: 'org-1',
          name: 'Engineering',
          code: 'ENGINEERING',
          description: 'Engineering department',
          parentId: null,
          headAgentId: null,
          headHumanId: null,
          budgetCents: 100000,
          costCenter: null,
          status: 'active',
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'dept-2',
          organizationId: 'org-1',
          name: 'Frontend',
          code: 'FRONTEND',
          description: 'Frontend team',
          parentId: 'dept-1',
          headAgentId: null,
          headHumanId: null,
          budgetCents: 50000,
          costCenter: null,
          status: 'active',
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const { db } = await import('../../db/client');
      vi.mocked(db.agentDepartment.findMany).mockResolvedValue(departments);

      const hierarchy = await service.getHierarchy('org-1');

      expect(hierarchy).toHaveLength(1);
      expect(hierarchy[0].name).toBe('Engineering');
      expect(hierarchy[0].children).toHaveLength(1);
      expect(hierarchy[0].children[0].name).toBe('Frontend');
    });
  });
});
