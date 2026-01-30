/**
 * Route Registrar
 *
 * Dynamically registers Express routes from extensions
 */
import * as fs from 'fs';
import * as path from 'path';
import { Express, Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { LoadedExtension, RouteComponent, LoadedRoute } from './types';
import { logger } from '../../utils/logger';
import { authenticate } from '../../middleware/auth.middleware';
import { apiRateLimiter } from '../../middleware/rate-limiter.middleware';

export interface RouteRegistrarOptions {
  prefix?: string;
  requireAuth?: boolean;
  rateLimit?: boolean;
  middleware?: RequestHandler[];
}

export interface RegisteredRoute {
  extensionId: string;
  path: string;
  methods: string[];
  registeredAt: Date;
}

/**
 * Route Registrar manages dynamic route registration for extensions
 */
export class RouteRegistrar {
  private app: Express | null = null;
  private registeredRoutes: Map<string, RegisteredRoute[]> = new Map();
  private extensionRouters: Map<string, Router> = new Map();
  private defaultOptions: RouteRegistrarOptions;

  constructor(options: RouteRegistrarOptions = {}) {
    this.defaultOptions = {
      prefix: '/api/ext',
      requireAuth: true,
      rateLimit: true,
      middleware: [],
      ...options,
    };
  }

  /**
   * Initialize with Express app
   */
  initialize(app: Express): void {
    this.app = app;
    logger.info('RouteRegistrar initialized');
  }

  /**
   * Register routes from an extension
   */
  async registerExtensionRoutes(
    extension: LoadedExtension,
    options: RouteRegistrarOptions = {}
  ): Promise<LoadedRoute[]> {
    if (!this.app) {
      throw new Error('RouteRegistrar not initialized. Call initialize() first.');
    }

    const mergedOptions = { ...this.defaultOptions, ...options };
    const routes = extension.manifest.components?.routes || [];
    const loadedRoutes: LoadedRoute[] = [];

    if (routes.length === 0) {
      logger.debug('No routes to register for extension', { extensionId: extension.id });
      return loadedRoutes;
    }

    // Create extension-specific router
    const extensionRouter = Router();
    this.extensionRouters.set(extension.id, extensionRouter);

    for (const routeDef of routes) {
      try {
        const loadedRoute = await this.loadRouteHandler(
          extension,
          routeDef,
          extensionRouter,
          mergedOptions
        );
        loadedRoutes.push(loadedRoute);
      } catch (error) {
        logger.error(
          'Failed to load route handler',
          { extensionId: extension.id, path: routeDef.path },
          error as Error
        );
      }
    }

    // Mount extension router with prefix
    const mountPath = `${mergedOptions.prefix}/${extension.id}`;
    const middleware: RequestHandler[] = [];

    if (mergedOptions.rateLimit) {
      middleware.push(apiRateLimiter);
    }

    if (mergedOptions.requireAuth) {
      middleware.push(authenticate);
    }

    if (mergedOptions.middleware) {
      middleware.push(...mergedOptions.middleware);
    }

    // Add extension context middleware
    middleware.push(this.createExtensionContextMiddleware(extension));

    this.app.use(mountPath, ...middleware, extensionRouter);

    // Track registered routes
    this.registeredRoutes.set(
      extension.id,
      loadedRoutes.map((r) => ({
        extensionId: extension.id,
        path: `${mountPath}${r.path}`,
        methods: r.methods,
        registeredAt: new Date(),
      }))
    );

    logger.info('Registered extension routes', {
      extensionId: extension.id,
      mountPath,
      routeCount: loadedRoutes.length,
    });

    return loadedRoutes;
  }

  /**
   * Load a route handler from file
   */
  private async loadRouteHandler(
    extension: LoadedExtension,
    routeDef: RouteComponent,
    router: Router,
    _options: RouteRegistrarOptions
  ): Promise<LoadedRoute> {
    const handlerPath = path.isAbsolute(routeDef.handler)
      ? routeDef.handler
      : path.join(extension.basePath, routeDef.handler);

    if (!fs.existsSync(handlerPath)) {
      throw new Error(`Route handler not found: ${handlerPath}`);
    }

    // Clear require cache for hot reload support
    delete require.cache[require.resolve(handlerPath)];

    // Load handler module
    let handlerModule: unknown;
    try {
      handlerModule = require(handlerPath);
    } catch (error) {
      // Try loading as ES module for TypeScript files
      if (handlerPath.endsWith('.ts')) {
        try {
          handlerModule = await import(handlerPath);
        } catch {
          throw new Error(`Failed to load handler: ${(error as Error).message}`);
        }
      } else {
        throw error;
      }
    }

    const module = handlerModule as {
      default?: Router | RequestHandler;
      router?: Router;
      handler?: RequestHandler;
    };

    // Support multiple export patterns
    let handler: Router | RequestHandler;
    if (module.default) {
      handler = module.default;
    } else if (module.router) {
      handler = module.router;
    } else if (module.handler) {
      handler = module.handler;
    } else if (typeof handlerModule === 'function') {
      handler = handlerModule as RequestHandler;
    } else {
      throw new Error(`No valid handler export found in ${handlerPath}`);
    }

    const methods = routeDef.methods || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    const routePath = this.normalizePath(routeDef.path);

    // Register the handler
    if (handler instanceof Router || (handler as any).stack) {
      // It's a router, mount it
      router.use(routePath, handler as Router);
    } else {
      // It's a handler function, register for each method
      for (const method of methods) {
        const methodLower = method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
        router[methodLower](routePath, handler as RequestHandler);
      }
    }

    logger.debug('Loaded route handler', {
      extensionId: extension.id,
      path: routePath,
      methods,
      handlerPath,
    });

    // Create a new router if handler is not a router
    let routeRouter: Router;
    if (handler instanceof Router || (handler as any).stack) {
      routeRouter = handler as Router;
    } else {
      routeRouter = Router();
      for (const method of methods) {
        const methodLower = method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
        routeRouter[methodLower](routePath, handler as RequestHandler);
      }
    }

    return {
      path: routePath,
      router: routeRouter,
      methods,
    };
  }

  /**
   * Create middleware that adds extension context to request
   */
  private createExtensionContextMiddleware(
    extension: LoadedExtension
  ): RequestHandler {
    return (req: Request, _res: Response, next: NextFunction) => {
      (req as any).extension = {
        id: extension.id,
        manifest: extension.manifest,
        config: extension.config,
      };
      next();
    };
  }

  /**
   * Normalize route path
   */
  private normalizePath(routePath: string): string {
    // Ensure path starts with /
    let normalized = routePath.startsWith('/') ? routePath : `/${routePath}`;

    // Handle wildcard patterns
    if (normalized.endsWith('/*')) {
      normalized = normalized.slice(0, -2);
    }

    return normalized;
  }

  /**
   * Unregister routes for an extension
   */
  unregisterExtensionRoutes(extensionId: string): void {
    if (!this.app) {
      return;
    }

    const router = this.extensionRouters.get(extensionId);
    if (router) {
      // Express doesn't have a clean way to remove routes
      // We need to filter out the routes from the app's stack
      const mountPath = `${this.defaultOptions.prefix}/${extensionId}`;

      // Find and remove the layer from app._router.stack
      const appRouter = (this.app as any)._router;
      if (appRouter && appRouter.stack) {
        const stackIndex = appRouter.stack.findIndex(
          (layer: any) =>
            layer.regexp &&
            layer.regexp.test &&
            layer.regexp.test(mountPath)
        );

        if (stackIndex !== -1) {
          appRouter.stack.splice(stackIndex, 1);
          logger.debug('Removed route layer from Express stack', {
            extensionId,
            mountPath,
          });
        }
      }

      this.extensionRouters.delete(extensionId);
    }

    this.registeredRoutes.delete(extensionId);

    logger.info('Unregistered extension routes', { extensionId });
  }

  /**
   * Get all registered routes
   */
  getRegisteredRoutes(): Map<string, RegisteredRoute[]> {
    return new Map(this.registeredRoutes);
  }

  /**
   * Get routes for a specific extension
   */
  getExtensionRoutes(extensionId: string): RegisteredRoute[] {
    return this.registeredRoutes.get(extensionId) || [];
  }

  /**
   * Check if extension has registered routes
   */
  hasRoutes(extensionId: string): boolean {
    return this.extensionRouters.has(extensionId);
  }

  /**
   * Create a sandboxed router for testing
   */
  createSandboxedRouter(extension: LoadedExtension): Router {
    const router = Router();

    // Add basic middleware
    router.use((req: Request, _res: Response, next: NextFunction) => {
      (req as any).extension = {
        id: extension.id,
        manifest: extension.manifest,
        config: extension.config,
        sandboxed: true,
      };
      next();
    });

    return router;
  }

  /**
   * Get route statistics
   */
  getStats(): {
    totalExtensions: number;
    totalRoutes: number;
    routesByExtension: Record<string, number>;
  } {
    const routesByExtension: Record<string, number> = {};
    let totalRoutes = 0;

    for (const [extId, routes] of this.registeredRoutes) {
      routesByExtension[extId] = routes.length;
      totalRoutes += routes.length;
    }

    return {
      totalExtensions: this.registeredRoutes.size,
      totalRoutes,
      routesByExtension,
    };
  }
}

/**
 * Create route handler wrapper with error handling
 */
export function wrapRouteHandler(
  handler: RequestHandler
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      logger.error(
        'Extension route handler error',
        {
          path: req.path,
          method: req.method,
          extensionId: (req as any).extension?.id,
        },
        error as Error
      );
      next(error);
    }
  };
}

/**
 * Create route validation middleware
 */
export function createRouteValidator(
  schema: Record<string, unknown>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    // Basic validation - could be extended with Zod or Joi
    const errors: string[] = [];

    if (schema && typeof schema === 'object') {
      // Validate required fields
      const required = (schema as any).required as string[] | undefined;
      if (required && Array.isArray(required)) {
        for (const field of required) {
          if (req.body[field] === undefined) {
            errors.push(`Missing required field: ${field}`);
          }
        }
      }
    }

    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }

    next();
    return;
  };
}

// Singleton instance
let registrarInstance: RouteRegistrar | null = null;

export function getRouteRegistrar(): RouteRegistrar {
  if (!registrarInstance) {
    registrarInstance = new RouteRegistrar();
  }
  return registrarInstance;
}

export function initializeRouteRegistrar(app: Express): RouteRegistrar {
  const registrar = getRouteRegistrar();
  registrar.initialize(app);
  return registrar;
}
