import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { ExtensionRegistry, ExtensionDefinitionSchema, ExtensionType } from '../services/extension-registry';

const router = Router();

// Get registry from app context (set during app initialization)
function getRegistry(req: Request): ExtensionRegistry {
  const registry = (req.app as any).extensionRegistry;
  if (!registry) {
    throw new Error('ExtensionRegistry not initialized');
  }
  return registry;
}

// Get org ID from authenticated request
function getOrgId(req: Request): string {
  const orgId = (req as any).organizationId;
  if (!orgId) {
    throw new Error('Organization ID not found in request');
  }
  return orgId;
}

/**
 * GET /api/v1/extensions
 * List extensions for organization
 */
router.get('/', (req: Request, res: Response) => {
  void (async () => {
    try {
      const registry = getRegistry(req);
      const orgId = getOrgId(req);

      const typeFilter = req.query.type as ExtensionType | undefined;
      const category = req.query.category as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

      const extensions = await registry.listExtensions(orgId, {
        type: typeFilter,
        category,
        limit,
        offset,
      });

      res.json({
        success: true,
        data: extensions,
        pagination: {
          limit,
          offset,
          total: extensions.length,
        },
      });
    } catch (error) {
      logger.error('Failed to list extensions', {}, error as Error);
      res.status(500).json({
        success: false,
        error: { code: 'LIST_FAILED', message: 'Failed to list extensions' },
      });
    }
  })();
});

/**
 * GET /api/v1/extensions/search
 * Search extensions
 */
router.get('/search', (req: Request, res: Response) => {
  void (async () => {
    try {
      const registry = getRegistry(req);
      const orgId = getOrgId(req);
      const query = typeof req.query.q === 'string' ? req.query.q : '';

      if (!query) {
        res.status(400).json({
          success: false,
          error: { code: 'MISSING_QUERY', message: 'Search query is required' },
        });
        return;
      }

      const typeFilter = req.query.type as ExtensionType | undefined;
      const includeGlobal = req.query.includeGlobal !== 'false';

      const extensions = await registry.searchExtensions(query, orgId, {
        type: typeFilter,
        includeGlobal,
      });

      res.json({
        success: true,
        data: extensions,
      });
    } catch (error) {
      logger.error('Failed to search extensions', {}, error as Error);
      res.status(500).json({
        success: false,
        error: { code: 'SEARCH_FAILED', message: 'Failed to search extensions' },
      });
    }
  })();
});

/**
 * GET /api/v1/extensions/:slug
 * Get extension details
 */
router.get('/:slug', (req: Request, res: Response) => {
  void (async () => {
    try {
      const registry = getRegistry(req);
      const orgId = getOrgId(req);
      const { slug } = req.params;

      const extension = await registry.getExtension(orgId, slug as string);

      if (!extension) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Extension not found' },
        });
        return;
      }

      res.json({
        success: true,
        data: extension,
      });
    } catch (error) {
      logger.error('Failed to get extension', { slug: req.params.slug }, error as Error);
      res.status(500).json({
        success: false,
        error: { code: 'GET_FAILED', message: 'Failed to get extension' },
      });
    }
  })();
});

/**
 * POST /api/v1/extensions
 * Create/register extension
 */
router.post('/', (req: Request, res: Response) => {
  void (async () => {
    try {
      const registry = getRegistry(req);
      const orgId = getOrgId(req);
      const userId = (req as any).userId;

      const definition = ExtensionDefinitionSchema.parse(req.body);
      const extension = await registry.registerExtension(orgId, definition, userId);

      logger.info('Extension created', { slug: definition.slug, orgId });

      res.status(201).json({
        success: true,
        data: extension,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid extension definition', details: error.errors },
        });
        return;
      }

      logger.error('Failed to create extension', {}, error as Error);
      res.status(500).json({
        success: false,
        error: { code: 'CREATE_FAILED', message: 'Failed to create extension' },
      });
    }
  })();
});

/**
 * PUT /api/v1/extensions/:slug
 * Update extension
 */
router.put('/:slug', (req: Request, res: Response) => {
  void (async () => {
    try {
      const registry = getRegistry(req);
      const orgId = getOrgId(req);
      const { slug } = req.params;

      // First get the extension to verify ownership
      const existing = await registry.getExtension(orgId, slug as string);
      if (!existing) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Extension not found' },
        });
        return;
      }

      // Only allow updating own extensions
      if (existing.organizationId !== orgId) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Cannot update global extensions' },
        });
        return;
      }

      const updates = req.body;
      const extension = await registry.updateExtension(existing.id, updates);

      logger.info('Extension updated', { slug, orgId });

      res.json({
        success: true,
        data: extension,
      });
    } catch (error) {
      logger.error('Failed to update extension', { slug: req.params.slug }, error as Error);
      res.status(500).json({
        success: false,
        error: { code: 'UPDATE_FAILED', message: 'Failed to update extension' },
      });
    }
  })();
});

/**
 * DELETE /api/v1/extensions/:slug
 * Delete extension
 */
router.delete('/:slug', (req: Request, res: Response) => {
  void (async () => {
    try {
      const registry = getRegistry(req);
      const orgId = getOrgId(req);
      const { slug } = req.params;

      const existing = await registry.getExtension(orgId, slug as string);
      if (!existing) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Extension not found' },
        });
        return;
      }

      if (existing.organizationId !== orgId) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Cannot delete global extensions' },
        });
        return;
      }

      await registry.deleteExtension(existing.id);

      logger.info('Extension deleted', { slug, orgId });

      res.json({
        success: true,
        message: 'Extension deleted',
      });
    } catch (error) {
      logger.error('Failed to delete extension', { slug: req.params.slug }, error as Error);
      res.status(500).json({
        success: false,
        error: { code: 'DELETE_FAILED', message: 'Failed to delete extension' },
      });
    }
  })();
});

/**
 * GET /api/v1/extensions/:slug/resolve
 * Resolve skills for a request
 */
router.post('/resolve', (req: Request, res: Response) => {
  void (async () => {
    try {
      const registry = getRegistry(req);
      const orgId = getOrgId(req);
      const { request, agentId } = req.body;

      if (!request) {
        res.status(400).json({
          success: false,
          error: { code: 'MISSING_REQUEST', message: 'Request text is required' },
        });
        return;
      }

      const resolved = await registry.resolveSkillsForRequest(orgId, request, agentId);

      res.json({
        success: true,
        data: resolved,
      });
    } catch (error) {
      logger.error('Failed to resolve skills', {}, error as Error);
      res.status(500).json({
        success: false,
        error: { code: 'RESOLVE_FAILED', message: 'Failed to resolve skills' },
      });
    }
  })();
});

export default router;
