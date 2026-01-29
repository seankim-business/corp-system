import { Router, Request, Response } from "express";
import { db as prisma } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { logger } from "../utils/logger";
import { Prisma } from "@prisma/client";

const router = Router();

// Type for Session with User included
type SessionWithUser = Prisma.SessionGetPayload<{
  include: { user: true };
}>;

interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

interface ConversationListItem {
  id: string;
  source: string | null;
  createdAt: string;
  lastUsedAt: string;
  messageCount: number;
  preview: string | null;
  userId: string;
  userName: string | null;
}

interface ConversationDetail {
  id: string;
  source: string | null;
  createdAt: string;
  lastUsedAt: string;
  userId: string;
  userName: string | null;
  history: ConversationMessage[];
  state: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

router.get(
  "/conversations",
  requireAuth,
  requirePermission(Permission.WORKFLOWS_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const { source, limit = "50", offset = "0" } = req.query;

      const limitNum = Math.min(parseInt(limit as string, 10) || 50, 100);
      const offsetNum = parseInt(offset as string, 10) || 0;

      const whereClause = {
        organizationId,
        tokenHash: null as string | null,
        ...(source && typeof source === "string" ? { source } : {}),
      };

      const [sessions, total] = await Promise.all([
        prisma.session.findMany({
          where: whereClause,
          include: {
            user: true,
          },
          orderBy: { lastUsedAt: "desc" },
          take: limitNum,
          skip: offsetNum,
        }) as Promise<SessionWithUser[]>,
        prisma.session.count({ where: whereClause }),
      ]);

      const conversations: ConversationListItem[] = sessions.map((session) => {
        const history = (session.history as unknown as ConversationMessage[]) || [];
        const firstUserMessage = history.find((m) => m.role === "user");

        return {
          id: session.id,
          source: session.source,
          createdAt: session.createdAt.toISOString(),
          lastUsedAt: session.lastUsedAt.toISOString(),
          messageCount: history.length,
          preview: firstUserMessage?.content?.slice(0, 100) || null,
          userId: session.userId,
          userName: session.user.displayName || session.user.email,
        };
      });

      return res.json({
        conversations,
        total,
        limit: limitNum,
        offset: offsetNum,
      });
    } catch (error) {
      logger.error("Get conversations error", {
        error: error instanceof Error ? error.message : error,
      });
      return res.status(500).json({ error: "Failed to fetch conversations" });
    }
  },
);

router.get(
  "/conversations/:id",
  requireAuth,
  requirePermission(Permission.WORKFLOWS_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = req.params.id as string;

      const session = (await prisma.session.findFirst({
        where: {
          id,
          organizationId,
          tokenHash: null,
        },
        include: {
          user: true,
        },
      })) as SessionWithUser | null;

      if (!session) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const conversation: ConversationDetail = {
        id: session.id,
        source: session.source,
        createdAt: session.createdAt.toISOString(),
        lastUsedAt: session.lastUsedAt.toISOString(),
        userId: session.userId,
        userName: session.user.displayName || session.user.email,
        history: (session.history as unknown as ConversationMessage[]) || [],
        state: (session.state as unknown as Record<string, unknown>) || {},
        metadata: (session.metadata as unknown as Record<string, unknown>) || {},
      };

      return res.json({ conversation });
    } catch (error) {
      logger.error("Get conversation detail error", {
        error: error instanceof Error ? error.message : error,
      });
      return res.status(500).json({ error: "Failed to fetch conversation" });
    }
  },
);

export { router as conversationsRouter };
