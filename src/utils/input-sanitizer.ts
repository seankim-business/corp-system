import { logger } from "./logger";

// =============================================================================
// Types
// =============================================================================

export interface SanitizationResult {
  value: string;
  wasSanitized: boolean;
  detectedPatterns: string[];
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Common SQL injection patterns to detect.
 * These are checked case-insensitively against user input.
 */
const SQL_INJECTION_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "union_select", pattern: /\bUNION\s+(ALL\s+)?SELECT\b/i },
  { name: "or_1_eq_1", pattern: /'\s*OR\s+['"]?\d+['"]?\s*=\s*['"]?\d+/i },
  { name: "comment_sequence", pattern: /--\s|\/\*|\*\//i },
  { name: "semicolon_statement", pattern: /;\s*(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|EXEC|EXECUTE)\b/i },
  { name: "drop_table", pattern: /\bDROP\s+(TABLE|DATABASE|INDEX)\b/i },
  { name: "delete_from", pattern: /\bDELETE\s+FROM\b/i },
  { name: "insert_into", pattern: /\bINSERT\s+INTO\b/i },
  { name: "update_set", pattern: /\bUPDATE\s+\w+\s+SET\b/i },
  { name: "exec_xp", pattern: /\b(EXEC|EXECUTE)\s+(xp_|sp_)/i },
  { name: "benchmark_sleep", pattern: /\b(BENCHMARK|SLEEP|WAITFOR\s+DELAY)\b/i },
  { name: "char_encoding", pattern: /\bCHAR\s*\(\s*\d+/i },
  { name: "hex_encoding", pattern: /0x[0-9a-fA-F]{6,}/i },
  { name: "information_schema", pattern: /\bINFORMATION_SCHEMA\b/i },
  { name: "pg_catalog", pattern: /\bpg_(catalog|tables|user|shadow)\b/i },
  { name: "stacked_query", pattern: /;\s*(SELECT|SHOW|DESCRIBE)\b/i },
];

/**
 * Common XSS patterns to detect.
 */
const XSS_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "script_tag", pattern: /<script[\s>]/i },
  { name: "on_event", pattern: /\bon\w+\s*=/i },
  { name: "javascript_proto", pattern: /javascript\s*:/i },
  { name: "data_proto", pattern: /data\s*:\s*text\/html/i },
  { name: "svg_onload", pattern: /<svg[\s/].*onload/i },
  { name: "img_onerror", pattern: /<img[\s/].*onerror/i },
  { name: "iframe_tag", pattern: /<iframe[\s>]/i },
  { name: "eval_call", pattern: /\beval\s*\(/i },
];

/**
 * Path traversal patterns.
 */
const PATH_TRAVERSAL_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "dot_dot_slash", pattern: /\.\.\//i },
  { name: "dot_dot_backslash", pattern: /\.\.\\/i },
  { name: "null_byte", pattern: /%00/i },
  { name: "encoded_traversal", pattern: /%2e%2e/i },
];

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Check input string for SQL injection patterns.
 * Returns detected pattern names.
 */
export function detectSQLInjection(input: string): string[] {
  const detected: string[] = [];
  for (const { name, pattern } of SQL_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      detected.push(name);
    }
  }
  return detected;
}

/**
 * Check input string for XSS patterns.
 */
export function detectXSS(input: string): string[] {
  const detected: string[] = [];
  for (const { name, pattern } of XSS_PATTERNS) {
    if (pattern.test(input)) {
      detected.push(name);
    }
  }
  return detected;
}

/**
 * Check input string for path traversal patterns.
 */
export function detectPathTraversal(input: string): string[] {
  const detected: string[] = [];
  for (const { name, pattern } of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(input)) {
      detected.push(name);
    }
  }
  return detected;
}

/**
 * Sanitize a string by stripping dangerous characters/sequences.
 * Returns the sanitized string and whether it was modified.
 */
export function sanitizeString(input: string): SanitizationResult {
  const detectedPatterns: string[] = [
    ...detectSQLInjection(input),
    ...detectXSS(input),
    ...detectPathTraversal(input),
  ];

  let sanitized = input;
  let wasSanitized = false;

  // Remove null bytes
  if (sanitized.includes("\0") || sanitized.includes("%00")) {
    sanitized = sanitized.replace(/\0/g, "").replace(/%00/g, "");
    wasSanitized = true;
  }

  // Strip HTML tags (basic - for defense in depth, not primary defense)
  const stripped = sanitized.replace(/<[^>]*>/g, "");
  if (stripped !== sanitized) {
    sanitized = stripped;
    wasSanitized = true;
  }

  if (detectedPatterns.length > 0) {
    wasSanitized = true;
  }

  return { value: sanitized, wasSanitized, detectedPatterns };
}

/**
 * Sanitize an object recursively, checking all string values.
 * Returns true if any suspicious patterns were detected.
 */
export function scanObject(
  obj: unknown,
  path = "",
): { suspicious: boolean; findings: Array<{ path: string; patterns: string[] }> } {
  const findings: Array<{ path: string; patterns: string[] }> = [];

  if (typeof obj === "string") {
    const sqlPatterns = detectSQLInjection(obj);
    const xssPatterns = detectXSS(obj);
    const pathPatterns = detectPathTraversal(obj);
    const allPatterns = [...sqlPatterns, ...xssPatterns, ...pathPatterns];

    if (allPatterns.length > 0) {
      findings.push({ path: path || "value", patterns: allPatterns });
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      const result = scanObject(item, `${path}[${index}]`);
      findings.push(...result.findings);
    });
  } else if (obj !== null && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj)) {
      const result = scanObject(value, path ? `${path}.${key}` : key);
      findings.push(...result.findings);
    }
  }

  return { suspicious: findings.length > 0, findings };
}

/**
 * Log detected injection attempt for security auditing.
 */
export function logInjectionAttempt(
  source: string,
  findings: Array<{ path: string; patterns: string[] }>,
  metadata?: Record<string, unknown>,
): void {
  logger.warn("Potential injection attempt detected", {
    source,
    findingCount: findings.length,
    patterns: findings.flatMap((f) => f.patterns),
    paths: findings.map((f) => f.path),
    ...metadata,
  });
}
