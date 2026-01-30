# Railway Deployment Service

Programmatic interface to Railway's GraphQL API for deployment automation.

## Features

- ✅ Trigger deployments programmatically
- ✅ Monitor deployment status in real-time
- ✅ Wait for deployment completion with timeout
- ✅ Fetch deployment logs
- ✅ Rollback to previous deployments
- ✅ Get project and service information
- ✅ List recent deployments

## Configuration

Set the following environment variables in `.env`:

```bash
# Railway API Token (get from: railway whoami --token)
RAILWAY_API_TOKEN="your-api-token-here"

# Project and Service IDs (get from: railway status --json)
RAILWAY_PROJECT_ID="your-project-id"
RAILWAY_SERVICE_ID="your-service-id"
RAILWAY_ENVIRONMENT_ID="production"  # optional, defaults to "production"
```

### Getting Your Railway Credentials

1. **API Token:**
   ```bash
   railway whoami --token
   ```

2. **Project and Service IDs:**
   ```bash
   railway status --json
   ```

## Usage

### Basic Deployment

```typescript
import { railwayDeploy } from './services/railway-deploy';

// Check if configured
if (!railwayDeploy.isConfigured()) {
  console.error('Railway API not configured');
  process.exit(1);
}

// Trigger deployment
const result = await railwayDeploy.triggerDeployment();

if (result.success) {
  console.log(`Deployment started: ${result.deploymentId}`);
  console.log(`Status: ${result.status}`);
} else {
  console.error(`Deployment failed: ${result.error}`);
}
```

### Wait for Deployment Completion

```typescript
// Trigger and wait for completion (max 5 minutes)
const result = await railwayDeploy.triggerDeployment();

if (result.success) {
  console.log('Waiting for deployment...');

  const completed = await railwayDeploy.waitForDeployment(
    result.deploymentId,
    300000  // 5 minutes timeout
  );

  if (completed.success) {
    console.log('✅ Deployment successful!');
  } else {
    console.error(`❌ Deployment failed: ${completed.error}`);

    // Get logs for debugging
    const logs = await railwayDeploy.getDeploymentLogs(result.deploymentId);
    console.error('Deployment logs:', logs);
  }
}
```

### Monitor Recent Deployments

```typescript
const recentDeployments = await railwayDeploy.getRecentDeployments(10);

console.log('Recent deployments:');
recentDeployments.forEach(deployment => {
  console.log(`
    ID: ${deployment.id}
    Status: ${deployment.status}
    Started: ${deployment.startedAt}
    Commit: ${deployment.commitMessage} (${deployment.commitSha})
  `);
});
```

### Check Deployment Status

```typescript
const status = await railwayDeploy.getDeploymentStatus(deploymentId);

console.log(`Status: ${status.status}`);
console.log(`Started: ${status.startedAt}`);

if (status.completedAt) {
  console.log(`Completed: ${status.completedAt}`);
}

if (status.error) {
  console.error(`Error: ${status.error}`);
}
```

### Get Deployment Logs

```typescript
const logs = await railwayDeploy.getDeploymentLogs(deploymentId);
console.log(logs);
```

### Rollback to Previous Deployment

```typescript
// Find a successful deployment to rollback to
const recent = await railwayDeploy.getRecentDeployments(10);
const lastSuccessful = recent.find(d => d.status === 'success');

if (lastSuccessful) {
  const rollback = await railwayDeploy.rollback(lastSuccessful.id);

  if (rollback.success) {
    console.log(`Rolled back to deployment ${lastSuccessful.id}`);
    console.log(`New deployment ID: ${rollback.deploymentId}`);

    // Wait for rollback to complete
    await railwayDeploy.waitForDeployment(rollback.deploymentId);
  } else {
    console.error(`Rollback failed: ${rollback.error}`);
  }
}
```

### Get Project Information

```typescript
const projectInfo = await railwayDeploy.getProjectInfo();

if (projectInfo) {
  console.log(`Project: ${projectInfo.name} (${projectInfo.id})`);
  console.log('Services:');
  projectInfo.services.forEach(service => {
    console.log(`  - ${service.name} (${service.id})`);
  });
}
```

## Integration Examples

### Slack Bot Integration

```typescript
import { railwayDeploy } from './services/railway-deploy';
import { slackClient } from './services/slack-service';

async function handleDeployCommand(channel: string) {
  await slackClient.postMessage(channel, '🚀 Starting deployment...');

  const result = await railwayDeploy.triggerDeployment();

  if (!result.success) {
    await slackClient.postMessage(channel, `❌ Failed to start deployment: ${result.error}`);
    return;
  }

  await slackClient.postMessage(
    channel,
    `✅ Deployment started: ${result.deploymentId}\nWaiting for completion...`
  );

  const completed = await railwayDeploy.waitForDeployment(result.deploymentId);

  if (completed.success) {
    await slackClient.postMessage(channel, '✅ Deployment successful!');
  } else {
    const logs = await railwayDeploy.getDeploymentLogs(result.deploymentId);
    await slackClient.postMessage(
      channel,
      `❌ Deployment failed: ${completed.error}\n\`\`\`\n${logs.slice(-1000)}\n\`\`\``
    );
  }
}
```

### CI/CD Pipeline Integration

```typescript
import { railwayDeploy } from './services/railway-deploy';

async function deployToProduction() {
  console.log('🚀 Deploying to production...');

  // Trigger deployment
  const result = await railwayDeploy.triggerDeployment();

  if (!result.success) {
    console.error('Failed to trigger deployment:', result.error);
    process.exit(1);
  }

  console.log(`Deployment ID: ${result.deploymentId}`);

  // Wait for completion (10 minute timeout)
  const completed = await railwayDeploy.waitForDeployment(
    result.deploymentId,
    600000
  );

  if (completed.success) {
    console.log('✅ Deployment successful');
    process.exit(0);
  } else {
    console.error('❌ Deployment failed:', completed.error);

    // Get logs
    const logs = await railwayDeploy.getDeploymentLogs(result.deploymentId);
    console.error('Logs:', logs);

    process.exit(1);
  }
}

deployToProduction();
```

### Health Check with Auto-Rollback

```typescript
import { railwayDeploy } from './services/railway-deploy';

async function deployWithHealthCheck(healthCheckUrl: string) {
  // Get current successful deployment for rollback
  const recent = await railwayDeploy.getRecentDeployments(10);
  const lastSuccessful = recent.find(d => d.status === 'success');

  // Deploy
  const result = await railwayDeploy.triggerDeployment();
  if (!result.success) {
    throw new Error(`Deployment failed: ${result.error}`);
  }

  // Wait for completion
  const completed = await railwayDeploy.waitForDeployment(result.deploymentId);
  if (!completed.success) {
    throw new Error(`Deployment failed: ${completed.error}`);
  }

  // Health check
  console.log('Running health check...');
  await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s for app startup

  const healthCheck = await fetch(healthCheckUrl);

  if (!healthCheck.ok) {
    console.error('❌ Health check failed! Rolling back...');

    if (lastSuccessful) {
      const rollback = await railwayDeploy.rollback(lastSuccessful.id);
      await railwayDeploy.waitForDeployment(rollback.deploymentId);
      console.log('✅ Rolled back to previous version');
    }

    throw new Error('Health check failed');
  }

  console.log('✅ Health check passed');
}
```

## API Reference

### Class: `RailwayDeployService`

#### Methods

##### `isConfigured(): boolean`

Check if Railway API credentials are configured.

**Returns:** `true` if both API token and project ID are set.

##### `triggerDeployment(commitSha?: string): Promise<DeploymentResult>`

Trigger a new deployment.

**Parameters:**
- `commitSha` (optional): Specific commit to deploy. If not provided, deploys latest.

**Returns:** Deployment result with status and deployment ID.

##### `getDeploymentStatus(deploymentId: string): Promise<DeploymentStatus>`

Get the current status of a deployment.

**Parameters:**
- `deploymentId`: The deployment ID to check.

**Returns:** Current deployment status with timestamps and commit info.

##### `waitForDeployment(deploymentId: string, timeoutMs?: number): Promise<DeploymentResult>`

Wait for a deployment to complete (success or failure).

**Parameters:**
- `deploymentId`: The deployment ID to wait for.
- `timeoutMs`: Maximum time to wait in milliseconds (default: 300000 = 5 minutes).

**Returns:** Final deployment result.

##### `getRecentDeployments(limit?: number): Promise<DeploymentStatus[]>`

Get a list of recent deployments.

**Parameters:**
- `limit`: Number of deployments to fetch (default: 10).

**Returns:** Array of deployment statuses.

##### `rollback(deploymentId: string): Promise<RollbackResult>`

Rollback to a previous successful deployment.

**Parameters:**
- `deploymentId`: The deployment ID to rollback to.

**Returns:** Rollback result with new deployment ID.

##### `getDeploymentLogs(deploymentId: string): Promise<string>`

Fetch logs for a specific deployment.

**Parameters:**
- `deploymentId`: The deployment ID.

**Returns:** Deployment logs as a string.

##### `getProjectInfo(): Promise<ProjectInfo | null>`

Get information about the configured Railway project.

**Returns:** Project name, ID, and list of services.

### Interfaces

#### `DeploymentStatus`

```typescript
interface DeploymentStatus {
  id: string;
  status: 'building' | 'deploying' | 'success' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  commitSha?: string;
  commitMessage?: string;
  error?: string;
}
```

#### `DeploymentResult`

```typescript
interface DeploymentResult {
  success: boolean;
  deploymentId: string;
  status: DeploymentStatus['status'];
  url?: string;
  logs?: string;
  error?: string;
}
```

#### `RollbackResult`

```typescript
interface RollbackResult {
  success: boolean;
  deploymentId: string;
  rolledBackTo: string;
  error?: string;
}
```

## Error Handling

All methods handle errors gracefully and return appropriate error messages:

```typescript
const result = await railwayDeploy.triggerDeployment();

if (!result.success) {
  // Handle error
  console.error('Deployment failed:', result.error);

  // Common errors:
  // - "Railway API not configured"
  // - "Railway API returned 401: Unauthorized" (invalid token)
  // - "Railway API returned 404: Not Found" (invalid project/service ID)
  // - "GraphQL errors: ..." (API-specific errors)
}
```

## Related Services

- **`railway-monitor`**: CLI-based Railway monitoring service (uses `railway` CLI)
- **`slack-status-updater`**: Can integrate with this service for deployment notifications

## Notes

- All timestamps are returned as JavaScript `Date` objects
- The service uses Railway's GraphQL API v2
- API endpoint: `https://backboard.railway.app/graphql/v2`
- Requires Railway API token (same as CLI token)
- Deployment status is polled every 5 seconds when using `waitForDeployment`

## Troubleshooting

### "Railway API not configured"

Make sure you've set:
- `RAILWAY_API_TOKEN` or `RAILWAY_TOKEN`
- `RAILWAY_PROJECT_ID`

### "Railway API returned 401: Unauthorized"

Your API token is invalid or expired. Generate a new one:
```bash
railway whoami --token
```

### "Railway API returned 404: Not Found"

Your project ID or service ID is incorrect. Check with:
```bash
railway status --json
```

### Deployment timeout

If deployments consistently timeout:
1. Check Railway dashboard for deployment progress
2. Increase timeout value in `waitForDeployment()`
3. Check deployment logs for errors

## License

Proprietary - Kyndof Corp
