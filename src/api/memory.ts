/**
 * Memory API Routes
 *
 * Endpoints for managing conversation memories and entities.
 *
 * Endpoints:
 * - GET    /api/memory/user              - List user memories
 * - POST   /api/memory/user              - Create user memory
 * - DELETE /api/memory/user/:id          - Delete user memory
 * - GET    /api/memory/entities          - List entities
 * - GET    /api/memory/entities/:id      - Get entity details
 * - PUT    /api/memory/entities/:id      - Update entity
 * - DELETE /api/memory/entities/:id      - Delete entity
 * - POST   /api/memory/search            - Search memories
 * - POST   /api/memory/extract           - Extract memories from conversation
 * - GET    /api/memory/context           - Get optimized context for current user
 */

import { Router, Request, Response } from "express";
// db import removed - memory table not yet implemented
import { requireAuth } from "../middleware/auth.middleware";
import { logger } from "../utils/logger";
import {
  longTermMemory,
  entityMemoryManager,
  memoryExtractor,
  contextOptimizer,
  shortTermMemory,
} from "../services/memory";
import type { MemoryScope, MemoryType, MemoryImportance } from "../services/memory/types";

const router = Router();

// ============================================================================
// USER MEMORIES
// ============================================================================

/**
 * GET /api/memory/user - List user's memories
 */
router.get("/memory/user", requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId, id: userId } = req.user!;
    const { type, importance, limit = "50" } = req.query;

    const memories = await longTermMemory.getAll(
      organizationId,
      "user",
      userId,
      {
        types: type ? [type as MemoryType] : undefined,
        importance: importance ? [importance as MemoryImportance] : undefined,
        limit: parseInt(limit as string, 10),
      },
    );

    return res.json({ memories });
  } catch (error) {
    logger.error(
      "List user memories error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to fetch memories" });
  }
});

/**
 * POST /api/memory/user - Create a user memory
 */
router.post("/memory/user", requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId, id: userId } = req.user!;
    const { key, value, type = "fact", importance = "medium" } = req.body;

    if (!key || !value) {
      return res.status(400).json({ error: "key and value are required" });
    }

    const memory = await longTermMemory.remember({
      organizationId,
      scope: "user",
      scopeId: userId,
      type: type as MemoryType,
      key,
      value,
      importance: importance as MemoryImportance,
      sourceType: "explicit",
    });

    return res.status(201).json({ memory });
  } catch (error) {
    logger.error(
      "Create user memory error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to create memory" });
  }
});

/**
 * DELETE /api/memory/user/:id - Delete a user memory
 */
router.delete("/memory/user/:id", requireAuth, async (_req: Request, res: Response) => {
  try {
    // NOTE: Requires Memory table in Prisma schema (see prisma/migrations/20260128_add_memory_tables/)
    logger.warn("Memory deletion endpoint called but memory table not yet implemented");

    return res.status(501).json({
      error: "Memory feature not yet implemented",
      message: "The memory table migration needs to be created and applied"
    });

    /* Original implementation - restore after migration:
    const { organizationId } = req.user!;
    const id = String(req.params.id);

    // Verify the memory belongs to this org
    const memory = await db.memory.findFirst({
      where: { id, organizationId },
    });

    if (!memory) {
      return res.status(404).json({ error: "Memory not found" });
    }

    await longTermMemory.forget(id);

    return res.json({ success: true });
    */
  } catch (error) {
    logger.error(
      "Delete user memory error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to delete memory" });
  }
});

// ============================================================================
// ORGANIZATION MEMORIES
// ============================================================================

/**
 * GET /api/memory/organization - List organization memories
 */
router.get("/memory/organization", requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const { type, importance, limit = "50" } = req.query;

    const memories = await longTermMemory.getAll(
      organizationId,
      "organization",
      organizationId,
      {
        types: type ? [type as MemoryType] : undefined,
        importance: importance ? [importance as MemoryImportance] : undefined,
        limit: parseInt(limit as string, 10),
      },
    );

    return res.json({ memories });
  } catch (error) {
    logger.error(
      "List organization memories error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to fetch memories" });
  }
});

/**
 * POST /api/memory/organization - Create an organization memory
 */
router.post("/memory/organization", requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const { key, value, type = "fact", importance = "medium" } = req.body;

    if (!key || !value) {
      return res.status(400).json({ error: "key and value are required" });
    }

    const memory = await longTermMemory.remember({
      organizationId,
      scope: "organization",
      scopeId: organizationId,
      type: type as MemoryType,
      key,
      value,
      importance: importance as MemoryImportance,
      sourceType: "explicit",
    });

    return res.status(201).json({ memory });
  } catch (error) {
    logger.error(
      "Create organization memory error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to create memory" });
  }
});

// ============================================================================
// ENTITIES
// ============================================================================

/**
 * GET /api/memory/entities - List entities
 */
router.get("/memory/entities", requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const { type, limit = "50" } = req.query;

    let entities;
    if (type) {
      entities = await entityMemoryManager.getEntitiesByType(
        organizationId,
        type as any,
        parseInt(limit as string, 10),
      );
    } else {
      entities = await entityMemoryManager.getRecentEntities(
        organizationId,
        parseInt(limit as string, 10),
      );
    }

    return res.json({ entities });
  } catch (error) {
    logger.error(
      "List entities error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to fetch entities" });
  }
});

/**
 * GET /api/memory/entities/:id - Get entity details
 */
router.get("/memory/entities/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const id = String(req.params.id);

    const entity = await entityMemoryManager.getEntity(id);

    if (!entity || entity.organizationId !== organizationId) {
      return res.status(404).json({ error: "Entity not found" });
    }

    return res.json({ entity });
  } catch (error) {
    logger.error(
      "Get entity error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to fetch entity" });
  }
});

/**
 * PUT /api/memory/entities/:id - Update entity
 */
router.put("/memory/entities/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const id = String(req.params.id);
    const { attributes, note, relationship } = req.body;

    // Verify entity exists and belongs to org
    const existing = await entityMemoryManager.getEntity(id);
    if (!existing || existing.organizationId !== organizationId) {
      return res.status(404).json({ error: "Entity not found" });
    }

    let entity = existing;

    // Update attributes if provided
    if (attributes && typeof attributes === "object") {
      entity = await entityMemoryManager.updateAttributes(id, attributes);
    }

    // Add note if provided
    if (note && typeof note === "string") {
      entity = await entityMemoryManager.addNote(id, note);
    }

    // Add relationship if provided
    if (relationship && relationship.relatedEntityId && relationship.type) {
      entity = await entityMemoryManager.addRelationship(
        id,
        relationship.relatedEntityId,
        relationship.type,
      );
    }

    return res.json({ entity });
  } catch (error) {
    logger.error(
      "Update entity error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to update entity" });
  }
});

/**
 * DELETE /api/memory/entities/:id - Delete entity
 */
router.delete("/memory/entities/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const id = String(req.params.id);

    // Verify entity exists and belongs to org
    const existing = await entityMemoryManager.getEntity(id);
    if (!existing || existing.organizationId !== organizationId) {
      return res.status(404).json({ error: "Entity not found" });
    }

    await entityMemoryManager.deleteEntity(id);

    return res.json({ success: true });
  } catch (error) {
    logger.error(
      "Delete entity error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to delete entity" });
  }
});

// ============================================================================
// SEARCH & CONTEXT
// ============================================================================

/**
 * POST /api/memory/search - Search memories
 */
router.post("/memory/search", requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId, id: userId } = req.user!;
    const { query, scope = "user", scopeId, limit = 20 } = req.body;

    if (!query) {
      return res.status(400).json({ error: "query is required" });
    }

    const actualScopeId = scopeId || (scope === "user" ? userId : organizationId);

    const memories = await longTermMemory.search(
      organizationId,
      scope as MemoryScope,
      actualScopeId,
      query,
      { limit },
    );

    // Also search entities
    const entities = await entityMemoryManager.findEntities(organizationId, query, { limit: 10 });

    return res.json({ memories, entities });
  } catch (error) {
    logger.error(
      "Search memories error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to search memories" });
  }
});

/**
 * POST /api/memory/extract - Extract memories from conversation
 */
router.post("/memory/extract", requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId, id: userId } = req.user!;
    const { conversation, sessionId } = req.body;

    if (!conversation || !Array.isArray(conversation)) {
      return res.status(400).json({ error: "conversation array is required" });
    }

    const result = await memoryExtractor.extractAndStore(
      organizationId,
      userId,
      conversation,
      sessionId,
    );

    return res.json(result);
  } catch (error) {
    logger.error(
      "Extract memories error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to extract memories" });
  }
});

/**
 * GET /api/memory/context - Get optimized context for query
 */
router.get("/memory/context", requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId, id: userId } = req.user!;
    const { query, maxTokens = "2000", sessionId } = req.query;

    if (!query) {
      return res.status(400).json({ error: "query is required" });
    }

    const context = await contextOptimizer.buildContext(
      organizationId,
      userId,
      query as string,
      parseInt(maxTokens as string, 10),
      sessionId as string | undefined,
    );

    const formatted = contextOptimizer.formatContextForPrompt(context);

    return res.json({
      context,
      formatted,
    });
  } catch (error) {
    logger.error(
      "Get context error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to get context" });
  }
});

// ============================================================================
// SESSION MEMORY
// ============================================================================

/**
 * GET /api/memory/session/:sessionId - Get session memories
 */
router.get("/memory/session/:sessionId", requireAuth, async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.sessionId);

    const memories = await shortTermMemory.getSessionContext(sessionId);

    return res.json({ memories });
  } catch (error) {
    logger.error(
      "Get session memories error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to get session memories" });
  }
});

/**
 * POST /api/memory/session/:sessionId - Store session memory
 */
router.post("/memory/session/:sessionId", requireAuth, async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.sessionId);
    const { key, value } = req.body;

    if (!key || !value) {
      return res.status(400).json({ error: "key and value are required" });
    }

    await shortTermMemory.remember(sessionId, key, value);

    return res.status(201).json({ success: true });
  } catch (error) {
    logger.error(
      "Store session memory error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to store session memory" });
  }
});

/**
 * DELETE /api/memory/session/:sessionId - Clear session memories
 */
router.delete("/memory/session/:sessionId", requireAuth, async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.sessionId);

    await shortTermMemory.clearSession(sessionId);

    return res.json({ success: true });
  } catch (error) {
    logger.error(
      "Clear session memories error",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: "Failed to clear session memories" });
  }
});

export default router;
