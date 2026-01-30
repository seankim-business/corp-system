import { spawn } from 'child_process';
import * as path from 'path';

/**
 * Configuration for sandbox command execution
 */
export interface SandboxConfig {
  maxExecutionTime: number;      // milliseconds, default 300000 (5 minutes)
  maxMemoryMB: number;           // megabytes, default 512
  maxOutputSize: number;         // bytes, default 10MB
  workingDirectory: string;      // must be /workspace only
  sessionId: string;
}

/**
 * Result from command execution
 */
export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  killed: boolean;
  killedReason?: 'timeout' | 'memory' | 'blocked';
}

/**
 * Error thrown when command execution fails security checks
 */
export class CommandSecurityError extends Error {
  constructor(message: string, public readonly reason: string) {
    super(message);
    this.name = 'CommandSecurityError';
  }
}

/**
 * Error thrown when command execution times out
 */
export class CommandTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandTimeoutError';
  }
}

/**
 * Whitelist of allowed base commands
 */
const ALLOWED_COMMANDS = [
  'git', 'npm', 'npx', 'node', 'tsc', 'eslint', 'prettier',
  'cat', 'ls', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'find', 'grep',
  'jest', 'vitest', 'pnpm', 'yarn', 'which', 'echo', 'touch',
  'head', 'tail', 'wc', 'sort', 'uniq', 'diff', 'sed', 'awk'
];

/**
 * Patterns that should block command execution
 */
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+[\/~]/,                    // rm -rf / or ~
  /curl|wget|nc|telnet|ftp/,             // Network download tools
  /\|\s*sh|\|\s*bash|\|\s*zsh/,          // Pipe to shell
  />\s*\/(?!workspace)/,                 // Write outside workspace
  /eval|exec\s*\(/,                      // Dynamic execution
  /sudo|su\s/,                           // Privilege escalation
  /--force/,                             // Force flags (potentially dangerous)
  /chmod\s+777/,                         // Dangerous permissions
  /chown|chgrp/,                         // Ownership changes
  /kill|pkill|killall/,                  // Process killing
  /reboot|shutdown|halt/,                // System commands
  /mkfs|fdisk|parted/,                   // Disk operations
  /iptables|ufw|firewall/,               // Firewall operations
  /systemctl|service/,                   // Service management
  /docker|podman|kubectl/,               // Container operations
  /ssh|scp|rsync/,                       // Remote access
];

/**
 * Safe environment variables to pass through
 */
const SAFE_ENV_VARS = [
  'NODE_ENV',
  'PATH',
  'TERM',
  'LANG',
  'LC_ALL',
  'TZ',
  'USER',
];

/**
 * Default sandbox configuration
 */
const DEFAULT_CONFIG: Omit<SandboxConfig, 'sessionId'> = {
  maxExecutionTime: 300000,     // 5 minutes
  maxMemoryMB: 512,             // 512 MB
  maxOutputSize: 10 * 1024 * 1024, // 10 MB
  workingDirectory: '/workspace',
};

/**
 * Command Executor with sandbox restrictions
 */
export class CommandExecutor {
  private config: SandboxConfig;

  constructor(config: Partial<SandboxConfig> & { sessionId: string }) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    // Validate working directory
    if (!this.config.workingDirectory.startsWith('/workspace')) {
      throw new CommandSecurityError(
        'Working directory must be within /workspace',
        'invalid_working_directory'
      );
    }
  }

  /**
   * Execute a command with sandbox restrictions
   */
  async execute(command: string, args: string[] = []): Promise<CommandResult> {
    const startTime = Date.now();

    // Security checks
    this.validateCommand(command);
    this.validateArgs(args);
    const fullCommand = `${command} ${args.join(' ')}`;
    this.validateFullCommand(fullCommand);

    // Prepare execution
    const env = this.buildSafeEnvironment();
    const cwd = this.config.workingDirectory;

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let killed = false;
      let killedReason: 'timeout' | 'memory' | 'blocked' | undefined;

      // Spawn process
      const child = spawn(command, args, {
        cwd,
        env,
        shell: false, // Never use shell for security
        timeout: this.config.maxExecutionTime,
      });

      // Timeout handler
      const timeoutHandle = setTimeout(() => {
        if (!child.killed) {
          killed = true;
          killedReason = 'timeout';
          child.kill('SIGTERM');

          // Force kill after 5 seconds
          setTimeout(() => {
            if (!child.killed) {
              child.kill('SIGKILL');
            }
          }, 5000);
        }
      }, this.config.maxExecutionTime);

      // Collect stdout with size limit
      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
        if (stdout.length > this.config.maxOutputSize) {
          killed = true;
          killedReason = 'blocked';
          child.kill('SIGTERM');
          reject(new CommandSecurityError(
            'Output size exceeded limit',
            'output_size_exceeded'
          ));
        }
      });

      // Collect stderr with size limit
      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
        if (stderr.length > this.config.maxOutputSize) {
          killed = true;
          killedReason = 'blocked';
          child.kill('SIGTERM');
          reject(new CommandSecurityError(
            'Error output size exceeded limit',
            'error_output_size_exceeded'
          ));
        }
      });

      // Handle process exit
      child.on('close', (code) => {
        clearTimeout(timeoutHandle);
        const duration = Date.now() - startTime;

        if (killed && killedReason === 'timeout') {
          reject(new CommandTimeoutError(
            `Command timed out after ${this.config.maxExecutionTime}ms`
          ));
        } else {
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: code ?? -1,
            duration,
            killed,
            killedReason,
          });
        }
      });

      // Handle process errors
      child.on('error', (error) => {
        clearTimeout(timeoutHandle);
        reject(error);
      });
    });
  }

  /**
   * Validate base command against whitelist
   */
  private validateCommand(command: string): void {
    const baseCommand = path.basename(command);

    if (!ALLOWED_COMMANDS.includes(baseCommand)) {
      throw new CommandSecurityError(
        `Command '${baseCommand}' is not in the allowed commands list`,
        'command_not_allowed'
      );
    }
  }

  /**
   * Validate arguments for dangerous patterns
   */
  private validateArgs(args: string[]): void {
    for (const arg of args) {
      // Check for path traversal
      if (arg.includes('..') && (arg.includes('/') || arg.includes('\\'))) {
        throw new CommandSecurityError(
          'Path traversal detected in arguments',
          'path_traversal'
        );
      }

      // Check for absolute paths outside workspace
      if (arg.startsWith('/') && !arg.startsWith('/workspace')) {
        throw new CommandSecurityError(
          'Absolute path outside workspace detected',
          'invalid_path'
        );
      }

      // Check for shell metacharacters
      if (/[;&|`$()]/.test(arg)) {
        throw new CommandSecurityError(
          'Shell metacharacters detected in arguments',
          'shell_metacharacters'
        );
      }
    }
  }

  /**
   * Validate full command string against blocked patterns
   */
  private validateFullCommand(fullCommand: string): void {
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(fullCommand)) {
        throw new CommandSecurityError(
          `Command matches blocked pattern: ${pattern.toString()}`,
          'blocked_pattern'
        );
      }
    }
  }

  /**
   * Build safe environment with only whitelisted variables
   */
  private buildSafeEnvironment(): NodeJS.ProcessEnv {
    const safeEnv: NodeJS.ProcessEnv = {
      HOME: '/workspace',
      USER: 'sandbox',
      SHELL: '/bin/sh',
    };

    // Copy safe environment variables
    for (const varName of SAFE_ENV_VARS) {
      if (process.env[varName]) {
        safeEnv[varName] = process.env[varName];
      }
    }

    // Ensure PATH is safe
    if (!safeEnv.PATH) {
      safeEnv.PATH = '/usr/local/bin:/usr/bin:/bin';
    }

    return safeEnv;
  }

  /**
   * Update sandbox configuration
   */
  updateConfig(config: Partial<SandboxConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };

    // Re-validate working directory if changed
    if (config.workingDirectory && !config.workingDirectory.startsWith('/workspace')) {
      throw new CommandSecurityError(
        'Working directory must be within /workspace',
        'invalid_working_directory'
      );
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<SandboxConfig> {
    return { ...this.config };
  }
}

/**
 * Factory function to create a command executor
 */
export function createCommandExecutor(
  config: Partial<SandboxConfig> & { sessionId: string }
): CommandExecutor {
  return new CommandExecutor(config);
}

/**
 * Check if a command would be allowed (without executing)
 */
export function isCommandAllowed(command: string): boolean {
  try {
    const baseCommand = path.basename(command);
    return ALLOWED_COMMANDS.includes(baseCommand);
  } catch {
    return false;
  }
}

/**
 * Check if command string contains blocked patterns
 */
export function hasBlockedPattern(commandString: string): boolean {
  return BLOCKED_PATTERNS.some(pattern => pattern.test(commandString));
}
