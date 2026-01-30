import { withQueueConnection } from "../db/redis";
import { db as prisma } from "../db/client";
import { logger } from "../utils/logger";

export async function createSessionMapping(
  nubabelSessionId: string,
  opencodeSessionId: string,
): Promise<void> {
  logger.info("Creating session mapping", { nubabelSessionId, opencodeSessionId });

  await withQueueConnection(async (redis) => {
    await redis.hset(`session:mapping:${nubabelSessionId}`, "opencodeSessionId", opencodeSessionId);
    await redis.hset(`session:mapping:${opencodeSessionId}`, "nubabelSessionId", nubabelSessionId);
    await redis.expire(`session:mapping:${nubabelSessionId}`, 86400);
    await redis.expire(`session:mapping:${opencodeSessionId}`, 86400);
  });

  const existingSession = await prisma.session.findUnique({
    where: { id: nubabelSessionId },
  });

  if (existingSession) {
    await prisma.session.update({
      where: { id: nubabelSessionId },
      data: {
        state: {
          ...(existingSession.state as any),
          opencodeSessionId,
          lastSyncAt: new Date().toISOString(),
        },
      },
    });
  }
}

export async function getOpencodeSessionId(nubabelSessionId: string): Promise<string | null> {
  let cached: string | null = null;

  await withQueueConnection(async (redis) => {
    cached = await redis.hget(`session:mapping:${nubabelSessionId}`, "opencodeSessionId");
  });

  if (cached) {
    logger.debug("OpenCode session ID found in cache", {
      nubabelSessionId,
      opencodeSessionId: cached,
    });
    return cached;
  }

  let sessionId: string | null = null;

  const session = await prisma.session.findUnique({
    where: { id: nubabelSessionId },
  });

  const state = session?.state as any;
  sessionId = state?.opencodeSessionId || null;

  if (sessionId) {
    await withQueueConnection(async (redis) => {
      await redis.hset(`session:mapping:${nubabelSessionId}`, "opencodeSessionId", sessionId!);
      await redis.expire(`session:mapping:${nubabelSessionId}`, 86400);
    });
  }

  return sessionId;
}

export async function getNubabelSessionId(opencodeSessionId: string): Promise<string | null> {
  let cached: string | null = null;

  await withQueueConnection(async (redis) => {
    cached = await redis.hget(`session:mapping:${opencodeSessionId}`, "nubabelSessionId");
  });

  if (cached) {
    return cached;
  }

  let sessionId: string | null = null;

  const sessions = await prisma.session.findMany({
    where: {
      state: {
        path: ["opencodeSessionId"],
        equals: opencodeSessionId,
      },
    },
    take: 1,
  });

  sessionId = sessions[0]?.id || null;

  if (sessionId) {
    await withQueueConnection(async (redis) => {
      await redis.hset(`session:mapping:${opencodeSessionId}`, "nubabelSessionId", sessionId!);
      await redis.expire(`session:mapping:${opencodeSessionId}`, 86400);
    });
  }

  return sessionId;
}
