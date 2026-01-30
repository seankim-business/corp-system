# Code Worker Setup Learnings

## Code Worker Entry Point Implementation

**File**: `code-worker/src/index.ts`

### Architecture Highlights

1. **Express Server** (Port 3001)
   - Health endpoint: `/health` - Service health check
   - Status endpoint: `/status` - Active jobs metrics
   - Metrics endpoint: `/metrics` - Detailed job statistics

2. **BullMQ Worker**
   - Queue: `code-operation`
   - Concurrency: Configurable (default 2)
   - Job types: error_fix, feature_implementation, refactor, test

3. **Operation Flow**
   - Clone repository → Create branch → Register branch
   - Acquire file locks → Execute AI → Secret scan
   - Push branch → Create PR (if approval required) → Cleanup

4. **File Lock Integration**
   - Acquires locks before modification
   - Automatic release on completion/error
   - Prevents concurrent modification conflicts

5. **Branch Coordination**
   - Registers branch with Redis
   - Tracks operation status (active/merging/merged)
   - Updates status through lifecycle

6. **Security**
   - Pre-commit secret scanning
   - Blocks commits with critical secrets
   - Workspace restriction to `/workspace/repos/`

7. **Graceful Shutdown**
   - Pauses worker on SIGTERM/SIGINT
   - Waits for active jobs (30s timeout)
   - Cleanup: worker → redis → server

### Job Data Structure

```typescript
interface CodeOperationJob {
  operationType: 'error_fix' | 'feature_implementation' | 'refactor' | 'test';
  description: string;
  repository: { url, owner, name, branch };
  targetFiles?: string[];
  errorContext?: { errorMessage, stackTrace, affectedFiles };
  featureContext?: { requirements, acceptanceCriteria, testStrategy };
  organizationId: string;
  sessionId: string;
  approvalRequired: boolean;
  maxIterations?: number;
}
```

### Result Structure

```typescript
interface CodeOperationResult {
  success: boolean;
  operationId: string;
  branch: string;
  commits: string[];
  pr?: { number, url, title };
  filesModified: string[];
  iterations: number;
  duration: number;
  error?: string;
}
```

### TODO: CodeExecutor Implementation

The `CodeExecutor` class is currently a stub. Full implementation needs:
- Anthropic SDK integration with tool calling
- File read/write tools
- Test runner integration
- Iterative refinement loop (up to maxIterations)
- Success verification logic

### Environment Variables

- `PORT`: HTTP server port (default: 3001)
- `REDIS_URL`: Redis connection string
- `WORKER_CONCURRENCY`: Max concurrent operations (default: 2)
- `WORKSPACE_ROOT`: Repository workspace root (default: /workspace/repos)
- `GITHUB_TOKEN`: GitHub API token for PR creation

### Monitoring

The service provides comprehensive logging:
- Job lifecycle events (active, completed, failed, stalled)
- Operation details (branch, commits, duration, PR)
- Error stack traces
- Active job tracking

### Error Handling

- Automatic cleanup on failure (locks, branch status)
- Detailed error messages in results
- Failed job counter for metrics
- Graceful degradation on timeout
