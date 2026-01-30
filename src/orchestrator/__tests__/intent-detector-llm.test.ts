import { detectIntent, analyzeRequest } from "../intent-detector";
import { generateClarificationQuestion } from "../ambiguity-detector";
import { logger } from "../../utils/logger";

describe("Intent Detector with LLM Fallback", () => {
  // Mock logger to reduce noise in tests
  beforeAll(() => {
    jest.spyOn(logger, "debug").mockImplementation(() => {});
    jest.spyOn(logger, "info").mockImplementation(() => {});
  });

  describe("Korean Intent Patterns", () => {
    it("should detect '작업 생성' as create action", async () => {
      const result = await detectIntent("작업 생성해줘");

      expect(result.action).toBe("create");
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it("should detect '일정 확인' as read action", async () => {
      const result = await detectIntent("일정 확인해줘");

      expect(result.action).toBe("read");
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it("should detect '메시지 보내' as notify action", async () => {
      const result = await detectIntent("메시지 보내줘");

      expect(result.action).toBe("notify");
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it("should detect '검색' as search action", async () => {
      const result = await detectIntent("검색해줘");

      expect(result.action).toBe("search");
      expect(result.confidence).toBeGreaterThan(0.7);
    });
  });

  describe("LLM Fallback Activation", () => {
    it("should use pattern matching for high-confidence requests", async () => {
      const result = await detectIntent("create a new task for testing");

      expect(result.action).toBe("create");
      expect(result.target).toBe("task");
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it("should fall back to LLM for low-confidence requests", async () => {
      // This is a vague request that should have low pattern confidence
      const vagueRequest = "do something";

      const result = await detectIntent(vagueRequest);

      // LLM should either classify it or return unknown
      expect(result).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0.1);
    }, 10000); // Longer timeout for LLM call

    it("should use cache on repeated requests", async () => {
      const request = "handle this thing";

      const result1 = await detectIntent(request);
      const result2 = await detectIntent(request);

      // Results should be identical (cached)
      expect(result1).toEqual(result2);
    }, 10000);
  });

  describe("analyzeRequest with LLM", () => {
    it("should analyze request and extract entities", async () => {
      const result = await analyzeRequest("create task in Notion for @john");

      expect(result.intent.action).toBe("create");
      expect(result.intent.target).toContain("task");
      expect(result.entities.providers).toContain("notion");
      expect(result.entities.userMentions).toContain("john");
    });

    it("should handle Korean requests", async () => {
      const result = await analyzeRequest("Notion에 작업 생성해줘");

      expect(result.intent.action).toBe("create");
      expect(result.entities.providers).toContain("notion");
    });
  });
});

describe("Clarification Question Generation", () => {
  it("should generate clarification for ambiguous requests", () => {
    const ambiguityResult = {
      isAmbiguous: true,
      ambiguityScore: 0.8,
      reasons: ["Vague verb without specific target"],
      suggestedClarifications: ["Which specific file, function, or component should be affected?"],
    };

    const entities = {
      providers: ["notion"],
      fileNames: ["test.ts"],
      urls: [],
      dates: [],
      projectNames: [],
      userMentions: [],
    };

    const clarification = generateClarificationQuestion(
      "fix the error",
      ambiguityResult,
      entities,
    );

    expect(clarification.question).toContain("specific");
    expect(clarification.context).toContain("notion");
  });

  it("should provide no clarification for clear requests", () => {
    const ambiguityResult = {
      isAmbiguous: false,
      ambiguityScore: 0.2,
      reasons: [],
      suggestedClarifications: [],
    };

    const clarification = generateClarificationQuestion("create task", ambiguityResult);

    expect(clarification.question).toContain("clear");
  });

  it("should generate suggested answers based on request type", () => {
    const ambiguityResult = {
      isAmbiguous: true,
      ambiguityScore: 0.75,
      reasons: ["Ambiguous scope for error handling"],
      suggestedClarifications: ["Where should error handling be added?"],
    };

    const clarification = generateClarificationQuestion(
      "add error handling",
      ambiguityResult,
    );

    expect(clarification.suggestedAnswers).toBeDefined();
    expect(clarification.suggestedAnswers?.length).toBeGreaterThan(0);
    expect(clarification.suggestedAnswers).toContain("Add try-catch blocks");
  });
});
