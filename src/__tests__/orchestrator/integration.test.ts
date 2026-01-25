import { analyzeRequest } from "../../orchestrator/request-analyzer";
import { selectCategory } from "../../orchestrator/category-selector";
import { selectSkills } from "../../orchestrator/skill-selector";

describe("Orchestrator Integration Tests", () => {
  describe("End-to-End Request Processing", () => {
    it("should process Linear update request correctly", async () => {
      const userRequest = "Linear에서 진행 중인 이슈를 완료 처리해줘";

      const analysis = await analyzeRequest(userRequest);
      const category = selectCategory(userRequest, analysis);
      const skills = selectSkills(userRequest);

      expect(analysis.intent).toContain("update");
      expect(analysis.entities.target).toBe("linear");
      expect(category).toBe("quick");
      expect(skills).toContain("mcp-integration");
    });

    it("should process Notion task creation correctly", async () => {
      const userRequest = "Notion에 새로운 task 만들어줘";

      const analysis = await analyzeRequest(userRequest);
      const category = selectCategory(userRequest, analysis);
      const skills = selectSkills(userRequest);

      expect(analysis.intent).toContain("create");
      expect(analysis.entities.target).toBe("notion");
      expect(category).toBe("quick");
      expect(skills).toContain("mcp-integration");
    });

    it("should process multi-step request correctly", async () => {
      const userRequest = "Linear 이슈를 완료하고 Slack에 알림 보내줘";

      const analysis = await analyzeRequest(userRequest);
      const skills = selectSkills(userRequest);

      expect(analysis.requiresMultiAgent).toBe(true);
      expect(analysis.complexity).toBe("high");
      expect(skills).toContain("mcp-integration");
    });

    it("should process design request correctly", async () => {
      const userRequest = "Dashboard UI 디자인 개선해줘";

      const analysis = await analyzeRequest(userRequest);
      const category = selectCategory(userRequest, analysis);
      const skills = selectSkills(userRequest);

      expect(category).toBe("visual-engineering");
      expect(skills).toContain("frontend-ui-ux");
    });

    it("should process git operation correctly", async () => {
      const userRequest = "변경사항 커밋하고 푸시해줘";

      const analysis = await analyzeRequest(userRequest);
      const category = selectCategory(userRequest, analysis);
      const skills = selectSkills(userRequest);

      expect(category).toBe("quick");
      expect(skills).toContain("git-master");
    });

    it("should detect all supported MCP providers", async () => {
      const providers = ["linear", "notion", "jira", "asana", "airtable"];

      for (const provider of providers) {
        const userRequest = `${provider} 작업 조회해줘`;
        const analysis = await analyzeRequest(userRequest);
        const skills = selectSkills(userRequest);

        expect(analysis.entities.target).toBe(provider);
        expect(skills).toContain("mcp-integration");
      }
    });
  });

  describe("Category Selection Logic", () => {
    it("should select correct categories for different task types", async () => {
      const testCases = [
        { request: "API 문서 작성해줘", expectedCategory: "writing" },
        { request: "복잡한 아키텍처 설계해줘", expectedCategory: "ultrabrain" },
        { request: "task 업데이트해줘", expectedCategory: "quick" },
      ];

      for (const { request, expectedCategory } of testCases) {
        const analysis = await analyzeRequest(request);
        const category = selectCategory(request, analysis);
        expect(category).toBe(expectedCategory);
      }
    });
  });

  describe("Skill Selection Logic", () => {
    it("should select multiple skills when needed", async () => {
      const userRequest =
        "Linear 이슈를 브라우저에서 확인하고 스크린샷 찍어서 Notion에 저장해줘";
      const skills = selectSkills(userRequest);

      expect(skills.length).toBeGreaterThan(1);
      expect(skills).toContain("mcp-integration");
      expect(skills).toContain("playwright");
    });

    it("should return empty array for non-actionable requests", () => {
      const skills = selectSkills("날씨 어때?");
      expect(skills).toEqual([]);
    });
  });
});
