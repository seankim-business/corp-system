/**
 * HookManager - Core Hook System
 *
 * Provides a typed, async event system with:
 * - Priority ordering for handlers
 * - Timeout enforcement (30s default)
 * - Error isolation (handler failures don't stop others)
 * - Zod validation for payloads
 * - Extension manifest hook registration
 * - Singleton pattern for global access
 */

import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger';
import {
  HookEventName,
  HookEventPayloads,
  HookHandler,
  HookPriority,
  HookRegistrationOptions,
  RegisteredHandler,
  HookEmitResult,
  HookExecutionResult,
  ExtensionHooksManifest,
  validatePayload,
  isValidHookEvent,
  GenericHookHandler,
  HookEventNames,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds
const MAX_TIMEOUT_MS = 300_000; // 5 minutes
const MIN_TIMEOUT_MS = 100; // 100ms minimum

// ---------------------------------------------------------------------------
// HookManager Class
// ---------------------------------------------------------------------------

export class HookManager {
  private static instance: HookManager | null = null;

  /**
   * Handlers indexed by event name, sorted by priority within each bucket.
   */
  private handlers: Map<HookEventName, RegisteredHandler[]> = new Map();

  /**
   * Quick lookup for handlers by ID (for removal).
   */
  private handlerIndex: Map<string, RegisteredHandler> = new Map();

  /**
   * Handlers registered by extension ID for bulk operations.
   */
  private extensionHandlers: Map<string, Set<string>> = new Map();

  /**
   * Statistics tracking.
   */
  private stats = {
    totalEmissions: 0,
    totalHandlerCalls: 0,
    totalErrors: 0,
    totalTimeouts: 0,
  };

  private constructor() {
    // Initialize handler buckets for all known events
    for (const event of Object.values(HookEventNames)) {
      this.handlers.set(event, []);
    }
    logger.debug('HookManager initialized');
  }

  /**
   * Get the singleton instance.
   */
  public static getInstance(): HookManager {
    if (!HookManager.instance) {
      HookManager.instance = new HookManager();
    }
    return HookManager.instance;
  }

  /**
   * Reset the singleton (for testing).
   */
  public static resetInstance(): void {
    if (HookManager.instance) {
      HookManager.instance.clear();
      HookManager.instance = null;
    }
  }

  // -------------------------------------------------------------------------
  // Registration Methods
  // -------------------------------------------------------------------------

  /**
   * Register a handler for an event.
   */
  public on<T extends HookEventName>(
    event: T,
    handler: HookHandler<T>,
    options: HookRegistrationOptions = {}
  ): string {
    return this.registerHandler(event, handler, { ...options, once: false });
  }

  /**
   * Register a one-time handler that auto-removes after first execution.
   */
  public once<T extends HookEventName>(
    event: T,
    handler: HookHandler<T>,
    options: Omit<HookRegistrationOptions, 'once'> = {}
  ): string {
    return this.registerHandler(event, handler, { ...options, once: true });
  }

  /**
   * Remove a handler by ID.
   */
  public off(handlerId: string): boolean {
    const handler = this.handlerIndex.get(handlerId);
    if (!handler) {
      return false;
    }

    // Remove from event bucket
    const bucket = this.handlers.get(handler.event);
    if (bucket) {
      const idx = bucket.findIndex((h) => h.id === handlerId);
      if (idx !== -1) {
        bucket.splice(idx, 1);
      }
    }

    // Remove from index
    this.handlerIndex.delete(handlerId);

    // Remove from extension tracking
    if (handler.extensionId) {
      const extHandlers = this.extensionHandlers.get(handler.extensionId);
      if (extHandlers) {
        extHandlers.delete(handlerId);
        if (extHandlers.size === 0) {
          this.extensionHandlers.delete(handler.extensionId);
        }
      }
    }

    logger.debug('Hook handler removed', { handlerId, event: handler.event });
    return true;
  }

  /**
   * Remove a handler by event and handler function reference.
   */
  public offByHandler<T extends HookEventName>(
    event: T,
    handler: HookHandler<T>
  ): boolean {
    const bucket = this.handlers.get(event);
    if (!bucket) return false;

    const registered = bucket.find((h) => h.handler === handler);
    if (!registered) return false;

    return this.off(registered.id);
  }

  /**
   * Remove all handlers for an extension.
   */
  public offByExtension(extensionId: string): number {
    const handlerIds = this.extensionHandlers.get(extensionId);
    if (!handlerIds) return 0;

    let removed = 0;
    Array.from(handlerIds).forEach((handlerId) => {
      if (this.off(handlerId)) {
        removed++;
      }
    });

    return removed;
  }

  /**
   * Register handlers from an extension manifest.
   */
  public registerFromManifest(
    extensionId: string,
    manifest: ExtensionHooksManifest,
    handlerMap: Record<string, GenericHookHandler>
  ): string[] {
    const registeredIds: string[] = [];

    if (!manifest.hooks || manifest.hooks.length === 0) {
      return registeredIds;
    }

    for (const hookDef of manifest.hooks) {
      const handler = handlerMap[hookDef.handler];
      if (!handler) {
        logger.warn('Handler not found in handlerMap', {
          extensionId,
          handlerName: hookDef.handler,
          event: hookDef.event,
        });
        continue;
      }

      if (!isValidHookEvent(hookDef.event)) {
        logger.warn('Invalid hook event in manifest', {
          extensionId,
          event: hookDef.event,
        });
        continue;
      }

      const id = this.registerHandler(hookDef.event, handler as HookHandler<typeof hookDef.event>, {
        extensionId,
        priority: hookDef.priority,
        timeoutMs: hookDef.timeoutMs,
        once: false,
      });

      registeredIds.push(id);
    }

    logger.info('Registered hooks from extension manifest', {
      extensionId,
      count: registeredIds.length,
    });

    return registeredIds;
  }

  // -------------------------------------------------------------------------
  // Emission Methods
  // -------------------------------------------------------------------------

  /**
   * Emit an event to all registered handlers.
   * Handlers are executed in priority order.
   * Errors are isolated - one handler failing won't stop others.
   */
  public async emit<T extends HookEventName>(
    event: T,
    payload: HookEventPayloads[T]
  ): Promise<HookEmitResult> {
    const startTime = Date.now();
    const bucket = this.handlers.get(event) || [];

    this.stats.totalEmissions++;

    if (bucket.length === 0) {
      return {
        event,
        handlersExecuted: 0,
        results: [],
        totalDurationMs: 0,
      };
    }

    // Validate payload
    const validation = validatePayload(event, payload);
    if (!validation.success) {
      logger.warn('Hook payload validation failed', {
        event,
        errors: (validation as { success: false; error: import('zod').ZodError }).error.errors,
      });
      // Continue anyway - validation is advisory
    }

    const results: HookExecutionResult[] = [];
    const handlersToRemove: string[] = [];

    // Execute handlers in priority order (already sorted)
    for (const registered of bucket) {
      const handlerResult = await this.executeHandler(registered, payload);
      results.push(handlerResult);

      if (registered.once) {
        handlersToRemove.push(registered.id);
      }
    }

    // Remove one-time handlers
    for (const id of handlersToRemove) {
      this.off(id);
    }

    const totalDurationMs = Date.now() - startTime;

    logger.debug('Hook event emitted', {
      event,
      handlersExecuted: results.length,
      successCount: results.filter((r) => r.success).length,
      errorCount: results.filter((r) => !r.success).length,
      totalDurationMs,
    });

    return {
      event,
      handlersExecuted: results.length,
      results,
      totalDurationMs,
    };
  }

  /**
   * Emit to multiple events with the same payload structure.
   * Useful for broadcasting lifecycle events.
   */
  public async emitMultiple<T extends HookEventName>(
    events: T[],
    payload: HookEventPayloads[T]
  ): Promise<Map<T, HookEmitResult>> {
    const results = new Map<T, HookEmitResult>();

    await Promise.all(
      events.map(async (event) => {
        const result = await this.emit(event, payload);
        results.set(event, result);
      })
    );

    return results;
  }

  // -------------------------------------------------------------------------
  // Query Methods
  // -------------------------------------------------------------------------

  /**
   * Get all handlers for an event.
   */
  public getHandlers<T extends HookEventName>(event: T): RegisteredHandler<T>[] {
    return (this.handlers.get(event) || []) as unknown as RegisteredHandler<T>[];
  }

  /**
   * Get handler count for an event.
   */
  public getHandlerCount(event: HookEventName): number {
    return (this.handlers.get(event) || []).length;
  }

  /**
   * Get all registered events that have handlers.
   */
  public getActiveEvents(): HookEventName[] {
    const active: HookEventName[] = [];
    this.handlers.forEach((handlers, event) => {
      if (handlers.length > 0) {
        active.push(event);
      }
    });
    return active;
  }

  /**
   * Get statistics.
   */
  public getStats(): typeof this.stats & { totalHandlers: number } {
    return {
      ...this.stats,
      totalHandlers: this.handlerIndex.size,
    };
  }

  /**
   * Check if any handlers are registered for an event.
   */
  public hasHandlers(event: HookEventName): boolean {
    return (this.handlers.get(event) || []).length > 0;
  }

  // -------------------------------------------------------------------------
  // Lifecycle Methods
  // -------------------------------------------------------------------------

  /**
   * Clear all handlers.
   */
  public clear(): void {
    this.handlers.forEach((bucket) => {
      bucket.length = 0;
    });
    this.handlerIndex.clear();
    this.extensionHandlers.clear();
    logger.debug('HookManager cleared');
  }

  /**
   * Shutdown hook manager gracefully.
   * Emits a shutdown event and clears all handlers.
   */
  public async shutdown(): Promise<void> {
    logger.info('HookManager shutting down', {
      totalHandlers: this.handlerIndex.size,
      stats: this.stats,
    });
    this.clear();
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  private registerHandler<T extends HookEventName>(
    event: T,
    handler: HookHandler<T>,
    options: HookRegistrationOptions & { once: boolean }
  ): string {
    const id = randomUUID();
    const priority = options.priority ?? HookPriority.NORMAL;
    const timeoutMs = Math.min(
      Math.max(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS),
      MAX_TIMEOUT_MS
    );

    const registered: RegisteredHandler<T> = {
      id,
      event,
      handler,
      priority,
      extensionId: options.extensionId,
      once: options.once,
      timeoutMs,
      createdAt: new Date(),
    };

    // Add to event bucket and sort by priority
    let bucket = this.handlers.get(event);
    if (!bucket) {
      bucket = [];
      this.handlers.set(event, bucket);
    }
    bucket.push(registered as unknown as RegisteredHandler);
    bucket.sort((a, b) => a.priority - b.priority);

    // Add to index
    this.handlerIndex.set(id, registered as unknown as RegisteredHandler);

    // Track by extension
    if (options.extensionId) {
      let extHandlers = this.extensionHandlers.get(options.extensionId);
      if (!extHandlers) {
        extHandlers = new Set();
        this.extensionHandlers.set(options.extensionId, extHandlers);
      }
      extHandlers.add(id);
    }

    logger.debug('Hook handler registered', {
      id,
      event,
      priority,
      extensionId: options.extensionId,
      once: options.once,
    });

    return id;
  }

  private async executeHandler(
    registered: RegisteredHandler,
    payload: unknown
  ): Promise<HookExecutionResult> {
    const startTime = Date.now();
    this.stats.totalHandlerCalls++;

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Hook handler timeout after ${registered.timeoutMs}ms`));
        }, registered.timeoutMs);
      });

      // Execute handler with timeout
      const handlerPromise = Promise.resolve(registered.handler(payload as any));
      await Promise.race([handlerPromise, timeoutPromise]);

      return {
        handlerId: registered.id,
        success: true,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const isTimeout = error instanceof Error && error.message.includes('timeout');

      if (isTimeout) {
        this.stats.totalTimeouts++;
        logger.warn('Hook handler timed out', {
          handlerId: registered.id,
          event: registered.event,
          extensionId: registered.extensionId,
          timeoutMs: registered.timeoutMs,
        });
      } else {
        this.stats.totalErrors++;
        logger.error('Hook handler error', {
          handlerId: registered.id,
          event: registered.event,
          extensionId: registered.extensionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      return {
        handlerId: registered.id,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        durationMs: Date.now() - startTime,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Convenience Exports
// ---------------------------------------------------------------------------

/**
 * Get the global HookManager instance.
 */
export function getHookManager(): HookManager {
  return HookManager.getInstance();
}

/**
 * Shorthand for registering a hook handler.
 */
export function onHook<T extends HookEventName>(
  event: T,
  handler: HookHandler<T>,
  options?: HookRegistrationOptions
): string {
  return getHookManager().on(event, handler, options);
}

/**
 * Shorthand for registering a one-time hook handler.
 */
export function onceHook<T extends HookEventName>(
  event: T,
  handler: HookHandler<T>,
  options?: Omit<HookRegistrationOptions, 'once'>
): string {
  return getHookManager().once(event, handler, options);
}

/**
 * Shorthand for removing a hook handler.
 */
export function offHook(handlerId: string): boolean {
  return getHookManager().off(handlerId);
}

/**
 * Shorthand for emitting a hook event.
 */
export async function emitHook<T extends HookEventName>(
  event: T,
  payload: HookEventPayloads[T]
): Promise<HookEmitResult> {
  return getHookManager().emit(event, payload);
}
