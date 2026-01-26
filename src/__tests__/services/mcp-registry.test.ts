import {
  getActiveMCPConnections,
  getMCPConnectionsByProvider,
  createMCPConnection,
  updateMCPConnection,
  deleteMCPConnection,
} from "../../services/mcp-registry";
import { db as prisma } from "../../db/client";

jest.mock("../../utils/cache", () => ({
  cache: {
    remember: async (_key: string, fn: () => Promise<any>) => fn(),
  },
}));

jest.mock("../../db/client", () => ({
  db: {
    mCPConnection: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

describe("MCP Registry Service", () => {
  const mockOrgId = "550e8400-e29b-41d4-a716-446655440000";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getActiveMCPConnections", () => {
    it("should return active connections for organization", async () => {
      const mockConnections = [
        {
          id: "1",
          organizationId: mockOrgId,
          provider: "linear",
          name: "Linear Production",
          config: { apiKey: "test" },
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (prisma.mCPConnection.findMany as jest.Mock).mockResolvedValue(mockConnections);

      const result = await getActiveMCPConnections(mockOrgId);

      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe("linear");
      expect(prisma.mCPConnection.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: mockOrgId,
          enabled: true,
        },
      });
    });
  });

  describe("getMCPConnectionsByProvider", () => {
    it("should filter connections by provider", async () => {
      const mockConnections = [
        {
          id: "1",
          organizationId: mockOrgId,
          provider: "linear",
          name: "Linear Prod",
          config: {},
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "2",
          organizationId: mockOrgId,
          provider: "notion",
          name: "Notion",
          config: {},
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (prisma.mCPConnection.findMany as jest.Mock).mockResolvedValue(mockConnections);

      const result = await getMCPConnectionsByProvider(mockOrgId, "linear");

      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe("linear");
    });
  });

  describe("createMCPConnection", () => {
    it("should create new MCP connection", async () => {
      const newConnection = {
        organizationId: mockOrgId,
        provider: "jira",
        name: "Jira Cloud",
        config: { apiToken: "test", domain: "test.atlassian.net" },
      };

      const mockCreated = {
        id: "3",
        ...newConnection,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.mCPConnection.create as jest.Mock).mockResolvedValue(mockCreated);

      const result = await createMCPConnection(newConnection);

      expect(result.provider).toBe("jira");
      expect(result.enabled).toBe(true);
      expect(prisma.mCPConnection.create).toHaveBeenCalledWith({
        data: {
          ...newConnection,
          enabled: true,
        },
      });
    });
  });

  describe("updateMCPConnection", () => {
    it("should update connection name", async () => {
      const connectionId = "1";
      const updates = { name: "Linear Updated" };

      (prisma.mCPConnection.update as jest.Mock).mockResolvedValue({});

      await updateMCPConnection(connectionId, updates);

      expect(prisma.mCPConnection.update).toHaveBeenCalledWith({
        where: { id: connectionId },
        data: updates,
      });
    });

    it("should toggle connection enabled state", async () => {
      const connectionId = "1";
      const updates = { enabled: false };

      (prisma.mCPConnection.update as jest.Mock).mockResolvedValue({});

      await updateMCPConnection(connectionId, updates);

      expect(prisma.mCPConnection.update).toHaveBeenCalledWith({
        where: { id: connectionId },
        data: updates,
      });
    });
  });

  describe("deleteMCPConnection", () => {
    it("should delete connection", async () => {
      const connectionId = "1";

      (prisma.mCPConnection.delete as jest.Mock).mockResolvedValue({});

      await deleteMCPConnection(connectionId);

      expect(prisma.mCPConnection.delete).toHaveBeenCalledWith({
        where: { id: connectionId },
      });
    });
  });
});
