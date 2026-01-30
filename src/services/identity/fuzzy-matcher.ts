/**
 * FuzzyMatcher - Multi-stage fuzzy name matching
 *
 * Matching stages:
 * 1. Exact match (confidence: 1.0)
 * 2. Normalized match - lowercase, trim, remove punctuation (confidence: 0.98)
 * 3. Dice coefficient similarity via string-similarity (threshold: 0.85)
 * 4. Token-based Jaccard similarity for word order differences (threshold: 0.80)
 */

import { compareTwoStrings } from "string-similarity";
import type { MatchResult } from "./types";

export class FuzzyMatcher {
  private readonly SIMILARITY_THRESHOLD = 0.85;
  private readonly TOKEN_THRESHOLD = 0.8;

  /**
   * Match two names and return confidence score
   */
  match(name1: string, name2: string): MatchResult {
    if (!name1 || !name2) {
      return { score: 0, method: "exact", confidence: 0 };
    }

    // Stage 1: Exact match
    if (name1 === name2) {
      return { score: 1.0, method: "exact", confidence: 1.0 };
    }

    // Stage 2: Normalized match
    const norm1 = this.normalize(name1);
    const norm2 = this.normalize(name2);

    if (norm1 === norm2) {
      return { score: 0.98, method: "normalized", confidence: 0.98 };
    }

    // Stage 3: Dice coefficient (via string-similarity)
    const diceScore = compareTwoStrings(norm1, norm2);

    if (diceScore >= this.SIMILARITY_THRESHOLD) {
      return {
        score: diceScore,
        method: "jaro_winkler", // Using Dice but naming for consistency
        confidence: diceScore,
        details: { algorithm: "dice_coefficient", rawScore: diceScore },
      };
    }

    // Stage 4: Token-based matching (handles word order differences)
    // e.g., "John Smith" vs "Smith, John"
    const tokenScore = this.tokenMatch(norm1, norm2);

    if (tokenScore >= this.TOKEN_THRESHOLD) {
      return {
        score: tokenScore,
        method: "token",
        confidence: tokenScore * 0.95, // Slightly lower confidence for token matching
        details: { algorithm: "jaccard_tokens", rawScore: tokenScore },
      };
    }

    // No good match - return best score with zero confidence
    const bestScore = Math.max(diceScore, tokenScore);
    return {
      score: bestScore,
      method: diceScore > tokenScore ? "jaro_winkler" : "token",
      confidence: 0,
      details: { diceScore, tokenScore, belowThreshold: true },
    };
  }

  /**
   * Normalize a name for comparison
   * - lowercase
   * - trim whitespace
   * - remove punctuation
   * - normalize multiple spaces
   */
  private normalize(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s\u3131-\uD79D]/g, "") // Keep letters, numbers, spaces, Korean
      .replace(/\s+/g, " ");
  }

  /**
   * Token-based Jaccard similarity
   * Handles "John Smith" vs "Smith, John"
   */
  private tokenMatch(s1: string, s2: string): number {
    const tokens1 = new Set(s1.split(/\s+/).filter(Boolean));
    const tokens2 = new Set(s2.split(/\s+/).filter(Boolean));

    if (tokens1.size === 0 || tokens2.size === 0) return 0;

    const intersection = new Set([...tokens1].filter((x) => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);

    return intersection.size / union.size;
  }

  /**
   * Batch match a name against multiple candidates
   * Returns sorted by confidence (descending)
   */
  matchBatch(
    sourceName: string,
    candidates: Array<{ id: string; name: string }>,
  ): Array<{ id: string; matchResult: MatchResult }> {
    return candidates
      .map((candidate) => ({
        id: candidate.id,
        matchResult: this.match(sourceName, candidate.name),
      }))
      .filter((result) => result.matchResult.confidence > 0)
      .sort((a, b) => b.matchResult.confidence - a.matchResult.confidence);
  }

  /**
   * Check if two emails share the same corporate domain
   * (not gmail.com, yahoo.com, etc.)
   */
  isSameCorporateDomain(email1?: string, email2?: string): boolean {
    if (!email1 || !email2) return false;

    const domain1 = email1.split("@")[1]?.toLowerCase();
    const domain2 = email2.split("@")[1]?.toLowerCase();

    if (!domain1 || !domain2) return false;
    if (domain1 !== domain2) return false;

    // Exclude common public email domains
    const publicDomains = new Set([
      "gmail.com",
      "googlemail.com",
      "yahoo.com",
      "hotmail.com",
      "outlook.com",
      "live.com",
      "icloud.com",
      "me.com",
      "naver.com",
      "daum.net",
      "hanmail.net",
      "kakao.com",
    ]);

    return !publicDomains.has(domain1);
  }

  /**
   * Get email domain
   */
  getEmailDomain(email?: string): string | null {
    if (!email) return null;
    const domain = email.split("@")[1]?.toLowerCase();
    return domain || null;
  }
}

// Singleton export
export const fuzzyMatcher = new FuzzyMatcher();
