import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';
import { GitHubSkillSource } from '../services/marketplace/sources/github-source';
import { NpmSkillSource } from '../services/marketplace/sources/npm-source';
import { PatternDetector } from '../services/skill-learning/pattern-detector';
import { SkillGenerator } from '../services/skill-learning/skill-generator';
import { ExtensionRegistry } from '../services/extension-registry';

const router = Router();
const prisma = new PrismaClient();

// Get organization ID from authenticated request
function getOrgId(req: Request): string {
  if (!req.user?.organizationId) {
    throw new Error('Organization ID not found in request');
  }
  return req.user.organizationId;
}

// Get registry from app context
function getRegistry(req: Request): ExtensionRegistry {
  const registry = (req.app as any).extensionRegistry;
  if (!registry) {
    throw new Error('ExtensionRegistry not initialized');
  }
  return registry;
}

/**
 * GET /api/marketplace/extensions
 * List all published extensions
 */
router.get('/extensions', requireAuth, (req: Request, res: Response) => {
  void (async () => {
    try {
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const pricing = typeof req.query.pricing === 'string' ? req.query.pricing : undefined;
      const sort = typeof req.query.sort === 'string' ? req.query.sort : 'popular';
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const where: any = {
        status: 'published',
        isPublic: true,
      };

      if (category) {
        where.category = category;
      }

      if (pricing) {
        where.pricing = pricing;
      }

      const orderBy: any = {};
      switch (sort) {
        case 'recent':
          orderBy.createdAt = 'desc';
          break;
        case 'rating':
          orderBy.rating = 'desc';
          break;
        case 'trending':
          orderBy.downloads = 'desc';
          break;
        default: // popular
          orderBy.downloads = 'desc';
      }

      const [extensions, total] = await Promise.all([
        prisma.marketplaceExtension.findMany({
          where,
          orderBy,
          skip: (page - 1) * limit,
          take: limit,
          include: {
            publisher: {
              select: {
                name: true,
                slug: true,
                verified: true,
              },
            },
          },
        }),
        prisma.marketplaceExtension.count({ where }),
      ]);

      // Transform to match frontend expected format
      const transformed = extensions.map(ext => ({
        id: ext.id,
        name: ext.name,
        slug: ext.slug,
        description: ext.description,
        publisherName: ext.publisher?.name || 'Unknown',
        publisherVerified: ext.publisher?.verified || false,
        category: ext.category,
        pricing: ext.pricing || 'free',
        price: ext.price as any,
        stats: {
          downloads: ext.downloads || 0,
          activeInstalls: ext.activeInstalls || 0,
          rating: ext.rating || 0,
          reviewCount: ext.reviewCount || 0,
        },
        icon: ext.icon,
        featured: ext.featured || false,
      }));

      res.json({
        extensions: transformed,
        total,
        page,
        limit,
      });
    } catch (error) {
      logger.error('Failed to fetch extensions', {}, error as Error);
      res.status(500).json({
        error: { code: 'FETCH_FAILED', message: 'Failed to fetch extensions' },
      });
    }
  })();
});

/**
 * GET /api/marketplace/categories
 * List all extension categories
 */
router.get('/categories', requireAuth, (req: Request, res: Response) => {
  void (async () => {
    try {
      // Get unique categories with counts
      const categoryCounts = await prisma.marketplaceExtension.groupBy({
        by: ['category'],
        where: {
          status: 'published',
          isPublic: true,
        },
        _count: {
          id: true,
        },
      });

      // Define standard categories
      const standardCategories = [
        { id: 'productivity', slug: 'productivity', name: 'Productivity', icon: '📊' },
        { id: 'automation', slug: 'automation', name: 'Automation', icon: '⚙️' },
        { id: 'integration', slug: 'integration', name: 'Integration', icon: '🔗' },
        { id: 'analytics', slug: 'analytics', name: 'Analytics', icon: '📈' },
        { id: 'communication', slug: 'communication', name: 'Communication', icon: '💬' },
        { id: 'development', slug: 'development', name: 'Development', icon: '💻' },
        { id: 'ai-ml', slug: 'ai-ml', name: 'AI & Machine Learning', icon: '🤖' },
        { id: 'security', slug: 'security', name: 'Security', icon: '🔒' },
        { id: 'general', slug: 'general', name: 'General', icon: '📦' },
      ];

      // Map counts to categories
      const countMap = new Map(categoryCounts.map(c => [c.category, c._count.id]));

      const categories = standardCategories.map(cat => ({
        ...cat,
        extensionCount: countMap.get(cat.slug) || 0,
      }));

      res.json({ categories });
    } catch (error) {
      logger.error('Failed to fetch categories', {}, error as Error);
      res.status(500).json({
        error: { code: 'FETCH_FAILED', message: 'Failed to fetch categories' },
      });
    }
  })();
});

/**
 * GET /api/marketplace/search
 * Search across external sources (GitHub, npm)
 */
router.get('/search', requireAuth, (req: Request, res: Response) => {
  void (async () => {
    try {
      const query = typeof req.query.q === 'string' ? req.query.q : '';
      const source = typeof req.query.source === 'string' ? req.query.source : 'all';
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      if (!query) {
        res.status(400).json({
          error: { code: 'MISSING_QUERY', message: 'Search query is required' },
        });
        return;
      }

      const results: any[] = [];

      // Search GitHub
      if (source === 'github' || source === 'all') {
        const githubSource = new GitHubSkillSource();
        const githubResults = await githubSource.search(query, { limit });
        results.push(...githubResults.map(r => ({ ...r, source: 'github' })));
      }

      // Search npm
      if (source === 'npm' || source === 'all') {
        const npmSource = new NpmSkillSource();
        const npmResults = await npmSource.search(query, { limit });
        results.push(...npmResults.map(r => ({ ...r, source: 'npm' })));
      }

      logger.info('Marketplace search completed', { query, source, resultCount: results.length });

      res.json({
        success: true,
        data: results.slice(0, limit),
      });
    } catch (error) {
      logger.error('Marketplace search failed', { query: req.query.q }, error as Error);
      res.status(500).json({
        error: { code: 'SEARCH_FAILED', message: 'Failed to search marketplace' },
      });
    }
  })();
});

/**
 * GET /api/marketplace/featured
 * Get featured/popular extensions
 */
router.get('/featured', requireAuth, (req: Request, res: Response) => {
  void (async () => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

      const featured = await prisma.marketplaceExtension.findMany({
        where: {
          status: 'published',
          isPublic: true,
        },
        orderBy: [
          { rating: 'desc' },
          { downloads: 'desc' },
        ],
        take: limit,
        include: {
          publisher: {
            select: {
              name: true,
              slug: true,
              verified: true,
            },
          },
        },
      });

      res.json({
        success: true,
        data: featured,
      });
    } catch (error) {
      logger.error('Failed to fetch featured extensions', {}, error as Error);
      res.status(500).json({
        error: { code: 'FETCH_FAILED', message: 'Failed to fetch featured extensions' },
      });
    }
  })();
});

/**
 * GET /api/marketplace/:slug
 * Get extension details
 */
router.get('/:slug', requireAuth, (req: Request, res: Response) => {
  void (async () => {
    try {
      const slug = req.params.slug as string;
      const orgId = getOrgId(req);

      const extension = await prisma.marketplaceExtension.findFirst({
        where: {
          slug,
          OR: [
            { organizationId: orgId },
            { isPublic: true },
          ],
        },
        include: {
          publisher: {
            select: {
              name: true,
              slug: true,
              verified: true,
              website: true,
            },
          },
          versions: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              version: true,
              changelog: true,
              createdAt: true,
            },
          },
          installations: {
            where: { organizationId: orgId },
            select: {
              version: true,
              status: true,
              installedAt: true,
            },
          },
        },
      });

      if (!extension) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Extension not found' },
        });
        return;
      }

      res.json({
        success: true,
        data: extension,
      });
    } catch (error) {
      logger.error('Failed to get extension details', { slug: req.params.slug }, error as Error);
      res.status(500).json({
        error: { code: 'GET_FAILED', message: 'Failed to get extension details' },
      });
    }
  })();
});

/**
 * POST /api/marketplace/:slug/install
 * Install an extension for organization
 */
router.post('/:slug/install', requireAuth, (req: Request, res: Response) => {
  void (async () => {
    try {
      const slug = req.params.slug as string;
      const orgId = getOrgId(req);
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'User ID not found' },
        });
        return;
      }

      // Find the extension
      const extension = await prisma.marketplaceExtension.findFirst({
        where: {
          slug,
          OR: [
            { organizationId: orgId },
            { isPublic: true },
          ],
        },
      });

      if (!extension) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Extension not found' },
        });
        return;
      }

      // Check if already installed
      const existing = await prisma.extensionInstallation.findUnique({
        where: {
          organizationId_extensionId: {
            organizationId: orgId,
            extensionId: extension.id,
          },
        },
      });

      if (existing) {
        res.status(400).json({
          error: { code: 'ALREADY_INSTALLED', message: 'Extension is already installed' },
        });
        return;
      }

      // Create installation
      const installation = await prisma.extensionInstallation.create({
        data: {
          organizationId: orgId,
          extensionId: extension.id,
          version: extension.version,
          installedBy: userId,
          status: 'active',
          autoUpdate: true,
        },
        include: {
          extension: {
            select: {
              name: true,
              description: true,
              version: true,
            },
          },
        },
      });

      // Increment download count
      await prisma.marketplaceExtension.update({
        where: { id: extension.id },
        data: { downloads: { increment: 1 } },
      });

      logger.info('Extension installed', { slug, orgId, userId });

      res.status(201).json({
        success: true,
        data: installation,
      });
    } catch (error) {
      logger.error('Failed to install extension', { slug: req.params.slug }, error as Error);
      res.status(500).json({
        error: { code: 'INSTALL_FAILED', message: 'Failed to install extension' },
      });
    }
  })();
});

/**
 * DELETE /api/marketplace/:slug/uninstall
 * Remove installation
 */
router.delete('/:slug/uninstall', requireAuth, (req: Request, res: Response) => {
  void (async () => {
    try {
      const slug = req.params.slug as string;
      const orgId = getOrgId(req);

      // Find the extension
      const extension = await prisma.marketplaceExtension.findFirst({
        where: {
          slug,
          OR: [
            { organizationId: orgId },
            { isPublic: true },
          ],
        },
      });

      if (!extension) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Extension not found' },
        });
        return;
      }

      // Find and delete installation
      const installation = await prisma.extensionInstallation.findUnique({
        where: {
          organizationId_extensionId: {
            organizationId: orgId,
            extensionId: extension.id,
          },
        },
      });

      if (!installation) {
        res.status(404).json({
          error: { code: 'NOT_INSTALLED', message: 'Extension is not installed' },
        });
        return;
      }

      await prisma.extensionInstallation.delete({
        where: {
          id: installation.id,
        },
      });

      logger.info('Extension uninstalled', { slug, orgId });

      res.json({
        success: true,
        message: 'Extension uninstalled successfully',
      });
    } catch (error) {
      logger.error('Failed to uninstall extension', { slug: req.params.slug }, error as Error);
      res.status(500).json({
        error: { code: 'UNINSTALL_FAILED', message: 'Failed to uninstall extension' },
      });
    }
  })();
});

/**
 * POST /api/marketplace/publish
 * Publish an extension
 */
router.post('/publish', requireAuth, (req: Request, res: Response) => {
  void (async () => {
    try {
      const orgId = getOrgId(req);
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'User ID not found' },
        });
        return;
      }

      const definition = req.body;

      // Validate required fields
      if (!definition.slug || !definition.name || !definition.version) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Missing required fields: slug, name, version' },
        });
        return;
      }

      // Check if slug already exists for this org
      const existing = await prisma.marketplaceExtension.findUnique({
        where: {
          organizationId_slug: {
            organizationId: orgId,
            slug: definition.slug,
          },
        },
      });

      if (existing) {
        res.status(400).json({
          error: { code: 'SLUG_EXISTS', message: 'Extension with this slug already exists' },
        });
        return;
      }

      // Create extension with review status
      const extension = await prisma.marketplaceExtension.create({
        data: {
          organizationId: orgId,
          slug: definition.slug,
          name: definition.name,
          description: definition.description || '',
          version: definition.version,
          extensionType: definition.extensionType || 'extension',
          category: definition.category || 'general',
          tags: definition.tags || [],
          source: definition.source || 'custom',
          format: definition.format || 'native',
          manifest: definition.manifest || {},
          definition: definition.definition || null,
          runtimeType: definition.runtimeType || null,
          runtimeConfig: definition.runtimeConfig || null,
          triggers: definition.triggers || [],
          parameters: definition.parameters || [],
          outputs: definition.outputs || [],
          dependencies: definition.dependencies || [],
          toolsRequired: definition.toolsRequired || [],
          mcpProviders: definition.mcpProviders || [],
          isPublic: false,
          verified: false,
          status: 'review',
          enabled: true,
          createdBy: userId,
        },
      });

      logger.info('Extension published for review', { slug: definition.slug, orgId, userId });

      res.status(201).json({
        success: true,
        data: extension,
        message: 'Extension submitted for review',
      });
    } catch (error) {
      logger.error('Failed to publish extension', {}, error as Error);
      res.status(500).json({
        error: { code: 'PUBLISH_FAILED', message: 'Failed to publish extension' },
      });
    }
  })();
});

/**
 * GET /api/marketplace/my-extensions
 * Get publisher's extensions
 */
router.get('/my-extensions', requireAuth, (req: Request, res: Response) => {
  void (async () => {
    try {
      const orgId = getOrgId(req);

      const extensions = await prisma.marketplaceExtension.findMany({
        where: {
          organizationId: orgId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          installations: {
            select: {
              id: true,
            },
          },
          versions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              version: true,
              createdAt: true,
            },
          },
        },
      });

      res.json({
        success: true,
        data: extensions.map(ext => ({
          ...ext,
          installCount: ext.installations.length,
        })),
      });
    } catch (error) {
      logger.error('Failed to fetch my extensions', {}, error as Error);
      res.status(500).json({
        error: { code: 'FETCH_FAILED', message: 'Failed to fetch extensions' },
      });
    }
  })();
});

/**
 * GET /api/marketplace/suggestions
 * Get auto-generated skill suggestions
 */
router.get('/suggestions', requireAuth, (req: Request, res: Response) => {
  void (async () => {
    try {
      const orgId = getOrgId(req);

      const detector = new PatternDetector(prisma);
      const suggestions = await detector.generateSuggestions(orgId);

      res.json({
        success: true,
        data: suggestions,
      });
    } catch (error) {
      logger.error('Failed to fetch suggestions', {}, error as Error);
      res.status(500).json({
        error: { code: 'FETCH_FAILED', message: 'Failed to fetch suggestions' },
      });
    }
  })();
});

/**
 * POST /api/marketplace/suggestions/:patternId/accept
 * Accept a suggestion and generate skill
 */
router.post('/suggestions/:patternId/accept', requireAuth, (req: Request, res: Response) => {
  void (async () => {
    try {
      const patternId = req.params.patternId as string;
      const orgId = getOrgId(req);
      const registry = getRegistry(req);

      // Get the pattern
      const pattern = await prisma.skillLearningPattern.findUnique({
        where: { id: patternId },
      });

      if (!pattern || pattern.organizationId !== orgId) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Pattern not found' },
        });
        return;
      }

      if (pattern.status !== 'detected') {
        res.status(400).json({
          error: { code: 'INVALID_STATUS', message: 'Pattern is not in detected status' },
        });
        return;
      }

      // Create suggestion object
      const detector = new PatternDetector(prisma);
      const suggestions = await detector.generateSuggestions(orgId);
      const suggestion = suggestions.find(s => s.pattern.id === patternId);

      if (!suggestion) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Suggestion not found' },
        });
        return;
      }

      // Generate skill
      const generator = new SkillGenerator(prisma, registry);
      const customizations = req.body.customizations || {};
      const skill = await generator.generateSkill(orgId, suggestion, customizations);

      logger.info('Skill generated from pattern', { patternId, orgId, skillId: skill.id });

      res.status(201).json({
        success: true,
        data: skill,
        message: 'Skill generated successfully',
      });
    } catch (error) {
      logger.error('Failed to accept suggestion', { patternId: req.params.patternId }, error as Error);
      res.status(500).json({
        error: { code: 'ACCEPT_FAILED', message: 'Failed to accept suggestion' },
      });
    }
  })();
});

/**
 * POST /api/marketplace/suggestions/:patternId/dismiss
 * Dismiss a suggestion
 */
router.post('/suggestions/:patternId/dismiss', requireAuth, (req: Request, res: Response) => {
  void (async () => {
    try {
      const patternId = req.params.patternId as string;
      const orgId = getOrgId(req);

      // Get the pattern
      const pattern = await prisma.skillLearningPattern.findUnique({
        where: { id: patternId },
      });

      if (!pattern || pattern.organizationId !== orgId) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Pattern not found' },
        });
        return;
      }

      // Dismiss pattern
      const detector = new PatternDetector(prisma);
      await detector.dismissPattern(patternId);

      logger.info('Pattern dismissed', { patternId, orgId });

      res.json({
        success: true,
        message: 'Suggestion dismissed',
      });
    } catch (error) {
      logger.error('Failed to dismiss suggestion', { patternId: req.params.patternId }, error as Error);
      res.status(500).json({
        error: { code: 'DISMISS_FAILED', message: 'Failed to dismiss suggestion' },
      });
    }
  })();
});

export default router;
