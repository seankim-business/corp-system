/**
 * Agent Routing E2E Tests
 *
 * Tests the complete agent routing flow:
 * - Korean/English language routing
 * - Ambiguous request handling
 * - Multi-agent detection
 * - Confidence scoring
 * - Follow-up detection
 * - Edge cases
 */

import { analyzeRequest, analyzeRequestEnhanced } from "../../orchestrator/request-analyzer";
import {
  setupTestDatabase,
  teardownTestDatabase,
  routeRequest,
} from "./setup";

describe("Agent Routing E2E", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  describe("Korean language routing", () => {
    it('routes "캠페인 브리프 작성" to brand-agent', async () => {
      const result = await routeRequest("캠페인 브리프 작성해줘");
      expect(result.agentId).toBe("brand-agent");
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('routes "예산 확인" to finance-agent', async () => {
      const result = await routeRequest("이번 달 예산 확인해줘");
      expect(result.agentId).toBe("finance-agent");
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('routes "제품 출시" to product-agent', async () => {
      const result = await routeRequest("새 제품 출시 준비해줘");
      expect(result.agentId).toBe("product-agent");
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('routes "운영 작업" to ops-agent', async () => {
      const result = await routeRequest("오늘 운영 작업 목록 보여줘");
      expect(result.agentId).toBe("ops-agent");
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('routes "데이터 분석" to data-agent', async () => {
      const result = await routeRequest("지난주 데이터 분석해줘");
      expect(result.agentId).toBe("data-agent");
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("routes marketing content request correctly", async () => {
      const result = await routeRequest("새 마케팅 콘텐츠 만들어줘");
      expect(result.agentId).toBe("brand-agent");
    });

    it("routes budget inquiry correctly", async () => {
      const result = await routeRequest("비용 승인해줘");
      expect(result.agentId).toBe("finance-agent");
    });
  });

  describe("English language routing", () => {
    it('routes "create campaign brief" to brand-agent', async () => {
      const result = await routeRequest("create a campaign brief for the new product");
      expect(result.agentId).toBe("brand-agent");
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('routes "check budget" to finance-agent', async () => {
      const result = await routeRequest("check the budget for Q1");
      expect(result.agentId).toBe("finance-agent");
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('routes "product launch" to product-agent', async () => {
      const result = await routeRequest("prepare for product launch next week");
      expect(result.agentId).toBe("product-agent");
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('routes "operations task" to ops-agent', async () => {
      const result = await routeRequest("show me the operations tasks for today");
      expect(result.agentId).toBe("ops-agent");
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('routes "data analytics" to data-agent', async () => {
      const result = await routeRequest("analyze the data from last week");
      expect(result.agentId).toBe("data-agent");
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  describe("Ambiguous request handling", () => {
    it('asks clarification for vague request "확인해줘"', async () => {
      const result = await routeRequest("확인해줘");
      expect(result.action).toBe("ask_clarification");
      expect(result.confidence).toBeLessThan(0.5);
    });

    it("asks clarification when no clear intent", async () => {
      const result = await routeRequest("도와줘");
      expect(result.action).toBe("ask_clarification");
    });

    it("handles single word requests", async () => {
      const result = await routeRequest("예?");
      expect(result.action).toBe("ask_clarification");
    });

    it("detects ambiguity in pronoun-heavy requests", async () => {
      const analysis = await analyzeRequestEnhanced("can you do that for them?");
      expect(analysis.ambiguity?.isAmbiguous).toBe(true);
      expect(analysis.ambiguity?.clarifyingQuestions).toBeDefined();
    });

    it("asks for assignee clarification when missing", async () => {
      const analysis = await analyzeRequestEnhanced("assign the task");
      expect(analysis.ambiguity?.isAmbiguous).toBe(true);
      expect(analysis.ambiguity?.clarifyingQuestions).toContain("Who should this be assigned to?");
    });
  });

  describe("Multi-agent detection", () => {
    it('detects multi-agent request for "캠페인 브리프 작성하고 예산도 확인해줘"', async () => {
      const result = await routeRequest("캠페인 브리프 작성하고 예산도 확인해줘");
      expect(result.requiresMultiAgent).toBe(true);
      expect(result.agents).toContain("brand-agent");
      expect(result.agents).toContain("finance-agent");
    });

    it("detects multi-agent for cross-functional requests", async () => {
      const result = await routeRequest("마케팅 콘텐츠 만들고 운영팀에 작업 할당해줘");
      expect(result.requiresMultiAgent).toBe(true);
    });

    it("detects multi-agent when multiple platforms mentioned", async () => {
      const analysis = await analyzeRequest("notion에 문서 만들고 slack에 공유해줘");
      expect(analysis.requiresMultiAgent).toBe(true);
    });

    it("correctly identifies single-agent requests", async () => {
      const result = await routeRequest("캠페인 브리프만 작성해줘");
      expect(result.requiresMultiAgent).toBeFalsy();
    });

    it("detects sequential workflow need", async () => {
      const result = await routeRequest("데이터 분석하고 그 결과로 보고서 만들어줘");
      expect(result.requiresMultiAgent).toBe(true);
    });
  });

  describe("Confidence scoring", () => {
    it("returns high confidence for exact keyword match", async () => {
      const result = await routeRequest("캠페인 브리프 콘텐츠 마케팅");
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it("returns moderate confidence for partial match", async () => {
      const result = await routeRequest("브랜드 관련 작업");
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
      expect(result.confidence).toBeLessThanOrEqual(0.9);
    });

    it("returns lower confidence for vague requests", async () => {
      const result = await routeRequest("something about marketing maybe");
      expect(result.confidence).toBeLessThan(0.8);
    });

    it("confidence increases with more specific keywords", async () => {
      const vague = await routeRequest("marketing");
      const specific = await routeRequest("캠페인 브리프 작성 마케팅 콘텐츠");
      expect(specific.confidence).toBeGreaterThanOrEqual(vague.confidence);
    });
  });

  describe("Follow-up detection", () => {
    it("detects follow-up request with context", async () => {
      const context = {
        previousMessages: [
          { role: "user", content: "캠페인 브리프 만들어줘" },
          { role: "assistant", content: "캠페인 브리프를 생성했습니다." },
        ],
      };

      const analysis = await analyzeRequestEnhanced("수정해줘", context);
      expect(analysis.followUp?.isFollowUp).toBe(true);
    });

    it('handles "also" and "additionally" patterns', async () => {
      const context = {
        previousMessages: [
          { role: "user", content: "캠페인 브리프 만들어줘" },
          { role: "assistant", content: "완료했습니다." },
        ],
      };

      const analysis = await analyzeRequestEnhanced("also add the budget section", context);
      expect(analysis.followUp?.isFollowUp).toBe(true);
    });

    it('detects "what about" follow-up pattern', async () => {
      const context = {
        previousMessages: [{ role: "assistant", content: "Here is the report." }],
      };

      const analysis = await analyzeRequestEnhanced("what about the Q2 data?", context);
      expect(analysis.followUp?.isFollowUp).toBe(true);
    });

    it("does not detect follow-up without context", async () => {
      const analysis = await analyzeRequestEnhanced("수정해줘");
      expect(analysis.followUp?.isFollowUp).toBe(false);
    });
  });

  describe("Intent classification", () => {
    it("classifies task creation intent", async () => {
      const analysis = await analyzeRequest("새 태스크 만들어줘");
      expect(analysis.intent).toBe("create_task");
    });

    it("classifies query intent", async () => {
      const analysis = await analyzeRequest("태스크 목록 보여줘");
      expect(analysis.intent).toBe("query_data");
    });

    it("classifies update intent", async () => {
      const analysis = await analyzeRequest("태스크 상태 업데이트해줘");
      expect(analysis.intent).toBe("update_task");
    });

    it("classifies report generation intent", async () => {
      const analysis = await analyzeRequest("리포트 생성해줘");
      expect(analysis.intent).toBe("generate_content");
    });

    it("handles mixed language intent", async () => {
      const analysis = await analyzeRequest("create 새로운 task for @john");
      expect(analysis.intent).toBe("create_task");
    });
  });

  describe("Entity extraction", () => {
    it("extracts target platform (Notion)", async () => {
      const analysis = await analyzeRequestEnhanced("노션에 문서 만들어줘");
      expect(analysis.entities.target).toBe("notion");
    });

    it("extracts target platform (Slack)", async () => {
      const analysis = await analyzeRequestEnhanced("슬랙에 메시지 보내줘");
      expect(analysis.entities.target).toBe("slack");
    });

    it("extracts target platform (Linear)", async () => {
      const analysis = await analyzeRequestEnhanced("리니어에 이슈 만들어줘");
      expect(analysis.entities.target).toBe("linear");
    });

    it("extracts assignee from mention", async () => {
      const analysis = await analyzeRequestEnhanced("@john에게 태스크 할당해줘");
      expect(analysis.extractedEntities?.assignee?.value).toBe("john");
    });

    it("extracts priority level", async () => {
      const analysis = await analyzeRequestEnhanced("긴급 태스크 만들어줘");
      expect(analysis.extractedEntities?.priority?.value).toBe("high");
    });

    it("extracts due date", async () => {
      const analysis = await analyzeRequestEnhanced("내일까지 태스크 완료해줘");
      expect(analysis.extractedEntities?.dueDate).toBeDefined();
    });
  });

  describe("Complexity assessment", () => {
    it("classifies simple request as low complexity", async () => {
      const analysis = await analyzeRequest("태스크 보여줘");
      expect(analysis.complexity).toBe("low");
    });

    it("classifies multi-agent request as high complexity", async () => {
      const analysis = await analyzeRequest("캠페인 브리프 작성하고 예산도 확인해줘");
      expect(analysis.complexity).toBe("high");
    });

    it("classifies long request as higher complexity", async () => {
      const analysis = await analyzeRequest(
        "새로운 마케팅 캠페인을 위한 브리프를 작성하고 그에 맞는 예산을 확인한 후 운영팀에 전달해줘",
      );
      expect(["medium", "high"]).toContain(analysis.complexity);
    });
  });

  describe("Edge cases", () => {
    it("handles empty request gracefully", async () => {
      const result = await routeRequest("");
      expect(result.action).toBe("ask_clarification");
    });

    it("handles very long request", async () => {
      const longRequest = "캠페인 브리프 작성해줘 ".repeat(50);
      const result = await routeRequest(longRequest);
      expect(result.agentId).toBe("brand-agent");
    });

    it("handles mixed language request", async () => {
      const result = await routeRequest("campaign 브리프 create 해줘");
      expect(result.agentId).toBe("brand-agent");
    });

    it("handles special characters", async () => {
      const result = await routeRequest("캠페인 브리프!!! 작성해줘???");
      expect(result.agentId).toBe("brand-agent");
    });

    it("handles emoji in request", async () => {
      const result = await routeRequest("캠페인 브리프 작성해줘 🎉");
      expect(result.agentId).toBe("brand-agent");
    });

    it("handles numbers in request", async () => {
      const result = await routeRequest("2024년 Q1 예산 확인해줘");
      expect(result.agentId).toBe("finance-agent");
    });

    it("handles URL in request", async () => {
      const result = await routeRequest("https://notion.so/doc 문서 확인해줘");
      expect(result.agentId).toBeDefined();
    });

    it("handles newlines in request", async () => {
      const result = await routeRequest("캠페인 브리프\n작성해줘");
      expect(result.agentId).toBe("brand-agent");
    });
  });

  describe("Request analysis accuracy", () => {
    it("correctly identifies action from request", async () => {
      const analysis = await analyzeRequest("새 문서 생성해줘");
      expect(analysis.entities.action).toBe("create");
    });

    it("correctly identifies object from request", async () => {
      const analysis = await analyzeRequest("태스크 조회해줘");
      expect(analysis.entities.object).toBe("task");
    });

    it("handles multiple entities in request", async () => {
      const analysis = await analyzeRequestEnhanced("@john에게 urgent 태스크 할당해줘");
      expect(analysis.extractedEntities?.assignee?.value).toBe("john");
      expect(analysis.extractedEntities?.priority?.value).toBe("high");
      expect(analysis.extractedEntities?.object?.value).toBe("task");
    });
  });
});
