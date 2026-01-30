import { ARAssignmentService } from "../../ar/organization/ar-assignment.service";
import { db as prisma } from "../../db/client";

jest.mock("../../db/client", () => ({
  db: {
    agent: {
      findUnique: jest.fn(),
    },
    agentPosition: {
      findUnique: jest.fn(),
    },
    agentAssignment: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("../../services/audit-logger", () => ({
  auditLogger: {
    log: jest.fn(),
  },
}));

jest.mock("../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("ARAssignmentService", () => {
  let service: ARAssignmentService;

  beforeEach(() => {
    service = new ARAssignmentService();
    jest.clearAllMocks();
  });

  describe("create", () => {
    it("should create a new assignment when position has capacity", async () => {
      const mockAgent = {
        id: "agent-1",
        organizationId: "org-1",
        status: "active",
        name: "Test Agent",
      };

      const mockPosition = {
        id: "position-1",
        title: "Senior Designer",
        maxConcurrent: 5,
        assignments: [{ status: "active" }],
        department: {
          name: "Design",
        },
      };

      const mockAssignment = {
        id: "assignment-1",
        organizationId: "org-1",
        agentId: "agent-1",
        positionId: "position-1",
        assignmentType: "permanent",
        status: "active",
        workload: 1.0,
      };

      (prisma.agent.findUnique as jest.Mock as jest.Mock).mockResolvedValue(mockAgent as any);
      (prisma.agentPosition.findUnique as jest.Mock as jest.Mock).mockResolvedValue(mockPosition as any);
      (prisma.agentAssignment.create as jest.Mock as jest.Mock).mockResolvedValue(mockAssignment as any);

      const result = await service.create({
        organizationId: "org-1",
        agentId: "agent-1",
        positionId: "position-1",
      });

      expect(result).toEqual(mockAssignment);
      expect(prisma.agentAssignment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: "org-1",
          agentId: "agent-1",
          positionId: "position-1",
          assignmentType: "permanent",
          status: "active",
        }),
      });
    });

    it("should throw error when position is at capacity", async () => {
      const mockAgent = {
        id: "agent-1",
        organizationId: "org-1",
        status: "active",
      };

      const mockPosition = {
        id: "position-1",
        maxConcurrent: 1,
        assignments: [{ status: "active" }],
      };

      (prisma.agent.findUnique as jest.Mock as jest.Mock).mockResolvedValue(mockAgent as any);
      (prisma.agentPosition.findUnique as jest.Mock as jest.Mock).mockResolvedValue(mockPosition as any);

      await expect(
        service.create({
          organizationId: "org-1",
          agentId: "agent-1",
          positionId: "position-1",
        }),
      ).rejects.toThrow("Position at capacity");
    });

    it("should throw error when agent is not active", async () => {
      const mockAgent = {
        id: "agent-1",
        organizationId: "org-1",
        status: "inactive",
      };

      (prisma.agent.findUnique as jest.Mock).mockResolvedValue(mockAgent as any);

      await expect(
        service.create({
          organizationId: "org-1",
          agentId: "agent-1",
          positionId: "position-1",
        }),
      ).rejects.toThrow("Agent is not active");
    });
  });

  describe("assignAgent", () => {
    it("should prevent duplicate active assignments to same position", async () => {
      const mockAgent = {
        id: "agent-1",
        organizationId: "org-1",
      };

      const mockExistingAssignment = {
        id: "assignment-1",
        agentId: "agent-1",
        positionId: "position-1",
        status: "active",
      };

      (prisma.agent.findUnique as jest.Mock).mockResolvedValue(mockAgent as any);
      (prisma.agentAssignment.findFirst as jest.Mock).mockResolvedValue(mockExistingAssignment as any);

      await expect(service.assignAgent("agent-1", "position-1")).rejects.toThrow(
        "already assigned to this position",
      );
    });
  });

  describe("updateWorkload", () => {
    it("should update workload within valid range", async () => {
      const mockUpdated = {
        id: "assignment-1",
        workload: 0.5,
      };

      (prisma.agentAssignment.update as jest.Mock).mockResolvedValue(mockUpdated as any);

      const result = await service.updateWorkload("assignment-1", 0.5);

      expect(result.workload).toBe(0.5);
      expect(prisma.agentAssignment.update).toHaveBeenCalledWith({
        where: { id: "assignment-1" },
        data: { workload: 0.5 },
      });
    });

    it("should throw error for invalid workload", async () => {
      await expect(service.updateWorkload("assignment-1", 1.5)).rejects.toThrow(
        "Workload must be between 0 and 1",
      );

      await expect(service.updateWorkload("assignment-1", -0.1)).rejects.toThrow(
        "Workload must be between 0 and 1",
      );
    });
  });

  describe("updatePerformanceScore", () => {
    it("should update performance score within valid range", async () => {
      const mockUpdated = {
        id: "assignment-1",
        performanceScore: 85,
      };

      (prisma.agentAssignment.update as jest.Mock).mockResolvedValue(mockUpdated as any);

      const result = await service.updatePerformanceScore("assignment-1", 85);

      expect(result.performanceScore).toBe(85);
    });

    it("should throw error for invalid performance score", async () => {
      await expect(service.updatePerformanceScore("assignment-1", 101)).rejects.toThrow(
        "Performance score must be between 0 and 100",
      );

      await expect(service.updatePerformanceScore("assignment-1", -1)).rejects.toThrow(
        "Performance score must be between 0 and 100",
      );
    });
  });

  describe("getAgentSupervisor", () => {
    it("should return both human and position supervisor when available", async () => {
      const mockUser = {
        id: "user-1",
        email: "supervisor@example.com",
      };

      const mockReportsToPosition = {
        id: "position-manager",
        title: "Department Head",
      };

      const mockAssignment = {
        agentId: "agent-1",
        status: "active",
        humanSupervisor: "user-1",
        position: {
          reportsTo: mockReportsToPosition,
        },
      };

      (prisma.agentAssignment.findFirst as jest.Mock).mockResolvedValue(mockAssignment as any);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser as any);

      const result = await service.getAgentSupervisor("agent-1");

      expect(result).toEqual({
        human: mockUser,
        agentPosition: mockReportsToPosition,
      });
    });

    it("should return null when agent has no active assignment", async () => {
      (prisma.agentAssignment.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.getAgentSupervisor("agent-1");

      expect(result).toBeNull();
    });
  });
});
