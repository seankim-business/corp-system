/**
 * Change Analyzer Service
 *
 * Provides AI-based analysis for organization changes:
 * - Skill/tool suggestions based on function and description
 * - Impact analysis (affected agents, SOPs)
 * - Risk level calculation
 * - File change predictions
 */

import { logger } from "../utils/logger";
import * as fs from "fs";
import * as path from "path";

export interface ChangeAnalysis {
  suggestedSkills: string[];
  suggestedTools: string[];
  impactedAgents: string[];
  impactedSOPs: string[];
  riskLevel: "low" | "medium" | "high";
  recommendations: string[];
  filesCreated: string[];
  filesModified: string[];
}

export interface ChangeRequest {
  changeType: "new_agent" | "new_team" | "process_modification" | "role_change";
  teamFunction: string;
  entityName: string;
  description: string;
  selectedSkills?: string[];
  selectedTools?: string[];
  permissions?: {
    read: string[];
    write: string[];
    deny: string[];
  };
}

// Skill suggestions by function
const FUNCTION_SKILLS: Record<string, string[]> = {
  "Data & Analytics": [
    "sql-query",
    "dashboard-create",
    "report-generate",
    "data-pipeline",
    "data-visualization",
  ],
  Engineering: ["code-review", "deploy", "monitoring", "testing", "ci-cd", "debugging"],
  Marketing: [
    "campaign-planning",
    "content-creation",
    "analytics",
    "brand-guidelines",
    "social-media",
  ],
  Operations: ["inventory-management", "logistics", "supply-chain", "process-optimization"],
  Finance: ["budget-management", "expense-tracking", "financial-reporting", "forecasting"],
  HR: ["onboarding", "performance-review", "recruitment", "training", "employee-relations"],
  Sales: ["lead-management", "crm-update", "proposal-creation", "contract-review"],
  "Customer Success": ["customer-onboarding", "support-ticket", "feedback-analysis", "retention"],
  Product: ["roadmap-planning", "feature-spec", "user-research", "competitive-analysis"],
  Design: ["ui-design", "brand-assets", "prototyping", "design-review"],
};

// Tool/MCP suggestions by function
const FUNCTION_TOOLS: Record<string, string[]> = {
  "Data & Analytics": ["bigquery", "tableau", "slack", "looker", "jupyter"],
  Engineering: ["github", "jira", "slack", "datadog", "sentry", "jenkins"],
  Marketing: ["notion", "figma", "google-analytics", "slack", "hubspot"],
  Operations: ["notion", "google-sheets", "slack", "asana", "inventory-system"],
  Finance: ["quickbooks", "google-sheets", "slack", "expensify", "netsuite"],
  HR: ["bamboohr", "notion", "slack", "workday", "greenhouse"],
  Sales: ["salesforce", "slack", "zoom", "docusign", "linkedin"],
  "Customer Success": ["zendesk", "intercom", "slack", "notion", "mixpanel"],
  Product: ["notion", "figma", "jira", "amplitude", "slack"],
  Design: ["figma", "notion", "slack", "adobe-cc", "zeplin"],
};

// Keywords that suggest additional skills
const KEYWORD_SKILLS: Record<string, string[]> = {
  automation: ["workflow-automation", "script-execution"],
  report: ["report-generate", "data-visualization"],
  analysis: ["data-analysis", "insight-generation"],
  customer: ["customer-communication", "feedback-analysis"],
  budget: ["budget-tracking", "expense-approval"],
  schedule: ["calendar-management", "meeting-scheduling"],
  document: ["document-creation", "template-management"],
  approval: ["approval-workflow", "review-process"],
};

/**
 * Analyze a change request and return suggestions + impact analysis
 */
export async function analyzeChange(change: ChangeRequest): Promise<ChangeAnalysis> {
  logger.info("Analyzing organization change", {
    changeType: change.changeType,
    teamFunction: change.teamFunction,
    entityName: change.entityName,
  });

  // Get base skills and tools from function
  const baseSkills = FUNCTION_SKILLS[change.teamFunction] || [];
  const baseTools = FUNCTION_TOOLS[change.teamFunction] || [];

  // Extract additional skills from description keywords
  const descriptionLower = change.description.toLowerCase();
  const additionalSkills: string[] = [];

  for (const [keyword, skills] of Object.entries(KEYWORD_SKILLS)) {
    if (descriptionLower.includes(keyword)) {
      additionalSkills.push(...skills);
    }
  }

  // Combine and dedupe skills
  const suggestedSkills = [...new Set([...baseSkills, ...additionalSkills])];
  const suggestedTools = [...new Set(baseTools)];

  // Find impacted agents and SOPs
  const { impactedAgents, impactedSOPs } = await findImpactedResources(change);

  // Calculate risk level
  const riskLevel = calculateRiskLevel(change, impactedAgents, impactedSOPs);

  // Generate recommendations
  const recommendations = generateRecommendations(change, riskLevel, impactedAgents);

  // Predict file changes
  const { filesCreated, filesModified } = predictFileChanges(change, impactedAgents);

  const analysis: ChangeAnalysis = {
    suggestedSkills,
    suggestedTools,
    impactedAgents,
    impactedSOPs,
    riskLevel,
    recommendations,
    filesCreated,
    filesModified,
  };

  logger.info("Change analysis complete", {
    entityName: change.entityName,
    riskLevel,
    impactedAgentsCount: impactedAgents.length,
    impactedSOPsCount: impactedSOPs.length,
  });

  return analysis;
}

/**
 * Find agents and SOPs that might be impacted by this change
 */
async function findImpactedResources(
  change: ChangeRequest,
): Promise<{ impactedAgents: string[]; impactedSOPs: string[] }> {
  const impactedAgents: string[] = [];
  const impactedSOPs: string[] = [];

  // Map functions to related agents
  const functionAgentMap: Record<string, string[]> = {
    "Data & Analytics": ["ops-agent", "finance-agent", "marketing-agent"],
    Engineering: ["ops-agent", "devops-agent"],
    Marketing: ["brand-agent", "content-agent", "design-agent"],
    Operations: ["inventory-agent", "logistics-agent", "finance-agent"],
    Finance: ["ops-agent", "budget-agent", "accounting-agent"],
    HR: ["secretary-agent", "onboarding-agent"],
    Sales: ["customer-agent", "contract-agent"],
    "Customer Success": ["support-agent", "feedback-agent"],
    Product: ["engineering-agent", "design-agent", "marketing-agent"],
    Design: ["brand-agent", "marketing-agent", "product-agent"],
  };

  // Map functions to related SOPs
  const functionSOPMap: Record<string, string[]> = {
    "Data & Analytics": ["data-reporting", "dashboard-creation", "analytics-review"],
    Engineering: ["code-review", "deployment", "incident-response"],
    Marketing: ["campaign-execution", "content-production", "brand-guidelines"],
    Operations: ["inventory-management", "supply-chain", "process-optimization"],
    Finance: ["budget-review", "expense-approval", "financial-reporting"],
    HR: ["employee-onboarding", "performance-review", "recruitment"],
    Sales: ["lead-qualification", "contract-review", "deal-closure"],
    "Customer Success": ["customer-onboarding", "support-escalation", "feedback-collection"],
    Product: ["feature-planning", "roadmap-review", "user-research"],
    Design: ["design-review", "asset-creation", "brand-update"],
  };

  // Get impacted resources based on function
  const relatedAgents = functionAgentMap[change.teamFunction] || [];
  const relatedSOPs = functionSOPMap[change.teamFunction] || [];

  // For role_change and process_modification, more agents are impacted
  if (change.changeType === "role_change") {
    impactedAgents.push(...relatedAgents);
  } else if (change.changeType === "process_modification") {
    impactedAgents.push(...relatedAgents.slice(0, 2)); // Fewer agents impacted
    impactedSOPs.push(...relatedSOPs);
  } else if (change.changeType === "new_agent") {
    // New agent might need to integrate with existing ones
    impactedAgents.push(...relatedAgents.slice(0, 1));
  } else if (change.changeType === "new_team") {
    // New team impacts multiple areas
    impactedAgents.push(...relatedAgents);
  }

  // Try to scan actual config directories if they exist
  const configDir = path.join(process.cwd(), "config");

  try {
    const agentsDir = path.join(configDir, "agents");
    if (fs.existsSync(agentsDir)) {
      const agentFiles = fs.readdirSync(agentsDir);
      // Filter to find agents that might reference the team function
      const relevantAgents = agentFiles
        .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
        .map((f) => f.replace(/\.ya?ml$/, ""));
      // Add any matching agents
      for (const agent of relevantAgents) {
        if (agent.includes(change.teamFunction.toLowerCase().split(" ")[0])) {
          if (!impactedAgents.includes(agent)) {
            impactedAgents.push(agent);
          }
        }
      }
    }
  } catch {
    // Config directory scanning is optional
  }

  try {
    const sopsDir = path.join(configDir, "sops");
    if (fs.existsSync(sopsDir)) {
      const sopFiles = fs.readdirSync(sopsDir);
      const relevantSOPs = sopFiles
        .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml") || f.endsWith(".md"))
        .map((f) => f.replace(/\.(ya?ml|md)$/, ""));
      for (const sop of relevantSOPs) {
        if (sop.includes(change.teamFunction.toLowerCase().split(" ")[0])) {
          if (!impactedSOPs.includes(sop)) {
            impactedSOPs.push(sop);
          }
        }
      }
    }
  } catch {
    // Config directory scanning is optional
  }

  return {
    impactedAgents: [...new Set(impactedAgents)],
    impactedSOPs: [...new Set(impactedSOPs)],
  };
}

/**
 * Calculate risk level based on change scope
 */
function calculateRiskLevel(
  change: ChangeRequest,
  impactedAgents: string[],
  impactedSOPs: string[],
): "low" | "medium" | "high" {
  // High risk scenarios
  if (change.changeType === "role_change" && impactedAgents.length > 2) {
    return "high";
  }

  if (impactedAgents.length > 3 || impactedSOPs.length > 3) {
    return "high";
  }

  // Medium risk scenarios
  if (change.changeType === "process_modification") {
    return "medium";
  }

  if (change.changeType === "new_team") {
    return "medium";
  }

  if (impactedAgents.length > 1 || impactedSOPs.length > 1) {
    return "medium";
  }

  // Low risk for simple additions
  return "low";
}

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(
  change: ChangeRequest,
  riskLevel: "low" | "medium" | "high",
  impactedAgents: string[],
): string[] {
  const recommendations: string[] = [];

  if (change.changeType === "new_agent") {
    recommendations.push(
      `${change.entityName}의 권한 범위를 최소한으로 시작하고 필요에 따라 확장하세요`,
    );
    recommendations.push("새 에이전트를 기존 워크플로우에 통합하기 전에 단독 테스트를 수행하세요");
  }

  if (change.changeType === "new_team") {
    recommendations.push("팀 간 커뮤니케이션 채널(Slack 채널)을 설정하세요");
    recommendations.push("기존 팀과의 협업 프로세스를 문서화하세요");
  }

  if (change.changeType === "process_modification") {
    recommendations.push("변경 전 현재 프로세스의 베이스라인 메트릭을 기록하세요");
    recommendations.push("점진적으로 변경을 적용하고 각 단계를 검증하세요");
  }

  if (change.changeType === "role_change") {
    recommendations.push("영향받는 에이전트 담당자들에게 사전 알림을 보내세요");
    recommendations.push("역할 변경 후 1-2주간 모니터링 기간을 두세요");
  }

  if (riskLevel === "high") {
    recommendations.push("⚠️ 고위험 변경: 스테이징 환경에서 먼저 테스트하세요");
    recommendations.push("변경 롤백 계획을 준비하세요");
  }

  if (impactedAgents.length > 0) {
    recommendations.push(`영향받는 에이전트 담당자들과 리뷰 미팅을 잡으세요: ${impactedAgents.join(", ")}`);
  }

  return recommendations;
}

/**
 * Predict which files will be created or modified
 */
function predictFileChanges(
  change: ChangeRequest,
  impactedAgents: string[],
): { filesCreated: string[]; filesModified: string[] } {
  const filesCreated: string[] = [];
  const filesModified: string[] = [];

  const entitySlug = change.entityName.toLowerCase().replace(/\s+/g, "-");

  switch (change.changeType) {
    case "new_agent":
      filesCreated.push(`config/agents/${entitySlug}.yaml`);
      // Parent agent might need update for reports_to
      if (impactedAgents.length > 0) {
        filesModified.push(`config/agents/${impactedAgents[0]}.yaml`);
      }
      break;

    case "new_team":
      filesCreated.push(`config/teams/${entitySlug}.yaml`);
      filesCreated.push(`config/agents/${entitySlug}-lead.yaml`);
      filesModified.push("config/org/structure.yaml");
      break;

    case "process_modification":
      // Find or create SOP file
      filesModified.push(`config/sops/${entitySlug}.yaml`);
      // Agents using this SOP might need updates
      for (const agent of impactedAgents.slice(0, 2)) {
        filesModified.push(`config/agents/${agent}.yaml`);
      }
      break;

    case "role_change":
      // Multiple agent configs need updates
      for (const agent of impactedAgents) {
        filesModified.push(`config/agents/${agent}.yaml`);
      }
      break;
  }

  return { filesCreated, filesModified };
}

/**
 * Notify stakeholders about an organization change
 */
export async function notifyStakeholders(
  change: ChangeRequest,
  analysis: ChangeAnalysis,
  prUrl: string,
): Promise<void> {
  logger.info("Notifying stakeholders about organization change", {
    changeType: change.changeType,
    entityName: change.entityName,
    impactedAgents: analysis.impactedAgents,
    prUrl,
  });

  const notifications: StakeholderNotification[] = [];

  // 1. Build notification for #org-changes Slack channel
  const slackNotification = buildSlackNotification(change, analysis, prUrl);
  notifications.push({
    channel: "slack",
    target: "#org-changes",
    message: slackNotification,
    priority: analysis.riskLevel === "high" ? "urgent" : "normal",
  });

  // 2. Notify impacted agent owners
  for (const agentName of analysis.impactedAgents) {
    notifications.push({
      channel: "in-app",
      target: `agent-owner:${agentName}`,
      message: `조직 변경이 ${agentName}에 영향을 미칩니다. PR 리뷰가 필요합니다: ${prUrl}`,
      priority: "normal",
    });
  }

  // 3. Notify team leads for high-risk changes
  if (analysis.riskLevel === "high") {
    notifications.push({
      channel: "email",
      target: "team-leads",
      message: buildEmailNotification(change, analysis, prUrl),
      priority: "urgent",
    });
  }

  // Queue notifications (actual implementation would use a notification service)
  await queueNotifications(notifications);

  logger.info("Stakeholder notifications queued", {
    notificationCount: notifications.length,
    channels: [...new Set(notifications.map((n) => n.channel))],
  });
}

interface StakeholderNotification {
  channel: "slack" | "email" | "in-app";
  target: string;
  message: string;
  priority: "normal" | "urgent";
}

/**
 * Build Slack notification message
 */
function buildSlackNotification(change: ChangeRequest, analysis: ChangeAnalysis, prUrl: string): string {
  const changeTypeKo: Record<string, string> = {
    new_agent: "새 에이전트 추가",
    new_team: "새 팀 생성",
    process_modification: "프로세스 수정",
    role_change: "역할 변경",
  };

  const riskEmoji: Record<string, string> = {
    low: "🟢",
    medium: "🟡",
    high: "🔴",
  };

  return `*${riskEmoji[analysis.riskLevel]} 조직 변경 알림*

*유형:* ${changeTypeKo[change.changeType] || change.changeType}
*대상:* ${change.entityName}
*팀/기능:* ${change.teamFunction}
*위험도:* ${analysis.riskLevel.toUpperCase()}

*설명:*
${change.description}

*영향 받는 에이전트:* ${analysis.impactedAgents.join(", ") || "없음"}
*영향 받는 SOP:* ${analysis.impactedSOPs.join(", ") || "없음"}

*생성된 파일:* ${analysis.filesCreated.length}개
*수정된 파일:* ${analysis.filesModified.length}개

:git-pull-request: <${prUrl}|PR 리뷰하기>`;
}

/**
 * Build email notification for high-risk changes
 */
function buildEmailNotification(change: ChangeRequest, analysis: ChangeAnalysis, prUrl: string): string {
  return `
조직 변경 검토 요청

안녕하세요,

고위험 조직 변경이 제출되었습니다. 검토가 필요합니다.

변경 유형: ${change.changeType}
대상: ${change.entityName}
설명: ${change.description}
위험도: ${analysis.riskLevel.toUpperCase()}

영향 받는 에이전트: ${analysis.impactedAgents.join(", ") || "없음"}
영향 받는 SOP: ${analysis.impactedSOPs.join(", ") || "없음"}

권장 사항:
${analysis.recommendations.map((r) => `- ${r}`).join("\n")}

PR 링크: ${prUrl}

감사합니다.
Nubabel Organization Change System
`;
}

/**
 * Queue notifications for delivery (placeholder for actual notification service)
 */
async function queueNotifications(notifications: StakeholderNotification[]): Promise<void> {
  // In a real implementation, this would:
  // 1. Send to Slack via Slack API/webhook
  // 2. Queue emails via email service (SES, SendGrid, etc.)
  // 3. Create in-app notifications in database

  for (const notification of notifications) {
    logger.info("Notification queued", {
      channel: notification.channel,
      target: notification.target,
      priority: notification.priority,
    });
  }
}
