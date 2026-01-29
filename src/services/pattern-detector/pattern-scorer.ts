/**
 * Pattern Scorer
 * Scores detected patterns for SOP candidacy and prioritization
 */

import type {
  DetectedPattern,
  PatternScoreFactors,
  RequestCluster,
  SequencePattern,
  TimePattern,
} from "./types";

interface ScoredPattern {
  pattern: DetectedPattern;
  score: number;
  factors: PatternScoreFactors;
  recommendation: string;
}

export class PatternScorer {
  // Weight factors for different scoring components
  private readonly weights = {
    frequency: 0.25,
    consistency: 0.2,
    userDiversity: 0.2,
    timeSavings: 0.2,
    complexity: 0.15,
  };

  /**
   * Score a detected pattern for SOP candidacy
   */
  scorePattern(pattern: DetectedPattern): ScoredPattern {
    const factors = this.calculateFactors(pattern);
    const score = this.calculateOverallScore(factors);
    const recommendation = this.generateRecommendation(pattern, score, factors);

    return {
      pattern: { ...pattern, confidence: score },
      score,
      factors,
      recommendation,
    };
  }

  /**
   * Score and rank multiple patterns
   */
  rankPatterns(patterns: DetectedPattern[]): ScoredPattern[] {
    const scored = patterns.map((p) => this.scorePattern(p));
    return scored.sort((a, b) => b.score - a.score);
  }

  /**
   * Filter patterns that meet minimum SOP candidacy threshold
   */
  filterSOPCandidates(patterns: DetectedPattern[], minScore = 0.6): DetectedPattern[] {
    const scored = this.rankPatterns(patterns);
    return scored.filter((s) => s.score >= minScore).map((s) => s.pattern);
  }

  /**
   * Get top N patterns for SOP suggestion
   */
  getTopPatterns(patterns: DetectedPattern[], limit = 10): ScoredPattern[] {
    return this.rankPatterns(patterns).slice(0, limit);
  }

  /**
   * Calculate scoring factors for a pattern
   */
  private calculateFactors(pattern: DetectedPattern): PatternScoreFactors {
    switch (pattern.type) {
      case "sequence":
        return this.calculateSequenceFactors(pattern.data as SequencePattern);
      case "cluster":
        return this.calculateClusterFactors(pattern.data as RequestCluster);
      case "time":
        return this.calculateTimeFactors(pattern.data as TimePattern);
      default:
        return this.getDefaultFactors();
    }
  }

  /**
   * Calculate factors for sequence patterns
   */
  private calculateSequenceFactors(seq: SequencePattern): PatternScoreFactors {
    // Frequency: Higher is better, normalize to 0-1
    const frequencyScore = Math.min(seq.frequency / 20, 1);

    // Consistency: Based on confidence from mining
    const consistencyScore = seq.confidence;

    // User diversity: More users = more generalizable
    const userDiversityScore = Math.min(seq.users.length / 10, 1);

    // Time savings: Based on average duration (longer = more savings potential)
    // Assume 1 minute minimum, 10 minutes = max score
    const timeSavingsScore = Math.min(seq.avgDuration / (10 * 60 * 1000), 1);

    // Complexity: Based on sequence length (2-3 = simple, 5+ = complex)
    // Sweet spot is 3-5 steps
    const seqLength = seq.sequence.length;
    let complexityScore: number;
    if (seqLength <= 2) {
      complexityScore = 0.3; // Too simple
    } else if (seqLength <= 5) {
      complexityScore = 0.8 + (seqLength - 3) * 0.1; // Sweet spot
    } else {
      complexityScore = Math.max(0.5, 1 - (seqLength - 5) * 0.1); // Too complex
    }

    return {
      frequency: frequencyScore,
      consistency: consistencyScore,
      userDiversity: userDiversityScore,
      timeSavings: timeSavingsScore,
      complexity: complexityScore,
    };
  }

  /**
   * Calculate factors for request cluster patterns
   */
  private calculateClusterFactors(cluster: RequestCluster): PatternScoreFactors {
    // Frequency: Based on cluster size
    const frequencyScore = Math.min(cluster.size / 20, 1);

    // Consistency: Based on similarity of requests
    const avgDistance =
      cluster.requests.reduce((sum, r) => sum + r.distance, 0) / cluster.requests.length;
    const consistencyScore = 1 - Math.min(avgDistance, 1);

    // User diversity
    const uniqueUsers = new Set(cluster.requests.map((r) => r.userId)).size;
    const userDiversityScore = Math.min(uniqueUsers / 5, 1);

    // Time savings: Estimate based on cluster size
    const timeSavingsScore = Math.min(cluster.size / 15, 1);

    // Complexity: Based on intent clarity
    const complexityScore = cluster.automatable ? 0.8 : 0.4;

    return {
      frequency: frequencyScore,
      consistency: consistencyScore,
      userDiversity: userDiversityScore,
      timeSavings: timeSavingsScore,
      complexity: complexityScore,
    };
  }

  /**
   * Calculate factors for time patterns
   */
  private calculateTimeFactors(timePattern: TimePattern): PatternScoreFactors {
    // Frequency: Based on occurrences
    const frequencyScore = Math.min(timePattern.occurrences / 15, 1);

    // Consistency: From pattern confidence
    const consistencyScore = timePattern.confidence;

    // User diversity: From underlying action pattern
    const userDiversityScore = Math.min(timePattern.actionPattern.users.length / 5, 1);

    // Time savings: Higher for more frequent patterns
    let timeSavingsScore: number;
    switch (timePattern.type) {
      case "daily":
        timeSavingsScore = 0.9; // Daily patterns save most time
        break;
      case "weekly":
        timeSavingsScore = 0.7;
        break;
      case "monthly":
        timeSavingsScore = 0.5;
        break;
      case "quarterly":
        timeSavingsScore = 0.3;
        break;
      default:
        timeSavingsScore = 0.4;
    }

    // Complexity: Based on underlying pattern complexity
    const seqLength = timePattern.actionPattern.sequence.length;
    const complexityScore = seqLength >= 2 && seqLength <= 5 ? 0.8 : 0.5;

    return {
      frequency: frequencyScore,
      consistency: consistencyScore,
      userDiversity: userDiversityScore,
      timeSavings: timeSavingsScore,
      complexity: complexityScore,
    };
  }

  /**
   * Calculate overall score from factors
   */
  private calculateOverallScore(factors: PatternScoreFactors): number {
    return (
      factors.frequency * this.weights.frequency +
      factors.consistency * this.weights.consistency +
      factors.userDiversity * this.weights.userDiversity +
      factors.timeSavings * this.weights.timeSavings +
      factors.complexity * this.weights.complexity
    );
  }

  /**
   * Generate recommendation based on score and factors
   */
  private generateRecommendation(
    _pattern: DetectedPattern,
    score: number,
    factors: PatternScoreFactors,
  ): string {
    if (score >= 0.8) {
      return "Highly recommended for automation. This pattern shows strong consistency and potential for significant time savings.";
    }

    if (score >= 0.6) {
      const weakPoints: string[] = [];
      if (factors.frequency < 0.5) weakPoints.push("could benefit from more occurrences");
      if (factors.userDiversity < 0.5) weakPoints.push("used by few users");
      if (factors.consistency < 0.5) weakPoints.push("shows some variation");

      return `Good candidate for automation${weakPoints.length > 0 ? `, but ${weakPoints.join(" and ")}` : ""}.`;
    }

    if (score >= 0.4) {
      return "Moderate potential. Consider monitoring for more data before automation.";
    }

    return "Low priority. Pattern may be too infrequent or inconsistent for automation.";
  }

  /**
   * Get default factors (for unknown pattern types)
   */
  private getDefaultFactors(): PatternScoreFactors {
    return {
      frequency: 0.5,
      consistency: 0.5,
      userDiversity: 0.5,
      timeSavings: 0.5,
      complexity: 0.5,
    };
  }

  /**
   * Compare two patterns for prioritization
   */
  comparePatterns(a: DetectedPattern, b: DetectedPattern): number {
    const scoreA = this.scorePattern(a).score;
    const scoreB = this.scorePattern(b).score;
    return scoreB - scoreA; // Higher scores first
  }

  /**
   * Get explanation for a pattern's score
   */
  explainScore(pattern: DetectedPattern): {
    score: number;
    factors: PatternScoreFactors;
    explanation: string[];
  } {
    const factors = this.calculateFactors(pattern);
    const score = this.calculateOverallScore(factors);
    const explanation: string[] = [];

    if (factors.frequency >= 0.7) {
      explanation.push("High frequency indicates this pattern is commonly used.");
    } else if (factors.frequency < 0.3) {
      explanation.push("Low frequency - pattern may be too rare for automation.");
    }

    if (factors.consistency >= 0.7) {
      explanation.push("High consistency shows reliable, predictable behavior.");
    } else if (factors.consistency < 0.3) {
      explanation.push("Low consistency - pattern varies significantly between occurrences.");
    }

    if (factors.userDiversity >= 0.7) {
      explanation.push("Used by many users, indicating broad applicability.");
    } else if (factors.userDiversity < 0.3) {
      explanation.push("Used by few users - may be specific to individual workflows.");
    }

    if (factors.timeSavings >= 0.7) {
      explanation.push("Significant time savings potential from automation.");
    }

    if (factors.complexity >= 0.7) {
      explanation.push("Appropriate complexity for automation.");
    } else if (factors.complexity < 0.3) {
      explanation.push("Pattern may be too simple or too complex for effective automation.");
    }

    return { score, factors, explanation };
  }
}

// Export singleton instance
export const patternScorer = new PatternScorer();
