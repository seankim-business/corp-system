import { redis } from "../db/redis";
import { Category } from "./types";

export interface SessionState {
  sessionId: string;
  lastCategory?: Category;
  lastQueryTime?: number;
  conversationDepth: number;
  lastIntent?: string;
  metadata?: Record<string, any>;
}

const SESSION_STATE_TTL = 1800;
const SESSION_STATE_PREFIX = "session:state:";

function getSessionKey(sessionId: string): string {
  return SESSION_STATE_PREFIX + sessionId;
}

export async function getSessionState(sessionId: string): Promise<SessionState | null> {
  const key = getSessionKey(sessionId);
  const data = await redis.get(key);

  if (!data) {
    return {
      sessionId,
      conversationDepth: 0,
    };
  }

  try {
    return JSON.parse(data);
  } catch {
    return {
      sessionId,
      conversationDepth: 0,
    };
  }
}

export async function updateSessionState(
  sessionId: string,
  updates: Partial<Omit<SessionState, "sessionId">>,
): Promise<void> {
  const key = getSessionKey(sessionId);
  const current = await getSessionState(sessionId);

  const updated: SessionState = {
    ...current,
    ...updates,
    sessionId,
    lastQueryTime: Date.now(),
    conversationDepth: (current?.conversationDepth || 0) + 1,
  };

  await redis.set(key, JSON.stringify(updated), SESSION_STATE_TTL);
}

export async function clearSessionState(sessionId: string): Promise<void> {
  const key = getSessionKey(sessionId);
  await redis.del(key);
}

export function isFollowUpQuery(prompt: string): boolean {
  const prompt_lower = prompt.toLowerCase().trim();

  const followUpPatterns = [
    /^(and |also |now |next |then )/,
    /^(what about|how about|can you also)/,
    /^(yes|no|ok|sure|right|okay)[,.]?\s/,
    /^(그리고|또|이제|다음|그럼|그러면)/,
    /^(네|응|예|좋아|알겠어)[,.]?\s/,
  ];

  for (const pattern of followUpPatterns) {
    if (pattern.test(prompt_lower)) {
      return true;
    }
  }

  return false;
}

export function applyContextBoost(
  confidence: number,
  sessionState: SessionState | null,
  isFollowUp: boolean,
): number {
  if (!isFollowUp || !sessionState) {
    return confidence;
  }

  const lastCategory = sessionState.lastCategory;
  if (!lastCategory) {
    return confidence;
  }

  if (["ultrabrain", "unspecified-high"].includes(lastCategory) && confidence < 0.8) {
    return Math.min(0.75, confidence + 0.15);
  }

  return confidence;
}
