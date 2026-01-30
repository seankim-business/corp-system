import {
  getLocalizedResponse,
  getUserLanguagePreference,
  detectLanguage,
  type SlackUserInfo,
} from "../language-detector";

describe("Task Creation i18n", () => {
  describe("getLocalizedResponse", () => {
    it("should return Korean task creation messages", () => {
      expect(getLocalizedResponse("task_created", "ko")).toBe(
        "✅ Notion에 태스크가 생성되었습니다!",
      );
      expect(getLocalizedResponse("task_view_in_notion", "ko")).toBe(
        "Notion에서 보기",
      );
      expect(getLocalizedResponse("task_login_required", "ko")).toBe(
        "❌ 먼저 로그인해주세요",
      );
      expect(getLocalizedResponse("task_org_not_found", "ko")).toBe(
        "❌ 조직을 찾을 수 없습니다",
      );
      expect(getLocalizedResponse("task_notion_not_connected", "ko")).toBe(
        "❌ Notion이 연결되지 않았습니다",
      );
    });

    it("should return English task creation messages", () => {
      expect(getLocalizedResponse("task_created", "en")).toBe(
        "✅ Task created in Notion!",
      );
      expect(getLocalizedResponse("task_view_in_notion", "en")).toBe(
        "View in Notion",
      );
      expect(getLocalizedResponse("task_login_required", "en")).toBe(
        "❌ Please login first",
      );
      expect(getLocalizedResponse("task_org_not_found", "en")).toBe(
        "❌ Organization not found",
      );
      expect(getLocalizedResponse("task_notion_not_connected", "en")).toBe(
        "❌ Notion not connected",
      );
    });

    it("should default to Korean for mixed language", () => {
      expect(getLocalizedResponse("task_created", "mixed")).toBe(
        "✅ Notion에 태스크가 생성되었습니다!",
      );
    });

    it("should return key if not found", () => {
      expect(getLocalizedResponse("non_existent_key", "en")).toBe(
        "non_existent_key",
      );
    });
  });

  describe("getUserLanguagePreference", () => {
    it("should detect Korean from Slack locale", () => {
      const slackUserInfo: SlackUserInfo = { locale: "ko-KR" };
      expect(getUserLanguagePreference(slackUserInfo)).toBe("ko");
    });

    it("should detect English from Slack locale", () => {
      const slackUserInfo: SlackUserInfo = { locale: "en-US" };
      expect(getUserLanguagePreference(slackUserInfo)).toBe("en");
    });

    it("should detect from text sample if locale unavailable", () => {
      expect(getUserLanguagePreference(undefined, "버그 수정")).toBe("ko");
      expect(getUserLanguagePreference(undefined, "Fix bug")).toBe("en");
    });

    it("should prioritize Slack locale over text detection", () => {
      const slackUserInfo: SlackUserInfo = { locale: "en-US" };
      // Even though text is Korean, Slack locale takes precedence
      expect(getUserLanguagePreference(slackUserInfo, "버그 수정")).toBe("en");
    });

    it("should default to English if no info available", () => {
      expect(getUserLanguagePreference()).toBe("en");
    });

    it("should handle mixed text with low confidence", () => {
      const slackUserInfo: SlackUserInfo = { locale: "ja-JP" }; // Japanese (not ko/en)
      const mixedText = "Fix 버그"; // Low confidence mixed text
      const result = getUserLanguagePreference(slackUserInfo, mixedText);
      expect(["ko", "en", "mixed"]).toContain(result);
    });
  });

  describe("Integration scenarios", () => {
    it("should support Korean user creating task", () => {
      const slackInfo: SlackUserInfo = { locale: "ko-KR" };
      const userLang = getUserLanguagePreference(slackInfo, "로그인 버그 수정");

      expect(userLang).toBe("ko");
      expect(getLocalizedResponse("task_created", userLang)).toContain("Notion");
      expect(getLocalizedResponse("task_created", userLang)).toContain("태스크");
    });

    it("should support English user creating task", () => {
      const slackInfo: SlackUserInfo = { locale: "en-US" };
      const userLang = getUserLanguagePreference(slackInfo, "Fix login bug");

      expect(userLang).toBe("en");
      expect(getLocalizedResponse("task_created", userLang)).toContain("Task");
      expect(getLocalizedResponse("task_created", userLang)).toContain("Notion");
    });

    it("should handle all error messages in Korean", () => {
      const errorKeys = [
        "task_login_required",
        "task_org_not_found",
        "task_notion_not_connected",
        "task_invalid_syntax",
        "task_no_default_database",
        "task_creation_failed",
      ];

      errorKeys.forEach((key) => {
        const koMessage = getLocalizedResponse(key, "ko");
        expect(koMessage).toContain("❌");
        expect(detectLanguage(koMessage).language).toBe("ko");
      });
    });

    it("should handle all error messages in English", () => {
      const errorKeys = [
        "task_login_required",
        "task_org_not_found",
        "task_notion_not_connected",
        "task_invalid_syntax",
        "task_no_default_database",
        "task_creation_failed",
      ];

      errorKeys.forEach((key) => {
        const enMessage = getLocalizedResponse(key, "en");
        expect(enMessage).toContain("❌");
        expect(detectLanguage(enMessage).language).toBe("en");
      });
    });
  });
});
