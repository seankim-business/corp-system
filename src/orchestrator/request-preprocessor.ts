import { logger } from "../utils/logger";

export interface PreprocessedRequest {
  original: string;
  normalized: string;
  language: "en" | "ko" | "mixed";
  tokens: string[];
  hasCode: boolean;
  hasUrl: boolean;
  estimatedWordCount: number;
}

// Korean Unicode ranges: Hangul Syllables (AC00-D7AF),
// Hangul Jamo (1100-11FF), Hangul Compatibility Jamo (3130-318F),
// Hangul Jamo Extended-A (A960-A97F), Hangul Jamo Extended-B (D7B0-D7FF)
const KOREAN_CHAR_REGEX =
  /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF]/g;

const CODE_BLOCK_REGEX = /```[\s\S]*?```/;
const INDENTED_CODE_REGEX = /(?:^|\n)(?: {4}|\t)\S.*/;
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
const MENTION_REGEX = /@([\w.-]+)/g;
const CHANNEL_REF_REGEX = /#([\w-]+)/g;
const PUNCTUATION_EXCEPT_HYPHENS_REGEX = /[^\w\s-]/g;
const MULTI_WHITESPACE_REGEX = /\s+/g;

/**
 * Detect the language of the input text based on the proportion
 * of Korean characters.
 *
 * - > 30% Korean characters -> "ko"
 * - < 5% Korean characters  -> "en"
 * - otherwise               -> "mixed"
 */
function detectLanguage(text: string): "en" | "ko" | "mixed" {
  // Strip whitespace and punctuation to count only meaningful characters
  const meaningful = text.replace(/[\s\p{P}]/gu, "");
  if (meaningful.length === 0) {
    return "en";
  }

  const koreanMatches = meaningful.match(KOREAN_CHAR_REGEX);
  const koreanCount = koreanMatches ? koreanMatches.length : 0;
  const ratio = koreanCount / meaningful.length;

  if (ratio > 0.3) return "ko";
  if (ratio < 0.05) return "en";
  return "mixed";
}

/**
 * Detect whether the text contains code blocks or indented code patterns.
 */
function detectCode(text: string): boolean {
  return CODE_BLOCK_REGEX.test(text) || INDENTED_CODE_REGEX.test(text);
}

/**
 * Detect whether the text contains HTTP/HTTPS URLs.
 */
function detectUrls(text: string): boolean {
  return URL_REGEX.test(text);
}

/**
 * Preprocess and normalize a user request for downstream consumption.
 *
 * Returns structured metadata including language detection, tokenization,
 * code/URL detection, and a normalized string form.
 */
export function preprocessRequest(userRequest: string): PreprocessedRequest {
  const original = userRequest;

  // Normalize whitespace: collapse multiple spaces/newlines into single space
  const normalized = userRequest.replace(MULTI_WHITESPACE_REGEX, " ").trim();

  const language = detectLanguage(original);
  const tokens = normalized.split(/\s+/).filter((t) => t.length > 0);
  const hasCode = detectCode(original);
  const hasUrl = detectUrls(original);
  const estimatedWordCount = tokens.length;

  logger.debug("Request preprocessed", {
    language,
    tokenCount: tokens.length,
    hasCode,
    hasUrl,
    estimatedWordCount,
    originalLength: original.length,
  });

  return {
    original,
    normalized,
    language,
    tokens,
    hasCode,
    hasUrl,
    estimatedWordCount,
  };
}

/**
 * Normalize text for matching/comparison purposes.
 *
 * - Lowercases the text
 * - Removes punctuation except hyphens
 * - Collapses whitespace
 * - Trims leading/trailing whitespace
 */
export function normalizeForMatching(text: string): string {
  return text
    .toLowerCase()
    .replace(PUNCTUATION_EXCEPT_HYPHENS_REGEX, "")
    .replace(MULTI_WHITESPACE_REGEX, " ")
    .trim();
}

/**
 * Extract @mentions from text.
 * Returns an array of mention targets (without the @ prefix).
 */
export function extractMentions(text: string): string[] {
  const mentions: string[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  const regex = new RegExp(MENTION_REGEX.source, MENTION_REGEX.flags);
  while ((match = regex.exec(text)) !== null) {
    mentions.push(match[1]);
  }

  return mentions;
}

/**
 * Extract #channel references from text.
 * Returns an array of channel names (without the # prefix).
 */
export function extractChannelRefs(text: string): string[] {
  const channels: string[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  const regex = new RegExp(CHANNEL_REF_REGEX.source, CHANNEL_REF_REGEX.flags);
  while ((match = regex.exec(text)) !== null) {
    channels.push(match[1]);
  }

  return channels;
}
