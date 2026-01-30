import Redis from 'ioredis';

export interface FileLock {
  path: string;
  operationId: string;
  agentId: string;
  acquiredAt: Date;
  expiresAt: Date;
}

export interface LockResult {
  success: boolean;
  locks?: FileLock[];
  conflicts?: string[];
}

const FILE_LOCK_PREFIX = 'nubabel:filelock:';
const DEFAULT_LOCK_TTL = 30 * 60; // 30 minutes in seconds

/**
 * Acquire locks on multiple file paths atomically.
 * Either all locks are acquired or none are.
 */
export async function acquireFileLock(
  redis: Redis,
  operationId: string,
  agentId: string,
  paths: string[]
): Promise<LockResult> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEFAULT_LOCK_TTL * 1000);

  const normalizedPaths = paths.map(p => normalizePath(p));
  const conflicts: string[] = [];
  const locks: FileLock[] = [];

  // Check for existing locks first
  for (const path of normalizedPaths) {
    const existingLock = await checkLock(redis, path);
    if (existingLock && existingLock.operationId !== operationId) {
      conflicts.push(path);
    }
  }

  if (conflicts.length > 0) {
    return {
      success: false,
      conflicts
    };
  }

  // Acquire all locks atomically using pipeline
  const pipeline = redis.pipeline();

  for (const path of normalizedPaths) {
    const lock: FileLock = {
      path,
      operationId,
      agentId,
      acquiredAt: now,
      expiresAt
    };

    const key = getLockKey(path);
    pipeline.set(key, JSON.stringify(lock), 'EX', DEFAULT_LOCK_TTL);
    locks.push(lock);
  }

  try {
    await pipeline.exec();
    return {
      success: true,
      locks
    };
  } catch (error) {
    // Rollback on error
    await releaseAllLocks(redis, operationId);
    throw error;
  }
}

/**
 * Release a single file lock.
 */
export async function releaseFileLock(
  redis: Redis,
  path: string,
  operationId: string
): Promise<void> {
  const normalizedPath = normalizePath(path);
  const existingLock = await checkLock(redis, normalizedPath);

  // Only release if owned by this operation
  if (existingLock && existingLock.operationId === operationId) {
    const key = getLockKey(normalizedPath);
    await redis.del(key);
  }
}

/**
 * Release all locks held by an operation.
 */
export async function releaseAllLocks(
  redis: Redis,
  operationId: string
): Promise<void> {
  const pattern = `${FILE_LOCK_PREFIX}*`;
  const keys = await scanKeys(redis, pattern);

  const pipeline = redis.pipeline();
  let releasedCount = 0;

  for (const key of keys) {
    const lockData = await redis.get(key);
    if (lockData) {
      try {
        const lock: FileLock = JSON.parse(lockData);
        if (lock.operationId === operationId) {
          pipeline.del(key);
          releasedCount++;
        }
      } catch (error) {
        // Skip malformed lock data
        console.warn(`Malformed lock data at ${key}:`, error);
      }
    }
  }

  if (releasedCount > 0) {
    await pipeline.exec();
  }
}

/**
 * Check if a file is locked and return lock details.
 */
export async function checkLock(
  redis: Redis,
  path: string
): Promise<FileLock | null> {
  const normalizedPath = normalizePath(path);
  const key = getLockKey(normalizedPath);
  const lockData = await redis.get(key);

  if (!lockData) {
    return null;
  }

  try {
    const lock: FileLock = JSON.parse(lockData);

    // Parse dates
    lock.acquiredAt = new Date(lock.acquiredAt);
    lock.expiresAt = new Date(lock.expiresAt);

    // Check expiration (defensive, Redis TTL should handle this)
    if (lock.expiresAt < new Date()) {
      await redis.del(key);
      return null;
    }

    return lock;
  } catch (error) {
    // Malformed data, clean up
    await redis.del(key);
    return null;
  }
}

/**
 * Extend lock TTL for an active operation.
 */
export async function extendLock(
  redis: Redis,
  path: string,
  operationId: string,
  additionalSeconds: number = DEFAULT_LOCK_TTL
): Promise<boolean> {
  const normalizedPath = normalizePath(path);
  const existingLock = await checkLock(redis, normalizedPath);

  if (!existingLock || existingLock.operationId !== operationId) {
    return false;
  }

  const key = getLockKey(normalizedPath);
  const result = await redis.expire(key, additionalSeconds);
  return result === 1;
}

/**
 * Get all active locks (for monitoring).
 */
export async function getAllLocks(redis: Redis): Promise<FileLock[]> {
  const pattern = `${FILE_LOCK_PREFIX}*`;
  const keys = await scanKeys(redis, pattern);
  const locks: FileLock[] = [];

  for (const key of keys) {
    const lockData = await redis.get(key);
    if (lockData) {
      try {
        const lock: FileLock = JSON.parse(lockData);
        lock.acquiredAt = new Date(lock.acquiredAt);
        lock.expiresAt = new Date(lock.expiresAt);
        locks.push(lock);
      } catch (error) {
        // Skip malformed data
        continue;
      }
    }
  }

  return locks;
}

// Helper functions

function getLockKey(path: string): string {
  return `${FILE_LOCK_PREFIX}${normalizePath(path)}`;
}

function normalizePath(path: string): string {
  // Normalize path separators and remove trailing slashes
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
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
