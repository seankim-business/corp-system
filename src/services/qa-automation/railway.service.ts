/**
 * Railway CLI Wrapper Service
 *
 * Provides typed programmatic access to Railway CLI for deployment monitoring.
 * - Execute Railway CLI commands with proper error handling
 * - Parse JSON output from `railway status --json`
 * - Stream logs with optional filtering
 * - Detect build failures and errors
 *
 * Usage:
 *   const railway = new RailwayService();
 *   const status = await railway.getStatus('project-id');
 *   const errors = await railway.detectBuildErrors();
 */

import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../../utils/logger";

// =============================================================================
// TYPES
// =============================================================================

export type DeploymentStatusValue = "SUCCESS" | "FAILED" | "BUILDING" | "DEPLOYING";

export interface Deployment {
  id: string;
  status: DeploymentStatusValue;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface DeploymentStatus {
  projectId: string;
  environmentName: string;
  deployments: Deployment[];
  lastDeployment?: Deployment;
  isHealthy: boolean;
}

export interface BuildErrorAnalysis {
  hasErrors: boolean;
  errors: string[];
  errorCount: number;
  lastErrorTime?: string;
}

export interface CommandExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const COMMAND_TIMEOUT_MS = 30000; // 30 seconds

// =============================================================================
// RAILWAY SERVICE
// =============================================================================

export class RailwayService {
  private execAsync = promisify(exec);

  /**
   * Get deployment status for a project
   *
   * @param projectId - Optional Railway project ID. If not provided, uses current project context
   * @returns Typed deployment status with health check
   */
  async getStatus(projectId?: string): Promise<DeploymentStatus> {
    try {
      const cmd = projectId
        ? `railway status --json --project ${this.sanitizeArg(projectId)}`
        : "railway status --json";

      const result = await this.execCommand(cmd);

      if (!result.success) {
        logger.error("Railway status command failed", {
          stderr: result.stderr,
          exitCode: result.exitCode,
        });
        throw new Error(`Railway status failed: ${result.stderr}`);
      }

      // Parse JSON output
      let statusData;
      try {
        statusData = JSON.parse(result.stdout);
      } catch (parseError) {
        logger.error("Failed to parse Railway status JSON", {
          output: result.stdout,
          error: parseError,
        });
        throw new Error("Invalid JSON response from railway status");
      }

      // Transform to typed response
      const deployments: Deployment[] = (statusData.deployments || []).map((d: any) => ({
        id: d.id || "",
        status: this.normalizeStatus(d.status),
        createdAt: d.createdAt || new Date().toISOString(),
        updatedAt: d.updatedAt || new Date().toISOString(),
        completedAt: d.completedAt,
      }));

      const lastDeployment = deployments[0];
      const isHealthy = !lastDeployment || lastDeployment.status === "SUCCESS";

      return {
        projectId: projectId || statusData.projectId || "unknown",
        environmentName: statusData.environmentName || "production",
        deployments,
        lastDeployment,
        isHealthy,
      };
    } catch (error) {
      logger.error("RailwayService.getStatus failed", { error, projectId });
      throw error;
    }
  }

  /**
   * Get logs from Railway deployment
   *
   * @param filters - Optional filters for log level and deployment type
   * @returns Array of log lines
   */
  async getLogs(filters?: {
    level?: "error" | "warn" | "info" | "debug";
    deployment?: boolean;
  }): Promise<string[]> {
    try {
      let cmd = "railway logs";

      // Add optional filters
      if (filters?.level) {
        cmd += ` --level ${this.sanitizeArg(filters.level)}`;
      }

      if (filters?.deployment) {
        cmd += " --deployment";
      }

      const result = await this.execCommand(cmd);

      if (!result.success) {
        logger.warn("Railway logs command returned non-zero exit code", {
          exitCode: result.exitCode,
          stderr: result.stderr,
        });
        // Don't throw - logs might be empty or command might have warnings
      }

      // Split output into lines and filter empty lines
      const logs = result.stdout.split("\n").filter((line) => line.trim().length > 0);

      logger.debug("Retrieved Railway logs", {
        count: logs.length,
        filters,
      });

      return logs;
    } catch (error) {
      logger.error("RailwayService.getLogs failed", { error, filters });
      throw error;
    }
  }

  /**
   * Detect build errors from deployment logs
   *
   * @returns Analysis of build errors found
   */
  async detectBuildErrors(): Promise<BuildErrorAnalysis> {
    try {
      // Get error-level logs from deployment
      const errorLogs = await this.getLogs({
        level: "error",
        deployment: true,
      });

      // Parse error patterns
      const errors = this.parseErrorLogs(errorLogs);

      const analysis: BuildErrorAnalysis = {
        hasErrors: errors.length > 0,
        errors,
        errorCount: errors.length,
        lastErrorTime: errorLogs[0] ? this.extractTimestamp(errorLogs[0]) : undefined,
      };

      logger.info("Build error detection complete", {
        hasErrors: analysis.hasErrors,
        errorCount: analysis.errorCount,
      });

      return analysis;
    } catch (error) {
      logger.error("RailwayService.detectBuildErrors failed", { error });
      throw error;
    }
  }

  /**
   * Execute arbitrary Railway CLI command
   *
   * @param cmd - Command to execute (will be sanitized)
   * @returns Command execution result with stdout, stderr, and exit code
   */
  async execCommand(cmd: string): Promise<CommandExecutionResult> {
    try {
      // Validate command doesn't contain dangerous patterns
      if (this.containsDangerousPatterns(cmd)) {
        throw new Error("Command contains potentially dangerous patterns");
      }

      logger.debug("Executing Railway command", { cmd });

      const { stdout, stderr } = await this.execAsync(cmd, {
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
      });

      return {
        stdout,
        stderr,
        exitCode: 0,
        success: true,
      };
    } catch (error: any) {
      // Handle timeout
      if (error.killed) {
        logger.error("Railway command timeout", {
          cmd,
          timeout: COMMAND_TIMEOUT_MS,
        });
        return {
          stdout: error.stdout || "",
          stderr: `Command timeout after ${COMMAND_TIMEOUT_MS}ms`,
          exitCode: 124, // Standard timeout exit code
          success: false,
        };
      }

      // Handle command execution errors
      const exitCode = error.code || 1;
      const stderr = error.stderr || error.message || "Unknown error";
      const stdout = error.stdout || "";

      logger.warn("Railway command failed", {
        cmd,
        exitCode,
        stderr: stderr.substring(0, 500), // Truncate for logging
      });

      return {
        stdout,
        stderr,
        exitCode,
        success: false,
      };
    }
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  /**
   * Normalize status string to typed value
   */
  private normalizeStatus(status: string): DeploymentStatusValue {
    const normalized = (status || "").toUpperCase();
    const validStatuses: DeploymentStatusValue[] = ["SUCCESS", "FAILED", "BUILDING", "DEPLOYING"];

    if (validStatuses.includes(normalized as DeploymentStatusValue)) {
      return normalized as DeploymentStatusValue;
    }

    // Map common variations
    if (normalized.includes("FAIL")) return "FAILED";
    if (normalized.includes("BUILD")) return "BUILDING";
    if (normalized.includes("DEPLOY")) return "DEPLOYING";

    return "DEPLOYING"; // Default to deploying for unknown states
  }

  /**
   * Sanitize command arguments to prevent injection
   */
  private sanitizeArg(arg: string): string {
    // Only allow alphanumeric, hyphens, underscores, and dots
    if (!/^[a-zA-Z0-9._-]+$/.test(arg)) {
      throw new Error(`Invalid argument format: ${arg}`);
    }
    return arg;
  }

  /**
   * Check for dangerous command patterns
   */
  private containsDangerousPatterns(cmd: string): boolean {
    const dangerousPatterns = [
      /[;&|`$()]/g, // Shell metacharacters
      /\$\{.*\}/g, // Variable expansion
      /\$\(.*\)/g, // Command substitution
      />\s*\/dev\/null/g, // Redirection
    ];

    return dangerousPatterns.some((pattern) => pattern.test(cmd));
  }

  /**
   * Parse error logs to extract meaningful error messages
   */
  private parseErrorLogs(logs: string[]): string[] {
    const errors: string[] = [];
    const errorPatterns = [
      /error:\s*(.+)/i,
      /failed:\s*(.+)/i,
      /exception:\s*(.+)/i,
      /fatal:\s*(.+)/i,
    ];

    for (const log of logs) {
      for (const pattern of errorPatterns) {
        const match = log.match(pattern);
        if (match && match[1]) {
          const errorMsg = match[1].trim();
          // Avoid duplicates
          if (!errors.includes(errorMsg)) {
            errors.push(errorMsg);
          }
          break;
        }
      }
    }

    return errors;
  }

  /**
   * Extract timestamp from log line
   */
  private extractTimestamp(logLine: string): string | undefined {
    // Try to match ISO timestamp at start of line
    const isoMatch = logLine.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    if (isoMatch) {
      return isoMatch[0];
    }

    // Try to match common timestamp formats
    const timestampMatch = logLine.match(/\[(\d{2}:\d{2}:\d{2})\]/);
    if (timestampMatch) {
      return timestampMatch[1];
    }

    return undefined;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const railwayService = new RailwayService();
