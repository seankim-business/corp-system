/**
 * Language detection and normalization for Korean+English bilingual support.
 * Zero external dependencies.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DetectedLanguage = "ko" | "en" | "mixed";

export interface LanguageResult {
  language: DetectedLanguage;
  confidence: number;
  koreanRatio: number;
}

// ---------------------------------------------------------------------------
// Unicode helpers
// ---------------------------------------------------------------------------

/** Hangul Syllables (\uAC00-\uD7A3), Jamo (\u3131-\u3163), Jamo Extended (\u1100-\u11FF) */
const HANGUL_RE = /[\uAC00-\uD7A3\u3131-\u3163\u1100-\u11FF]/g;

/** Basic Latin letters */
const LATIN_RE = /[a-zA-Z]/g;

// ---------------------------------------------------------------------------
// 1. detectLanguage
// ---------------------------------------------------------------------------

export function detectLanguage(text: string): LanguageResult {
  const hangulMatches = text.match(HANGUL_RE);
  const latinMatches = text.match(LATIN_RE);

  const hangulCount = hangulMatches ? hangulMatches.length : 0;
  const latinCount = latinMatches ? latinMatches.length : 0;
  const totalAlpha = hangulCount + latinCount;

  if (totalAlpha === 0) {
    return { language: "en", confidence: 0, koreanRatio: 0 };
  }

  const koreanRatio = hangulCount / totalAlpha;

  let language: DetectedLanguage;
  if (koreanRatio > 0.5) {
    language = "ko";
  } else if (koreanRatio < 0.2) {
    language = "en";
  } else {
    language = "mixed";
  }

  // Confidence increases as the ratio moves toward 0 or 1 (clear signal).
  // At the boundaries (0.2, 0.5) confidence is lowest.
  const confidence =
    language === "mixed"
      ? 1 - Math.abs(koreanRatio - 0.35) / 0.35 // peaks ~0.35
      : Math.abs(koreanRatio - 0.35) / 0.65; // further from ambiguity → higher

  return {
    language,
    confidence: Math.round(confidence * 100) / 100,
    koreanRatio: Math.round(koreanRatio * 1000) / 1000,
  };
}

// ---------------------------------------------------------------------------
// 2. normalizeRequest
// ---------------------------------------------------------------------------

interface AbbreviationEntry {
  pattern: RegExp;
  replacement: string;
}

const KOREAN_ABBREVIATIONS: AbbreviationEntry[] = [
  { pattern: /ㄱㄱ/g, replacement: "go" },
  { pattern: /ㅇㅇ/g, replacement: "yes" },
  { pattern: /ㄴㄴ/g, replacement: "no" },
  { pattern: /ㅇㅋ/g, replacement: "ok" },
  { pattern: /ㄷㄷ/g, replacement: "wow" },
  { pattern: /ㅎㅎ/g, replacement: "haha" },
  { pattern: /ㅋㅋ+/g, replacement: "haha" },
  { pattern: /ㅠㅠ+/g, replacement: "sad" },
  { pattern: /ㅜㅜ+/g, replacement: "sad" },
];

/** Excessive punctuation: three or more identical punctuation chars → single */
const EXCESSIVE_PUNCT_RE = /([!?.,;])\1{2,}/g;

export function normalizeRequest(text: string): string {
  let result = text.trim();

  // Collapse whitespace (spaces, tabs, newlines) into single space
  result = result.replace(/\s+/g, " ");

  // Normalize Korean abbreviations
  for (const abbr of KOREAN_ABBREVIATIONS) {
    result = result.replace(abbr.pattern, abbr.replacement);
  }

  // Remove excessive punctuation (3+ identical → single)
  result = result.replace(EXCESSIVE_PUNCT_RE, "$1");

  return result;
}

// ---------------------------------------------------------------------------
// 3. translateKeyTerms
// ---------------------------------------------------------------------------

interface TermMapping {
  ko: string[];
  en: string[];
}

const TERM_DICTIONARY: TermMapping[] = [
  { ko: ["만들어", "생성", "추가"], en: ["create", "add"] },
  { ko: ["찾아", "검색", "조회"], en: ["search", "find", "query"] },
  { ko: ["수정", "변경", "업데이트"], en: ["update", "modify", "edit"] },
  { ko: ["삭제", "제거"], en: ["delete", "remove"] },
  { ko: ["작업", "태스크"], en: ["task"] },
  { ko: ["이슈", "문제"], en: ["issue", "problem"] },
  { ko: ["프로젝트"], en: ["project"] },
  { ko: ["일정", "스케줄"], en: ["schedule"] },
  { ko: ["분석"], en: ["analyze"] },
  { ko: ["요약"], en: ["summarize"] },
  { ko: ["보고서", "리포트"], en: ["report"] },
  { ko: ["알림", "통지"], en: ["notification"] },
  { ko: ["승인", "허가"], en: ["approval"] },
];

export function translateKeyTerms(
  text: string,
  fromLang: DetectedLanguage,
  toLang: DetectedLanguage,
): string {
  if (fromLang === toLang) {
    return text;
  }

  let result = text;

  for (const mapping of TERM_DICTIONARY) {
    if (fromLang === "ko" || fromLang === "mixed") {
      if (toLang === "en" || toLang === "mixed") {
        for (const koTerm of mapping.ko) {
          if (result.includes(koTerm)) {
            result = result.replace(
              new RegExp(escapeRegExp(koTerm), "g"),
              mapping.en[0],
            );
          }
        }
      }
    }

    if (fromLang === "en" || fromLang === "mixed") {
      if (toLang === "ko" || toLang === "mixed") {
        for (const enTerm of mapping.en) {
          const enPattern = new RegExp(`\\b${escapeRegExp(enTerm)}\\b`, "gi");
          if (enPattern.test(result)) {
            result = result.replace(
              new RegExp(`\\b${escapeRegExp(enTerm)}\\b`, "gi"),
              mapping.ko[0],
            );
          }
        }
      }
    }
  }

  return result;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// 4. getLocalizedResponse
// ---------------------------------------------------------------------------

type ResponseKey =
  | "processing"
  | "completed"
  | "failed"
  | "not_found"
  | "unauthorized"
  | "rate_limited";

const LOCALIZED_RESPONSES: Record<ResponseKey, Record<"ko" | "en", string>> = {
  processing: {
    ko: "요청을 처리하고 있습니다...",
    en: "Processing your request...",
  },
  completed: {
    ko: "작업이 완료되었습니다.",
    en: "Task completed successfully.",
  },
  failed: {
    ko: "작업 처리 중 오류가 발생했습니다.",
    en: "An error occurred while processing the task.",
  },
  not_found: {
    ko: "요청하신 항목을 찾을 수 없습니다.",
    en: "The requested item could not be found.",
  },
  unauthorized: {
    ko: "이 작업을 수행할 권한이 없습니다.",
    en: "You do not have permission to perform this action.",
  },
  rate_limited: {
    ko: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    en: "Too many requests. Please try again later.",
  },
};

export function getLocalizedResponse(
  key: string,
  lang: DetectedLanguage,
): string {
  const responseKey = key as ResponseKey;
  const entry = LOCALIZED_RESPONSES[responseKey];

  if (!entry) {
    return key;
  }

  // For "mixed", default to Korean since the user has demonstrated Korean usage
  const effectiveLang: "ko" | "en" = lang === "en" ? "en" : "ko";
  return entry[effectiveLang];
}
