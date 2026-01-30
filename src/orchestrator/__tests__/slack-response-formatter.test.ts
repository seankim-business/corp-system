import { describe, it, expect } from "@jest/globals";
import {
  formatErrorMessage,
  formatProcessingMessage,
  formatClarificationQuestion,
  formatMultiAgentStart,
  formatApprovalButtons,
  formatAgentContext,
} from "../slack-response-formatter";
import { AgentConfig } from "../../config/agent-loader";
import { SkillConfig } from "../../config/skill-loader";

describe("slack-response-formatter with i18n", () => {
  const mockAgent: AgentConfig = {
    id: "test-agent",
    name: "Test Agent",
    emoji: "🤖",
    function: "Test function",
    description: "Test agent description",
    skills: ["skill-1"],
    tools: ["tool-1"],
    routing_keywords: ["test"],
    permissions: {
      read: ["test"],
      write: ["test"],
    },
    fallback: false,
  };

  const mockSkills: SkillConfig[] = [
    {
      id: "skill-1",
      name: "Skill 1",
      description: "Test skill",
      category: "test",
      triggers: [],
      parameters: [],
      outputs: [],
      tools_required: [],
    },
  ];

  describe("formatErrorMessage", () => {
    it("should format generic error in Korean (default)", () => {
      const blocks = formatErrorMessage({
        errorMessage: "테스트 오류",
        errorType: "generic",
        language: "ko",
      });

      expect(blocks).toHaveLength(2);
      expect(blocks[0].text?.text).toContain("❌ 오류 발생");
      expect(blocks[0].text?.text).toContain("테스트 오류");
      expect(blocks[1].elements?.[0]).toMatchObject({
        type: "mrkdwn",
        text: expect.stringContaining("Error ID:"),
      });
    });

    it("should format generic error in English", () => {
      const blocks = formatErrorMessage({
        errorMessage: "Test error",
        errorType: "generic",
        language: "en",
      });

      expect(blocks).toHaveLength(2);
      expect(blocks[0].text?.text).toContain("❌ Error Occurred");
      expect(blocks[0].text?.text).toContain("Test error");
    });

    it("should format budget error in Korean", () => {
      const blocks = formatErrorMessage({
        errorType: "budget",
        language: "ko",
        errorId: "test-id-123",
      });

      expect(blocks.length).toBeGreaterThanOrEqual(1);
      expect(blocks[0].text?.text).toContain("예산 한도에 도달했습니다");
    });

    it("should format budget error in English", () => {
      const blocks = formatErrorMessage({
        errorType: "budget",
        language: "en",
        errorId: "test-id-456",
      });

      expect(blocks.length).toBeGreaterThanOrEqual(1);
      expect(blocks[0].text?.text).toContain("Budget limit reached");
    });

    it("should format rate limit error in Korean", () => {
      const blocks = formatErrorMessage({
        errorType: "rate_limit",
        language: "ko",
      });

      expect(blocks[0].text?.text).toContain("잠시 후 다시 시도해주세요");
    });

    it("should format rate limit error in English", () => {
      const blocks = formatErrorMessage({
        errorType: "rate_limit",
        language: "en",
      });

      expect(blocks[0].text?.text).toContain("Please try again in a few minutes");
    });

    it("should format MCP error with service name in Korean", () => {
      const blocks = formatErrorMessage({
        errorType: "mcp",
        serviceName: "Slack",
        language: "ko",
      });

      expect(blocks[0].text?.text).toContain("[Slack] 연결에 실패했습니다");
    });

    it("should format MCP error with service name in English", () => {
      const blocks = formatErrorMessage({
        errorType: "mcp",
        serviceName: "Slack",
        language: "en",
      });

      expect(blocks[0].text?.text).toContain("Failed to connect to [Slack]");
    });

    it("should include agent ID in header when provided", () => {
      const blocks = formatErrorMessage({
        errorMessage: "Test",
        agentId: "test-agent",
        language: "en",
      });

      expect(blocks[0].text?.text).toContain("[test-agent]");
    });

    it("should support legacy string signature with default Korean", () => {
      const blocks = formatErrorMessage("레거시 오류", "agent-1");

      expect(blocks[0].text?.text).toContain("오류 발생");
      expect(blocks[0].text?.text).toContain("[agent-1]");
    });
  });

  describe("formatProcessingMessage", () => {
    it("should format processing message in Korean", () => {
      const blocks = formatProcessingMessage(mockAgent, "ko");

      expect(blocks).toHaveLength(2);
      expect(blocks[0].text?.text).toContain(mockAgent.emoji);
      expect(blocks[1].elements?.[0]).toMatchObject({
        type: "mrkdwn",
        text: "⏳ 요청을 처리하고 있습니다...",
      });
    });

    it("should format processing message in English", () => {
      const blocks = formatProcessingMessage(mockAgent, "en");

      expect(blocks).toHaveLength(2);
      expect(blocks[1].elements?.[0]).toMatchObject({
        type: "mrkdwn",
        text: "⏳ Processing your request...",
      });
    });
  });

  describe("formatClarificationQuestion", () => {
    it("should format clarification in Korean", () => {
      const blocks = formatClarificationQuestion([mockAgent], "ko");

      expect(blocks[0].text?.text).toContain("요청을 더 잘 이해하기 위해 확인이 필요합니다");
      const selectElement = blocks[1].elements?.[0];
      expect(selectElement).toMatchObject({
        type: "static_select",
        placeholder: {
          type: "plain_text",
          text: "에이전트 선택...",
        },
      });
    });

    it("should format clarification in English", () => {
      const blocks = formatClarificationQuestion([mockAgent], "en");

      expect(blocks[0].text?.text).toContain("I need clarification");
      const selectElement = blocks[1].elements?.[0];
      expect(selectElement).toMatchObject({
        type: "static_select",
        placeholder: {
          type: "plain_text",
          text: "Select agent...",
        },
      });
    });
  });

  describe("formatMultiAgentStart", () => {
    it("should format multi-agent start in Korean", () => {
      const blocks = formatMultiAgentStart([mockAgent], "ko");

      expect(blocks[0].text?.text).toContain("멀티 에이전트 워크플로우 시작");
      expect(blocks[0].text?.text).toContain(mockAgent.emoji);
    });

    it("should format multi-agent start in English", () => {
      const blocks = formatMultiAgentStart([mockAgent], "en");

      expect(blocks[0].text?.text).toContain("Multi-Agent Workflow Started");
      expect(blocks[0].text?.text).toContain(mockAgent.emoji);
    });
  });

  describe("formatApprovalButtons", () => {
    it("should format approval buttons in Korean", () => {
      const block = formatApprovalButtons("approval-123", "ko");

      expect(block.elements).toHaveLength(2);
      expect(block.elements?.[0].text).toMatchObject({
        type: "plain_text",
        text: "✅ 승인",
      });
      expect(block.elements?.[1].text).toMatchObject({
        type: "plain_text",
        text: "❌ 거절",
      });
    });

    it("should format approval buttons in English", () => {
      const block = formatApprovalButtons("approval-123", "en");

      expect(block.elements).toHaveLength(2);
      expect(block.elements?.[0].text).toMatchObject({
        type: "plain_text",
        text: "✅ Approve",
      });
      expect(block.elements?.[1].text).toMatchObject({
        type: "plain_text",
        text: "❌ Reject",
      });
    });
  });

  describe("formatAgentContext", () => {
    it("should format context in Korean", () => {
      const blocks = formatAgentContext(mockSkills, "/path/to/sop", "ko");

      expect(blocks[0].elements?.[0]).toMatchObject({
        type: "mrkdwn",
        text: expect.stringContaining("📋 사용 SOP"),
      });
      expect(blocks[0].elements?.[1]).toMatchObject({
        type: "mrkdwn",
        text: expect.stringContaining("🛠️ 활성 스킬"),
      });
    });

    it("should format context in English", () => {
      const blocks = formatAgentContext(mockSkills, "/path/to/sop", "en");

      expect(blocks[0].elements?.[0]).toMatchObject({
        type: "mrkdwn",
        text: expect.stringContaining("📋 Using SOP"),
      });
      expect(blocks[0].elements?.[1]).toMatchObject({
        type: "mrkdwn",
        text: expect.stringContaining("🛠️ Active Skills"),
      });
    });
  });
});
