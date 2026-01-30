/**
 * Change Reviewer Service
 *
 * Uses Claude to review code changes made by agents before approval.
 * Provides AI-powered code review with security scanning, quality checks,
 * and actionable feedback.
 */

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../utils/logger";

// =============================================================================
// Types
// =============================================================================

export interface ReviewResult {
  approved: boolean;
  score: number; // 0-100
  summary: string;
  issues: Array<{
    severity: "critical" | "major" | "minor" | "suggestion";
    file: string;
    line?: number;
    message: string;
    suggestion?: string;
  }>;
  securityConcerns: string[];
  testCoverage: "adequate" | "insufficient" | "unknown";
  codeQuality: "excellent" | "good" | "acceptable" | "poor";
}

export interface ReviewRequest {
  diff: string;
  description: string;
  context: string;
  filesChanged: string[];
  operationType: "debug" | "implement" | "refactor" | "fix";
}

// =============================================================================
// Constants
// =============================================================================

const REVIEW_SYSTEM_PROMPT = `You are a senior code reviewer. Review the following code changes and provide feedback.

Focus on:
1. Security vulnerabilities (SQL injection, XSS, auth issues, secrets exposure)
2. Logic errors and bugs
3. Code quality and maintainability
4. Test coverage adequacy
5. Breaking changes
6. Performance concerns
7. TypeScript type safety

Be concise but thorough. Flag any critical issues that should block merge.

Respond ONLY with valid JSON in this exact format:
{
  "approved": boolean,
  "score": number (0-100),
  "summary": "brief overview",
  "issues": [
    {
      "severity": "critical" | "major" | "minor" | "suggestion",
      "file": "path/to/file",
      "line": number (optional),
      "message": "description",
      "suggestion": "how to fix (optional)"
    }
  ],
  "securityConcerns": ["concern1", "concern2"],
  "testCoverage": "adequate" | "insufficient" | "unknown",
  "codeQuality": "excellent" | "good" | "acceptable" | "poor"
}`;

const SECURITY_SCAN_PROMPT = `You are a security expert. Scan the following code diff for security vulnerabilities.

Look for:
- SQL injection risks
- XSS vulnerabilities
- Authentication/authorization bypasses
- Secrets or credentials in code
- Unsafe deserialization
- Path traversal
- Command injection
- Insecure cryptography

Respond with a JSON array of security concerns (strings). Empty array if none found.`;

// =============================================================================
// Service
// =============================================================================

class ChangeReviewerService {
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      logger.warn("ANTHROPIC_API_KEY not set - change reviewer will fail");
    }
    this.client = new Anthropic({ apiKey: apiKey || "dummy-key" });
  }

  /**
   * Review code changes with comprehensive analysis
   */
  async reviewChanges(request: ReviewRequest): Promise<ReviewResult> {
    const startTime = Date.now();
    logger.info("Starting code review", {
      filesChanged: request.filesChanged.length,
      operationType: request.operationType,
    });

    try {
      const userPrompt = this.buildReviewPrompt(request);

      const response = await this.client.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 4096,
        temperature: 0.3,
        system: REVIEW_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== "text") {
        throw new Error("Unexpected response type from Claude");
      }

      const result = this.parseReviewResponse(content.text);

      const duration = Date.now() - startTime;
      logger.info("Code review completed", {
        approved: result.approved,
        score: result.score,
        issueCount: result.issues.length,
        securityConcernCount: result.securityConcerns.length,
        durationMs: duration,
      });

      return result;
    } catch (error) {
      logger.error("Code review failed", { error });
      throw error;
    }
  }

  /**
   * Quick security-focused scan (faster, cheaper)
   */
  async quickSecurityScan(diff: string): Promise<string[]> {
    logger.info("Starting quick security scan");

    try {
      const response = await this.client.messages.create({
        model: "claude-3-5-haiku-20241022", // Use faster model for quick scan
        max_tokens: 2048,
        temperature: 0.1,
        system: SECURITY_SCAN_PROMPT,
        messages: [
          {
            role: "user",
            content: `Review this diff for security issues:\n\n${diff}`,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== "text") {
        throw new Error("Unexpected response type from Claude");
      }

      // Parse JSON array
      const concerns = JSON.parse(content.text);
      if (!Array.isArray(concerns)) {
        throw new Error("Expected array response from security scan");
      }

      logger.info("Security scan completed", {
        concernCount: concerns.length,
      });

      return concerns;
    } catch (error) {
      logger.error("Security scan failed", { error });
      throw error;
    }
  }

  /**
   * Build the review prompt from request
   */
  private buildReviewPrompt(request: ReviewRequest): string {
    return `
**Operation Type:** ${request.operationType}

**Description:**
${request.description}

**Context:**
${request.context}

**Files Changed:**
${request.filesChanged.join("\n")}

**Diff:**
\`\`\`diff
${request.diff}
\`\`\`

Provide a comprehensive code review in JSON format.
`.trim();
  }

  /**
   * Parse Claude's review response into ReviewResult
   */
  private parseReviewResponse(response: string): ReviewResult {
    try {
      // Try to extract JSON if wrapped in markdown
      let jsonStr = response.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonStr);

      // Validate required fields
      if (
        typeof parsed.approved !== "boolean" ||
        typeof parsed.score !== "number" ||
        typeof parsed.summary !== "string" ||
        !Array.isArray(parsed.issues) ||
        !Array.isArray(parsed.securityConcerns)
      ) {
        throw new Error("Invalid review response structure");
      }

      // Validate issue format
      for (const issue of parsed.issues) {
        if (
          !["critical", "major", "minor", "suggestion"].includes(issue.severity) ||
          typeof issue.file !== "string" ||
          typeof issue.message !== "string"
        ) {
          throw new Error("Invalid issue format in review response");
        }
      }

      // Validate enums
      if (!["adequate", "insufficient", "unknown"].includes(parsed.testCoverage)) {
        parsed.testCoverage = "unknown";
      }

      if (!["excellent", "good", "acceptable", "poor"].includes(parsed.codeQuality)) {
        parsed.codeQuality = "acceptable";
      }

      // Ensure score is in range
      parsed.score = Math.max(0, Math.min(100, parsed.score));

      return parsed as ReviewResult;
    } catch (error) {
      logger.error("Failed to parse review response", {
        error,
        response: response.substring(0, 500),
      });

      // Return a safe fallback
      return {
        approved: false,
        score: 0,
        summary: "Failed to parse review response - manual review required",
        issues: [
          {
            severity: "critical",
            file: "unknown",
            message: `Review parsing failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        securityConcerns: ["Review parsing failed - manual security review required"],
        testCoverage: "unknown",
        codeQuality: "poor",
      };
    }
  }

  /**
   * Format review result as markdown for display
   */
  formatReview(result: ReviewResult): string {
    const lines: string[] = [];

    // Header
    lines.push(`# Code Review Result`);
    lines.push("");
    lines.push(`**Status:** ${result.approved ? "✅ APPROVED" : "❌ REJECTED"}`);
    lines.push(`**Score:** ${result.score}/100`);
    lines.push(`**Quality:** ${result.codeQuality}`);
    lines.push(`**Test Coverage:** ${result.testCoverage}`);
    lines.push("");

    // Summary
    lines.push(`## Summary`);
    lines.push("");
    lines.push(result.summary);
    lines.push("");

    // Security concerns
    if (result.securityConcerns.length > 0) {
      lines.push(`## 🔒 Security Concerns`);
      lines.push("");
      for (const concern of result.securityConcerns) {
        lines.push(`- ${concern}`);
      }
      lines.push("");
    }

    // Issues by severity
    const critical = result.issues.filter((i) => i.severity === "critical");
    const major = result.issues.filter((i) => i.severity === "major");
    const minor = result.issues.filter((i) => i.severity === "minor");
    const suggestions = result.issues.filter((i) => i.severity === "suggestion");

    if (critical.length > 0) {
      lines.push(`## 🚨 Critical Issues`);
      lines.push("");
      for (const issue of critical) {
        this.formatIssue(issue, lines);
      }
    }

    if (major.length > 0) {
      lines.push(`## ⚠️ Major Issues`);
      lines.push("");
      for (const issue of major) {
        this.formatIssue(issue, lines);
      }
    }

    if (minor.length > 0) {
      lines.push(`## ℹ️ Minor Issues`);
      lines.push("");
      for (const issue of minor) {
        this.formatIssue(issue, lines);
      }
    }

    if (suggestions.length > 0) {
      lines.push(`## 💡 Suggestions`);
      lines.push("");
      for (const issue of suggestions) {
        this.formatIssue(issue, lines);
      }
    }

    return lines.join("\n");
  }

  /**
   * Format a single issue for markdown display
   */
  private formatIssue(
    issue: ReviewResult["issues"][0],
    lines: string[],
  ): void {
    const location = issue.line ? `${issue.file}:${issue.line}` : issue.file;
    lines.push(`### ${location}`);
    lines.push("");
    lines.push(issue.message);
    if (issue.suggestion) {
      lines.push("");
      lines.push(`**Suggestion:** ${issue.suggestion}`);
    }
    lines.push("");
  }
}

// =============================================================================
// Exports
// =============================================================================

export const changeReviewer = new ChangeReviewerService();
