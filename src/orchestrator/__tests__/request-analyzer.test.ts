import {
  analyzeRequest,
  analyzeRequestEnhanced,
  analyzeRequestWithLLMFallback,
  getLLMUsageMetrics,
  resetLLMUsageMetrics,
} from "../request-analyzer";

describe("Request Analyzer - Enhanced NLP Capabilities", () => {
  describe("Task Creation Intent", () => {
    it("should detect task creation with 'create task for' pattern", async () => {
      const result = await analyzeRequestEnhanced(
        "create task for john to review the document by friday",
      );
      expect(result.intent).toBe("create_task");
      expect(result.intentConfidence).toBeGreaterThan(0.7);
    });

    it("should detect task creation with 'assign to' pattern", async () => {
      const result = await analyzeRequestEnhanced("assign this to @sarah");
      expect(result.intent).toBe("create_task");
    });

    it("should detect task creation with 'allocate to' pattern", async () => {
      const result = await analyzeRequestEnhanced("allocate this work to the team");
      expect(result.intent).toBe("create_task");
    });

    it("should extract assignee from @mention", async () => {
      const result = await analyzeRequestEnhanced("create task for @john to review");
      expect(result.extractedEntities?.assignee?.value).toBe("john");
      expect(result.extractedEntities?.assignee?.confidence).toBeGreaterThan(0.9);
    });

    it("should extract assignee from 'for' pattern", async () => {
      const result = await analyzeRequestEnhanced("create task for sarah to complete");
      expect(result.extractedEntities?.assignee?.value).toBe("sarah");
    });

    it("should extract due date from natural language", async () => {
      const result = await analyzeRequestEnhanced("create task by friday");
      expect(result.extractedEntities?.dueDate).toBeDefined();
      expect(result.extractedEntities?.dueDate?.type).toBe("dueDate");
    });

    it("should extract priority from task creation", async () => {
      const result = await analyzeRequestEnhanced("create urgent task for john");
      expect(result.extractedEntities?.priority?.value).toBe("high");
    });

    it("should extract project name", async () => {
      const result = await analyzeRequestEnhanced("create task in ProjectAlpha for john");
      expect(result.extractedEntities?.project?.value).toBe("ProjectAlpha");
    });
  });

  describe("Search/Query Intent", () => {
    it("should detect 'show my tasks' pattern", async () => {
      const result = await analyzeRequestEnhanced("show my tasks");
      expect(result.intent).toBe("query_data");
      expect(result.intentConfidence).toBeGreaterThan(0.7);
    });

    it("should detect 'what's on my plate' pattern", async () => {
      const result = await analyzeRequestEnhanced("what's on my plate");
      expect(result.intent).toBe("query_data");
    });

    it("should detect search pattern", async () => {
      const result = await analyzeRequestEnhanced("search for tasks assigned to john");
      expect(result.intent).toBe("query_data");
    });

    it("should detect list pattern", async () => {
      const result = await analyzeRequestEnhanced("list all pending tasks");
      expect(result.intent).toBe("query_data");
    });

    it("should detect find pattern", async () => {
      const result = await analyzeRequestEnhanced("find tasks with high priority");
      expect(result.intent).toBe("query_data");
    });

    it("should extract object type from search", async () => {
      const result = await analyzeRequestEnhanced("show all tasks");
      expect(result.extractedEntities?.object?.value).toBe("task");
    });
  });

  describe("Report/Analytics Intent", () => {
    it("should detect 'generate report' pattern", async () => {
      const result = await analyzeRequestEnhanced("generate report on team productivity");
      expect(result.intent).toBe("generate_content");
      expect(result.intentConfidence).toBeGreaterThan(0.7);
    });

    it("should detect 'show summary' pattern", async () => {
      const result = await analyzeRequestEnhanced("show summary of completed tasks");
      expect(result.intent).toBe("generate_content");
    });

    it("should detect analytics pattern", async () => {
      const result = await analyzeRequestEnhanced("display analytics for this month");
      expect(result.intent).toBe("generate_content");
    });

    it("should detect statistics pattern", async () => {
      const result = await analyzeRequestEnhanced("how many tasks are overdue");
      expect(result.intent).toBe("generate_content");
    });
  });

  describe("Approval Intent", () => {
    it("should detect 'approve' pattern", async () => {
      const result = await analyzeRequestEnhanced("approve this request");
      expect(result.intent).toBe("update_task");
      expect(result.intentConfidence).toBeGreaterThan(0.7);
    });

    it("should detect 'reject' pattern", async () => {
      const result = await analyzeRequestEnhanced("reject the proposal");
      expect(result.intent).toBe("update_task");
    });

    it("should detect 'confirm' pattern", async () => {
      const result = await analyzeRequestEnhanced("confirm this change");
      expect(result.intent).toBe("update_task");
    });

    it("should extract action as approve", async () => {
      const result = await analyzeRequestEnhanced("approve this request");
      expect(result.extractedEntities?.action?.value).toBe("approve");
    });
  });

  describe("Entity Extraction", () => {
    it("should extract multiple entities from complex request", async () => {
      const result = await analyzeRequestEnhanced(
        "create urgent task for @john in ProjectAlpha to review document by friday",
      );
      expect(result.extractedEntities?.assignee?.value).toBe("john");
      expect(result.extractedEntities?.priority?.value).toBe("high");
      expect(result.extractedEntities?.project?.value).toBe("ProjectAlpha");
      expect(result.extractedEntities?.dueDate).toBeDefined();
    });

    it("should extract target platform", async () => {
      const result = await analyzeRequestEnhanced("create task in notion");
      expect(result.extractedEntities?.target?.value).toBe("notion");
    });

    it("should extract slack as target", async () => {
      const result = await analyzeRequestEnhanced("post to slack");
      expect(result.extractedEntities?.target?.value).toBe("slack");
    });

    it("should extract github as target", async () => {
      const result = await analyzeRequestEnhanced("create issue on github");
      expect(result.extractedEntities?.target?.value).toBe("github");
    });

    it("should extract linear as target", async () => {
      const result = await analyzeRequestEnhanced("add to linear");
      expect(result.extractedEntities?.target?.value).toBe("linear");
    });

    it("should extract jira as target", async () => {
      const result = await analyzeRequestEnhanced("create jira ticket");
      expect(result.extractedEntities?.target?.value).toBe("jira");
    });

    it("should extract asana as target", async () => {
      const result = await analyzeRequestEnhanced("add to asana");
      expect(result.extractedEntities?.target?.value).toBe("asana");
    });

    it("should extract airtable as target", async () => {
      const result = await analyzeRequestEnhanced("update airtable");
      expect(result.extractedEntities?.target?.value).toBe("airtable");
    });

    it("should extract priority levels", async () => {
      const highResult = await analyzeRequestEnhanced("urgent task");
      expect(highResult.extractedEntities?.priority?.value).toBe("high");

      const mediumResult = await analyzeRequestEnhanced("normal priority");
      expect(mediumResult.extractedEntities?.priority?.value).toBe("medium");

      const lowResult = await analyzeRequestEnhanced("low priority task");
      expect(lowResult.extractedEntities?.priority?.value).toBe("low");
    });

    it("should extract object types", async () => {
      const taskResult = await analyzeRequestEnhanced("create task");
      expect(taskResult.extractedEntities?.object?.value).toBe("task");

      const docResult = await analyzeRequestEnhanced("create document");
      expect(docResult.extractedEntities?.object?.value).toBe("document");

      const workflowResult = await analyzeRequestEnhanced("create workflow");
      expect(workflowResult.extractedEntities?.object?.value).toBe("workflow");
    });
  });

  describe("Ambiguity Detection", () => {
    it("should detect ambiguous assignee", async () => {
      const result = await analyzeRequestEnhanced("create task for someone");
      expect(result.ambiguity?.isAmbiguous).toBe(true);
      expect(result.ambiguity?.ambiguousTerms).toContain("assignee");
      expect(result.ambiguity?.clarifyingQuestions).toContain("Who should this be assigned to?");
    });

    it("should detect ambiguous due date", async () => {
      const result = await analyzeRequestEnhanced("create task by sometime");
      expect(result.ambiguity?.isAmbiguous).toBe(true);
      expect(result.ambiguity?.ambiguousTerms).toContain("dueDate");
    });

    it("should detect ambiguous priority", async () => {
      const result = await analyzeRequestEnhanced("create task with some priority");
      expect(result.ambiguity?.isAmbiguous).toBe(true);
      expect(result.ambiguity?.ambiguousTerms).toContain("priority");
    });

    it("should detect ambiguous project", async () => {
      const result = await analyzeRequestEnhanced("create task in a project");
      expect(result.ambiguity?.isAmbiguous).toBe(true);
      expect(result.ambiguity?.ambiguousTerms).toContain("project");
    });

    it("should detect ambiguous pronoun reference", async () => {
      const result = await analyzeRequestEnhanced("update it");
      expect(result.ambiguity?.isAmbiguous).toBe(true);
      expect(result.ambiguity?.ambiguousTerms).toContain("referent");
    });

    it("should not flag as ambiguous when all entities present", async () => {
      const result = await analyzeRequestEnhanced(
        "create task for john by friday with high priority",
      );
      expect(result.ambiguity?.isAmbiguous).toBe(false);
    });
  });

  describe("Follow-up Detection", () => {
    it("should detect follow-up with 'also' keyword", async () => {
      const context = {
        previousMessages: [{ role: "assistant", content: "Created task for john" }],
      };
      const result = await analyzeRequestEnhanced("also assign it to sarah", context);
      expect(result.followUp?.isFollowUp).toBe(true);
    });

    it("should detect follow-up with 'additionally' keyword", async () => {
      const context = {
        previousMessages: [{ role: "assistant", content: "Task created" }],
      };
      const result = await analyzeRequestEnhanced("additionally, set priority to high", context);
      expect(result.followUp?.isFollowUp).toBe(true);
    });

    it("should detect follow-up with 'and' keyword", async () => {
      const context = {
        previousMessages: [{ role: "assistant", content: "Created task" }],
      };
      const result = await analyzeRequestEnhanced("and assign to john", context);
      expect(result.followUp?.isFollowUp).toBe(true);
    });

    it("should detect follow-up with 'what about' pattern", async () => {
      const context = {
        previousMessages: [{ role: "assistant", content: "Task created" }],
      };
      const result = await analyzeRequestEnhanced("what about the deadline", context);
      expect(result.followUp?.isFollowUp).toBe(true);
    });

    it("should not flag as follow-up without context", async () => {
      const result = await analyzeRequestEnhanced("create task for john");
      expect(result.followUp?.isFollowUp).toBe(false);
    });

    it("should extract related topic from previous message", async () => {
      const context = {
        previousMessages: [{ role: "assistant", content: "Created task for john" }],
      };
      const result = await analyzeRequestEnhanced("also assign to sarah", context);
      expect(result.followUp?.relatedTo).toBeDefined();
    });
  });

  describe("Backward Compatibility", () => {
    it("should maintain original analyzeRequest function", async () => {
      const result = await analyzeRequest("create task");
      expect(result.intent).toBeDefined();
      expect(result.entities).toBeDefined();
      expect(result.keywords).toBeDefined();
      expect(result.requiresMultiAgent).toBeDefined();
      expect(result.complexity).toBeDefined();
    });

    it("should handle korean text", async () => {
      const result = await analyzeRequestEnhanced("태스크 생성");
      expect(result.intent).toBe("create_task");
    });

    it("should handle mixed korean and english", async () => {
      const result = await analyzeRequestEnhanced("create 태스크 for john");
      expect(result.intent).toBe("create_task");
      expect(result.extractedEntities?.assignee?.value).toBe("john");
    });

    it("should maintain confidence scoring", async () => {
      const result = await analyzeRequestEnhanced("create task");
      expect(result.intentConfidence).toBeGreaterThan(0);
      expect(result.intentConfidence).toBeLessThanOrEqual(1);
    });

    it("should maintain complexity assessment", async () => {
      const simpleResult = await analyzeRequestEnhanced("show tasks");
      expect(simpleResult.complexity).toBe("low");

      const complexResult = await analyzeRequestEnhanced(
        "create task for john in notion and slack with high priority by friday",
      );
      expect(complexResult.complexity).toMatch(/low|medium|high/);
    });
  });

  describe("Common Intent Patterns", () => {
    it("should handle 'create task for [user] to [action] by [date]'", async () => {
      const result = await analyzeRequestEnhanced(
        "create task for john to review document by friday",
      );
      expect(result.intent).toBe("create_task");
      expect(result.extractedEntities?.assignee?.value).toBe("john");
      expect(result.extractedEntities?.dueDate).toBeDefined();
    });

    it("should handle 'show my tasks' / 'what's on my plate'", async () => {
      const result1 = await analyzeRequestEnhanced("show my tasks");
      expect(result1.intent).toBe("query_data");

      const result2 = await analyzeRequestEnhanced("what's on my plate");
      expect(result2.intent).toBe("query_data");
    });

    it("should handle 'approve [request]' / 'reject [request]'", async () => {
      const approveResult = await analyzeRequestEnhanced("approve this request");
      expect(approveResult.intent).toBe("update_task");
      expect(approveResult.extractedEntities?.action?.value).toBe("approve");

      const rejectResult = await analyzeRequestEnhanced("reject the proposal");
      expect(rejectResult.intent).toBe("update_task");
    });

    it("should handle 'search for [query]'", async () => {
      const result = await analyzeRequestEnhanced("search for tasks assigned to john");
      expect(result.intent).toBe("query_data");
    });

    it("should handle 'generate report on [topic]'", async () => {
      const result = await analyzeRequestEnhanced("generate report on team productivity");
      expect(result.intent).toBe("generate_content");
    });
  });

  describe("Context-Aware Responses", () => {
    it("should use context to improve intent detection", async () => {
      const context = {
        previousMessages: [{ role: "assistant", content: "Created task successfully" }],
      };
      const result = await analyzeRequestEnhanced("show it", context);
      expect(result.intent).toBe("query_data");
    });

    it("should maintain session metadata", async () => {
      const context = {
        sessionMetadata: {
          lastTarget: "notion",
          lastObject: "task",
        },
      };
      const result = await analyzeRequest("create new one", context);
      expect(result.entities).toBeDefined();
      expect(result.entities.target).toBeDefined();
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty string", async () => {
      const result = await analyzeRequestEnhanced("");
      expect(result.intent).toBeDefined();
      expect(result.intentConfidence).toBeGreaterThan(0);
    });

    it("should handle very long request", async () => {
      const longRequest =
        "create task for john to review the document and provide feedback and suggestions by friday with high priority in the ProjectAlpha project";
      const result = await analyzeRequestEnhanced(longRequest);
      expect(result.intent).toBe("create_task");
      expect(result.complexity).toMatch(/low|medium|high/);
    });

    it("should handle special characters", async () => {
      const result = await analyzeRequestEnhanced(
        "create task for @john-smith to review doc_v2.pdf",
      );
      expect(result.intent).toBe("create_task");
    });

    it("should handle multiple @mentions", async () => {
      const result = await analyzeRequestEnhanced("create task for @john and @sarah");
      expect(result.extractedEntities?.assignee).toBeDefined();
    });

    it("should handle dates in various formats", async () => {
      const result1 = await analyzeRequestEnhanced("by friday");
      expect(result1.extractedEntities?.dueDate).toBeDefined();

      const result2 = await analyzeRequestEnhanced("by next week");
      expect(result2.extractedEntities?.dueDate).toBeDefined();

      const result3 = await analyzeRequestEnhanced("by 2024-12-25");
      expect(result3.extractedEntities?.dueDate).toBeDefined();
    });
  });

  describe("LLM Fallback Integration", () => {
    beforeEach(() => {
      resetLLMUsageMetrics();
    });

    it("should detect Notion intent without LLM for high-confidence Korean request", async () => {
      // Korean: "create a new task in Notion"
      const result = await analyzeRequestWithLLMFallback("노션에 새 태스크 만들어줘");

      expect(result.intent).toBe("create_task");
      expect(result.entities?.target).toBe("notion");
      expect(result.intentConfidence).toBeGreaterThanOrEqual(0.8);
      expect(result.llmUsed).toBe(false);
      expect(result.needsClarification).toBe(false);
    });

    it("should detect Slack intent without LLM for high-confidence English request", async () => {
      const result = await analyzeRequestWithLLMFallback("send a message to slack");

      expect(result.entities?.target).toBe("slack");
      expect(result.intentConfidence).toBeGreaterThan(0.5);
      expect(result.needsClarification).toBe(false);
    });

    it("should use LLM for low-confidence requests", async () => {
      // Ambiguous Korean: "do that thing"
      const result = await analyzeRequestWithLLMFallback("그거 해줘");

      // Should either classify or mark as needing clarification
      expect(result).toBeDefined();
      expect(result.llmUsed).toBe(true);
      // Low confidence should trigger clarification need
      if (result.intent === "unknown") {
        expect(result.needsClarification).toBe(true);
      }
    }, 15000); // Longer timeout for LLM call

    it("should track LLM usage metrics", async () => {
      // Start with clean metrics
      resetLLMUsageMetrics();
      const initialMetrics = getLLMUsageMetrics();
      expect(initialMetrics.llmCallCount).toBe(0);

      // High confidence request - no LLM
      await analyzeRequestWithLLMFallback("create task in notion");
      const afterHighConfidence = getLLMUsageMetrics();
      expect(afterHighConfidence.llmCallCount).toBe(0);

      // Low confidence request - should use LLM
      await analyzeRequestWithLLMFallback("해줘");
      const afterLowConfidence = getLLMUsageMetrics();
      expect(afterLowConfidence.llmCallCount).toBeGreaterThan(0);
    }, 15000);

    it("should return llmUsed flag correctly", async () => {
      // High confidence - no LLM needed
      const highConfResult = await analyzeRequestEnhanced(
        "create task for john in notion by friday",
        undefined,
        { enableLLMFallback: false }
      );
      expect(highConfResult.llmUsed).toBe(false);

      // Explicit LLM disable should prevent LLM use
      const disabledResult = await analyzeRequestEnhanced(
        "handle this",
        undefined,
        { enableLLMFallback: false }
      );
      expect(disabledResult.llmUsed).toBe(false);
    });

    it("should support Korean task creation patterns", async () => {
      const patterns = [
        "작업 생성해줘",           // "create a task"
        "태스크 추가해줘",          // "add a task"
        "새 작업 만들어줘",         // "make a new task"
      ];

      for (const pattern of patterns) {
        const result = await analyzeRequestWithLLMFallback(pattern);
        expect(result.intent).toBe("create_task");
        expect(result.intentConfidence).toBeGreaterThan(0.5);
      }
    });

    it("should support Korean query patterns", async () => {
      const patterns = [
        "작업 목록 보여줘",         // "show task list"
        "할 일 확인해줘",           // "check to-dos"
        "태스크 조회해줘",          // "query tasks"
      ];

      for (const pattern of patterns) {
        const result = await analyzeRequestWithLLMFallback(pattern);
        expect(result.intent).toBe("query_data");
        expect(result.intentConfidence).toBeGreaterThan(0.5);
      }
    });

    it("should detect need for clarification on ambiguous requests", async () => {
      const ambiguousRequests = [
        "이거 좀 처리해줘",  // "handle this thing"
        "저거 해줘",        // "do that"
      ];

      for (const request of ambiguousRequests) {
        const result = await analyzeRequestWithLLMFallback(request);
        // Should either classify with low confidence or mark needing clarification
        expect(result.intentConfidence).toBeLessThanOrEqual(0.9);
        if (result.intent === "unknown") {
          expect(result.needsClarification).toBe(true);
        }
      }
    }, 15000);

    it("should combine regex and LLM results for better accuracy", async () => {
      // Request with some specific keywords but potentially ambiguous context
      const result = await analyzeRequestEnhanced(
        "update the thing",
        undefined,
        { enableLLMFallback: true }
      );

      // Should have analyzed the request
      expect(result.intent).toBeDefined();
      expect(result.intentConfidence).toBeGreaterThan(0);
    }, 15000);
  });
});
