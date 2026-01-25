import { db as prisma } from "../db/client";
import Redis from "ioredis";
import { Session } from "./types";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

/**
 * 세션 생성
 */
export async function createSession(params: {
  userId: string;
  organizationId: string;
  source: Session["source"];
  metadata?: Record<string, any>;
}): Promise<Session> {
  const session: Session = {
    id: `ses_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId: params.userId,
    organizationId: params.organizationId,
    source: params.source,
    state: {},
    history: [],
    metadata: params.metadata || {},
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 3600 * 1000), // 1시간
  };

  // Redis에 저장 (Hot)
  await redis.setex(
    `session:${session.id}`,
    3600, // TTL: 1시간
    JSON.stringify(session),
  );

  // PostgreSQL에 저장 (Cold)
  await prisma.session.create({
    data: {
      id: session.id,
      userId: params.userId,
      organizationId: params.organizationId,
      source: params.source,
      state: session.state,
      history: session.history,
      metadata: session.metadata,
      expiresAt: session.expiresAt,
    },
  });

  return session;
}

/**
 * 세션 조회
 */
export async function getSession(sessionId: string): Promise<Session | null> {
  // 1. Redis에서 조회 (빠름)
  const cached = await redis.get(`session:${sessionId}`);
  if (cached) {
    return JSON.parse(cached);
  }

  // 2. PostgreSQL에서 조회 (느림)
  const dbSession = await prisma.session.findUnique({
    where: { id: sessionId },
  });

  if (!dbSession) {
    return null;
  }

  const session: Session = {
    id: dbSession.id,
    userId: dbSession.userId,
    organizationId: dbSession.organizationId,
    source: dbSession.source as Session["source"],
    state: dbSession.state as Record<string, any>,
    history: dbSession.history as any[],
    metadata: dbSession.metadata as Record<string, any>,
    createdAt: dbSession.createdAt,
    expiresAt: dbSession.expiresAt,
  };

  // Redis에 다시 캐시
  await redis.setex(`session:${sessionId}`, 3600, JSON.stringify(session));

  return session;
}

/**
 * Slack 스레드로 세션 조회
 */
export async function getSessionBySlackThread(
  threadTs: string,
): Promise<Session | null> {
  const dbSession = await prisma.session.findFirst({
    where: {
      source: "slack",
      metadata: {
        path: ["slackThreadTs"],
        equals: threadTs,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!dbSession) {
    return null;
  }

  return getSession(dbSession.id);
}

/**
 * 세션 업데이트
 */
export async function updateSession(
  sessionId: string,
  updates: Partial<Pick<Session, "state" | "history" | "metadata">>,
): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  const updatedSession = {
    ...session,
    ...updates,
  };

  // Redis 업데이트
  await redis.setex(
    `session:${sessionId}`,
    3600,
    JSON.stringify(updatedSession),
  );

  // PostgreSQL 업데이트
  await prisma.session.update({
    where: { id: sessionId },
    data: {
      state: updatedSession.state,
      history: updatedSession.history,
      metadata: updatedSession.metadata,
      updatedAt: new Date(),
    },
  });
}
