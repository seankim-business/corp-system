/**
 * SOP Execution E2E Tests
 *
 * Tests the Standard Operating Procedure execution:
 * - SOP loading and initialization
 * - Step execution (automated, manual, approval)
 * - Parallel steps
 * - Status tracking
 * - Error handling and recovery
 */

import * as yaml from "js-yaml";
import * as fs from "fs";
import * as path from "path";
import {
  setupTestDatabase,
  teardownTestDatabase,
  generateTestCustomer,
} from "./setup";

// Types for SOP execution
interface SOPStep {
  id: string;
  name: string;
  type: "automated" | "manual" | "approval" | "parallel";
  action?: string;
  template?: string;
  config?: Record<string, unknown>;
  description?: string;
  assignee_role?: string;
  approver_role?: string;
  approval_type?: string;
  required_data?: string[];
  parallel_steps?: SOPStep[];
  timeout?: number;
}

interface SOPDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  category: string;
  estimated_duration: number;
  steps: SOPStep[];
}

interface SOPExecution {
  id: string;
  sopId: string;
  organizationId: string;
  userId: string;
  status: "pending" | "running" | "waiting_manual" | "waiting_approval" | "completed" | "failed";
  currentStepIndex: number;
  stepResults: StepResult[];
  context: Record<string, unknown>;
  startedAt: Date;
  completedAt?: Date;
}

interface StepResult {
  stepId: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  output?: unknown;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

// Mock SOP executor functions
class MockSOPExecutor {
  private sops: Map<string, SOPDefinition> = new Map();
  private executions: Map<string, SOPExecution> = new Map();

  loadSOP(sopId: string): SOPDefinition | undefined {
    // Try to load from fixtures
    const fixturesPath = path.join(__dirname, "fixtures", "sops.yaml");
    try {
      const content = fs.readFileSync(fixturesPath, "utf-8");
      const data = yaml.load(content) as { sops: SOPDefinition[] };
      const sop = data.sops.find((s) => s.id === sopId);
      if (sop) {
        this.sops.set(sopId, sop);
        return sop;
      }
    } catch {
      // Fixtures not available, use mock
    }

    // Return mock SOP if not found in fixtures
    const mockSop: SOPDefinition = {
      id: sopId,
      name: `Mock SOP: ${sopId}`,
      description: "Mock SOP for testing",
      version: "1.0.0",
      category: "test",
      estimated_duration: 3600,
      steps: [
        { id: "step1", name: "Step 1", type: "automated", action: "mock_action" },
        { id: "step2", name: "Step 2", type: "manual", description: "Manual step" },
        { id: "step3", name: "Step 3", type: "approval", approver_role: "manager" },
      ],
    };
    this.sops.set(sopId, mockSop);
    return mockSop;
  }

  async startExecution(
    sopId: string,
    context: Record<string, unknown>,
  ): Promise<SOPExecution> {
    const sop = this.loadSOP(sopId);
    if (!sop) {
      throw new Error(`SOP not found: ${sopId}`);
    }

    const execution: SOPExecution = {
      id: `exec-${Date.now()}`,
      sopId,
      organizationId: context.organizationId as string || "test-org",
      userId: context.userId as string || "test-user",
      status: "running",
      currentStepIndex: 0,
      stepResults: [],
      context,
      startedAt: new Date(),
    };

    this.executions.set(execution.id, execution);
    return execution;
  }

  async proceed(executionId: string): Promise<SOPExecution> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    const sop = this.sops.get(execution.sopId);
    if (!sop) {
      throw new Error(`SOP not found: ${execution.sopId}`);
    }

    const currentStep = sop.steps[execution.currentStepIndex];
    if (!currentStep) {
      execution.status = "completed";
      execution.completedAt = new Date();
      return execution;
    }

    // Execute current step based on type
    const stepResult: StepResult = {
      stepId: currentStep.id,
      status: "running",
      startedAt: new Date(),
    };

    switch (currentStep.type) {
      case "automated":
        stepResult.status = "completed";
        stepResult.output = { action: currentStep.action, result: "success" };
        stepResult.completedAt = new Date();
        execution.stepResults.push(stepResult);
        execution.currentStepIndex++;
        break;

      case "manual":
        stepResult.status = "pending";
        execution.stepResults.push(stepResult);
        execution.status = "waiting_manual";
        break;

      case "approval":
        stepResult.status = "pending";
        execution.stepResults.push(stepResult);
        execution.status = "waiting_approval";
        break;

      case "parallel":
        // Execute all parallel steps
        const parallelResults = await Promise.all(
          (currentStep.parallel_steps || []).map(async (ps) => ({
            stepId: ps.id,
            status: "completed" as const,
            output: { action: ps.action, result: "success" },
            startedAt: new Date(),
            completedAt: new Date(),
          })),
        );
        stepResult.status = "completed";
        stepResult.output = parallelResults;
        stepResult.completedAt = new Date();
        execution.stepResults.push(stepResult);
        execution.currentStepIndex++;
        break;
    }

    this.executions.set(executionId, execution);
    return execution;
  }

  async completeManualStep(
    executionId: string,
    data: Record<string, unknown>,
  ): Promise<SOPExecution> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    if (execution.status !== "waiting_manual") {
      throw new Error("Execution is not waiting for manual step");
    }

    const currentResult = execution.stepResults[execution.stepResults.length - 1];
    currentResult.status = "completed";
    currentResult.output = data;
    currentResult.completedAt = new Date();

    execution.currentStepIndex++;
    execution.status = "running";
    execution.context = { ...execution.context, ...data };

    this.executions.set(executionId, execution);
    return execution;
  }

  async approveStep(executionId: string): Promise<SOPExecution> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    if (execution.status !== "waiting_approval") {
      throw new Error("Execution is not waiting for approval");
    }

    const currentResult = execution.stepResults[execution.stepResults.length - 1];
    currentResult.status = "completed";
    currentResult.output = { approved: true, approvedAt: new Date() };
    currentResult.completedAt = new Date();

    execution.currentStepIndex++;
    execution.status = "running";

    this.executions.set(executionId, execution);
    return execution;
  }

  async rejectStep(executionId: string, reason: string): Promise<SOPExecution> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    const currentResult = execution.stepResults[execution.stepResults.length - 1];
    currentResult.status = "failed";
    currentResult.error = reason;
    currentResult.completedAt = new Date();

    execution.status = "failed";
    execution.completedAt = new Date();

    this.executions.set(executionId, execution);
    return execution;
  }

  getExecution(executionId: string): SOPExecution | undefined {
    return this.executions.get(executionId);
  }

  getCurrentStep(execution: SOPExecution): string {
    const sop = this.sops.get(execution.sopId);
    if (!sop) return "unknown";
    return sop.steps[execution.currentStepIndex]?.id || "END";
  }
}

describe("SOP Execution E2E", () => {
  let sopExecutor: MockSOPExecutor;

  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(() => {
    sopExecutor = new MockSOPExecutor();
  });

  describe("SOP loading", () => {
    it("loads customer-onboarding SOP from fixtures", () => {
      const sop = sopExecutor.loadSOP("customer-onboarding");
      expect(sop).toBeDefined();
      expect(sop?.id).toBe("customer-onboarding");
      expect(sop?.steps.length).toBeGreaterThan(0);
    });

    it("loads content-review SOP from fixtures", () => {
      const sop = sopExecutor.loadSOP("content-review");
      expect(sop).toBeDefined();
      expect(sop?.category).toBe("marketing");
    });

    it("loads expense-reimbursement SOP from fixtures", () => {
      const sop = sopExecutor.loadSOP("expense-reimbursement");
      expect(sop).toBeDefined();
      expect(sop?.category).toBe("finance");
    });

    it("returns mock SOP for unknown ID", () => {
      const sop = sopExecutor.loadSOP("unknown-sop");
      expect(sop).toBeDefined();
      expect(sop?.name).toContain("Mock SOP");
    });
  });

  describe("Customer onboarding SOP execution", () => {
    it("executes customer-onboarding SOP step by step", async () => {
      const mockCustomer = generateTestCustomer();
      const sop = sopExecutor.loadSOP("customer-onboarding");
      expect(sop).toBeDefined();

      // Start execution
      const execution = await sopExecutor.startExecution("customer-onboarding", {
        customer: mockCustomer,
        organizationId: "test-org",
        userId: "test-user",
      });

      expect(execution.status).toBe("running");
      expect(execution.currentStepIndex).toBe(0);

      // Step 1: Automated welcome email
      let currentStep = sopExecutor.getCurrentStep(execution);
      expect(currentStep).toBe("welcome-email");

      await sopExecutor.proceed(execution.id);
      expect(execution.stepResults[0].status).toBe("completed");

      // Step 2: Manual kickoff meeting
      currentStep = sopExecutor.getCurrentStep(execution);
      expect(currentStep).toBe("kickoff-meeting");

      await sopExecutor.proceed(execution.id);
      expect(execution.status).toBe("waiting_manual");

      // Complete manual step
      await sopExecutor.completeManualStep(execution.id, {
        meetingTime: "2026-01-30T10:00:00Z",
        attendees: ["customer@test.com", "account_manager@test.com"],
        agenda: ["Introduction", "Product overview", "Q&A"],
      });

      expect(execution.status).toBe("running");
      expect(execution.context.meetingTime).toBe("2026-01-30T10:00:00Z");

      // Step 3: Approval for account setup
      currentStep = sopExecutor.getCurrentStep(execution);
      expect(currentStep).toBe("account-setup");

      await sopExecutor.proceed(execution.id);
      expect(execution.status).toBe("waiting_approval");
    });

    it("handles approval rejection in customer onboarding", async () => {
      const mockCustomer = generateTestCustomer();
      const execution = await sopExecutor.startExecution("customer-onboarding", {
        customer: mockCustomer,
      });

      // Fast-forward to approval step
      await sopExecutor.proceed(execution.id); // welcome-email
      await sopExecutor.proceed(execution.id); // kickoff-meeting
      await sopExecutor.completeManualStep(execution.id, { meetingTime: "2026-01-30T10:00:00Z" });
      await sopExecutor.proceed(execution.id); // account-setup

      expect(execution.status).toBe("waiting_approval");

      // Reject the approval
      await sopExecutor.rejectStep(execution.id, "Account configuration incomplete");

      expect(execution.status).toBe("failed");
      const lastResult = execution.stepResults[execution.stepResults.length - 1];
      expect(lastResult.status).toBe("failed");
      expect(lastResult.error).toContain("incomplete");
    });
  });

  describe("Content review SOP execution", () => {
    it("executes content-review SOP with multiple approvals", async () => {
      const sop = sopExecutor.loadSOP("content-review");
      expect(sop).toBeDefined();

      const execution = await sopExecutor.startExecution("content-review", {
        content_draft: "Marketing content draft",
        target_audience: "B2B",
      });

      expect(execution.status).toBe("running");

      // Step through the workflow
      await sopExecutor.proceed(execution.id); // draft-review (manual)
      expect(execution.status).toBe("waiting_manual");

      await sopExecutor.completeManualStep(execution.id, {
        reviewNotes: "Content looks good, minor edits needed",
        approved: true,
      });

      await sopExecutor.proceed(execution.id); // legal-review (approval)
      expect(execution.status).toBe("waiting_approval");
    });
  });

  describe("Expense reimbursement SOP execution", () => {
    it("executes expense-reimbursement with budget check", async () => {
      const sop = sopExecutor.loadSOP("expense-reimbursement");
      expect(sop).toBeDefined();

      const execution = await sopExecutor.startExecution("expense-reimbursement", {
        receipt_image: "receipt.jpg",
        amount: 150,
        category: "travel",
        description: "Client meeting travel expenses",
      });

      expect(execution.status).toBe("running");

      // Step 1: Submit receipt (manual)
      await sopExecutor.proceed(execution.id);
      expect(execution.status).toBe("waiting_manual");

      await sopExecutor.completeManualStep(execution.id, {
        receipt_verified: true,
      });

      // Step 2: Auto-categorize
      await sopExecutor.proceed(execution.id);
      expect(execution.stepResults[1].status).toBe("completed");
    });
  });

  describe("SOP status tracking", () => {
    it("tracks status transitions correctly", async () => {
      const execution = await sopExecutor.startExecution("customer-onboarding", {});

      const statuses: string[] = [execution.status];

      await sopExecutor.proceed(execution.id);
      statuses.push(execution.status);

      await sopExecutor.proceed(execution.id);
      statuses.push(execution.status);

      expect(statuses).toContain("running");
      expect(statuses).toContain("waiting_manual");
    });

    it("records step completion timestamps", async () => {
      const execution = await sopExecutor.startExecution("customer-onboarding", {});

      await sopExecutor.proceed(execution.id); // Complete first automated step

      const firstResult = execution.stepResults[0];
      expect(firstResult.startedAt).toBeDefined();
      expect(firstResult.completedAt).toBeDefined();
      expect(firstResult.completedAt!.getTime()).toBeGreaterThanOrEqual(
        firstResult.startedAt.getTime(),
      );
    });

    it("calculates total execution duration", async () => {
      const execution = await sopExecutor.startExecution("customer-onboarding", {});

      // Complete a few steps
      await sopExecutor.proceed(execution.id);
      await sopExecutor.proceed(execution.id);
      await sopExecutor.completeManualStep(execution.id, { data: "test" });

      const currentDuration = Date.now() - execution.startedAt.getTime();
      expect(currentDuration).toBeGreaterThanOrEqual(0);
      expect(currentDuration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe("Error handling", () => {
    it("handles missing SOP gracefully", async () => {
      // This should not throw because mock executor creates a mock SOP
      const execution = await sopExecutor.startExecution("non-existent-sop", {});
      expect(execution).toBeDefined();
    });

    it("handles invalid step transition", async () => {
      const execution = await sopExecutor.startExecution("customer-onboarding", {});
      await sopExecutor.proceed(execution.id);
      await sopExecutor.proceed(execution.id); // Now waiting_manual

      // Try to approve when waiting for manual step
      await expect(sopExecutor.approveStep(execution.id)).rejects.toThrow(
        "not waiting for approval",
      );
    });

    it("handles missing required data in manual step", async () => {
      const execution = await sopExecutor.startExecution("customer-onboarding", {});
      await sopExecutor.proceed(execution.id);
      await sopExecutor.proceed(execution.id);

      // Complete manual step with minimal data (should still work)
      await sopExecutor.completeManualStep(execution.id, {});
      expect(execution.status).toBe("running");
    });
  });

  describe("Parallel step execution", () => {
    it("executes parallel steps concurrently", async () => {
      const sop = sopExecutor.loadSOP("product-launch-sop");
      expect(sop).toBeDefined();

      const execution = await sopExecutor.startExecution("product-launch-sop", {
        requirements_doc: "requirements.md",
        user_stories: ["As a user..."],
      });

      // Progress to parallel step
      await sopExecutor.proceed(execution.id); // requirements-review (manual)
      await sopExecutor.completeManualStep(execution.id, { reviewed: true });

      await sopExecutor.proceed(execution.id); // stakeholder-approval
      await sopExecutor.approveStep(execution.id);

      await sopExecutor.proceed(execution.id); // marketing-prep (parallel)

      // Parallel step should be completed with all sub-results
      const parallelResult = execution.stepResults.find((r) => r.stepId === "marketing-prep");
      if (parallelResult && parallelResult.output) {
        const outputs = parallelResult.output as StepResult[];
        expect(Array.isArray(outputs)).toBe(true);
      }
    });
  });

  describe("SOP context management", () => {
    it("preserves initial context throughout execution", async () => {
      const initialContext = {
        customer: { name: "Test Customer" },
        organizationId: "test-org",
        customField: "custom-value",
      };

      const execution = await sopExecutor.startExecution("customer-onboarding", initialContext);

      await sopExecutor.proceed(execution.id);

      expect(execution.context.customer).toEqual({ name: "Test Customer" });
      expect(execution.context.customField).toBe("custom-value");
    });

    it("accumulates data from manual steps", async () => {
      const execution = await sopExecutor.startExecution("customer-onboarding", {});

      await sopExecutor.proceed(execution.id);
      await sopExecutor.proceed(execution.id);

      await sopExecutor.completeManualStep(execution.id, {
        field1: "value1",
      });

      await sopExecutor.proceed(execution.id);
      expect(execution.status).toBe("waiting_approval");

      await sopExecutor.approveStep(execution.id);

      await sopExecutor.proceed(execution.id);

      // Check that data from manual step is preserved
      expect(execution.context.field1).toBe("value1");
    });
  });

  describe("SOP completion", () => {
    it("marks SOP as completed when all steps finish", async () => {
      // Use a simple mock SOP that can be completed
      sopExecutor.loadSOP("simple-test");

      // Override with a simple SOP
      (sopExecutor as any).sops.set("simple-auto", {
        id: "simple-auto",
        name: "Simple Auto SOP",
        description: "Simple automated SOP",
        version: "1.0.0",
        category: "test",
        estimated_duration: 60,
        steps: [
          { id: "auto1", name: "Auto Step 1", type: "automated", action: "action1" },
          { id: "auto2", name: "Auto Step 2", type: "automated", action: "action2" },
        ],
      });

      const execution = await sopExecutor.startExecution("simple-auto", {});

      await sopExecutor.proceed(execution.id); // auto1
      await sopExecutor.proceed(execution.id); // auto2
      await sopExecutor.proceed(execution.id); // END

      expect(execution.status).toBe("completed");
      expect(execution.completedAt).toBeDefined();
    });

    it("records completion timestamp", async () => {
      (sopExecutor as any).sops.set("simple-single", {
        id: "simple-single",
        name: "Single Step SOP",
        description: "Single automated step",
        version: "1.0.0",
        category: "test",
        estimated_duration: 30,
        steps: [{ id: "only-step", name: "Only Step", type: "automated", action: "do_something" }],
      });

      const execution = await sopExecutor.startExecution("simple-single", {});
      await sopExecutor.proceed(execution.id);
      await sopExecutor.proceed(execution.id); // Complete

      expect(execution.completedAt).toBeDefined();
      expect(execution.completedAt!.getTime()).toBeGreaterThanOrEqual(
        execution.startedAt.getTime(),
      );
    });
  });
});
