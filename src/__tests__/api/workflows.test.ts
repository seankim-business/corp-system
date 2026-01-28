import request from "supertest";
import express from "express";
import workflowsRouter from "../../api/workflows";

// Mock dependencies
jest.mock("../../db/client", () => ({
  db: {
    workflow: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    workflowExecution: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    notionConnection: {
      findUnique: jest.fn(),
    },
    mCPConnection: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock("../../middleware/auth.middleware", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (req.user) {
      next();
    } else {
      res.status(401).json({ error: "Unauthorized" });
    }
  },
}));

jest.mock("../../middleware/require-permission", () => ({
  requirePermission: (permission: string) => (req: any, res: any, next: any) => {
    // Simulate permission check - allow if user has permission
    if (req.user?.permissions?.includes(permission)) {
      next();
    } else {
      res.status(403).json({ error: "Forbidden" });
    }
  },
}));

jest.mock("../../mcp-servers/notion", () => ({
  executeNotionTool: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("../../mcp-servers/linear", () => ({
  executeLinearTool: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("../../mcp-servers/github", () => ({
  executeGitHubTool: jest.fn().mockResolvedValue({ success: true }),
}));

const { db } = require("../../db/client");

// Test data generators
const mockUser = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  organizationId: "550e8400-e29b-41d4-a716-446655440001",
  permissions: [
    "workflow:read",
    "workflow:create",
    "workflow:update",
    "workflow:delete",
    "workflow:execute",
    "execution:read",
  ],
};

const mockWorkflow = {
  id: "550e8400-e29b-41d4-a716-446655440002",
  organizationId: "550e8400-e29b-41d4-a716-446655440001",
  name: "Test Workflow",
  description: "A test workflow",
  config: { steps: [] },
  enabled: true,
  createdAt: new Date("2026-01-28"),
  updatedAt: new Date("2026-01-28"),
};

const mockExecution = {
  id: "550e8400-e29b-41d4-a716-446655440003",
  workflowId: "550e8400-e29b-41d4-a716-446655440002",
  status: "pending",
  inputData: { key: "value" },
  outputData: null,
  errorMessage: null,
  startedAt: new Date("2026-01-28"),
  completedAt: null,
  createdAt: new Date("2026-01-28"),
  updatedAt: new Date("2026-01-28"),
};

function createTestApp(userOverrides = {}) {
  const app = express();
  app.use(express.json());

  // Middleware to inject user
  app.use((req, _res, next) => {
    (req as any).user = { ...mockUser, ...userOverrides };
    next();
  });

  app.use("/api", workflowsRouter);

  return app;
}

describe("Workflows API", () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createTestApp();
  });

  // ============================================================================
  // GET /workflows - List workflows
  // ============================================================================

  describe("GET /workflows - List workflows", () => {
    it("should return 401 when user is not authenticated", async () => {
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.use((req, _res, next) => {
        (req as any).user = undefined;
        next();
      });
      unauthApp.use("/api", workflowsRouter);

      const response = await request(unauthApp).get("/api/workflows");

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: "Unauthorized" });
    });

    it("should return 403 when user lacks WORKFLOW_READ permission", async () => {
      const noPermApp = createTestApp({ permissions: [] });

      const response = await request(noPermApp).get("/api/workflows");

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: "Forbidden" });
    });

    it("should return empty array when no workflows exist", async () => {
      (db.workflow.findMany as jest.Mock).mockResolvedValue([]);

      const response = await request(app).get("/api/workflows");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ workflows: [] });
      expect(db.workflow.findMany).toHaveBeenCalledWith({
        where: { organizationId: "550e8400-e29b-41d4-a716-446655440001" },
        orderBy: { createdAt: "desc" },
      });
    });

    it("should return workflows for authenticated user", async () => {
      const workflows = [
        mockWorkflow,
        { ...mockWorkflow, id: "550e8400-e29b-41d4-a716-446655440006", name: "Another Workflow" },
      ];
      (db.workflow.findMany as jest.Mock).mockResolvedValue(workflows);

      const response = await request(app).get("/api/workflows");

      expect(response.status).toBe(200);
      expect(response.body.workflows).toHaveLength(2);
      expect(response.body.workflows[0].name).toBe("Test Workflow");
      expect(response.body.workflows[1].name).toBe("Another Workflow");
    });

    it("should filter workflows by organizationId", async () => {
      (db.workflow.findMany as jest.Mock).mockResolvedValue([mockWorkflow]);

      await request(app).get("/api/workflows");

      expect(db.workflow.findMany).toHaveBeenCalledWith({
        where: { organizationId: "550e8400-e29b-41d4-a716-446655440001" },
        orderBy: { createdAt: "desc" },
      });
    });

    it("should order workflows by createdAt descending", async () => {
      const workflows = [
        { ...mockWorkflow, createdAt: new Date("2026-01-28") },
        { ...mockWorkflow, id: "550e8400-e29b-41d4-a716-446655440006", createdAt: new Date("2026-01-27") },
      ];
      (db.workflow.findMany as jest.Mock).mockResolvedValue(workflows);

      const response = await request(app).get("/api/workflows");

      expect(response.body.workflows[0].createdAt).toBe("2026-01-28T00:00:00.000Z");
      expect(response.body.workflows[1].createdAt).toBe("2026-01-27T00:00:00.000Z");
    });

    it("should handle database errors gracefully", async () => {
      (db.workflow.findMany as jest.Mock).mockRejectedValue(new Error("Database error"));

      const response = await request(app).get("/api/workflows");

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Failed to fetch workflows" });
    });
  });

  // ============================================================================
  // POST /workflows - Create workflow
  // ============================================================================

  describe("POST /workflows - Create workflow", () => {
    it("should return 401 when user is not authenticated", async () => {
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.use((req, _res, next) => {
        (req as any).user = undefined;
        next();
      });
      unauthApp.use("/api", workflowsRouter);

      const response = await request(unauthApp).post("/api/workflows").send({
        name: "New Workflow",
      });

      expect(response.status).toBe(401);
    });

    it("should return 403 when user lacks WORKFLOW_CREATE permission", async () => {
      const noPermApp = createTestApp({ permissions: [] });

      const response = await request(noPermApp).post("/api/workflows").send({
        name: "New Workflow",
      });

      expect(response.status).toBe(403);
    });

    it("should return 400 when name is missing", async () => {
      const response = await request(app).post("/api/workflows").send({
        description: "Missing name",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Validation failed");
      expect(response.body.details).toContainEqual(
        expect.objectContaining({
          path: "name",
        }),
      );
    });

    it("should return 400 when name is empty string", async () => {
      const response = await request(app).post("/api/workflows").send({
        name: "",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Validation failed");
    });

    it("should return 400 when name exceeds max length", async () => {
      const longName = "a".repeat(256);

      const response = await request(app).post("/api/workflows").send({
        name: longName,
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Validation failed");
    });

    it("should return 400 when description exceeds max length", async () => {
      const longDescription = "a".repeat(1001);

      const response = await request(app).post("/api/workflows").send({
        name: "Test",
        description: longDescription,
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Validation failed");
    });

    it("should create workflow with required fields only", async () => {
      const createdWorkflow = { ...mockWorkflow, description: null };
      (db.workflow.create as jest.Mock).mockResolvedValue(createdWorkflow);

      const response = await request(app).post("/api/workflows").send({
        name: "New Workflow",
      });

      expect(response.status).toBe(201);
      expect(response.body.workflow.name).toBe("Test Workflow");
      expect(db.workflow.create).toHaveBeenCalledWith({
        data: {
          organizationId: "550e8400-e29b-41d4-a716-446655440001",
          name: "New Workflow",
          description: null,
          config: {},
          enabled: true,
        },
      });
    });

    it("should create workflow with all fields", async () => {
      (db.workflow.create as jest.Mock).mockResolvedValue(mockWorkflow);

      const response = await request(app)
        .post("/api/workflows")
        .send({
          name: "Test Workflow",
          description: "A test workflow",
          config: { steps: [] },
          enabled: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.workflow).toMatchObject({
        name: "Test Workflow",
        description: "A test workflow",
        enabled: true,
      });
    });

    it("should default enabled to true", async () => {
      (db.workflow.create as jest.Mock).mockResolvedValue(mockWorkflow);

      await request(app).post("/api/workflows").send({
        name: "Test Workflow",
      });

      expect(db.workflow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            enabled: true,
          }),
        }),
      );
    });

    it("should default config to empty object", async () => {
      (db.workflow.create as jest.Mock).mockResolvedValue(mockWorkflow);

      await request(app).post("/api/workflows").send({
        name: "Test Workflow",
      });

      expect(db.workflow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            config: {},
          }),
        }),
      );
    });

    it("should set organizationId from user context", async () => {
      (db.workflow.create as jest.Mock).mockResolvedValue(mockWorkflow);

      await request(app).post("/api/workflows").send({
        name: "Test Workflow",
      });

      expect(db.workflow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: "550e8400-e29b-41d4-a716-446655440001",
          }),
        }),
      );
    });

    it("should handle database errors gracefully", async () => {
      (db.workflow.create as jest.Mock).mockRejectedValue(new Error("Database error"));

      const response = await request(app).post("/api/workflows").send({
        name: "Test Workflow",
      });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Failed to create workflow" });
    });
  });

  // ============================================================================
  // GET /workflows/:id - Get single workflow
  // ============================================================================

  describe("GET /workflows/:id - Get single workflow", () => {
    it("should return 401 when user is not authenticated", async () => {
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.use((req, _res, next) => {
        (req as any).user = undefined;
        next();
      });
      unauthApp.use("/api", workflowsRouter);

      const response = await request(unauthApp).get("/api/workflows/workflow-123");

      expect(response.status).toBe(401);
    });

    it("should return 403 when user lacks WORKFLOW_READ permission", async () => {
      const noPermApp = createTestApp({ permissions: [] });

      const response = await request(noPermApp).get("/api/workflows/workflow-123");

      expect(response.status).toBe(403);
    });

    it("should return 400 when id is not a valid UUID", async () => {
      const response = await request(app).get("/api/workflows/invalid-id");

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Validation failed");
    });

    it("should return 404 when workflow not found", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await request(app).get(
        "/api/workflows/00000000-0000-0000-0000-000000000000",
      );

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "Workflow not found" });
    });

    it("should return 404 when workflow belongs to different organization", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await request(app).get("/api/workflows/workflow-123");

      expect(response.status).toBe(404);
      expect(db.workflow.findFirst).toHaveBeenCalledWith({
        where: {
          id: "550e8400-e29b-41d4-a716-446655440002",
          organizationId: "550e8400-e29b-41d4-a716-446655440001",
        },
        include: {
          executions: {
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      });
    });

    it("should return workflow with recent executions", async () => {
      const workflowWithExecutions = {
        ...mockWorkflow,
        executions: [mockExecution, { ...mockExecution, id: "550e8400-e29b-41d4-a716-446655440005" }],
      };
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(workflowWithExecutions);

      const response = await request(app).get("/api/workflows/workflow-123");

      expect(response.status).toBe(200);
      expect(response.body.workflow.name).toBe("Test Workflow");
      expect(response.body.workflow.executions).toHaveLength(2);
    });

    it("should include last 10 executions", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow);

      await request(app).get("/api/workflows/workflow-123");

      expect(db.workflow.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            executions: {
              orderBy: { createdAt: "desc" },
              take: 10,
            },
          },
        }),
      );
    });

    it("should handle database errors gracefully", async () => {
      (db.workflow.findFirst as jest.Mock).mockRejectedValue(new Error("Database error"));

      const response = await request(app).get("/api/workflows/workflow-123");

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Failed to fetch workflow" });
    });
  });

  // ============================================================================
  // PUT /workflows/:id - Update workflow
  // ============================================================================

  describe("PUT /workflows/:id - Update workflow", () => {
    it("should return 401 when user is not authenticated", async () => {
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.use((req, _res, next) => {
        (req as any).user = undefined;
        next();
      });
      unauthApp.use("/api", workflowsRouter);

      const response = await request(unauthApp).put("/api/workflows/workflow-123").send({
        name: "Updated",
      });

      expect(response.status).toBe(401);
    });

    it("should return 403 when user lacks WORKFLOW_UPDATE permission", async () => {
      const noPermApp = createTestApp({ permissions: [] });

      const response = await request(noPermApp).put("/api/workflows/workflow-123").send({
        name: "Updated",
      });

      expect(response.status).toBe(403);
    });

    it("should return 400 when id is not a valid UUID", async () => {
      const response = await request(app).put("/api/workflows/invalid-id").send({
        name: "Updated",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Validation failed");
    });

    it("should return 400 when body is empty", async () => {
      const response = await request(app).put("/api/workflows/workflow-123").send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Validation failed");
    });

    it("should return 400 when name is empty string", async () => {
      const response = await request(app).put("/api/workflows/workflow-123").send({
        name: "",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Validation failed");
    });

    it("should return 404 when workflow not found", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await request(app).put("/api/workflows/workflow-123").send({
        name: "Updated",
      });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "Workflow not found" });
    });

    it("should update only name field", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow);
      (db.workflow.update as jest.Mock).mockResolvedValue({
        ...mockWorkflow,
        name: "Updated Name",
      });

      const response = await request(app).put("/api/workflows/workflow-123").send({
        name: "Updated Name",
      });

      expect(response.status).toBe(200);
      expect(db.workflow.update).toHaveBeenCalledWith({
        where: { id: "550e8400-e29b-41d4-a716-446655440002" },
        data: {
          name: "Updated Name",
        },
      });
    });

    it("should update only description field", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow);
      (db.workflow.update as jest.Mock).mockResolvedValue({
        ...mockWorkflow,
        description: "Updated description",
      });

      const response = await request(app).put("/api/workflows/workflow-123").send({
        description: "Updated description",
      });

      expect(response.status).toBe(200);
      expect(db.workflow.update).toHaveBeenCalledWith({
        where: { id: "550e8400-e29b-41d4-a716-446655440002" },
        data: {
          description: "Updated description",
        },
      });
    });

    it("should update only enabled field", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow);
      (db.workflow.update as jest.Mock).mockResolvedValue({
        ...mockWorkflow,
        enabled: false,
      });

      const response = await request(app).put("/api/workflows/workflow-123").send({
        enabled: false,
      });

      expect(response.status).toBe(200);
      expect(db.workflow.update).toHaveBeenCalledWith({
        where: { id: "550e8400-e29b-41d4-a716-446655440002" },
        data: {
          enabled: false,
        },
      });
    });

    it("should update only config field", async () => {
      const newConfig = { steps: [{ type: "action" }] };
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow);
      (db.workflow.update as jest.Mock).mockResolvedValue({
        ...mockWorkflow,
        config: newConfig,
      });

      const response = await request(app).put("/api/workflows/workflow-123").send({
        config: newConfig,
      });

      expect(response.status).toBe(200);
      expect(db.workflow.update).toHaveBeenCalledWith({
        where: { id: "550e8400-e29b-41d4-a716-446655440002" },
        data: {
          config: newConfig,
        },
      });
    });

    it("should update multiple fields", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow);
      (db.workflow.update as jest.Mock).mockResolvedValue({
        ...mockWorkflow,
        name: "Updated",
        enabled: false,
      });

      const response = await request(app).put("/api/workflows/workflow-123").send({
        name: "Updated",
        enabled: false,
      });

      expect(response.status).toBe(200);
      expect(db.workflow.update).toHaveBeenCalledWith({
        where: { id: "550e8400-e29b-41d4-a716-446655440002" },
        data: {
          name: "Updated",
          enabled: false,
        },
      });
    });

    it("should handle database errors gracefully", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow);
      (db.workflow.update as jest.Mock).mockRejectedValue(new Error("Database error"));

      const response = await request(app).put("/api/workflows/workflow-123").send({
        name: "Updated",
      });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Failed to update workflow" });
    });
  });

  // ============================================================================
  // DELETE /workflows/:id - Delete workflow
  // ============================================================================

  describe("DELETE /workflows/:id - Delete workflow", () => {
    it("should return 401 when user is not authenticated", async () => {
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.use((req, _res, next) => {
        (req as any).user = undefined;
        next();
      });
      unauthApp.use("/api", workflowsRouter);

      const response = await request(unauthApp).delete("/api/workflows/workflow-123");

      expect(response.status).toBe(401);
    });

    it("should return 403 when user lacks WORKFLOW_DELETE permission", async () => {
      const noPermApp = createTestApp({ permissions: [] });

      const response = await request(noPermApp).delete("/api/workflows/workflow-123");

      expect(response.status).toBe(403);
    });

    it("should return 400 when id is not a valid UUID", async () => {
      const response = await request(app).delete("/api/workflows/invalid-id");

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Validation failed");
    });

    it("should return 404 when workflow not found", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await request(app).delete("/api/workflows/workflow-123");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "Workflow not found" });
    });

    it("should delete workflow successfully", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow);
      (db.workflow.delete as jest.Mock).mockResolvedValue(mockWorkflow);

      const response = await request(app).delete("/api/workflows/workflow-123");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(db.workflow.delete).toHaveBeenCalledWith({
        where: { id: "550e8400-e29b-41d4-a716-446655440002" },
      });
    });

    it("should verify workflow belongs to organization before deleting", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow);
      (db.workflow.delete as jest.Mock).mockResolvedValue(mockWorkflow);

      await request(app).delete("/api/workflows/workflow-123");

      expect(db.workflow.findFirst).toHaveBeenCalledWith({
        where: {
          id: "550e8400-e29b-41d4-a716-446655440002",
          organizationId: "550e8400-e29b-41d4-a716-446655440001",
        },
      });
    });

    it("should handle database errors gracefully", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow);
      (db.workflow.delete as jest.Mock).mockRejectedValue(new Error("Database error"));

      const response = await request(app).delete("/api/workflows/workflow-123");

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Failed to delete workflow" });
    });
  });

  // ============================================================================
  // POST /workflows/:id/execute - Execute workflow
  // ============================================================================

  describe("POST /workflows/:id/execute - Execute workflow", () => {
    it("should return 401 when user is not authenticated", async () => {
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.use((req, _res, next) => {
        (req as any).user = undefined;
        next();
      });
      unauthApp.use("/api", workflowsRouter);

      const response = await request(unauthApp)
        .post("/api/workflows/workflow-123/execute")
        .send({});

      expect(response.status).toBe(401);
    });

    it("should return 403 when user lacks WORKFLOW_EXECUTE permission", async () => {
      const noPermApp = createTestApp({ permissions: [] });

      const response = await request(noPermApp)
        .post("/api/workflows/workflow-123/execute")
        .send({});

      expect(response.status).toBe(403);
    });

    it("should return 400 when id is not a valid UUID", async () => {
      const response = await request(app).post("/api/workflows/invalid-id/execute").send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Validation failed");
    });

    it("should return 404 when workflow not found", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await request(app).post("/api/workflows/workflow-123/execute").send({});

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "Workflow not found or disabled" });
    });

    it("should return 404 when workflow is disabled", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue({
        ...mockWorkflow,
        enabled: false,
      });

      const response = await request(app).post("/api/workflows/workflow-123/execute").send({});

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "Workflow not found or disabled" });
    });

    it("should create execution with pending status", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow);
      (db.workflowExecution.create as jest.Mock).mockResolvedValue(mockExecution);

      const response = await request(app).post("/api/workflows/workflow-123/execute").send({});

      expect(response.status).toBe(202);
      expect(db.workflowExecution.create).toHaveBeenCalledWith({
        data: {
          workflowId: "550e8400-e29b-41d4-a716-446655440002",
          status: "pending",
          inputData: undefined,
          startedAt: expect.any(Date),
        },
      });
    });

    it("should accept inputData in request body", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow);
      (db.workflowExecution.create as jest.Mock).mockResolvedValue(mockExecution);

      const inputData = { key: "value", nested: { data: 123 } };

      const response = await request(app).post("/api/workflows/workflow-123/execute").send({
        inputData,
      });

      expect(response.status).toBe(202);
      expect(db.workflowExecution.create).toHaveBeenCalledWith({
        data: {
          workflowId: "550e8400-e29b-41d4-a716-446655440002",
          status: "pending",
          inputData,
          startedAt: expect.any(Date),
        },
      });
    });

    it("should return 202 Accepted status", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow);
      (db.workflowExecution.create as jest.Mock).mockResolvedValue(mockExecution);

      const response = await request(app).post("/api/workflows/workflow-123/execute").send({});

      expect(response.status).toBe(202);
    });

    it("should return execution object in response", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow);
      (db.workflowExecution.create as jest.Mock).mockResolvedValue(mockExecution);

      const response = await request(app).post("/api/workflows/workflow-123/execute").send({});

      expect(response.body.execution).toMatchObject({
        id: "550e8400-e29b-41d4-a716-446655440003",
        workflowId: "550e8400-e29b-41d4-a716-446655440002",
        status: "pending",
      });
    });

    it("should verify workflow belongs to organization", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow);
      (db.workflowExecution.create as jest.Mock).mockResolvedValue(mockExecution);

      await request(app).post("/api/workflows/workflow-123/execute").send({});

      expect(db.workflow.findFirst).toHaveBeenCalledWith({
        where: {
          id: "550e8400-e29b-41d4-a716-446655440002",
          organizationId: "550e8400-e29b-41d4-a716-446655440001",
          enabled: true,
        },
      });
    });

    it("should handle database errors gracefully", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow);
      (db.workflowExecution.create as jest.Mock).mockRejectedValue(new Error("Database error"));

      const response = await request(app).post("/api/workflows/workflow-123/execute").send({});

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Failed to execute workflow" });
    });
  });

  // ============================================================================
  // GET /workflows/:id/executions - List workflow executions
  // ============================================================================

  describe("GET /workflows/:id/executions - List workflow executions", () => {
    it("should return 401 when user is not authenticated", async () => {
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.use((req, _res, next) => {
        (req as any).user = undefined;
        next();
      });
      unauthApp.use("/api", workflowsRouter);

      const response = await request(unauthApp).get("/api/workflows/workflow-123/executions");

      expect(response.status).toBe(401);
    });

    it("should return 403 when user lacks EXECUTION_READ permission", async () => {
      const noPermApp = createTestApp({ permissions: [] });

      const response = await request(noPermApp).get("/api/workflows/workflow-123/executions");

      expect(response.status).toBe(403);
    });

    it("should return 400 when id is not a valid UUID", async () => {
      const response = await request(app).get("/api/workflows/invalid-id/executions");

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Validation failed");
    });

    it("should return 404 when workflow not found", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await request(app).get("/api/workflows/workflow-123/executions");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "Workflow not found" });
    });

    it("should return empty array when no executions exist", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow);
      (db.workflowExecution.findMany as jest.Mock).mockResolvedValue([]);

      const response = await request(app).get("/api/workflows/workflow-123/executions");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ executions: [] });
    });

    it("should return executions for workflow", async () => {
      const executions = [mockExecution, { ...mockExecution, id: "550e8400-e29b-41d4-a716-446655440005" }];
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow);
      (db.workflowExecution.findMany as jest.Mock).mockResolvedValue(executions);

      const response = await request(app).get("/api/workflows/workflow-123/executions");

      expect(response.status).toBe(200);
      expect(response.body.executions).toHaveLength(2);
    });

    it("should limit to 50 most recent executions", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow);
      (db.workflowExecution.findMany as jest.Mock).mockResolvedValue([]);

      await request(app).get("/api/workflows/workflow-123/executions");

      expect(db.workflowExecution.findMany).toHaveBeenCalledWith({
        where: { workflowId: "550e8400-e29b-41d4-a716-446655440002" },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    });

    it("should verify workflow belongs to organization", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow);
      (db.workflowExecution.findMany as jest.Mock).mockResolvedValue([]);

      await request(app).get("/api/workflows/workflow-123/executions");

      expect(db.workflow.findFirst).toHaveBeenCalledWith({
        where: {
          id: "550e8400-e29b-41d4-a716-446655440002",
          organizationId: "550e8400-e29b-41d4-a716-446655440001",
        },
      });
    });

    it("should handle database errors gracefully", async () => {
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow);
      (db.workflowExecution.findMany as jest.Mock).mockRejectedValue(new Error("Database error"));

      const response = await request(app).get("/api/workflows/workflow-123/executions");

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Failed to fetch executions" });
    });
  });

  // ============================================================================
  // GET /executions - List all executions
  // ============================================================================

  describe("GET /executions - List all executions", () => {
    it("should return 401 when user is not authenticated", async () => {
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.use((req, _res, next) => {
        (req as any).user = undefined;
        next();
      });
      unauthApp.use("/api", workflowsRouter);

      const response = await request(unauthApp).get("/api/executions");

      expect(response.status).toBe(401);
    });

    it("should return 403 when user lacks EXECUTION_READ permission", async () => {
      const noPermApp = createTestApp({ permissions: [] });

      const response = await request(noPermApp).get("/api/executions");

      expect(response.status).toBe(403);
    });

    it("should return empty array when no executions exist", async () => {
      (db.workflowExecution.findMany as jest.Mock).mockResolvedValue([]);

      const response = await request(app).get("/api/executions");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ executions: [] });
    });

    it("should return all executions for organization", async () => {
      const executions = [mockExecution, { ...mockExecution, id: "550e8400-e29b-41d4-a716-446655440005" }];
      (db.workflowExecution.findMany as jest.Mock).mockResolvedValue(executions);

      const response = await request(app).get("/api/executions");

      expect(response.status).toBe(200);
      expect(response.body.executions).toHaveLength(2);
    });

    it("should include workflow name in response", async () => {
      const executionWithWorkflow = {
        ...mockExecution,
        workflow: { name: "Test Workflow" },
      };
      (db.workflowExecution.findMany as jest.Mock).mockResolvedValue([executionWithWorkflow]);

      const response = await request(app).get("/api/executions");

      expect(response.status).toBe(200);
      expect(response.body.executions[0].workflow.name).toBe("Test Workflow");
    });

    it("should limit to 100 most recent executions", async () => {
      (db.workflowExecution.findMany as jest.Mock).mockResolvedValue([]);

      await request(app).get("/api/executions");

      expect(db.workflowExecution.findMany).toHaveBeenCalledWith({
        where: {
          workflow: {
            organizationId: "550e8400-e29b-41d4-a716-446655440001",
          },
        },
        include: {
          workflow: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    });

    it("should filter by organization", async () => {
      (db.workflowExecution.findMany as jest.Mock).mockResolvedValue([]);

      await request(app).get("/api/executions");

      expect(db.workflowExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workflow: {
              organizationId: "550e8400-e29b-41d4-a716-446655440001",
            },
          },
        }),
      );
    });

    it("should handle database errors gracefully", async () => {
      (db.workflowExecution.findMany as jest.Mock).mockRejectedValue(new Error("Database error"));

      const response = await request(app).get("/api/executions");

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Failed to fetch executions" });
    });
  });

  // ============================================================================
  // GET /executions/:id - Get single execution
  // ============================================================================

  describe("GET /executions/:id - Get single execution", () => {
    it("should return 401 when user is not authenticated", async () => {
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.use((req, _res, next) => {
        (req as any).user = undefined;
        next();
      });
      unauthApp.use("/api", workflowsRouter);

      const response = await request(unauthApp).get("/api/executions/execution-123");

      expect(response.status).toBe(401);
    });

    it("should return 403 when user lacks EXECUTION_READ permission", async () => {
      const noPermApp = createTestApp({ permissions: [] });

      const response = await request(noPermApp).get("/api/executions/execution-123");

      expect(response.status).toBe(403);
    });

    it("should return 400 when id is not a valid UUID", async () => {
      const response = await request(app).get("/api/executions/invalid-id");

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Validation failed");
    });

    it("should return 404 when execution not found", async () => {
      (db.workflowExecution.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await request(app).get("/api/executions/execution-123");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "Execution not found" });
    });

    it("should return 404 when execution belongs to different organization", async () => {
      const executionDifferentOrg = {
        ...mockExecution,
        workflow: { ...mockWorkflow, organizationId: "550e8400-e29b-41d4-a716-446655440004" },
      };
      (db.workflowExecution.findFirst as jest.Mock).mockResolvedValue(executionDifferentOrg);

      const response = await request(app).get("/api/executions/execution-123");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "Execution not found" });
    });

    it("should return execution with workflow details", async () => {
      const executionWithWorkflow = {
        ...mockExecution,
        workflow: mockWorkflow,
      };
      (db.workflowExecution.findFirst as jest.Mock).mockResolvedValue(executionWithWorkflow);

      const response = await request(app).get("/api/executions/execution-123");

      expect(response.status).toBe(200);
      expect(response.body.execution.workflow.name).toBe("Test Workflow");
    });

    it("should include workflow in response", async () => {
      (db.workflowExecution.findFirst as jest.Mock).mockResolvedValue(mockExecution);

      await request(app).get("/api/executions/execution-123");

      expect(db.workflowExecution.findFirst).toHaveBeenCalledWith({
        where: { id: "550e8400-e29b-41d4-a716-446655440003" },
        include: {
          workflow: true,
        },
      });
    });

    it("should handle database errors gracefully", async () => {
      (db.workflowExecution.findFirst as jest.Mock).mockRejectedValue(new Error("Database error"));

      const response = await request(app).get("/api/executions/execution-123");

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Failed to fetch execution" });
    });
  });

  // ============================================================================
  // Multi-tenant isolation tests
  // ============================================================================

  describe("Multi-tenant isolation", () => {
    it("should not allow user from org-456 to access workflows from org-123", async () => {
      const otherOrgApp = createTestApp({ organizationId: "550e8400-e29b-41d4-a716-446655440004" });
      (db.workflow.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await request(otherOrgApp).get("/api/workflows/workflow-123");

      expect(response.status).toBe(404);
      expect(db.workflow.findFirst).toHaveBeenCalledWith({
        where: {
          id: "550e8400-e29b-41d4-a716-446655440002",
          organizationId: "550e8400-e29b-41d4-a716-446655440004",
        },
        include: {
          executions: {
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      });
    });

    it("should filter list workflows by organization", async () => {
      const otherOrgApp = createTestApp({ organizationId: "550e8400-e29b-41d4-a716-446655440004" });
      (db.workflow.findMany as jest.Mock).mockResolvedValue([]);

      await request(otherOrgApp).get("/api/workflows");

      expect(db.workflow.findMany).toHaveBeenCalledWith({
        where: { organizationId: "550e8400-e29b-41d4-a716-446655440004" },
        orderBy: { createdAt: "desc" },
      });
    });

    it("should create workflows in user's organization only", async () => {
      const otherOrgApp = createTestApp({ organizationId: "550e8400-e29b-41d4-a716-446655440004" });
      (db.workflow.create as jest.Mock).mockResolvedValue({
        ...mockWorkflow,
        organizationId: "550e8400-e29b-41d4-a716-446655440004",
      });

      await request(otherOrgApp).post("/api/workflows").send({
        name: "Test",
      });

      expect(db.workflow.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: "550e8400-e29b-41d4-a716-446655440004",
        }),
      });
    });
  });
});
