import Redis from 'ioredis';

export interface BranchOperation {
  operationId: string;
  branchName: string;
  baseBranch: string;
  status: 'active' | 'merging' | 'merged' | 'abandoned';
  conflictsWith: string[];
  createdAt: Date;
}

export interface MergeLockResult {
  success: boolean;
  waitingOn?: string;
}

const BRANCH_PREFIX = 'nubabel:branch:';
const MERGE_LOCK_KEY = 'nubabel:merge-lock';
const MERGE_LOCK_TTL = 5 * 60; // 5 minutes

/**
 * Register a new branch operation.
 */
export async function registerBranch(
  redis: Redis,
  operation: BranchOperation
): Promise<void> {
  const key = getBranchKey(operation.branchName);
  const data = {
    ...operation,
    createdAt: operation.createdAt.toISOString()
  };

  await redis.set(key, JSON.stringify(data));
}

/**
 * Request exclusive merge lock for a branch.
 * Only one branch can hold the merge lock at a time to prevent conflicts.
 */
export async function requestMergeLock(
  redis: Redis,
  branchName: string
): Promise<MergeLockResult> {
  // Try to acquire lock with SET NX (set if not exists)
  const acquired = await redis.set(
    MERGE_LOCK_KEY,
    branchName,
    'EX',
    MERGE_LOCK_TTL,
    'NX'
  );

  if (acquired === 'OK') {
    return { success: true };
  }

  // Lock is held by another branch
  const holder = await redis.get(MERGE_LOCK_KEY);
  return {
    success: false,
    waitingOn: holder || undefined
  };
}

/**
 * Release merge lock if held by this branch.
 */
export async function releaseMergeLock(
  redis: Redis,
  branchName: string
): Promise<void> {
  const holder = await redis.get(MERGE_LOCK_KEY);

  // Only release if we hold the lock
  if (holder === branchName) {
    await redis.del(MERGE_LOCK_KEY);
  }
}

/**
 * Get all active branch operations.
 */
export async function getActiveBranches(
  redis: Redis
): Promise<BranchOperation[]> {
  const pattern = `${BRANCH_PREFIX}*`;
  const keys = await scanKeys(redis, pattern);
  const branches: BranchOperation[] = [];

  for (const key of keys) {
    const data = await redis.get(key);
    if (data) {
      try {
        const branch = JSON.parse(data);
        branch.createdAt = new Date(branch.createdAt);

        // Only include active and merging branches
        if (branch.status === 'active' || branch.status === 'merging') {
          branches.push(branch);
        }
      } catch (error) {
        // Skip malformed data
        console.warn(`Malformed branch data at ${key}:`, error);
      }
    }
  }

  return branches;
}

/**
 * Update branch operation status.
 */
export async function updateBranchStatus(
  redis: Redis,
  branchName: string,
  status: BranchOperation['status']
): Promise<void> {
  const key = getBranchKey(branchName);
  const data = await redis.get(key);

  if (!data) {
    throw new Error(`Branch operation not found: ${branchName}`);
  }

  try {
    const branch = JSON.parse(data);
    branch.status = status;

    // If merged or abandoned, set expiration for cleanup
    if (status === 'merged' || status === 'abandoned') {
      await redis.set(key, JSON.stringify(branch), 'EX', 3600); // 1 hour TTL
    } else {
      await redis.set(key, JSON.stringify(branch));
    }
  } catch (error) {
    throw new Error(`Failed to update branch status: ${error}`);
  }
}

/**
 * Check for potential conflicts with other active branches.
 */
export async function checkBranchConflicts(
  redis: Redis,
  branchName: string,
  _targetFiles: string[]
): Promise<string[]> {
  const activeBranches = await getActiveBranches(redis);
  const conflicts: string[] = [];

  for (const branch of activeBranches) {
    if (branch.branchName === branchName) {
      continue; // Skip self
    }

    // Check if any files overlap
    // Note: This is a simplified check. Real implementation would need
    // to track files per branch operation.
    if (branch.baseBranch === branchName || branchName.startsWith(branch.baseBranch)) {
      conflicts.push(branch.branchName);
    }
  }

  return conflicts;
}

/**
 * Record conflicts for a branch operation.
 */
export async function recordBranchConflicts(
  redis: Redis,
  branchName: string,
  conflictsWith: string[]
): Promise<void> {
  const key = getBranchKey(branchName);
  const data = await redis.get(key);

  if (!data) {
    throw new Error(`Branch operation not found: ${branchName}`);
  }

  try {
    const branch = JSON.parse(data);
    branch.conflictsWith = conflictsWith;
    await redis.set(key, JSON.stringify(branch));
  } catch (error) {
    throw new Error(`Failed to record conflicts: ${error}`);
  }
}

/**
 * Get branch operation details.
 */
export async function getBranchOperation(
  redis: Redis,
  branchName: string
): Promise<BranchOperation | null> {
  const key = getBranchKey(branchName);
  const data = await redis.get(key);

  if (!data) {
    return null;
  }

  try {
    const branch = JSON.parse(data);
    branch.createdAt = new Date(branch.createdAt);
    return branch;
  } catch (error) {
    console.warn(`Malformed branch data for ${branchName}:`, error);
    return null;
  }
}

/**
 * Clean up completed branch operations older than specified hours.
 */
export async function cleanupOldBranches(
  redis: Redis,
  olderThanHours: number = 24
): Promise<number> {
  const pattern = `${BRANCH_PREFIX}*`;
  const keys = await scanKeys(redis, pattern);
  const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

  let deletedCount = 0;
  const pipeline = redis.pipeline();

  for (const key of keys) {
    const data = await redis.get(key);
    if (data) {
      try {
        const branch = JSON.parse(data);
        const createdAt = new Date(branch.createdAt);

        // Delete if merged/abandoned and old enough
        if (
          (branch.status === 'merged' || branch.status === 'abandoned') &&
          createdAt < cutoffTime
        ) {
          pipeline.del(key);
          deletedCount++;
        }
      } catch (error) {
        // Delete malformed data
        pipeline.del(key);
        deletedCount++;
      }
    }
  }

  if (deletedCount > 0) {
    await pipeline.exec();
  }

  return deletedCount;
}

/**
 * Check who currently holds the merge lock.
 */
export async function getMergeLockHolder(redis: Redis): Promise<string | null> {
  return await redis.get(MERGE_LOCK_KEY);
}

/**
 * Force release merge lock (admin/emergency use).
 */
export async function forceReleaseMergeLock(redis: Redis): Promise<void> {
  await redis.del(MERGE_LOCK_KEY);
}

// Helper functions

function getBranchKey(branchName: string): string {
  return `${BRANCH_PREFIX}${branchName}`;
}

async function scanKeys(redis: Redis, pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';

  do {
    const [nextCursor, batch] = await redis.scan(
      cursor,
      'MATCH',
      pattern,
      'COUNT',
      100
    );
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== '0');

  return keys;
}
