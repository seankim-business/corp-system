/**
 * Sandbox module for safe command execution
 *
 * Provides secure command execution with:
 * - Command whitelisting
 * - Pattern blocking
 * - Path restrictions
 * - Resource limits
 * - Environment sanitization
 */

export {
  CommandExecutor,
  createCommandExecutor,
  isCommandAllowed,
  hasBlockedPattern,
  CommandSecurityError,
  CommandTimeoutError,
  type SandboxConfig,
  type CommandResult,
} from './command-executor';
