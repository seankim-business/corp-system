/**
 * Example Integration: Activity Hub + Slack Agent Notifier
 *
 * This shows how to use both services together for agent activity notifications.
 */

import { WebClient } from "@slack/web-api";
import { activityHub } from "../activity-hub";
import { slackAgentNotifier } from "./index";

// ============================================================================
// Setup
// ============================================================================

export function initializeAgentNotifications(): void {
  // 1. Get Slack client (from your app initialization)
  const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

  // 2. Initialize the notifier with the Slack client
  slackAgentNotifier.initialize(slackClient);

  // That's it! The notifier is now listening to activity hub events
  console.log("✅ Agent notifications initialized");
}

// ============================================================================
// Example: Agent Execution Lifecycle
// ============================================================================

export async function exampleAgentExecution(): Promise<void> {
  const executionId = "exec-12345";
  const agentId = "agent-sales-01";
  const agentName = "Sales Agent";
  const organizationId = "org-kyndof";

  try {
    // 1. Emit execution start
    // → Slack: "🤖 Sales Agent started working"
    activityHub.emitExecutionStart(
      executionId,
      agentId,
      agentName,
      organizationId,
      { taskDescription: "Analyze Q4 sales data" }
    );

    // 2. Simulate work with progress updates
    await simulateWork();

    // Optional: Emit progress (disabled by default to avoid noise)
    activityHub.emitExecutionProgress(
      executionId,
      agentId,
      agentName,
      organizationId,
      50,
      "Processing Q4 data"
    );

    await simulateWork();

    // 3. Emit tool usage
    // → Slack: "🔧 Using tool: notion_search" (if notifyOnToolUse enabled)
    activityHub.emitToolCall(
      executionId,
      agentId,
      agentName,
      organizationId,
      "notion_search",
      { query: "Q4 sales targets" }
    );

    await simulateWork();

    activityHub.emitToolComplete(
      executionId,
      agentId,
      agentName,
      organizationId,
      "notion_search",
      { resultCount: 15 }
    );

    // 4. Emit completion
    // → Slack: "✅ Sales Agent completed in 5s"
    activityHub.emitExecutionComplete(
      executionId,
      agentId,
      agentName,
      organizationId,
      { result: "Report generated successfully" }
    );

  } catch (error) {
    // 5. Emit failure
    // → Slack: "❌ Sales Agent failed"
    activityHub.emitExecutionFailed(
      executionId,
      agentId,
      agentName,
      organizationId,
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? error.name : "Error"
    );
  }
}

// ============================================================================
// Example: Agent Collaboration
// ============================================================================

export async function exampleAgentDelegation(): Promise<void> {
  const executionId = "exec-12346";
  const salesAgentId = "agent-sales-01";
  const salesAgentName = "Sales Agent";
  const reportAgentId = "agent-report-01";
  const reportAgentName = "Report Generator";
  const organizationId = "org-kyndof";

  // 1. Sales Agent starts
  activityHub.emitExecutionStart(
    executionId,
    salesAgentId,
    salesAgentName,
    organizationId
  );

  await simulateWork();

  // 2. Sales Agent delegates to Report Generator
  // → Slack: "↪️ Sales Agent delegated to Report Generator"
  activityHub.emitDelegationStart(
    executionId,
    salesAgentId,
    salesAgentName,
    reportAgentId,
    reportAgentName,
    organizationId,
    "Generate Q4 sales report with charts"
  );

  // Alternative: Use manual notification method
  await slackAgentNotifier.notifyDelegation(
    salesAgentName,
    reportAgentName,
    "Generate Q4 sales report with charts",
    "C12345678", // Slack channel ID
    "1234567890.123456" // Thread timestamp
  );

  await simulateWork();

  // 3. Report Generator completes
  activityHub.emitDelegationComplete(
    executionId,
    salesAgentId,
    salesAgentName,
    reportAgentId,
    reportAgentName,
    organizationId,
    { reportUrl: "https://reports.example.com/q4-sales" }
  );

  // 4. Sales Agent completes
  activityHub.emitExecutionComplete(
    executionId,
    salesAgentId,
    salesAgentName,
    organizationId
  );
}

// ============================================================================
// Example: Escalation
// ============================================================================

export async function exampleEscalation(): Promise<void> {
  const executionId = "exec-12347";
  const juniorAgentId = "agent-junior-01";
  const juniorAgentName = "Junior Agent";
  const managerId = "agent-manager-01";
  const managerName = "Senior Manager";
  const organizationId = "org-kyndof";

  // 1. Junior Agent encounters issue
  activityHub.emitExecutionStart(
    executionId,
    juniorAgentId,
    juniorAgentName,
    organizationId
  );

  await simulateWork();

  // 2. Escalate to manager
  // → Slack: "⬆️ Junior Agent escalated to Senior Manager"
  activityHub.emitEscalation(
    executionId,
    juniorAgentId,
    juniorAgentName,
    managerId,
    managerName,
    organizationId,
    "Budget approval needed for new software license ($5000/mo)"
  );

  // Alternative: Use manual notification method
  await slackAgentNotifier.notifyEscalation(
    juniorAgentName,
    managerName,
    "Budget approval needed for new software license ($5000/mo)",
    "C12345678",
    "1234567890.123456"
  );
}

// ============================================================================
// Example: Custom Event Listener
// ============================================================================

export function setupCustomMetrics(): void {
  // Track all execution completions
  activityHub.on("execution:complete", (event) => {
    console.log(`✅ Agent completed:`, {
      agentName: event.agentName,
      executionId: event.executionId,
      timestamp: event.timestamp,
    });

    // Send to metrics service
    // metrics.increment("agent.execution.success", {
    //   agentId: event.agentId,
    //   organizationId: event.organizationId,
    // });
  });

  // Track all failures
  activityHub.on("execution:failed", (event) => {
    console.error(`❌ Agent failed:`, {
      agentName: event.agentName,
      error: event.data.error,
      errorType: event.data.errorType,
    });

    // Alert on-call engineer
    // alerting.sendAlert("agent_execution_failed", { ... });
  });

  // Track tool usage
  activityHub.on("tool:call", (event) => {
    console.log(`🔧 Tool used:`, event.data.toolName);

    // Track tool usage metrics
    // metrics.increment("tool.usage", {
    //   toolName: event.data.toolName as string,
    // });
  });

  // Track all events (wildcard)
  activityHub.on("*", (event) => {
    console.debug(`[Activity Hub] ${event.type}:`, event);
  });
}

// ============================================================================
// Helpers
// ============================================================================

function simulateWork(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1000));
}

// ============================================================================
// Usage
// ============================================================================

// Initialize on app startup
if (require.main === module) {
  console.log("Starting example integration...\n");

  initializeAgentNotifications();
  setupCustomMetrics();

  (async () => {
    console.log("\n1. Simple execution:");
    await exampleAgentExecution();

    console.log("\n2. Agent delegation:");
    await exampleAgentDelegation();

    console.log("\n3. Escalation:");
    await exampleEscalation();

    console.log("\n✅ All examples completed");
  })();
}
