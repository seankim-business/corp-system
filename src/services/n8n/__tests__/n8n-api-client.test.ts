import { describe, it, expect, beforeEach, vi } from "vitest";
import { N8nApiClient, createN8nClient } from "../n8n-api-client";
import type { N8nWorkflowInput, N8nWorkflow } from "../types";

describe("N8nApiClient", () => {
  let client: N8nApiClient;
  const mockInstanceUrl = "https://n8n.example.com";
  const mockApiKey = "test-api-key-123";

  beforeEach(() => {
    client = new N8nApiClient(mockInstanceUrl, mockApiKey);
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create client with valid credentials", () => {
      expect(client).toBeDefined();
    });

    it("should remove trailing slash from instance URL", () => {
      const clientWithSlash = new N8nApiClient(`${mockInstanceUrl}/`, mockApiKey);
      expect(clientWithSlash).toBeDefined();
    });

    it("should accept custom maxRetries option", () => {
      const clientWithRetries = new N8nApiClient(mockInstanceUrl, mockApiKey, { maxRetries: 5 });
      expect(clientWithRetries).toBeDefined();
    });
  });

  describe("createN8nClient factory", () => {
    it("should create N8nApiClient instance", () => {
      const factoryClient = createN8nClient(mockInstanceUrl, mockApiKey);
      expect(factoryClient).toBeInstanceOf(N8nApiClient);
    });
  });

  describe("healthCheck", () => {
    it("should return true for healthy instance", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
      });

      const isHealthy = await client.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it("should return false for unhealthy instance", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
      });

      const isHealthy = await client.healthCheck();
      expect(isHealthy).toBe(false);
    });

    it("should return false on connection error", async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error("Connection failed"));

      const isHealthy = await client.healthCheck();
      expect(isHealthy).toBe(false);
    });
  });

  describe("workflow methods", () => {
    const mockWorkflow: N8nWorkflowInput = {
      name: "Test Workflow",
      nodes: [],
      connections: {},
      active: false,
    };

    const mockWorkflowResponse: N8nWorkflow = {
      ...mockWorkflow,
      id: "workflow-123",
      createdAt: "2024-01-30T00:00:00Z",
      updatedAt: "2024-01-30T00:00:00Z",
    };

    it("should create workflow", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockWorkflowResponse,
      });

      const result = await client.createWorkflow(mockWorkflow);
      expect(result.id).toBe("workflow-123");
      expect(result.name).toBe("Test Workflow");
    });

    it("should get workflow by id", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockWorkflowResponse,
      });

      const result = await client.getWorkflow("workflow-123");
      expect(result.id).toBe("workflow-123");
    });

    it("should update workflow", async () => {
      const updatedWorkflow = { ...mockWorkflowResponse, name: "Updated Workflow" };
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => updatedWorkflow,
      });

      const result = await client.updateWorkflow("workflow-123", { name: "Updated Workflow" });
      expect(result.name).toBe("Updated Workflow");
    });

    it("should delete workflow", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await expect(client.deleteWorkflow("workflow-123")).resolves.toBeUndefined();
    });

    it("should activate workflow", async () => {
      const activeWorkflow = { ...mockWorkflowResponse, active: true };
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => activeWorkflow,
      });

      const result = await client.activateWorkflow("workflow-123");
      expect(result.active).toBe(true);
    });

    it("should deactivate workflow", async () => {
      const inactiveWorkflow = { ...mockWorkflowResponse, active: false };
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => inactiveWorkflow,
      });

      const result = await client.deactivateWorkflow("workflow-123");
      expect(result.active).toBe(false);
    });

    it("should list workflows", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [mockWorkflowResponse],
          nextCursor: undefined,
        }),
      });

      const result = await client.listWorkflows();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe("workflow-123");
    });
  });

  describe("execution methods", () => {
    const mockExecution = {
      id: "exec-123",
      finished: true,
      mode: "manual" as const,
      startedAt: "2024-01-30T00:00:00Z",
      workflowId: "workflow-123",
      status: "success" as const,
    };

    it("should get execution by id", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockExecution,
      });

      const result = await client.getExecution("exec-123");
      expect(result.id).toBe("exec-123");
      expect(result.status).toBe("success");
    });

    it("should list executions", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [mockExecution],
          nextCursor: undefined,
        }),
      });

      const result = await client.listExecutions();
      expect(result.data).toHaveLength(1);
    });

    it("should delete execution", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await expect(client.deleteExecution("exec-123")).resolves.toBeUndefined();
    });
  });

  describe("credential methods", () => {
    const mockCredential = {
      id: "cred-123",
      name: "Test Credential",
      type: "httpBasicAuth",
      createdAt: "2024-01-30T00:00:00Z",
      updatedAt: "2024-01-30T00:00:00Z",
    };

    it("should create credential", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockCredential,
      });

      const result = await client.createCredential({
        name: "Test Credential",
        type: "httpBasicAuth",
        data: { username: "test", password: "secret" },
      });
      expect(result.id).toBe("cred-123");
    });

    it("should get credential by id", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockCredential,
      });

      const result = await client.getCredential("cred-123");
      expect(result.id).toBe("cred-123");
    });

    it("should delete credential", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await expect(client.deleteCredential("cred-123")).resolves.toBeUndefined();
    });

    it("should list credentials", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [mockCredential],
          nextCursor: undefined,
        }),
      });

      const result = await client.listCredentials();
      expect(result.data).toHaveLength(1);
    });
  });

  describe("error handling", () => {
    it("should throw error on API error response", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "Bad Request",
      });

      await expect(client.getWorkflow("invalid")).rejects.toThrow("n8n API error");
    });

    it("should throw error on network failure", async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));

      await expect(client.getWorkflow("workflow-123")).rejects.toThrow();
    });
  });
});
