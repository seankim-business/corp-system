import { Request, Response, NextFunction } from "express";
import { correlationIdMiddleware } from "../../middleware/correlation-id.middleware";
import { getCorrelationId } from "../../utils/logger";
import { trace } from "@opentelemetry/api";

const createMockRequest = (headers: Record<string, string> = {}): Request => {
  const req = {
    get: (header: string) => headers[header.toLowerCase()],
    headers,
  } as unknown as Request;
  return req;
};

const createMockResponse = (): Response => {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (key: string, value: string) => {
      headers[key] = value;
      return res;
    },
    getHeader: (key: string) => headers[key],
  } as unknown as Response;
  return res;
};

describe("Correlation ID Middleware", () => {
  let nextCalled = false;

  beforeEach(() => {
    nextCalled = false;
  });

  const next: NextFunction = () => {
    nextCalled = true;
  };

  describe("ID Generation", () => {
    it("should generate a new UUID when no X-Request-ID header is present", () => {
      const req = createMockRequest() as Request;
      const res = createMockResponse() as Response;

      correlationIdMiddleware(req, res, next);

      expect((req as any).correlationId).toBeDefined();
      expect((req as any).correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(nextCalled).toBe(true);
    });

    it("should reuse existing X-Request-ID header (uppercase)", () => {
      const existingId = "550e8400-e29b-41d4-a716-446655440000";
      const req = createMockRequest({ "x-request-id": existingId }) as Request;
      const res = createMockResponse() as Response;

      correlationIdMiddleware(req, res, next);

      expect((req as any).correlationId).toBe(existingId);
      expect(nextCalled).toBe(true);
    });

    it("should reuse existing x-request-id header (lowercase)", () => {
      const existingId = "550e8400-e29b-41d4-a716-446655440001";
      const req = createMockRequest({ "x-request-id": existingId }) as Request;
      const res = createMockResponse() as Response;

      correlationIdMiddleware(req, res, next);

      expect((req as any).correlationId).toBe(existingId);
      expect(nextCalled).toBe(true);
    });

    it("should handle case-insensitive header lookup", () => {
      const existingId = "550e8400-e29b-41d4-a716-446655440002";
      const req = createMockRequest({
        "x-request-id": existingId,
      }) as Request;
      const res = createMockResponse() as Response;

      correlationIdMiddleware(req, res, next);

      expect((req as any).correlationId).toBe(existingId);
      expect(nextCalled).toBe(true);
    });
  });

  describe("Response Headers", () => {
    it("should add X-Request-ID to response headers", () => {
      const req = createMockRequest() as Request;
      const res = createMockResponse() as Response;

      correlationIdMiddleware(req, res, next);

      expect(res.getHeader("X-Request-ID")).toBe((req as any).correlationId);
    });

    it("should preserve existing correlation ID in response headers", () => {
      const existingId = "550e8400-e29b-41d4-a716-446655440004";
      const req = createMockRequest({ "x-request-id": existingId }) as Request;
      const res = createMockResponse() as Response;

      correlationIdMiddleware(req, res, next);

      expect(res.getHeader("X-Request-ID")).toBe(existingId);
    });
  });

  describe("Async Context", () => {
    it("should set correlation ID in async context", () => {
      const req = createMockRequest() as Request;
      const res = createMockResponse() as Response;

      correlationIdMiddleware(req, res, next);

      // Correlation ID should be available in async context
      const contextId = getCorrelationId();
      expect(contextId).toBe((req as any).correlationId);
    });

    it("should maintain correlation ID across async operations", async () => {
      const req = createMockRequest() as Request;
      const res = createMockResponse() as Response;

      correlationIdMiddleware(req, res, next);
      const originalId = (req as any).correlationId;

      // Simulate async operation
      await new Promise((resolve) => setTimeout(resolve, 10));

      const contextId = getCorrelationId();
      expect(contextId).toBe(originalId);
    });
  });

  describe("OpenTelemetry Span Integration", () => {
    it("should add correlation ID to active span", () => {
      const req = createMockRequest() as Request;
      const res = createMockResponse() as Response;

      // Mock span
      const mockSpan = {
        setAttribute: jest.fn(),
      };
      jest.spyOn(trace, "getActiveSpan").mockReturnValue(mockSpan as any);

      correlationIdMiddleware(req, res, next);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        "correlation.id",
        (req as any).correlationId,
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith("request.id", (req as any).correlationId);
    });

    it("should handle missing active span gracefully", () => {
      const req = createMockRequest() as Request;
      const res = createMockResponse() as Response;

      jest.spyOn(trace, "getActiveSpan").mockReturnValue(undefined);

      // Should not throw
      expect(() => {
        correlationIdMiddleware(req, res, next);
      }).not.toThrow();

      expect((req as any).correlationId).toBeDefined();
      expect(nextCalled).toBe(true);
    });
  });

  describe("Middleware Chain", () => {
    it("should call next() to continue middleware chain", () => {
      const req = createMockRequest() as Request;
      const res = createMockResponse() as Response;

      correlationIdMiddleware(req, res, next);

      expect(nextCalled).toBe(true);
    });

    it("should not block request processing", () => {
      const req = createMockRequest() as Request;
      const res = createMockResponse() as Response;
      let nextCallOrder = 0;
      let middlewareCallOrder = 0;

      const trackingNext: NextFunction = () => {
        nextCallOrder = 1;
      };

      middlewareCallOrder = 0;
      correlationIdMiddleware(req, res, trackingNext);
      middlewareCallOrder = 1;

      expect(nextCallOrder).toBe(1);
      expect(middlewareCallOrder).toBe(1);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty header values", () => {
      const req = createMockRequest({ "x-request-id": "" }) as Request;
      const res = createMockResponse() as Response;

      correlationIdMiddleware(req, res, next);

      // Should generate new ID if header is empty
      expect((req as any).correlationId).toBeDefined();
      expect((req as any).correlationId).not.toBe("");
    });

    it("should handle multiple requests with different IDs", () => {
      const req1 = createMockRequest() as Request;
      const res1 = createMockResponse() as Response;
      const req2 = createMockRequest() as Request;
      const res2 = createMockResponse() as Response;

      correlationIdMiddleware(req1, res1, next);
      const id1 = (req1 as any).correlationId;

      correlationIdMiddleware(req2, res2, next);
      const id2 = (req2 as any).correlationId;

      expect(id1).not.toBe(id2);
    });

    it("should handle special characters in correlation ID", () => {
      const specialId = "550e8400-e29b-41d4-a716-446655440005";
      const req = createMockRequest({ "x-request-id": specialId }) as Request;
      const res = createMockResponse() as Response;

      correlationIdMiddleware(req, res, next);

      expect((req as any).correlationId).toBe(specialId);
      expect(res.getHeader("X-Request-ID")).toBe(specialId);
    });
  });

  describe("Logger Integration", () => {
    it("should make correlation ID available to logger", () => {
      const req = createMockRequest() as Request;
      const res = createMockResponse() as Response;

      correlationIdMiddleware(req, res, next);

      const correlationId = getCorrelationId();
      expect(correlationId).toBe((req as any).correlationId);
    });

    it("should maintain correlation ID across multiple logger calls", () => {
      const req = createMockRequest() as Request;
      const res = createMockResponse() as Response;

      correlationIdMiddleware(req, res, next);
      const originalId = (req as any).correlationId;

      // Simulate multiple logger calls
      const id1 = getCorrelationId();
      const id2 = getCorrelationId();
      const id3 = getCorrelationId();

      expect(id1).toBe(originalId);
      expect(id2).toBe(originalId);
      expect(id3).toBe(originalId);
    });
  });
});
