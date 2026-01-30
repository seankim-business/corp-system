/**
 * Secrets Scanner - Pre-commit secret detection
 * Scans code for exposed API keys, tokens, passwords, and credentials
 */

import * as fs from 'fs/promises';

export interface SecretFinding {
  type: string;           // 'api_key', 'private_key', 'password', etc.
  pattern: string;        // Which pattern matched
  match: string;          // Redacted match (first 10 chars + ...)
  file: string;
  line: number;
  severity: 'critical' | 'high' | 'medium';
}

export interface ScanResult {
  passed: boolean;
  findings: SecretFinding[];
  blockedCommit: boolean;  // true if any critical findings
  scannedFiles: number;
}

interface SecretPattern {
  name: string;
  pattern: RegExp;
  severity: 'critical' | 'high' | 'medium';
  type: string;
}

const SECRET_PATTERNS: SecretPattern[] = [
  // API Keys
  {
    name: 'OpenAI API Key',
    pattern: /sk-[a-zA-Z0-9]{32,}/g,
    severity: 'critical',
    type: 'api_key'
  },
  {
    name: 'Anthropic API Key',
    pattern: /sk-ant-[a-zA-Z0-9-]{32,}/g,
    severity: 'critical',
    type: 'api_key'
  },
  {
    name: 'GitHub Personal Access Token',
    pattern: /ghp_[a-zA-Z0-9]{36}/g,
    severity: 'critical',
    type: 'api_key'
  },
  {
    name: 'GitHub OAuth Token',
    pattern: /gho_[a-zA-Z0-9]{36}/g,
    severity: 'critical',
    type: 'api_key'
  },
  {
    name: 'Slack Bot Token',
    pattern: /xoxb-[0-9]+-[a-zA-Z0-9]+/g,
    severity: 'critical',
    type: 'api_key'
  },
  {
    name: 'Slack User Token',
    pattern: /xoxp-[0-9]+-[a-zA-Z0-9]+/g,
    severity: 'critical',
    type: 'api_key'
  },
  {
    name: 'AWS Access Key',
    pattern: /AKIA[0-9A-Z]{16}/g,
    severity: 'critical',
    type: 'api_key'
  },
  {
    name: 'AWS Secret Key',
    pattern: /(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)[\s=:]+['"']?([a-zA-Z0-9/+=]{40})['"']?/g,
    severity: 'critical',
    type: 'api_key'
  },

  // Private Keys
  {
    name: 'RSA Private Key',
    pattern: /-----BEGIN (RSA )?PRIVATE KEY-----/g,
    severity: 'critical',
    type: 'private_key'
  },
  {
    name: 'EC Private Key',
    pattern: /-----BEGIN EC PRIVATE KEY-----/g,
    severity: 'critical',
    type: 'private_key'
  },
  {
    name: 'OpenSSH Private Key',
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----/g,
    severity: 'critical',
    type: 'private_key'
  },
  {
    name: 'PGP Private Key',
    pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----/g,
    severity: 'critical',
    type: 'private_key'
  },

  // Database URLs with credentials
  {
    name: 'PostgreSQL URL with password',
    pattern: /postgres(?:ql)?:\/\/[^:\/\s]+:[^@\/\s]+@[^\/\s]+/g,
    severity: 'critical',
    type: 'database_url'
  },
  {
    name: 'MySQL URL with password',
    pattern: /mysql:\/\/[^:\/\s]+:[^@\/\s]+@[^\/\s]+/g,
    severity: 'critical',
    type: 'database_url'
  },
  {
    name: 'MongoDB URL with password',
    pattern: /mongodb(?:\+srv)?:\/\/[^:\/\s]+:[^@\/\s]+@[^\/\s]+/g,
    severity: 'critical',
    type: 'database_url'
  },

  // Generic patterns (more context-dependent)
  {
    name: 'Generic API Key',
    pattern: /(?:api[_-]?key|apikey)[\s=:]+['"']?([a-zA-Z0-9_\-]{20,})['"']?/gi,
    severity: 'high',
    type: 'api_key'
  },
  {
    name: 'Generic Secret',
    pattern: /(?:secret|token)[\s=:]+['"']?([a-zA-Z0-9_\-]{20,})['"']?/gi,
    severity: 'high',
    type: 'secret'
  },
  {
    name: 'Password Assignment',
    pattern: /(?:password|passwd|pwd)[\s=:]+['"']([^'"]{8,})['"']/gi,
    severity: 'medium',
    type: 'password'
  },
  {
    name: 'JWT Token',
    pattern: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
    severity: 'high',
    type: 'token'
  },
];

/**
 * Files and patterns to exclude from scanning
 */
const EXCLUSION_PATTERNS = {
  files: [
    /\.test\.ts$/,
    /\.spec\.ts$/,
    /\.test\.js$/,
    /\.spec\.js$/,
    /\.test\.tsx$/,
    /\.spec\.tsx$/,
  ],
  directories: [
    /__mocks__/,
    /__tests__/,
    /\/tests?\//,
    /\/node_modules\//,
    /\/dist\//,
    /\/build\//,
    /\.git\//,
  ],
  comments: [
    /example/i,
    /placeholder/i,
    /sample/i,
    /dummy/i,
    /test/i,
    /mock/i,
    /fake/i,
  ],
};

/**
 * Redact a secret match for safe display
 */
function redactMatch(match: string): string {
  if (match.length <= 10) {
    return '***REDACTED***';
  }
  return `${match.substring(0, 10)}...***REDACTED***`;
}

/**
 * Check if a file should be excluded from scanning
 */
function shouldExcludeFile(filePath: string): boolean {
  // Check file patterns
  for (const pattern of EXCLUSION_PATTERNS.files) {
    if (pattern.test(filePath)) {
      return true;
    }
  }

  // Check directory patterns
  for (const pattern of EXCLUSION_PATTERNS.directories) {
    if (pattern.test(filePath)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a line is a safe comment (example/placeholder)
 */
function isSafeComment(line: string): boolean {
  const trimmed = line.trim();

  // Check if line is a comment
  const isComment = trimmed.startsWith('//') ||
                    trimmed.startsWith('#') ||
                    trimmed.startsWith('*') ||
                    /^\s*\/\*/.test(line);

  if (!isComment) {
    return false;
  }

  // Check if comment contains exclusion keywords
  for (const pattern of EXCLUSION_PATTERNS.comments) {
    if (pattern.test(line)) {
      return true;
    }
  }

  return false;
}

/**
 * Scan content for secrets
 */
export async function scanContent(content: string, filePath: string): Promise<SecretFinding[]> {
  const findings: SecretFinding[] = [];
  const lines = content.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    // Skip safe comments
    if (isSafeComment(line)) {
      continue;
    }

    // Check each pattern
    for (const secretPattern of SECRET_PATTERNS) {
      // Reset regex lastIndex for global patterns
      secretPattern.pattern.lastIndex = 0;

      const matches = line.matchAll(secretPattern.pattern);

      for (const match of matches) {
        const matchedText = match[0];

        findings.push({
          type: secretPattern.type,
          pattern: secretPattern.name,
          match: redactMatch(matchedText),
          file: filePath,
          line: lineNum + 1, // 1-indexed line numbers
          severity: secretPattern.severity,
        });
      }
    }
  }

  return findings;
}

/**
 * Scan a single file for secrets
 */
export async function scanFile(filePath: string): Promise<SecretFinding[]> {
  if (shouldExcludeFile(filePath)) {
    return [];
  }

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return scanContent(content, filePath);
  } catch (error) {
    // File doesn't exist or can't be read
    console.error(`Error scanning file ${filePath}:`, error);
    return [];
  }
}

/**
 * Scan multiple files for secrets
 */
export async function scanFiles(filePaths: string[]): Promise<ScanResult> {
  const allFindings: SecretFinding[] = [];
  let scannedFiles = 0;

  for (const filePath of filePaths) {
    if (!shouldExcludeFile(filePath)) {
      const findings = await scanFile(filePath);
      allFindings.push(...findings);
      scannedFiles++;
    }
  }

  const hasCritical = allFindings.some(f => f.severity === 'critical');

  return {
    passed: allFindings.length === 0,
    findings: allFindings,
    blockedCommit: hasCritical,
    scannedFiles,
  };
}

/**
 * Scan only added lines in a git diff
 */
export async function scanDiff(diff: string): Promise<ScanResult> {
  const findings: SecretFinding[] = [];
  const lines = diff.split('\n');

  let currentFile = '';
  let lineNum = 0;

  for (const line of lines) {
    // Track current file
    if (line.startsWith('+++')) {
      const match = line.match(/\+\+\+ b\/(.*)/);
      if (match) {
        currentFile = match[1];
        lineNum = 0;
      }
      continue;
    }

    // Skip if file is excluded
    if (currentFile && shouldExcludeFile(currentFile)) {
      continue;
    }

    // Track line numbers in diff hunks
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      if (match) {
        lineNum = parseInt(match[1], 10) - 1; // Will be incremented before use
      }
      continue;
    }

    // Only scan added lines (starting with +)
    if (line.startsWith('+') && !line.startsWith('+++')) {
      lineNum++;

      const content = line.substring(1); // Remove the + prefix

      // Skip safe comments
      if (isSafeComment(content)) {
        continue;
      }

      // Check each pattern
      for (const secretPattern of SECRET_PATTERNS) {
        secretPattern.pattern.lastIndex = 0;

        const matches = content.matchAll(secretPattern.pattern);

        for (const match of matches) {
          const matchedText = match[0];

          findings.push({
            type: secretPattern.type,
            pattern: secretPattern.name,
            match: redactMatch(matchedText),
            file: currentFile,
            line: lineNum,
            severity: secretPattern.severity,
          });
        }
      }
    } else if (!line.startsWith('-')) {
      // Non-deleted lines count towards line number
      lineNum++;
    }
  }

  const hasCritical = findings.some(f => f.severity === 'critical');

  return {
    passed: findings.length === 0,
    findings,
    blockedCommit: hasCritical,
    scannedFiles: 1, // Diff represents changes across files
  };
}

/**
 * Format findings for display
 */
export function formatFindings(result: ScanResult): string {
  if (result.passed) {
    return `✓ No secrets detected (scanned ${result.scannedFiles} files)`;
  }

  const lines: string[] = [];

  lines.push(`\n⚠️  SECRET DETECTION WARNING`);
  lines.push(`Found ${result.findings.length} potential secrets in ${result.scannedFiles} files\n`);

  // Group by severity
  const critical = result.findings.filter(f => f.severity === 'critical');
  const high = result.findings.filter(f => f.severity === 'high');
  const medium = result.findings.filter(f => f.severity === 'medium');

  if (critical.length > 0) {
    lines.push('CRITICAL:');
    for (const finding of critical) {
      lines.push(`  ${finding.file}:${finding.line} - ${finding.pattern}`);
      lines.push(`    Match: ${finding.match}`);
    }
    lines.push('');
  }

  if (high.length > 0) {
    lines.push('HIGH:');
    for (const finding of high) {
      lines.push(`  ${finding.file}:${finding.line} - ${finding.pattern}`);
      lines.push(`    Match: ${finding.match}`);
    }
    lines.push('');
  }

  if (medium.length > 0) {
    lines.push('MEDIUM:');
    for (const finding of medium) {
      lines.push(`  ${finding.file}:${finding.line} - ${finding.pattern}`);
      lines.push(`    Match: ${finding.match}`);
    }
    lines.push('');
  }

  if (result.blockedCommit) {
    lines.push('❌ COMMIT BLOCKED - Critical secrets detected');
    lines.push('Remove secrets or add files to .gitignore before committing');
  } else {
    lines.push('⚠️  WARNING - Review findings before committing');
  }

  return lines.join('\n');
}
