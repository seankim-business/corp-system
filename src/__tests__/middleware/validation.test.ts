import { Request, Response, NextFunction } from "express";
import {
  validate,
  createWorkflowSchema,
  updateWorkflowSchema,
  uuidParamSchema,
  loginSchema,
} from "../../middleware/validation.middleware";

const mockRequest = (body = {}, params = {}, query = {}) =>
  ({
    body,
    params,
    query,
  }) as Request;

const mockResponse = () => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
};

const mockNext: NextFunction = jest.fn();

describe("Validation Middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("validate function", () => {
    it("should pass valid body through", async () => {
      const middleware = validate({ body: createWorkflowSchema });
      const req = mockRequest({ name: "Test Workflow" });
      const res = mockResponse();

      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(req.body.name).toBe("Test Workflow");
      expect(req.body.enabled).toBe(true);
    });

    it("should reject invalid body with 400", async () => {
      const middleware = validate({ body: createWorkflowSchema });
      const req = mockRequest({});
      const res = mockResponse();

      await middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Validation failed",
          details: expect.arrayContaining([
            expect.objectContaining({
              path: "name",
              message: expect.any(String),
            }),
          ]),
        }),
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should validate params", async () => {
      const middleware = validate({ params: uuidParamSchema });
      const req = mockRequest({}, { id: "123e4567-e89b-12d3-a456-426614174000" });
      const res = mockResponse();

      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it("should reject invalid UUID params", async () => {
      const middleware = validate({ params: uuidParamSchema });
      const req = mockRequest({}, { id: "not-a-uuid" });
      const res = mockResponse();

      await middleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe("createWorkflowSchema", () => {
    it("should accept valid workflow data", () => {
      const result = createWorkflowSchema.safeParse({
        name: "My Workflow",
        description: "A test workflow",
        config: { steps: [] },
        enabled: false,
      });

      expect(result.success).toBe(true);
    });

    it("should provide defaults for optional fields", () => {
      const result = createWorkflowSchema.safeParse({ name: "Test" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.config).toEqual({});
        expect(result.data.enabled).toBe(true);
      }
    });

    it("should reject empty name", () => {
      const result = createWorkflowSchema.safeParse({ name: "" });

      expect(result.success).toBe(false);
    });

    it("should reject name exceeding max length", () => {
      const result = createWorkflowSchema.safeParse({ name: "a".repeat(256) });

      expect(result.success).toBe(false);
    });
  });

  describe("updateWorkflowSchema", () => {
    it("should accept partial updates", () => {
      const result = updateWorkflowSchema.safeParse({ name: "Updated Name" });

      expect(result.success).toBe(true);
    });

    it("should reject empty updates", () => {
      const result = updateWorkflowSchema.safeParse({});

      expect(result.success).toBe(false);
    });
  });

  describe("loginSchema", () => {
    it("should accept valid login credentials", () => {
      const result = loginSchema.safeParse({
        email: "user@example.com",
        password: "password123",
      });

      expect(result.success).toBe(true);
    });

    it("should reject invalid email", () => {
      const result = loginSchema.safeParse({
        email: "not-an-email",
        password: "password123",
      });

      expect(result.success).toBe(false);
    });

    it("should reject short password", () => {
      const result = loginSchema.safeParse({
        email: "user@example.com",
        password: "short",
      });

      expect(result.success).toBe(false);
    });
  });
});
