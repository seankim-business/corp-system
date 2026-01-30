# Command Executor Sandbox

Safe command execution wrapper for the code worker with comprehensive security controls.

## Features

- **Command Whitelist**: Only allows pre-approved commands
- **Pattern Blocking**: Blocks dangerous command patterns (rm -rf /, shell injections, etc.)
- **Path Restrictions**: Limits file operations to `/workspace` directory
- **Resource Limits**: Enforces timeouts, memory limits, and output size caps
- **Environment Sanitization**: Blocks access to secrets via environment variables
- **No Shell Execution**: Uses direct process spawning to prevent shell injections

## Usage

```typescript
import { createCommandExecutor } from './command-executor';

// Create executor with configuration
const executor = createCommandExecutor({
  sessionId: 'user-session-123',
  workingDirectory: '/workspace/project',
  maxExecutionTime: 300000,  // 5 minutes
  maxMemoryMB: 512,
  maxOutputSize: 10 * 1024 * 1024, // 10 MB
});

// Execute a command
try {
  const result = await executor.execute('npm', ['install']);

  console.log('Output:', result.stdout);
  console.log('Exit code:', result.exitCode);
  console.log('Duration:', result.duration, 'ms');

  if (result.killed) {
    console.log('Killed reason:', result.killedReason);
  }
} catch (error) {
  if (error instanceof CommandSecurityError) {
    console.error('Security violation:', error.reason);
  } else if (error instanceof CommandTimeoutError) {
    console.error('Command timed out');
  }
}
```

## Configuration

### SandboxConfig

```typescript
interface SandboxConfig {
  maxExecutionTime: number;      // Max runtime in ms (default: 300000 = 5 min)
  maxMemoryMB: number;           // Max memory in MB (default: 512)
  maxOutputSize: number;         // Max stdout/stderr in bytes (default: 10MB)
  workingDirectory: string;      // Must be under /workspace
  sessionId: string;             // Unique session identifier
}
```

### Default Values

```typescript
{
  maxExecutionTime: 300000,     // 5 minutes
  maxMemoryMB: 512,             // 512 MB
  maxOutputSize: 10485760,      // 10 MB
  workingDirectory: '/workspace'
}
```

## Security Controls

### Allowed Commands

Only these base commands are permitted:

- **Version Control**: `git`
- **Package Managers**: `npm`, `npx`, `pnpm`, `yarn`
- **Node.js**: `node`, `tsc`, `eslint`, `prettier`
- **Testing**: `jest`, `vitest`
- **File Operations**: `cat`, `ls`, `pwd`, `mkdir`, `rm`, `cp`, `mv`, `find`, `grep`, `head`, `tail`, `wc`, `sort`, `uniq`, `diff`, `sed`, `awk`
- **Utilities**: `which`, `echo`, `touch`

### Blocked Patterns

The following patterns are automatically blocked:

- **Destructive**: `rm -rf /`, `rm -rf ~`
- **Network Tools**: `curl`, `wget`, `nc`, `telnet`, `ftp`, `ssh`, `scp`, `rsync`
- **Shell Injection**: `| sh`, `| bash`, `| zsh`
- **Path Escape**: Writing to paths outside `/workspace`
- **Code Execution**: `eval`, `exec()`
- **Privilege Escalation**: `sudo`, `su`
- **Force Operations**: `--force` flag
- **Permission Changes**: `chmod 777`, `chown`, `chgrp`
- **Process Control**: `kill`, `pkill`, `killall`
- **System Operations**: `reboot`, `shutdown`, `halt`
- **Disk Operations**: `mkfs`, `fdisk`, `parted`
- **Firewall**: `iptables`, `ufw`, `firewall`
- **Services**: `systemctl`, `service`
- **Containers**: `docker`, `podman`, `kubectl`

### Path Restrictions

- **Working Directory**: Must be under `/workspace`
- **Path Traversal**: `..` in paths is blocked
- **Absolute Paths**: Only `/workspace/*` paths allowed
- **Shell Metacharacters**: `;`, `&`, `|`, `` ` ``, `$`, `(`, `)` in arguments are blocked

### Environment Sanitization

Only safe environment variables are passed through:

- `NODE_ENV`, `PATH`, `TERM`, `LANG`, `LC_ALL`, `TZ`, `USER`
- `HOME` is always set to `/workspace`
- All other variables (including secrets) are stripped

## API

### createCommandExecutor(config)

Factory function to create a command executor instance.

```typescript
const executor = createCommandExecutor({
  sessionId: 'session-123',
  workingDirectory: '/workspace/project',
});
```

### executor.execute(command, args)

Execute a command with the given arguments.

```typescript
const result = await executor.execute('npm', ['install', 'express']);
```

Returns `CommandResult`:
```typescript
interface CommandResult {
  stdout: string;         // Standard output
  stderr: string;         // Error output
  exitCode: number;       // Process exit code
  duration: number;       // Execution time in ms
  killed: boolean;        // Whether process was killed
  killedReason?: string;  // 'timeout' | 'memory' | 'blocked'
}
```

### executor.updateConfig(config)

Update executor configuration.

```typescript
executor.updateConfig({
  maxExecutionTime: 600000, // 10 minutes
});
```

### executor.getConfig()

Get current configuration (read-only).

```typescript
const config = executor.getConfig();
console.log('Session ID:', config.sessionId);
```

### isCommandAllowed(command)

Check if a command is in the whitelist (without executing).

```typescript
if (isCommandAllowed('git')) {
  console.log('Git is allowed');
}
```

### hasBlockedPattern(commandString)

Check if a command string contains blocked patterns.

```typescript
if (hasBlockedPattern('rm -rf /')) {
  console.log('Dangerous command detected');
}
```

## Error Handling

### CommandSecurityError

Thrown when a command violates security policies.

```typescript
try {
  await executor.execute('curl', ['http://evil.com']);
} catch (error) {
  if (error instanceof CommandSecurityError) {
    console.log('Security violation:', error.reason);
    // Possible reasons:
    // - command_not_allowed
    // - path_traversal
    // - invalid_path
    // - shell_metacharacters
    // - blocked_pattern
    // - output_size_exceeded
    // - invalid_working_directory
  }
}
```

### CommandTimeoutError

Thrown when a command exceeds the time limit.

```typescript
try {
  await executor.execute('sleep', ['600']);
} catch (error) {
  if (error instanceof CommandTimeoutError) {
    console.log('Command timed out');
  }
}
```

## Examples

### Safe Git Operations

```typescript
// Clone a repository
await executor.execute('git', ['clone', 'https://github.com/user/repo.git']);

// Check status
await executor.execute('git', ['status']);

// Commit changes
await executor.execute('git', ['commit', '-m', 'Update feature']);
```

### Package Management

```typescript
// Install dependencies
await executor.execute('npm', ['install']);

// Run scripts
await executor.execute('npm', ['run', 'build']);

// Install specific package
await executor.execute('npm', ['install', 'express', '--save']);
```

### File Operations

```typescript
// List files
await executor.execute('ls', ['-la']);

// Read file contents
await executor.execute('cat', ['package.json']);

// Find files
await executor.execute('find', ['.', '-name', '*.ts']);

// Search in files
await executor.execute('grep', ['-r', 'TODO', 'src/']);
```

### TypeScript/Testing

```typescript
// Type check
await executor.execute('tsc', ['--noEmit']);

// Run linter
await executor.execute('eslint', ['src/**/*.ts']);

// Run tests
await executor.execute('jest', ['--coverage']);
```

## Resource Limits

### Timeouts

Commands are automatically killed after `maxExecutionTime`:

```typescript
const executor = createCommandExecutor({
  sessionId: 'session-123',
  maxExecutionTime: 60000, // 1 minute
});

// This will timeout after 1 minute
await executor.execute('npm', ['install']);
```

### Output Size

Both stdout and stderr are capped at `maxOutputSize`:

```typescript
const executor = createCommandExecutor({
  sessionId: 'session-123',
  maxOutputSize: 1024 * 1024, // 1 MB
});

// Throws error if output exceeds 1 MB
await executor.execute('cat', ['large-file.txt']);
```

### Memory Limits

Memory limit is configured but enforcement depends on OS support:

```typescript
const executor = createCommandExecutor({
  sessionId: 'session-123',
  maxMemoryMB: 256, // 256 MB
});
```

## Best Practices

1. **Always use specific commands**: Prefer `executor.execute('npm', ['install'])` over constructing command strings
2. **Validate user input**: Even with sandbox, validate inputs before passing to executor
3. **Set appropriate timeouts**: Adjust `maxExecutionTime` based on expected operation duration
4. **Monitor output size**: Large output can indicate runaway processes
5. **Handle errors gracefully**: Catch and handle `CommandSecurityError` and `CommandTimeoutError`
6. **Use session IDs**: Include unique session IDs for tracking and debugging
7. **Limit working directory scope**: Use most specific working directory possible

## Testing

Run the test suite:

```bash
npm test command-executor.test.ts
```

Tests cover:
- Security validation (whitelist, blocked patterns, path restrictions)
- Command execution (success, failure, output capture)
- Resource limits (timeouts, output size)
- Configuration management
- Environment sanitization

## Security Considerations

This sandbox provides defense-in-depth but should not be the only security layer:

1. **Container Isolation**: Run code worker in isolated containers
2. **Network Restrictions**: Limit network access at firewall level
3. **File System**: Mount `/workspace` with appropriate permissions
4. **User Permissions**: Run worker as non-privileged user
5. **Resource Quotas**: Use OS-level resource controls (cgroups)
6. **Audit Logging**: Log all command executions for security monitoring

## Future Enhancements

- [ ] CPU time limits (separate from wall-clock time)
- [ ] Network request monitoring and limiting
- [ ] File system quota enforcement
- [ ] Syscall filtering (seccomp)
- [ ] Command execution caching
- [ ] Parallel command execution
- [ ] Command dependency graph
