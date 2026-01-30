# Secrets Manager

A comprehensive secrets management abstraction that supports multiple backends with caching, audit logging, and automatic refresh capabilities.

## Features

- **Multiple Backend Support**: Environment variables, File-based (encrypted), AWS Secrets Manager, HashiCorp Vault
- **Intelligent Caching**: Redis-backed caching with configurable TTL (default 5 minutes)
- **Automatic Refresh**: Proactive secret refresh before expiry
- **Audit Logging**: Track all secret access operations
- **Secret Rotation**: Support for rotating secrets (where backend supports it)
- **Encryption**: File-based secrets are encrypted using AES-256-GCM
- **Type Safety**: Full TypeScript support with comprehensive interfaces

## Installation

The secrets manager is already integrated into the project. No additional installation needed.

## Quick Start

```typescript
import { createSecretsManager } from './services/secrets-manager';

// Create a secrets manager instance
const secretsManager = createSecretsManager({
  provider: 'file',
  secretsDir: '.secrets',
  cacheTTL: 300, // 5 minutes
  enableAuditLog: true
});

// Get a secret
const apiKey = await secretsManager.getSecret('API_KEY');

// Set a secret
await secretsManager.setSecret('NEW_SECRET', 'secret-value');

// List secrets with prefix
const apiSecrets = await secretsManager.listSecrets('API_');

// Delete a secret
await secretsManager.deleteSecret('OLD_SECRET');
```

## Supported Providers

### 1. Environment Variables (`env`)

Reads and writes secrets from `process.env`. Best for:
- Local development
- Testing
- Simple deployments

```typescript
const manager = createSecretsManager({
  provider: 'env',
  cacheTTL: 60
});
```

**Pros:**
- Simple and fast
- No external dependencies
- Works everywhere

**Cons:**
- Not persistent across process restarts
- Limited security
- No rotation support

---

### 2. File-Based (`file`)

Stores encrypted secrets in `.secrets/` directory. Best for:
- Development environments
- Small deployments
- Local secret management

```typescript
const manager = createSecretsManager({
  provider: 'file',
  secretsDir: '.secrets',
  cacheTTL: 300
});
```

**Pros:**
- Encrypted at rest (AES-256-GCM)
- Persistent storage
- No external dependencies
- Works offline

**Cons:**
- File system access required
- Manual secret rotation
- Not suitable for distributed systems

**Requirements:**
- `ENCRYPTION_SECRET` environment variable must be set (min 32 characters)

---

### 3. AWS Secrets Manager (`aws`)

Uses AWS Secrets Manager for production secret storage. Best for:
- Production environments
- AWS infrastructure
- Multi-region deployments

```typescript
const manager = createSecretsManager({
  provider: 'aws',
  awsRegion: 'us-east-1',
  awsSecretPrefix: 'nubabel/production',
  cacheTTL: 600 // Higher TTL to reduce API calls
});
```

**Pros:**
- Enterprise-grade security
- Built-in rotation support
- Audit trails
- Multi-region replication
- IAM integration

**Cons:**
- Requires AWS account
- Additional cost
- Network latency
- Currently stubbed (requires AWS SDK integration)

**TODO:** Implement AWS SDK integration

---

### 4. HashiCorp Vault (`vault`)

Uses HashiCorp Vault for secret management. Best for:
- Multi-cloud deployments
- Complex secret workflows
- Dynamic secret generation

```typescript
const manager = createSecretsManager({
  provider: 'vault',
  vaultUrl: 'https://vault.example.com',
  vaultToken: 'hvs.xxxxxxxxxxxxx',
  vaultPath: 'secret',
  cacheTTL: 300
});
```

**Pros:**
- Cloud-agnostic
- Dynamic secrets
- Advanced access control
- Lease management

**Cons:**
- Requires Vault infrastructure
- More complex setup
- Currently stubbed (requires node-vault integration)

**TODO:** Implement node-vault integration

---

## Configuration

### SecretsConfig Interface

```typescript
interface SecretsConfig {
  provider: 'env' | 'file' | 'aws' | 'vault';
  cacheTTL?: number;           // Default: 300 seconds (5 minutes)
  enableAuditLog?: boolean;    // Default: true

  // File provider options
  secretsDir?: string;         // Default: .secrets/

  // AWS provider options
  awsRegion?: string;
  awsSecretPrefix?: string;

  // Vault provider options
  vaultUrl?: string;
  vaultToken?: string;
  vaultPath?: string;          // Default: secret/
}
```

### Cache Behavior

- **In-Memory Cache**: Fast access for frequently used secrets
- **Redis Cache**: Shared cache across application instances
- **TTL-based Expiration**: Configurable cache lifetime
- **Proactive Refresh**: Secrets are refreshed at 80% of TTL
- **Automatic Invalidation**: Cache is cleared on set/delete operations

### Audit Logging

When enabled (`enableAuditLog: true`), all operations are logged:

```typescript
interface AuditLogEntry {
  timestamp: string;
  operation: 'get' | 'set' | 'delete' | 'rotate' | 'list';
  key: string;
  success: boolean;
  provider: string;
  error?: string;
}
```

Access audit logs:

```typescript
const manager = createSecretsManager(config);
const auditLog = manager.getAuditLog();
```

---

## API Reference

### `createSecretsManager(config: SecretsConfig): SecretsManager`

Factory function to create a secrets manager instance.

### `getSecret(key: string): Promise<string | null>`

Retrieve a secret by key. Returns `null` if not found.

```typescript
const apiKey = await manager.getSecret('API_KEY');
```

### `setSecret(key: string, value: string): Promise<void>`

Store a secret.

```typescript
await manager.setSecret('DATABASE_PASSWORD', 'super-secret');
```

### `deleteSecret(key: string): Promise<void>`

Delete a secret.

```typescript
await manager.deleteSecret('OLD_SECRET');
```

### `listSecrets(prefix?: string): Promise<string[]>`

List all secret keys, optionally filtered by prefix.

```typescript
const dbSecrets = await manager.listSecrets('DB_');
// Returns: ['DB_PASSWORD', 'DB_USERNAME', 'DB_HOST']
```

### `rotateSecret(key: string): Promise<string>`

Rotate a secret (generates new value). Only supported by certain providers (AWS, Vault).

```typescript
const newSecret = await manager.rotateSecret('database-password');
```

---

## Best Practices

### 1. Environment-Based Configuration

```typescript
function createSecretManager() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    return createSecretsManager({
      provider: 'aws',
      awsRegion: process.env.AWS_REGION || 'us-east-1',
      cacheTTL: 600,
      enableAuditLog: true
    });
  } else {
    return createSecretsManager({
      provider: 'file',
      secretsDir: '.secrets',
      cacheTTL: 60,
      enableAuditLog: false
    });
  }
}
```

### 2. Singleton Pattern

```typescript
class SecretsService {
  private static instance: SecretsManager;

  static getInstance(): SecretsManager {
    if (!SecretsService.instance) {
      SecretsService.instance = createSecretManager();
    }
    return SecretsService.instance;
  }
}

// Usage
const secrets = SecretsService.getInstance();
const token = await secrets.getSecret('API_TOKEN');
```

### 3. Secret Naming Conventions

Use prefixes to organize secrets:

- `DB_*` - Database credentials
- `API_*` - API keys and tokens
- `OAUTH_*` - OAuth credentials
- `SMTP_*` - Email service credentials

### 4. Cache TTL Guidelines

- **Production (AWS/Vault)**: 600s (10 min) - Reduce API calls
- **Development (File)**: 60s (1 min) - Faster updates
- **Testing (Env)**: 0s - No caching for predictable tests

### 5. Security Considerations

- **Never log secret values**: Only log keys and operation status
- **Set ENCRYPTION_SECRET**: Required for file-based provider
- **Use IAM roles**: For AWS provider, use IAM roles instead of hardcoded credentials
- **Rotate regularly**: Use rotation support where available
- **Audit logs**: Enable in production for compliance

---

## Migration Guide

### From Environment Variables

```typescript
// Before
const apiKey = process.env.API_KEY;

// After
const secrets = createSecretsManager({ provider: 'env' });
const apiKey = await secrets.getSecret('API_KEY');
```

### From Hardcoded Secrets

```typescript
// Before
const dbPassword = 'hardcoded-password'; // 🚨 Dangerous!

// After
const secrets = createSecretsManager({ provider: 'file' });
await secrets.setSecret('DB_PASSWORD', 'secure-password');
const dbPassword = await secrets.getSecret('DB_PASSWORD');
```

---

## Testing

See `secrets-manager.test.ts` for comprehensive test examples.

```bash
npm test -- secrets-manager
```

---

## Examples

See `secrets-manager.example.ts` for complete usage examples:

- Environment variables provider
- File-based provider
- AWS Secrets Manager (stubbed)
- HashiCorp Vault (stubbed)
- Multi-environment setup
- Secret rotation
- Caching performance
- Singleton pattern

---

## Troubleshooting

### Error: "ENCRYPTION_SECRET environment variable is required"

**Solution**: Set the `ENCRYPTION_SECRET` environment variable (minimum 32 characters).

```bash
export ENCRYPTION_SECRET="your-very-long-secret-key-at-least-32-chars"
```

### Error: "Secret rotation not supported"

**Solution**: Only AWS and Vault providers support rotation. Use `setSecret()` to manually update secrets for other providers.

### Cache not invalidating

**Solution**: Use `clearCache()` to manually clear all cached secrets:

```typescript
await manager.clearCache();
```

### AWS/Vault provider not working

**Solution**: These providers are currently stubbed. Integration requires:
- AWS Provider: Install `@aws-sdk/client-secrets-manager`
- Vault Provider: Install `node-vault`

---

## Future Enhancements

- [ ] Complete AWS SDK integration
- [ ] Complete HashiCorp Vault integration
- [ ] Add Google Cloud Secret Manager support
- [ ] Add Azure Key Vault support
- [ ] Secret versioning support
- [ ] Secret expiration enforcement
- [ ] Webhook notifications for rotation
- [ ] Secret validation schemas

---

## License

MIT
