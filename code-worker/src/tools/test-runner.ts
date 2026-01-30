import { execa } from 'execa';
import * as path from 'path';

// Result types
export interface TypecheckResult {
  success: boolean;
  errors: Array<{
    file: string;
    line: number;
    column: number;
    message: string;
    code: string;
  }>;
  errorCount: number;
}

export interface LintResult {
  success: boolean;
  errors: Array<{
    file: string;
    line: number;
    rule: string;
    message: string;
    severity: 'error' | 'warning';
  }>;
  errorCount: number;
  warningCount: number;
}

export interface TestResult {
  success: boolean;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  failures: Array<{
    testName: string;
    file: string;
    message: string;
    stack?: string;
  }>;
  duration: number; // ms
}

export interface BuildResult {
  success: boolean;
  output: string;
  duration: number;
}

export interface FormatResult {
  success: boolean;
  filesNeedingFormat: string[];
}

// Main class
export class TestRunnerTools {
  private workingDirectory: string;
  private timeout: number = 5 * 60 * 1000; // 5 minutes

  constructor(workingDirectory: string) {
    // Validate working directory is under /workspace/repos/
    if (!workingDirectory.startsWith('/workspace/repos/')) {
      throw new Error(
        `Working directory must be under /workspace/repos/, got: ${workingDirectory}`
      );
    }
    this.workingDirectory = workingDirectory;
  }

  /**
   * Run TypeScript type checking
   */
  async typecheck(): Promise<TypecheckResult> {
    const startTime = Date.now();
    try {
      await execa('tsc', ['--noEmit'], {
        cwd: this.workingDirectory,
        timeout: this.timeout,
        reject: false,
      });

      return {
        success: true,
        errors: [],
        errorCount: 0,
      };
    } catch (error: any) {
      const errors = this.parseTscOutput(error.stdout || error.stderr || '');
      return {
        success: false,
        errors,
        errorCount: errors.length,
      };
    }
  }

  /**
   * Run ESLint
   */
  async lint(files?: string[]): Promise<LintResult> {
    const args = ['--format', 'json'];
    if (files && files.length > 0) {
      args.push(...files);
    } else {
      args.push('.');
    }

    try {
      const result = await execa('eslint', args, {
        cwd: this.workingDirectory,
        timeout: this.timeout,
        reject: false,
      });

      const lintResults = JSON.parse(result.stdout || '[]');
      const errors = this.parseEslintOutput(lintResults);

      const errorCount = errors.filter((e) => e.severity === 'error').length;
      const warningCount = errors.filter((e) => e.severity === 'warning').length;

      return {
        success: errorCount === 0,
        errors,
        errorCount,
        warningCount,
      };
    } catch (error: any) {
      // If eslint not found or other error
      if (error.code === 'ENOENT') {
        return {
          success: true,
          errors: [],
          errorCount: 0,
          warningCount: 0,
        };
      }

      // Try to parse output
      try {
        const lintResults = JSON.parse(error.stdout || '[]');
        const errors = this.parseEslintOutput(lintResults);
        const errorCount = errors.filter((e) => e.severity === 'error').length;
        const warningCount = errors.filter((e) => e.severity === 'warning').length;

        return {
          success: errorCount === 0,
          errors,
          errorCount,
          warningCount,
        };
      } catch {
        throw error;
      }
    }
  }

  /**
   * Run tests
   */
  async test(pattern?: string): Promise<TestResult> {
    const startTime = Date.now();

    // Try Jest first
    try {
      const args = ['--json', '--no-coverage'];
      if (pattern) {
        args.push(pattern);
      }

      const result = await execa('jest', args, {
        cwd: this.workingDirectory,
        timeout: this.timeout,
        reject: false,
      });

      const duration = Date.now() - startTime;
      const testResults = JSON.parse(result.stdout);

      return this.parseJestOutput(testResults, duration);
    } catch (error: any) {
      // If jest not found, try npm test
      if (error.code === 'ENOENT') {
        return this.runNpmTest(startTime, pattern);
      }

      // If JSON parsing failed, check if tests ran
      const duration = Date.now() - startTime;
      try {
        const testResults = JSON.parse(error.stdout || '{}');
        return this.parseJestOutput(testResults, duration);
      } catch {
        throw error;
      }
    }
  }

  /**
   * Run build
   */
  async build(): Promise<BuildResult> {
    const startTime = Date.now();

    try {
      const result = await execa('npm', ['run', 'build'], {
        cwd: this.workingDirectory,
        timeout: this.timeout,
        reject: false,
      });

      const duration = Date.now() - startTime;
      const output = result.stdout + '\n' + result.stderr;

      return {
        success: result.exitCode === 0,
        output,
        duration,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const output = (error.stdout || '') + '\n' + (error.stderr || '');

      return {
        success: false,
        output,
        duration,
      };
    }
  }

  /**
   * Check formatting
   */
  async formatCheck(files?: string[]): Promise<FormatResult> {
    const args = ['--check'];
    if (files && files.length > 0) {
      args.push(...files);
    } else {
      args.push('.');
    }

    try {
      const result = await execa('prettier', args, {
        cwd: this.workingDirectory,
        timeout: this.timeout,
        reject: false,
      });

      // Prettier outputs files that need formatting
      const filesNeedingFormat = result.stdout
        .split('\n')
        .filter((line: string) => line.trim().length > 0)
        .map((line: string) => line.trim());

      return {
        success: result.exitCode === 0,
        filesNeedingFormat,
      };
    } catch (error: any) {
      // If prettier not found
      if (error.code === 'ENOENT') {
        return {
          success: true,
          filesNeedingFormat: [],
        };
      }

      const filesNeedingFormat = (error.stdout || '')
        .split('\n')
        .filter((line: string) => line.trim().length > 0)
        .map((line: string) => line.trim());

      return {
        success: false,
        filesNeedingFormat,
      };
    }
  }

  // Private helper methods

  private parseTscOutput(output: string): TypecheckResult['errors'] {
    const errors: TypecheckResult['errors'] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      // Match pattern: file.ts(line,column): error TS1234: message
      const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/);
      if (match) {
        errors.push({
          file: match[1],
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          code: match[4],
          message: match[5],
        });
      }
    }

    return errors;
  }

  private parseEslintOutput(results: any[]): LintResult['errors'] {
    const errors: LintResult['errors'] = [];

    for (const result of results) {
      const file = result.filePath;
      for (const message of result.messages || []) {
        errors.push({
          file,
          line: message.line,
          rule: message.ruleId || 'unknown',
          message: message.message,
          severity: message.severity === 2 ? 'error' : 'warning',
        });
      }
    }

    return errors;
  }

  private parseJestOutput(results: any, duration: number): TestResult {
    const { numTotalTests, numPassedTests, numFailedTests, numPendingTests, testResults } =
      results;

    const failures: TestResult['failures'] = [];

    for (const suite of testResults || []) {
      for (const test of suite.assertionResults || []) {
        if (test.status === 'failed') {
          failures.push({
            testName: test.fullName || test.title,
            file: suite.name,
            message: test.failureMessages?.join('\n') || 'Test failed',
            stack: test.failureMessages?.join('\n'),
          });
        }
      }
    }

    return {
      success: numFailedTests === 0,
      total: numTotalTests || 0,
      passed: numPassedTests || 0,
      failed: numFailedTests || 0,
      skipped: numPendingTests || 0,
      failures,
      duration,
    };
  }

  private async runNpmTest(startTime: number, pattern?: string): Promise<TestResult> {
    const args = ['test'];
    if (pattern) {
      args.push('--', pattern);
    }

    try {
      const result = await execa('npm', args, {
        cwd: this.workingDirectory,
        timeout: this.timeout,
        reject: false,
      });

      const duration = Date.now() - startTime;
      const output = result.stdout + '\n' + result.stderr;

      // Basic parsing for npm test output
      const testMatch = output.match(/(\d+)\s+passing/i);
      const failMatch = output.match(/(\d+)\s+failing/i);

      const passed = testMatch ? parseInt(testMatch[1], 10) : 0;
      const failed = failMatch ? parseInt(failMatch[1], 10) : 0;

      return {
        success: result.exitCode === 0 && failed === 0,
        total: passed + failed,
        passed,
        failed,
        skipped: 0,
        failures: [], // Can't easily parse npm test failures
        duration,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const output = (error.stdout || '') + '\n' + (error.stderr || '');

      const testMatch = output.match(/(\d+)\s+passing/i);
      const failMatch = output.match(/(\d+)\s+failing/i);

      const passed = testMatch ? parseInt(testMatch[1], 10) : 0;
      const failed = failMatch ? parseInt(failMatch[1], 10) : 0;

      return {
        success: false,
        total: passed + failed,
        passed,
        failed,
        skipped: 0,
        failures: [],
        duration,
      };
    }
  }
}

// Export factory function
export function createTestRunner(workingDirectory: string): TestRunnerTools {
  return new TestRunnerTools(workingDirectory);
}
