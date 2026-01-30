import { logger } from "../utils/logger";
import { getQueueConnectionSync, releaseQueueConnection } from "../db/redis";
import type Redis from "ioredis";

export type KeyspaceEvent = "expired" | "del" | "set" | "hset" | "lpush" | "evicted";

export type KeyspaceHandler = (key: string, event: KeyspaceEvent) => void;

const KEYEVENT_EXPIRED = "__keyevent@0__:expired";
const KEYEVENT_DEL = "__keyevent@0__:del";
const KEYEVENT_EVICTED = "__keyevent@0__:evicted";

const SUBSCRIBED_CHANNELS = [KEYEVENT_EXPIRED, KEYEVENT_DEL, KEYEVENT_EVICTED] as const;

/**
 * Map a Redis keyevent channel name to a KeyspaceEvent type.
 */
function channelToEvent(channel: string): KeyspaceEvent | null {
  if (channel === KEYEVENT_EXPIRED) return "expired";
  if (channel === KEYEVENT_DEL) return "del";
  if (channel === KEYEVENT_EVICTED) return "evicted";
  return null;
}

/**
 * Simple glob matching supporting `*` (any sequence) and `?` (single char).
 * Converts the glob pattern to a RegExp for matching.
 */
function globToRegExp(pattern: string): RegExp {
  let regexStr = "^";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") {
      regexStr += ".*";
    } else if (ch === "?") {
      regexStr += ".";
    } else {
      // Escape special regex characters
      regexStr += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  regexStr += "$";
  return new RegExp(regexStr);
}

interface HandlerRegistration {
  pattern: string;
  handler: KeyspaceHandler;
  events: Set<KeyspaceEvent | "any">;
  regex: RegExp;
}

class KeyspaceNotificationManager {
  private subscriber: Redis | null = null;
  private configConnection: Redis | null = null;
  private handlers: Map<string, HandlerRegistration[]> = new Map();
  private started = false;

  /**
   * Start listening for Redis keyspace notifications.
   *
   * Enables keyspace notifications via CONFIG SET, subscribes to
   * expired/del/evicted keyevent channels, and begins routing
   * events to registered handlers.
   */
  async start(): Promise<void> {
    if (this.started) {
      logger.warn("KeyspaceNotificationManager already started");
      return;
    }

    try {
      this.configConnection = getQueueConnectionSync();
      this.subscriber = getQueueConnectionSync();
    } catch (err) {
      logger.error("Failed to acquire Redis connections for keyspace notifications", {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    // Enable keyspace notifications: K=keyspace, g=generic, x=expired, e=evicted
    try {
      await this.configConnection.config("SET", "notify-keyspace-events", "Kgxe");
      logger.info("Redis keyspace notifications enabled", {
        config: "Kgxe",
      });
    } catch (err) {
      logger.error("Failed to enable Redis keyspace notifications via CONFIG SET", {
        error: err instanceof Error ? err.message : String(err),
      });
      this.releaseConnections();
      throw err;
    }

    // Set up the message handler before subscribing
    this.subscriber.on("message", (channel: string, key: string) => {
      const event = channelToEvent(channel);
      if (event) {
        logger.debug("Keyspace event received", { channel, key, event });
        this.routeEvent(key, event);
      } else {
        logger.warn("Received message on unknown keyevent channel", { channel, key });
      }
    });

    // Subscribe to all keyevent channels
    try {
      for (const channel of SUBSCRIBED_CHANNELS) {
        await new Promise<void>((resolve, reject) => {
          this.subscriber!.subscribe(channel, (err: unknown) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
        logger.info("Subscribed to keyevent channel", { channel });
      }
    } catch (err) {
      logger.error("Failed to subscribe to keyevent channels", {
        error: err instanceof Error ? err.message : String(err),
      });
      this.releaseConnections();
      throw err;
    }

    this.started = true;
    logger.info("KeyspaceNotificationManager started", {
      channels: SUBSCRIBED_CHANNELS.length,
      registeredPatterns: this.handlers.size,
    });
  }

  /**
   * Register a handler for key expiry events matching a glob pattern.
   */
  onKeyExpired(pattern: string, handler: KeyspaceHandler): void {
    this.registerHandler(pattern, handler, new Set<KeyspaceEvent | "any">(["expired"]));
    logger.debug("Registered keyspace handler for expired events", { pattern });
  }

  /**
   * Register a handler for key deletion events matching a glob pattern.
   */
  onKeyDeleted(pattern: string, handler: KeyspaceHandler): void {
    this.registerHandler(pattern, handler, new Set<KeyspaceEvent | "any">(["del"]));
    logger.debug("Registered keyspace handler for del events", { pattern });
  }

  /**
   * Register a handler for key eviction events matching a glob pattern.
   */
  onKeyEvicted(pattern: string, handler: KeyspaceHandler): void {
    this.registerHandler(pattern, handler, new Set<KeyspaceEvent | "any">(["evicted"]));
    logger.debug("Registered keyspace handler for evicted events", { pattern });
  }

  /**
   * Register a handler for any keyspace event matching a glob pattern.
   */
  onAnyEvent(pattern: string, handler: KeyspaceHandler): void {
    this.registerHandler(pattern, handler, new Set<KeyspaceEvent | "any">(["any"]));
    logger.debug("Registered keyspace handler for all events", { pattern });
  }

  /**
   * Stop listening for keyspace notifications and release connections.
   */
  async stop(): Promise<void> {
    if (!this.started) {
      logger.warn("KeyspaceNotificationManager is not started");
      return;
    }

    // Unsubscribe from all channels
    if (this.subscriber) {
      try {
        for (const channel of SUBSCRIBED_CHANNELS) {
          await this.subscriber.unsubscribe(channel);
          logger.debug("Unsubscribed from keyevent channel", { channel });
        }
      } catch (err) {
        logger.error("Error unsubscribing from keyevent channels", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.releaseConnections();
    this.started = false;

    logger.info("KeyspaceNotificationManager stopped");
  }

  /**
   * Return statistics about the current state of the notification manager.
   */
  getStats(): { subscribedChannels: number; registeredPatterns: number; started: boolean } {
    return {
      subscribedChannels: this.started ? SUBSCRIBED_CHANNELS.length : 0,
      registeredPatterns: this.handlers.size,
      started: this.started,
    };
  }

  /**
   * Check if a key matches a glob pattern.
   */
  private matchPattern(key: string, pattern: string): boolean {
    const regex = globToRegExp(pattern);
    return regex.test(key);
  }

  /**
   * Route a keyspace event to all matching registered handlers.
   */
  private routeEvent(key: string, event: KeyspaceEvent): void {
    let matchCount = 0;

    this.handlers.forEach((registrations, pattern) => {
      if (!this.matchPattern(key, pattern)) return;

      for (const registration of registrations) {
        if (registration.events.has("any") || registration.events.has(event)) {
          try {
            registration.handler(key, event);
            matchCount++;
          } catch (err) {
            logger.error("Error in keyspace event handler", {
              pattern,
              key,
              event,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    });

    if (matchCount > 0) {
      logger.debug("Keyspace event routed", { key, event, matchCount });
    }
  }

  /**
   * Register a handler for specific events on a glob pattern.
   */
  private registerHandler(
    pattern: string,
    handler: KeyspaceHandler,
    events: Set<KeyspaceEvent | "any">,
  ): void {
    const registration: HandlerRegistration = {
      pattern,
      handler,
      events,
      regex: globToRegExp(pattern),
    };

    const existing = this.handlers.get(pattern);
    if (existing) {
      existing.push(registration);
    } else {
      this.handlers.set(pattern, [registration]);
    }
  }

  /**
   * Release Redis connections back to the pool.
   */
  private releaseConnections(): void {
    if (this.configConnection) {
      releaseQueueConnection(this.configConnection);
      this.configConnection = null;
    }
    if (this.subscriber) {
      releaseQueueConnection(this.subscriber);
      this.subscriber = null;
    }
  }
}

export const keyspaceNotifications = new KeyspaceNotificationManager();
