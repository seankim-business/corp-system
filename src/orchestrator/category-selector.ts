import { Category, RequestAnalysis } from "./types";

/**
 * Category 선택 로직
 */
export function selectCategory(
  userRequest: string,
  analysis: RequestAnalysis,
): Category {
  const text = userRequest.toLowerCase();

  // 1. 키워드 기반 매칭
  const categoryKeywords: Record<Category, string[]> = {
    "visual-engineering": [
      "디자인",
      "design",
      "UI",
      "UX",
      "프론트엔드",
      "frontend",
      "React",
      "Vue",
      "Angular",
      "컴포넌트",
      "component",
      "CSS",
      "style",
      "스타일",
      "레이아웃",
      "layout",
      "애니메이션",
      "animation",
    ],
    ultrabrain: [
      "아키텍처",
      "architecture",
      "최적화",
      "optimization",
      "설계",
      "design",
      "전략",
      "strategy",
      "복잡한",
      "complex",
      "분석",
      "analysis",
      "리팩토링",
      "refactoring",
      "성능",
      "performance",
    ],
    artistry: [
      "창의적",
      "creative",
      "아이디어",
      "idea",
      "콘셉트",
      "concept",
      "브랜드",
      "brand",
      "캠페인",
      "campaign",
      "콘텐츠",
      "content",
      "크리에이티브",
      "creative",
      "기획",
      "planning",
      "스토리",
      "story",
      "비주얼",
      "visual",
    ],
    quick: [
      "업데이트",
      "update",
      "수정",
      "modify",
      "변경",
      "change",
      "간단한",
      "simple",
      "빠른",
      "quick",
      "오타",
      "typo",
      "제목",
      "title",
      "rename",
      "fix",
    ],
    writing: [
      "문서",
      "document",
      "작성",
      "write",
      "SOP",
      "가이드",
      "guide",
      "설명",
      "description",
      "매뉴얼",
      "manual",
      "documentation",
      "README",
      "기술",
      "technical",
    ],
    "unspecified-low": [],
    "unspecified-high": [],
  };

  // 키워드 매칭 점수 계산
  const scores: Record<Category, number> = {
    "visual-engineering": 0,
    ultrabrain: 0,
    artistry: 0,
    quick: 0,
    writing: 0,
    "unspecified-low": 0,
    "unspecified-high": 0,
  };

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        scores[category as Category] += 1;
      }
    }
  }

  // 최고 점수 category 선택
  const maxScore = Math.max(...Object.values(scores));
  if (maxScore > 0) {
    const winner = Object.entries(scores).find(
      ([_, score]) => score === maxScore,
    );
    if (winner) {
      return winner[0] as Category;
    }
  }

  // 2. 복잡도 기반 fallback
  if (analysis.complexity === "low") {
    return "quick";
  } else if (analysis.complexity === "high") {
    return "unspecified-high";
  } else {
    return "unspecified-low";
  }
}
