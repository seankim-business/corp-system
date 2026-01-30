#!/usr/bin/env node
/**
 * Seed starter workflows for Kyndof organization
 *
 * Workflows:
 * 1. Daily Team Briefing - AI summarizes tasks from Notion
 * 2. Slack Support Assistant - AI handles common questions
 * 3. Production Order Tracker - Track manufacturing status
 */
const { PrismaClient } = require("@prisma/client");

const KYNDOF_ORG_ID = "2367a924-153a-4dd1-a5eb-137bc6dec909";

const STARTER_WORKFLOWS = [
  {
    name: "Daily Team Briefing",
    description:
      "AI가 매일 아침 Notion의 작업 현황을 요약해서 Slack에 공유합니다. 우선순위가 높은 태스크, 오늘 마감인 항목, 그리고 팀원별 진행 상황을 한눈에 볼 수 있습니다.",
    config: {
      trigger: {
        type: "schedule",
        cron: "0 9 * * 1-5", // Mon-Fri at 9:00 AM
        timezone: "Asia/Seoul",
      },
      actions: [
        {
          type: "mcp_invoke",
          provider: "notion",
          tool: "getTasks",
          params: {
            filter: {
              status: { not_equals: "Done" },
            },
            sorts: [
              { property: "Priority", direction: "descending" },
              { property: "Due Date", direction: "ascending" },
            ],
          },
        },
        {
          type: "ai_summarize",
          prompt:
            "다음 작업 목록을 분석해서 오늘의 팀 브리핑을 작성해주세요. 1) 긴급/중요 항목 2) 오늘 마감 항목 3) 진행 중인 주요 프로젝트 형식으로 요약해주세요.",
          model: "claude-sonnet",
        },
        {
          type: "mcp_invoke",
          provider: "slack",
          tool: "slack_send_message",
          params: {
            channel: "#general",
            text: "{{ai_result}}",
          },
        },
      ],
      notifications: {
        onSuccess: { slack: "#it-test" },
        onFailure: { slack: "#it-test", mention: "@channel" },
      },
    },
    enabled: true,
    sopEnabled: false,
  },
  {
    name: "Slack Support Assistant",
    description:
      "고객이나 팀원이 Slack에서 질문하면 AI가 자동으로 응답합니다. FAQ, 제품 정보, 프로세스 안내 등을 처리하고, 복잡한 문의는 담당자에게 에스컬레이션합니다.",
    config: {
      trigger: {
        type: "slack_mention",
        channels: ["#support", "#general", "#it-test"],
        keywords: ["도움", "질문", "문의", "help", "?"],
      },
      actions: [
        {
          type: "ai_analyze",
          prompt:
            "다음 질문을 분석해서 1) 카테고리 (FAQ/제품/프로세스/기타) 2) 긴급도 (높음/보통/낮음) 3) 에스컬레이션 필요 여부를 판단해주세요.",
          model: "claude-haiku",
        },
        {
          type: "conditional",
          condition: "{{analysis.escalation_required}} == false",
          then: [
            {
              type: "ai_respond",
              prompt:
                "친절하고 전문적인 톤으로 질문에 답변해주세요. 가능하면 구체적인 다음 단계나 관련 리소스 링크도 제공해주세요.",
              model: "claude-sonnet",
            },
          ],
          else: [
            {
              type: "mcp_invoke",
              provider: "slack",
              tool: "slack_send_message",
              params: {
                channel: "#support-escalation",
                text: "에스컬레이션 필요: {{original_message}}",
              },
            },
          ],
        },
      ],
      context: {
        companyInfo: "Kyndof는 패션 테크 스타트업으로, K-POP 아이돌 무대 의상을 제작합니다.",
        commonFAQ: [
          {
            q: "납기일 얼마나 걸려요?",
            a: "일반적으로 2-4주 소요되며, 긴급 건은 협의 가능합니다.",
          },
          { q: "수정 몇 번까지 가능해요?", a: "기본 2회 수정 포함, 추가 수정은 별도 협의합니다." },
        ],
      },
    },
    enabled: true,
    sopEnabled: false,
  },
  {
    name: "Production Order Tracker",
    description:
      "제작 주문의 진행 상황을 추적하고, 상태 변경 시 관련 담당자에게 알림을 보냅니다. Notion 데이터베이스와 연동하여 실시간 현황을 파악할 수 있습니다.",
    config: {
      trigger: {
        type: "webhook",
        path: "/webhooks/production-update",
        method: "POST",
        auth: "api_key",
      },
      actions: [
        {
          type: "validate_input",
          schema: {
            orderId: { type: "string", required: true },
            status: {
              type: "string",
              enum: ["received", "in_progress", "quality_check", "shipping", "delivered"],
            },
            notes: { type: "string" },
          },
        },
        {
          type: "mcp_invoke",
          provider: "notion",
          tool: "updateTask",
          params: {
            taskId: "{{input.orderId}}",
            properties: {
              Status: "{{input.status}}",
              "Last Updated": "{{now}}",
              Notes: "{{input.notes}}",
            },
          },
        },
        {
          type: "conditional",
          condition: "{{input.status}} in ['quality_check', 'shipping', 'delivered']",
          then: [
            {
              type: "mcp_invoke",
              provider: "slack",
              tool: "slack_send_message",
              params: {
                channel: "#production",
                text: "주문 {{input.orderId}} 상태 업데이트: {{input.status}}\n{{input.notes}}",
              },
            },
          ],
        },
      ],
      notifications: {
        onStatusChange: {
          quality_check: { slack: "#quality-team" },
          shipping: { slack: "#logistics", email: "shipping@kyndof.com" },
          delivered: { slack: "#sales", email: "{{order.client_email}}" },
        },
      },
    },
    enabled: true,
    sopEnabled: true,
    sopSteps: [
      {
        step: 1,
        name: "Order Received",
        description: "주문 접수 및 초기 검토",
        checklist: ["고객 요구사항 확인", "재료 가용성 체크", "일정 산정"],
        assignee: "sales",
      },
      {
        step: 2,
        name: "Design Phase",
        description: "디자인 작업 및 고객 승인",
        checklist: ["초안 디자인", "고객 피드백 반영", "최종 디자인 승인"],
        assignee: "design",
      },
      {
        step: 3,
        name: "Production",
        description: "제작 진행",
        checklist: ["재료 준비", "패턴 작업", "봉제", "마감 처리"],
        assignee: "production",
      },
      {
        step: 4,
        name: "Quality Check",
        description: "품질 검수",
        checklist: ["외관 검사", "치수 확인", "마감 상태 확인", "포장"],
        assignee: "quality",
      },
      {
        step: 5,
        name: "Delivery",
        description: "배송 및 완료",
        checklist: ["배송 준비", "운송장 발급", "고객 인도", "피드백 수집"],
        assignee: "logistics",
      },
    ],
  },
];

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log("Checking organization...");
    const org = await prisma.organization.findUnique({
      where: { id: KYNDOF_ORG_ID },
    });

    if (!org) {
      console.error(`Organization ${KYNDOF_ORG_ID} not found`);
      process.exit(1);
    }

    console.log(`Found organization: ${org.name}`);

    for (const workflow of STARTER_WORKFLOWS) {
      console.log(`\nCreating workflow: ${workflow.name}...`);

      const existing = await prisma.workflow.findFirst({
        where: {
          organizationId: KYNDOF_ORG_ID,
          name: workflow.name,
        },
      });

      if (existing) {
        console.log(`  - Already exists (id: ${existing.id}), updating...`);
        await prisma.workflow.update({
          where: { id: existing.id },
          data: {
            description: workflow.description,
            config: workflow.config,
            enabled: workflow.enabled,
            sopEnabled: workflow.sopEnabled,
            sopSteps: workflow.sopSteps || null,
          },
        });
        console.log(`  - Updated`);
      } else {
        const created = await prisma.workflow.create({
          data: {
            organizationId: KYNDOF_ORG_ID,
            name: workflow.name,
            description: workflow.description,
            config: workflow.config,
            enabled: workflow.enabled,
            sopEnabled: workflow.sopEnabled,
            sopSteps: workflow.sopSteps || null,
          },
        });
        console.log(`  - Created (id: ${created.id})`);
      }
    }

    console.log("\n✅ All starter workflows created/updated successfully!");

    const allWorkflows = await prisma.workflow.findMany({
      where: { organizationId: KYNDOF_ORG_ID },
      select: { id: true, name: true, enabled: true, sopEnabled: true },
    });

    console.log("\nCurrent workflows for Kyndof:");
    for (const wf of allWorkflows) {
      console.log(`  - ${wf.name} (enabled: ${wf.enabled}, SOP: ${wf.sopEnabled})`);
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
