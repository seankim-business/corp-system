/**
 * Code Safety Service
 *
 * Provides risk assessment, path safety validation, and auto-approval logic
 * for autonomous code operations.
 *
 * Features:
 * - Multi-dimensional risk assessment (breaking changes, security, data loss, etc.)
 * - Secret pattern detection with severity levels
 * - Path safety validation against blocked patterns
 * - Auto-approval criteria evaluation
 * - Commit message and diff validation
 */

import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";
import { minimatch } from "minimatch";

// ============================================================================
// TYPES
// ============================================================================

export interface Risk {
  type: "breaking_change" | "security" | "data_loss" | "performance" | "dependency";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  file?: string;
  line?: number;
}

export interface Blocker {
  type: "secret_detected" | "blocked_path" | "size_limit" | "pattern_violation";
  description: string;
  file?: string;
}

export interface SecretFinding {
  type: string;
  pattern: string;
  file: string;
  line: number;
  severity: "critical" | "high" | "medium";
}

export interface SafetyCheckResult {
  allowed: boolean;
  requiresApproval: boolean;
  approvalLevel: "auto" | "team-lead" | "admin";
  risks: Risk[];
  blockers: Blocker[];
  secretsFound: SecretFinding[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Auto-approval criteria - all must be true for auto-approval
 */
const AUTO_APPROVE_CRITERIA = {
  maxLinesChanged: 20,
  allowedFileTypes: [".test.ts", ".spec.ts", ".md", ".txt", ".json"],
  noNewDependencies: true,
  noSchemaChanges: true,
  noAPIChanges: true,
  noSecurityFiles: true,
  testsPass: true,
  typecheckPass: true,
};

/**
 * Blocked paths that should never be modified
 */
const BLOCKED_PATHS = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  "credentials.json",
  "service-account.json",
  ".npmrc",
  ".pypirc",
  "id_rsa",
  "id_ed25519",
  "*.pem",
  "*.key",
  ".git/config",
  ".git/hooks/*",
];

/**
 * Security-sensitive files that require admin approval
 */
const SECURITY_SENSITIVE_FILES = [
  "src/middleware/auth*",
  "src/services/auth*",
  "prisma/schema.prisma",
  "railway.toml",
  "Dockerfile*",
  ".github/workflows/*",
];

/**
 * Secret patterns with severity levels
 */
const SECRET_PATTERNS = [
  {
    name: "OpenAI Key",
    pattern: /sk-[a-zA-Z0-9]{32,}/g,
    severity: "critical" as const,
  },
  {
    name: "Anthropic Key",
    pattern: /sk-ant-[a-zA-Z0-9-]{32,}/g,
    severity: "critical" as const,
  },
  {
    name: "GitHub PAT",
    pattern: /ghp_[a-zA-Z0-9]{36}/g,
    severity: "critical" as const,
  },
  {
    name: "Slack Token",
    pattern: /xox[baprs]-[0-9]+-[a-zA-Z0-9]+/g,
    severity: "critical" as const,
  },
  {
    name: "AWS Key",
    pattern: /AKIA[0-9A-Z]{16}/g,
    severity: "critical" as const,
  },
  {
    name: "Private Key",
    pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    severity: "critical" as const,
  },
  {
    name: "Database URL",
    pattern: /(postgres|mysql|mongodb)(\+srv)?:\/\/[^:]+:[^@]+@/g,
    severity: "high" as const,
  },
  {
    name: "Generic API Key",
    pattern: /api[_-]?key['":\s]+[a-zA-Z0-9_-]{20,}/gi,
    severity: "high" as const,
  },
  {
    name: "Generic Secret",
    pattern: /secret['":\s]+[a-zA-Z0-9_-]{20,}/gi,
    severity: "medium" as const,
  },
  {
    name: "JWT Token",
    pattern: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
    severity: "high" as const,
  },
];

/**
 * Breaking change patterns in diffs
 */
const BREAKING_CHANGE_PATTERNS = [
  { pattern: /export (function|class|interface|type) (\w+)/g, type: "removed_export" },
  { pattern: /function (\w+)\([^)]*\)/g, type: "signature_change" },
  { pattern: /@deprecated/gi, type: "deprecation" },
  { pattern: /ALTER TABLE/gi, type: "schema_migration" },
  { pattern: /DROP (TABLE|COLUMN|INDEX)/gi, type: "destructive_migration" },
];

/**
 * Security-sensitive patterns
 */
const SECURITY_PATTERNS = [
  { pattern: /eval\(/g, description: "Use of eval() function" },
  { pattern: /dangerouslySetInnerHTML/g, description: "Use of dangerouslySetInnerHTML" },
  { pattern: /process\.env\./g, description: "Direct process.env access" },
  { pattern: /exec\(/g, description: "Use of exec() for shell commands" },
  { pattern: /new Function\(/g, description: "Dynamic function creation" },
  { pattern: /innerHTML\s*=/g, description: "Direct innerHTML assignment" },
];

/**
 * Dependency change patterns
 */
const DEPENDENCY_PATTERNS = [
  { pattern: /"dependencies":/g, file: "package.json" },
  { pattern: /"devDependencies":/g, file: "package.json" },
  { pattern: /requirements\.txt/g, file: "requirements.txt" },
  { pattern: /Cargo\.toml/g, file: "Cargo.toml" },
];

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Assess risk level of code changes
 */
export async function assessChangeRisk(diff: string): Promise<SafetyCheckResult> {
  const startTime = Date.now();

  try {
    logger.debug("Assessing change risk", { diffLength: diff.length });

    const risks: Risk[] = [];
    const blockers: Blocker[] = [];
    const secretsFound: SecretFinding[] = [];

    // 1. Scan for secrets
    const secrets = scanForSecrets(diff);
    secretsFound.push(...secrets);

    // If critical secrets found, block immediately
    const criticalSecrets = secrets.filter((s) => s.severity === "critical");
    if (criticalSecrets.length > 0) {
      blockers.push({
        type: "secret_detected",
        description: `Critical secrets detected: ${criticalSecrets.map((s) => s.type).join(", ")}`,
      });
    }

    // 2. Check for breaking changes
    const breakingChangeRisks = detectBreakingChanges(diff);
    risks.push(...breakingChangeRisks);

    // 3. Check for security issues
    const securityRisks = detectSecurityIssues(diff);
    risks.push(...securityRisks);

    // 4. Check for data loss patterns
    const dataLossRisks = detectDataLossPatterns(diff);
    risks.push(...dataLossRisks);

    // 5. Check for performance concerns
    const performanceRisks = detectPerformanceIssues(diff);
    risks.push(...performanceRisks);

    // 6. Check for dependency changes
    const dependencyRisks = detectDependencyChanges(diff);
    risks.push(...dependencyRisks);

    // 7. Check size limits
    const lines = diff.split("\n").length;
    if (lines > 1000) {
      blockers.push({
        type: "size_limit",
        description: `Change too large: ${lines} lines (limit: 1000)`,
      });
    }

    // Determine approval level based on risks
    const approvalLevel = getRequiredApprovalLevel(risks);

    // Check if blocked
    const allowed = blockers.length === 0;

    // Require approval if high risks or blockers
    const requiresApproval =
      !allowed ||
      risks.some((r) => r.severity === "critical" || r.severity === "high") ||
      approvalLevel !== "auto";

    const duration = Date.now() - startTime;

    metrics.histogram("code_safety.assess_risk.duration", duration);
    metrics.increment("code_safety.assess_risk.completed", {
      allowed: String(allowed),
      requiresApproval: String(requiresApproval),
      approvalLevel,
    });

    logger.info("Change risk assessment completed", {
      allowed,
      requiresApproval,
      approvalLevel,
      riskCount: risks.length,
      blockerCount: blockers.length,
      secretsCount: secretsFound.length,
      durationMs: duration,
    });

    return {
      allowed,
      requiresApproval,
      approvalLevel,
      risks,
      blockers,
      secretsFound,
    };
  } catch (error) {
    logger.error(
      "Failed to assess change risk",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );

    metrics.increment("code_safety.assess_risk.errors");

    // Conservative fallback on error
    return {
      allowed: false,
      requiresApproval: true,
      approvalLevel: "admin",
      risks: [
        {
          type: "security",
          severity: "critical",
          description: "Risk assessment failed - requiring admin approval",
        },
      ],
      blockers: [
        {
          type: "pattern_violation",
          description: "Unable to assess risk due to error",
        },
      ],
      secretsFound: [],
    };
  }
}

/**
 * Check if a file path is safe to modify
 */
export function checkPathSafety(path: string): { safe: boolean; reason?: string } {
  // Check blocked paths
  for (const blockedPattern of BLOCKED_PATHS) {
    if (minimatch(path, blockedPattern)) {
      return {
        safe: false,
        reason: `Path matches blocked pattern: ${blockedPattern}`,
      };
    }
  }

  // Check security-sensitive files
  for (const sensitivePattern of SECURITY_SENSITIVE_FILES) {
    if (minimatch(path, sensitivePattern)) {
      return {
        safe: true,
        reason: `Security-sensitive file: ${sensitivePattern} (requires admin approval)`,
      };
    }
  }

  return { safe: true };
}

/**
 * Validate commit message and diff
 */
export function validateCommit(message: string, diff: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check commit message format
  if (!message || message.trim().length === 0) {
    errors.push("Commit message cannot be empty");
  }

  if (message.length < 10) {
    warnings.push("Commit message is very short (< 10 characters)");
  }

  if (message.length > 500) {
    warnings.push("Commit message is very long (> 500 characters)");
  }

  // Check for conventional commit format
  const conventionalPattern = /^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)(\(.+\))?: .+/;
  if (!conventionalPattern.test(message)) {
    warnings.push("Commit message does not follow conventional commit format");
  }

  // Check diff content
  if (!diff || diff.trim().length === 0) {
    errors.push("Diff cannot be empty");
  }

  // Check for debug statements
  if (/console\.(log|debug|info|warn|error)/g.test(diff)) {
    warnings.push("Diff contains console statements");
  }

  // Check for TODO comments being added
  if (/\+.*TODO|FIXME|XXX/g.test(diff)) {
    warnings.push("Diff adds TODO/FIXME comments");
  }

  // Check for large file additions
  const additions = diff.split("\n").filter((line) => line.startsWith("+")).length;
  if (additions > 500) {
    warnings.push(`Large number of additions: ${additions} lines`);
  }

  // Check for secrets in diff
  const secrets = scanForSecrets(diff);
  if (secrets.length > 0) {
    errors.push(`Secrets detected in diff: ${secrets.map((s) => s.type).join(", ")}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if a change can be auto-approved
 */
export function canAutoApprove(change: {
  diff: string;
  filesChanged: string[];
  linesChanged: number;
}): boolean {
  try {
    logger.debug("Checking auto-approval eligibility", {
      filesChanged: change.filesChanged.length,
      linesChanged: change.linesChanged,
    });

    // Check size limit
    if (change.linesChanged > AUTO_APPROVE_CRITERIA.maxLinesChanged) {
      logger.debug("Auto-approval denied: too many lines changed", {
        linesChanged: change.linesChanged,
        limit: AUTO_APPROVE_CRITERIA.maxLinesChanged,
      });
      return false;
    }

    // Check file types - all files must be in allowed types
    const allFilesAllowed = change.filesChanged.every((file) =>
      AUTO_APPROVE_CRITERIA.allowedFileTypes.some((ext) => file.endsWith(ext)),
    );

    if (!allFilesAllowed) {
      logger.debug("Auto-approval denied: non-allowed file types", {
        filesChanged: change.filesChanged,
      });
      return false;
    }

    // Check for security-sensitive files
    if (AUTO_APPROVE_CRITERIA.noSecurityFiles) {
      const hasSensitiveFiles = change.filesChanged.some((file) =>
        SECURITY_SENSITIVE_FILES.some((pattern) => minimatch(file, pattern)),
      );

      if (hasSensitiveFiles) {
        logger.debug("Auto-approval denied: security-sensitive files", {
          filesChanged: change.filesChanged,
        });
        return false;
      }
    }

    // Check for schema changes
    if (AUTO_APPROVE_CRITERIA.noSchemaChanges) {
      const hasSchemaChanges =
        /ALTER TABLE|CREATE TABLE|DROP TABLE|CREATE INDEX|DROP INDEX/gi.test(change.diff);

      if (hasSchemaChanges) {
        logger.debug("Auto-approval denied: schema changes detected");
        return false;
      }
    }

    // Check for dependency changes
    if (AUTO_APPROVE_CRITERIA.noNewDependencies) {
      const hasDependencyChanges =
        change.filesChanged.some((f) => f.includes("package.json")) &&
        /"dependencies":|"devDependencies":/g.test(change.diff);

      if (hasDependencyChanges) {
        logger.debug("Auto-approval denied: dependency changes detected");
        return false;
      }
    }

    // Check for API changes
    if (AUTO_APPROVE_CRITERIA.noAPIChanges) {
      const hasAPIChanges =
        /export (function|class|interface|type)|app\.(get|post|put|delete|patch)/gi.test(
          change.diff,
        );

      if (hasAPIChanges) {
        logger.debug("Auto-approval denied: API changes detected");
        return false;
      }
    }

    // Check for secrets
    const secrets = scanForSecrets(change.diff);
    if (secrets.length > 0) {
      logger.debug("Auto-approval denied: secrets detected", {
        secretsCount: secrets.length,
      });
      return false;
    }

    logger.info("Auto-approval granted", {
      filesChanged: change.filesChanged.length,
      linesChanged: change.linesChanged,
    });

    metrics.increment("code_safety.auto_approval.granted");
    return true;
  } catch (error) {
    logger.error(
      "Error checking auto-approval eligibility",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );

    metrics.increment("code_safety.auto_approval.errors");
    return false; // Deny on error
  }
}

/**
 * Scan content for secrets
 */
export function scanForSecrets(content: string): SecretFinding[] {
  const findings: SecretFinding[] = [];

  for (const secretPattern of SECRET_PATTERNS) {
    // Reset regex lastIndex
    secretPattern.pattern.lastIndex = 0;

    let match;
    while ((match = secretPattern.pattern.exec(content)) !== null) {
      // Find line number
      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split("\n").length;

      // Extract file from diff context if available
      const lines = content.split("\n");
      let file = "unknown";

      // Look backwards from match line to find file indicator
      for (let i = lineNumber - 1; i >= 0 && i >= lineNumber - 20; i--) {
        const line = lines[i];
        const fileMatch = line.match(/^[\+\-]{3} [ab]\/(.*)/);
        if (fileMatch) {
          file = fileMatch[1];
          break;
        }
      }

      findings.push({
        type: secretPattern.name,
        pattern: secretPattern.pattern.source,
        file,
        line: lineNumber,
        severity: secretPattern.severity,
      });

      logger.warn("Secret detected", {
        type: secretPattern.name,
        file,
        line: lineNumber,
        severity: secretPattern.severity,
      });

      metrics.increment("code_safety.secrets_detected", {
        type: secretPattern.name,
        severity: secretPattern.severity,
      });
    }
  }

  return findings;
}

/**
 * Get required approval level based on risks
 */
export function getRequiredApprovalLevel(risks: Risk[]): "auto" | "team-lead" | "admin" {
  // Critical risks require admin approval
  if (risks.some((r) => r.severity === "critical")) {
    return "admin";
  }

  // High risks require team-lead approval
  if (risks.some((r) => r.severity === "high")) {
    return "team-lead";
  }

  // Medium risks require team-lead approval
  if (risks.some((r) => r.severity === "medium")) {
    return "team-lead";
  }

  // Only low risks or no risks - can be auto-approved
  return "auto";
}

// ============================================================================
// RISK DETECTION HELPERS
// ============================================================================

/**
 * Detect breaking changes in diff
 */
function detectBreakingChanges(diff: string): Risk[] {
  const risks: Risk[] = [];

  for (const pattern of BREAKING_CHANGE_PATTERNS) {
    pattern.pattern.lastIndex = 0;

    let match;
    while ((match = pattern.pattern.exec(diff)) !== null) {
      const lineNumber = diff.substring(0, match.index).split("\n").length;

      risks.push({
        type: "breaking_change",
        severity: "high",
        description: `Potential breaking change: ${pattern.type}`,
        line: lineNumber,
      });
    }
  }

  return risks;
}

/**
 * Detect security issues in diff
 */
function detectSecurityIssues(diff: string): Risk[] {
  const risks: Risk[] = [];

  for (const pattern of SECURITY_PATTERNS) {
    pattern.pattern.lastIndex = 0;

    let match;
    while ((match = pattern.pattern.exec(diff)) !== null) {
      const lineNumber = diff.substring(0, match.index).split("\n").length;

      risks.push({
        type: "security",
        severity: "high",
        description: pattern.description,
        line: lineNumber,
      });
    }
  }

  return risks;
}

/**
 * Detect data loss patterns in diff
 */
function detectDataLossPatterns(diff: string): Risk[] {
  const risks: Risk[] = [];

  const dataLossPatterns = [
    { pattern: /DROP TABLE/gi, description: "DROP TABLE statement" },
    { pattern: /DROP COLUMN/gi, description: "DROP COLUMN statement" },
    { pattern: /DELETE FROM/gi, description: "DELETE statement" },
    { pattern: /TRUNCATE/gi, description: "TRUNCATE statement" },
    { pattern: /\.deleteMany\(/g, description: "Bulk delete operation" },
    { pattern: /\.drop\(\)/g, description: "Drop collection/table" },
  ];

  for (const pattern of dataLossPatterns) {
    pattern.pattern.lastIndex = 0;

    let match;
    while ((match = pattern.pattern.exec(diff)) !== null) {
      const lineNumber = diff.substring(0, match.index).split("\n").length;

      risks.push({
        type: "data_loss",
        severity: "critical",
        description: pattern.description,
        line: lineNumber,
      });
    }
  }

  return risks;
}

/**
 * Detect performance issues in diff
 */
function detectPerformanceIssues(diff: string): Risk[] {
  const risks: Risk[] = [];

  const performancePatterns = [
    { pattern: /SELECT \* FROM/gi, description: "SELECT * query (full table scan)" },
    { pattern: /\.forEach\(/g, description: "forEach in hot path (consider map/filter)" },
    { pattern: /for\s*\(\s*var\s+/g, description: "var in loop (memory leak risk)" },
    { pattern: /new RegExp\(/g, description: "Dynamic RegExp creation (performance)" },
  ];

  for (const pattern of performancePatterns) {
    pattern.pattern.lastIndex = 0;

    let match;
    while ((match = pattern.pattern.exec(diff)) !== null) {
      const lineNumber = diff.substring(0, match.index).split("\n").length;

      risks.push({
        type: "performance",
        severity: "medium",
        description: pattern.description,
        line: lineNumber,
      });
    }
  }

  return risks;
}

/**
 * Detect dependency changes in diff
 */
function detectDependencyChanges(diff: string): Risk[] {
  const risks: Risk[] = [];

  for (const pattern of DEPENDENCY_PATTERNS) {
    pattern.pattern.lastIndex = 0;

    if (pattern.pattern.test(diff)) {
      risks.push({
        type: "dependency",
        severity: "medium",
        description: `Dependency changes in ${pattern.file}`,
      });
    }
  }

  return risks;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  assessChangeRisk,
  checkPathSafety,
  validateCommit,
  canAutoApprove,
  scanForSecrets,
  getRequiredApprovalLevel,
};
