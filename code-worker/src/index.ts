/**
 * Code Worker Entry Point
 *
 * Main service for autonomous code operations:
 * - Listens to BullMQ code-operation queue
 * - Executes code changes via AI
 * - Manages file locks and branch coordination
 * - Scans for secrets before commit
 * - Creates PRs with agent attribution
 */

import { Worker, Job } from 'bullmq';
import express from 'express';
import Redis from 'ioredis';
import { acquireFileLock, releaseAllLocks } from './concurrency/file-lock';
import { registerBranch, updateBranchStatus } from './concurrency/branch-coordinator';
import { scanFiles } from './security/secrets-scanner';
import { createGitToolsWithAutoConfig } from './tools/git';
import { CodeExecutor, ExecutionContext } from './ai-executor';

// ============================================================================
// Types
// ============================================================================

interface ErrorContext {
  errorMessage: string;
  stackTrace?: string;
  affectedFiles?: string[];
}

interface FeatureContext {
  requirements: string;
  acceptanceCriteria: string[];
  testStrategy?: string;
}

interface Repository {
  url: string;
  owner: string;
  name: string;
  branch: string;
}

interface CodeOperationJob {
  operationType: 'error_fix' | 'feature_implementation' | 'refactor' | 'test';
  description: string;
  repository: Repository;
  targetFiles?: string[];
  errorContext?: ErrorContext;
  featureContext?: FeatureContext;
  organizationId: string;
  sessionId: string;
  approvalRequired: boolean;
  maxIterations?: number;
}

interface CodeOperationResult {
  success: boolean;
  operationId: string;
  branch: string;
  commits: Array<{ sha: string; message: string }>;
  pr?: {
    number: number;
    url: string;
    title: string;
  };
  filesModified: string[];
  iterations: number;
  duration: number;
  error?: string;
}

// ============================================================================
// Configuration
// ============================================================================

const PORT = process.env.PORT || 3001;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '2', 10);
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/workspace/repos';

// ============================================================================
// Redis Connection
// ============================================================================

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('error', (error) => {
  console.error('[CodeWorker] Redis connection error:', error);
});

redis.on('connect', () => {
  console.log('[CodeWorker] Redis connected');
});

// ============================================================================
// Express Server
// ============================================================================

const app = express();
app.use(express.json());

// Track active jobs
const activeJobs = new Map<string, { startedAt: Date; operation: string }>();
let completedCount = 0;
let failedCount = 0;

// Health endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    redis: redis.status,
  });
});

// Status endpoint
app.get('/status', async (_req, res) => {
  res.json({
    status: 'running',
    activeJobs: activeJobs.size,
    completedJobs: completedCount,
    failedJobs: failedCount,
    uptime: process.uptime(),
    redis: redis.status,
  });
});

// Metrics endpoint
app.get('/metrics', async (_req, res) => {
  const activeJobsList = Array.from(activeJobs.entries()).map(([id, data]) => ({
    id,
    operation: data.operation,
    duration: Date.now() - data.startedAt.getTime(),
  }));

  res.json({
    active: activeJobsList,
    completed: completedCount,
    failed: failedCount,
    concurrency: WORKER_CONCURRENCY,
  });
});

// ============================================================================
// AI Executor - Using full implementation from ai-executor.ts
// ============================================================================

// CodeExecutor is imported from ./ai-executor at the top of the file.
// It provides full Anthropic SDK integration with tool calling for:
// - File read/write operations
// - Git operations (status, diff, add, commit)
// - Test running (typecheck, tests, lint)
// - Iterative refinement loop with max iterations

// ============================================================================
// Code Operation Worker
// ============================================================================

const worker = new Worker<CodeOperationJob, CodeOperationResult>(
  'code-operation',
  async (job: Job<CodeOperationJob>) => {
    const {
      operationType,
      description,
      repository,
      targetFiles,
      errorContext,
      featureContext,
      organizationId: _organizationId,
      sessionId,
      approvalRequired,
      maxIterations = 5,
    } = job.data;

    const operationId = job.id!;
    activeJobs.set(operationId, {
      startedAt: new Date(),
      operation: operationType
    });

    console.log(`[CodeWorker] Starting ${operationType}: ${description}`);
    console.log(`[CodeWorker] Job ID: ${operationId}`);
    console.log(`[CodeWorker] Repository: ${repository.owner}/${repository.name}`);

    try {
      // 1. Setup workspace directory
      const workDir = `${WORKSPACE_ROOT}/${repository.owner}/${repository.name}`;
      console.log(`[CodeWorker] Working directory: ${workDir}`);

      // 2. Clone repository
      console.log(`[CodeWorker] Cloning repository...`);
      const git = await createGitToolsWithAutoConfig(
        workDir,
        process.env.GITHUB_TOKEN,
        'code-worker'
      );

      await git.clone(repository.url, workDir);
      console.log(`[CodeWorker] Repository cloned successfully`);

      // 3. Create branch
      const branchName = `agent/${operationId.slice(0, 8)}-${operationType}`;
      console.log(`[CodeWorker] Creating branch: ${branchName}`);
      await git.createBranch(branchName, repository.branch);
      await git.checkout(branchName);

      // 4. Register branch for coordination
      console.log(`[CodeWorker] Registering branch for coordination`);
      await registerBranch(redis, {
        operationId,
        branchName,
        baseBranch: repository.branch,
        status: 'active',
        conflictsWith: [],
        createdAt: new Date(),
      });

      // 5. Acquire file locks if target files specified
      if (targetFiles?.length) {
        console.log(`[CodeWorker] Acquiring file locks for ${targetFiles.length} files`);
        const lockResult = await acquireFileLock(
          redis,
          operationId,
          'code-worker',
          targetFiles
        );

        if (!lockResult.success) {
          throw new Error(
            `Files locked by another operation: ${lockResult.conflicts?.join(', ')}`
          );
        }
        console.log(`[CodeWorker] File locks acquired successfully`);
      }

      // 6. Execute AI code operation
      console.log(`[CodeWorker] Starting AI execution`);
      const executor = new CodeExecutor({
        workingDirectory: workDir,
        sessionId,
        operationId,
        agentId: 'code-worker',
        maxIterations,
        githubToken: process.env.GITHUB_TOKEN,
      });

      // Build context string for executor
      const contextParts: string[] = [];
      if (errorContext) {
        contextParts.push(`Error to fix: ${errorContext.errorMessage}`);
        if (errorContext.stackTrace) {
          contextParts.push(`Stack trace:\n${errorContext.stackTrace}`);
        }
        if (errorContext.affectedFiles?.length) {
          contextParts.push(`Affected files:\n${errorContext.affectedFiles.join('\n')}`);
        }
      }
      if (featureContext) {
        contextParts.push(`Requirements: ${featureContext.requirements}`);
        contextParts.push(`Acceptance Criteria:\n${featureContext.acceptanceCriteria.join('\n')}`);
        if (featureContext.testStrategy) {
          contextParts.push(`Test Strategy: ${featureContext.testStrategy}`);
        }
      }

      // Build execution context
      const executionContext: ExecutionContext = {
        errorMessage: errorContext?.errorMessage,
        requirements: featureContext?.requirements,
        additionalContext: contextParts.join('\n\n'),
      };

      const result = await executor.execute(description, executionContext);

      if (!result.success) {
        throw new Error(result.error || 'AI execution failed');
      }

      console.log(`[CodeWorker] AI execution completed successfully`);
      console.log(`[CodeWorker] Files modified: ${result.filesModified.length}`);
      console.log(`[CodeWorker] Iterations: ${result.iterations}`);

      // 7. Pre-commit secret scan
      console.log(`[CodeWorker] Running secret scan`);
      const scanResult = await scanFiles(result.filesModified);

      if (!scanResult.passed) {
        const criticalSecrets = scanResult.findings
          .filter(f => f.severity === 'critical')
          .map(f => `${f.pattern} at ${f.file}:${f.line}`)
          .join(', ');

        throw new Error(
          `Secrets detected - commit blocked: ${criticalSecrets}`
        );
      }
      console.log(`[CodeWorker] Secret scan passed`);

      // 8. Push branch
      console.log(`[CodeWorker] Pushing branch to remote`);
      await git.push(branchName);

      // 9. Create PR if approval required
      let pr = undefined;
      if (approvalRequired) {
        console.log(`[CodeWorker] Creating pull request`);
        const prBody = [
          `## Summary`,
          result.summary,
          ``,
          `## Changes`,
          result.filesModified.map(f => `- ${f}`).join('\n'),
          ``,
          `## Context`,
          ...contextParts,
          ``,
          `---`,
          `🤖 Generated by Nubabel Code Agent`,
          `Operation ID: ${operationId}`,
          `Iterations: ${result.iterations}`,
        ].join('\n');

        pr = await git.createPR(
          `[Agent] ${description}`,
          prBody,
          repository.branch,
          branchName
        );

        console.log(`[CodeWorker] PR created: ${pr.url}`);
      }

      // 10. Update branch status
      await updateBranchStatus(
        redis,
        branchName,
        approvalRequired ? 'active' : 'merged'
      );

      // 11. Cleanup locks
      console.log(`[CodeWorker] Releasing file locks`);
      await releaseAllLocks(redis, operationId);

      // 12. Record metrics
      const duration = Date.now() - activeJobs.get(operationId)!.startedAt.getTime();
      completedCount++;
      activeJobs.delete(operationId);

      console.log(`[CodeWorker] Operation completed successfully in ${duration}ms`);

      return {
        success: true,
        operationId,
        branch: branchName,
        commits: result.commits,
        pr,
        filesModified: result.filesModified,
        iterations: result.iterations,
        duration,
      };

    } catch (error) {
      // Cleanup on error
      console.error(`[CodeWorker] Operation failed:`, error);

      await releaseAllLocks(redis, operationId);
      activeJobs.delete(operationId);
      failedCount++;

      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        operationId,
        branch: '',
        commits: [],
        filesModified: [],
        iterations: 0,
        duration: Date.now() - (activeJobs.get(operationId)?.startedAt.getTime() ?? Date.now()),
        error: errorMessage,
      };
    }
  },
  {
    connection: redis,
    concurrency: WORKER_CONCURRENCY,
    autorun: true,
  }
);

// ============================================================================
// Worker Event Handlers
// ============================================================================

worker.on('completed', (job, result) => {
  console.log(`[CodeWorker] ✓ Job ${job.id} completed`);
  if (result.success) {
    console.log(`[CodeWorker]   Branch: ${result.branch}`);
    console.log(`[CodeWorker]   Commits: ${result.commits.length}`);
    console.log(`[CodeWorker]   Duration: ${result.duration}ms`);
    if (result.pr) {
      console.log(`[CodeWorker]   PR: ${result.pr.url}`);
    }
  } else {
    console.log(`[CodeWorker]   Error: ${result.error}`);
  }
});

worker.on('failed', (job, error) => {
  console.error(`[CodeWorker] ✗ Job ${job?.id} failed:`, error.message);
  if (error.stack) {
    console.error(`[CodeWorker]   Stack: ${error.stack}`);
  }
});

worker.on('error', (error) => {
  console.error('[CodeWorker] Worker error:', error);
});

worker.on('active', (job) => {
  console.log(`[CodeWorker] → Job ${job.id} active: ${job.data.operationType}`);
});

worker.on('stalled', (jobId) => {
  console.warn(`[CodeWorker] ⚠ Job ${jobId} stalled`);
});

// ============================================================================
// Server Startup
// ============================================================================

const server = app.listen(PORT, () => {
  console.log('='.repeat(70));
  console.log('[CodeWorker] Service started');
  console.log(`[CodeWorker] Port: ${PORT}`);
  console.log(`[CodeWorker] Redis: ${REDIS_URL}`);
  console.log(`[CodeWorker] Concurrency: ${WORKER_CONCURRENCY}`);
  console.log(`[CodeWorker] Workspace: ${WORKSPACE_ROOT}`);
  console.log('='.repeat(70));
  console.log('[CodeWorker] Ready to process code operations...');
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

const shutdown = async (signal: string) => {
  console.log(`\n[CodeWorker] Received ${signal}, shutting down gracefully...`);

  // Stop accepting new jobs
  console.log('[CodeWorker] Pausing worker...');
  await worker.pause();

  // Wait for active jobs to complete (with timeout)
  const shutdownTimeout = 30000; // 30 seconds
  const startTime = Date.now();

  while (activeJobs.size > 0 && Date.now() - startTime < shutdownTimeout) {
    console.log(`[CodeWorker] Waiting for ${activeJobs.size} active jobs to complete...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (activeJobs.size > 0) {
    console.warn(`[CodeWorker] Timeout reached, ${activeJobs.size} jobs still active`);
  }

  // Close worker
  console.log('[CodeWorker] Closing worker...');
  await worker.close();

  // Close Redis
  console.log('[CodeWorker] Closing Redis connection...');
  await redis.quit();

  // Close server
  console.log('[CodeWorker] Closing HTTP server...');
  server.close(() => {
    console.log('[CodeWorker] Shutdown complete');
    process.exit(0);
  });

  // Force exit after 5 seconds
  setTimeout(() => {
    console.error('[CodeWorker] Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[CodeWorker] Uncaught exception:', error);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CodeWorker] Unhandled rejection at:', promise, 'reason:', reason);
  shutdown('unhandledRejection');
});

// ============================================================================
// Exports (for testing)
// ============================================================================

export {
  CodeExecutor,
  worker,
  app,
  redis,
};
