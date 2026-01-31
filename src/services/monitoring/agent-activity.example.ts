import { agentActivityService } from "./agent-activity.service";

async function exampleUsage() {
  const activityId = await agentActivityService.trackStart({
    organizationId: "org-123",
    sessionId: "ses-456",
    agentType: "executor",
    agentName: "executor-high",
    category: "ultrabrain",
    inputData: {
      prompt: "Implement feature X",
      model: "claude-opus-4",
    },
    metadata: {
      userId: "user-789",
      source: "slack",
    },
  });

  await agentActivityService.trackProgress(activityId, {
    message: "Analyzing codebase...",
    progress: 30,
    metadata: {
      filesAnalyzed: 15,
    },
  });

  await agentActivityService.trackProgress(activityId, {
    message: "Implementing changes...",
    progress: 70,
    metadata: {
      filesModified: 3,
    },
  });

  await agentActivityService.trackComplete(activityId, {
    outputData: {
      filesChanged: ["src/api/users.ts", "src/services/auth.ts"],
      linesAdded: 45,
      linesRemoved: 12,
    },
    metadata: {
      totalDuration: 12500,
    },
  });

  const recentActivities = await agentActivityService.getRecent("org-123", 10);
  console.log("Recent activities:", recentActivities);

  const sessionActivities = await agentActivityService.getBySession("ses-456");
  console.log("Session activities:", sessionActivities);
}

exampleUsage().catch(console.error);
