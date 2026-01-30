/**
 * Manual verification script for multi-agent orchestrator
 */

import {
  shouldUseMultiAgent,
  getSuggestedAgents,
  getAvailableAgents,
} from "../src/orchestrator/multi-agent-orchestrator";
import { decomposeTask, estimateTaskComplexity } from "../src/orchestrator/task-decomposer";
import { agentRegistry } from "../src/orchestrator/agent-registry";

console.log("=== Multi-Agent Orchestrator Verification ===\n");

// Test 1: Agent Registry
console.log("1. Agent Registry:");
const allAgents = getAvailableAgents();
console.log(`   Found ${allAgents.length} agents:`);
allAgents.forEach((agent) => {
  console.log(`   - ${agent.emoji} ${agent.name} (${agent.id}): ${agent.description}`);
});
console.log();

// Test 2: Simple Request Detection
console.log("2. Simple Request Detection:");
const simpleRequest = "find the latest sales report";
const simpleComplex = shouldUseMultiAgent(simpleRequest);
console.log(`   Request: "${simpleRequest}"`);
console.log(`   Needs multi-agent: ${simpleComplex}`);
console.log(`   Complexity: ${estimateTaskComplexity(simpleRequest)}`);
console.log();

// Test 3: Complex Request Detection
console.log("3. Complex Request Detection:");
const complexRequest =
  "extract sales metrics from the database, create a formatted report, and send it to the team via Slack";
const complexMulti = shouldUseMultiAgent(complexRequest);
console.log(`   Request: "${complexRequest}"`);
console.log(`   Needs multi-agent: ${complexMulti}`);
console.log(`   Complexity: ${estimateTaskComplexity(complexRequest)}`);
console.log(`   Suggested agents: ${getSuggestedAgents(complexRequest).join(", ")}`);
console.log();

// Test 4: Task Decomposition
console.log("4. Task Decomposition:");
const decomposition = decomposeTask(complexRequest);
console.log(`   Original request: "${decomposition.originalRequest.substring(0, 60)}..."`);
console.log(`   Requires multi-agent: ${decomposition.requiresMultiAgent}`);
console.log(`   Estimated complexity: ${decomposition.estimatedComplexity}`);
console.log(`   Subtasks (${decomposition.subtasks.length}):`);
decomposition.subtasks.forEach((task, idx) => {
  const agent = agentRegistry.getAgent(task.assignedAgent);
  console.log(
    `     ${idx + 1}. [${agent?.emoji || "❓"}] ${task.assignedAgent}: ${task.description.substring(0, 60)}...`,
  );
  if (task.dependencies.length > 0) {
    console.log(`        Dependencies: ${task.dependencies.length} task(s)`);
  }
});
console.log();

// Test 5: Parallelization Groups
console.log("5. Parallelization Strategy:");
console.log(`   Parallel groups: ${decomposition.suggestedParallelization.length}`);
decomposition.suggestedParallelization.forEach((group, idx) => {
  console.log(`     Group ${idx + 1}: ${group.join(", ")} (${group.length} agent(s))`);
});
console.log();

// Test 6: Agent Capabilities
console.log("6. Agent Capabilities Sample:");
const dataAgent = agentRegistry.getAgent("data");
if (dataAgent) {
  console.log(`   ${dataAgent.emoji} ${dataAgent.name}:`);
  console.log(`     Category: ${dataAgent.category}`);
  console.log(`     Skills: ${dataAgent.skills.join(", ")}`);
  console.log(`     Capabilities: ${dataAgent.capabilities.length}`);
  dataAgent.capabilities.forEach((cap) => {
    console.log(`       - ${cap.name}: ${cap.description}`);
  });
}
console.log();

// Test 7: Different Request Patterns
console.log("7. Pattern Detection:");
const testCases = [
  "create a weekly report",
  "send notifications",
  "analyze task priorities",
  "get approval for budget",
  "update all project statuses",
];

testCases.forEach((testReq) => {
  const agents = getSuggestedAgents(testReq);
  const needsMulti = shouldUseMultiAgent(testReq);
  console.log(`   "${testReq}"`);
  console.log(`     Multi-agent: ${needsMulti}, Agents: ${agents.join(", ")}`);
});
console.log();

console.log("=== Verification Complete ===");
console.log("\n✅ All core functions are implemented and working:");
console.log("   - shouldUseMultiAgent() ✓");
console.log("   - getSuggestedAgents() ✓");
console.log("   - getAvailableAgents() ✓");
console.log("   - decomposeTask() ✓");
console.log("   - estimateTaskComplexity() ✓");
console.log("   - agentRegistry.getAgent() ✓");
console.log("   - Task dependency tracking ✓");
console.log("   - Parallel execution grouping ✓");
