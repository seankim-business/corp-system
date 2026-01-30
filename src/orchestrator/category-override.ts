import { Category } from "./types";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";

const OVERRIDE_PREFIX = "category:override:";
const OVERRIDE_TTL = 86400; // 24 hours

export interface CategoryOverride {
  category: Category;
  reason: string;
  setBy: string; // userId who set it
  expiresAt?: number; // Unix timestamp
  pattern?: string; // regex pattern to match requests
}

export interface OverrideCheckResult {
  hasOverride: boolean;
  override?: CategoryOverride;
  scope: "user" | "organization" | "pattern" | "none";
}

function orgKey(orgId: string): string {
  return `${OVERRIDE_PREFIX}org:${orgId}`;
}

function userKey(orgId: string, userId: string): string {
  return `${OVERRIDE_PREFIX}user:${orgId}:${userId}`;
}

function computeTtl(override: CategoryOverride): number {
  if (override.expiresAt) {
    const remaining = Math.floor(override.expiresAt - Date.now() / 1000);
    return remaining > 0 ? remaining : OVERRIDE_TTL;
  }
  return OVERRIDE_TTL;
}

/**
 * Set an organization-wide category override.
 * All users in the organization will inherit this override unless
 * they have a user-specific override.
 */
export async function setOrganizationOverride(
  orgId: string,
  override: CategoryOverride,
): Promise<void> {
  const key = orgKey(orgId);
  const ttl = computeTtl(override);
  const serialized = JSON.stringify(override);

  const success = await redis.set(key, serialized, ttl);
  if (success) {
    logger.info("Organization category override set", {
      orgId,
      category: override.category,
      reason: override.reason,
      setBy: override.setBy,
      ttl,
    });
  } else {
    logger.error("Failed to set organization category override", {
      orgId,
      category: override.category,
    });
  }
}

/**
 * Set a user-specific category override within an organization.
 * Takes precedence over organization-level overrides.
 */
export async function setUserOverride(
  orgId: string,
  userId: string,
  override: CategoryOverride,
): Promise<void> {
  const key = userKey(orgId, userId);
  const ttl = computeTtl(override);
  const serialized = JSON.stringify(override);

  const success = await redis.set(key, serialized, ttl);
  if (success) {
    logger.info("User category override set", {
      orgId,
      userId,
      category: override.category,
      reason: override.reason,
      setBy: override.setBy,
      ttl,
    });
  } else {
    logger.error("Failed to set user category override", {
      orgId,
      userId,
      category: override.category,
    });
  }
}

/**
 * Clear an override. If userId is provided, clears the user-specific override.
 * Otherwise, clears the organization-level override.
 */
export async function clearOverride(
  orgId: string,
  userId?: string,
): Promise<void> {
  const key = userId ? userKey(orgId, userId) : orgKey(orgId);

  const success = await redis.del(key);
  if (success) {
    logger.info("Category override cleared", {
      orgId,
      userId: userId ?? null,
      scope: userId ? "user" : "organization",
    });
  } else {
    logger.error("Failed to clear category override", {
      orgId,
      userId: userId ?? null,
    });
  }
}

/**
 * Check if a category override applies for the given org/user/request.
 *
 * Precedence order (highest to lowest):
 * 1. User-specific override
 * 2. Organization-level override (with pattern match if pattern is set)
 * 3. No override
 */
export async function checkOverride(
  orgId: string,
  userId: string,
  userRequest: string,
): Promise<OverrideCheckResult> {
  // 1. Check user-specific override (highest precedence)
  const userRaw = await redis.get(userKey(orgId, userId));
  if (userRaw) {
    try {
      const override: CategoryOverride = JSON.parse(userRaw);

      // Check expiration if expiresAt is set
      if (override.expiresAt && Date.now() / 1000 > override.expiresAt) {
        await redis.del(userKey(orgId, userId));
        logger.debug("User override expired, removed", { orgId, userId });
      } else {
        logger.debug("User category override matched", {
          orgId,
          userId,
          category: override.category,
        });
        return { hasOverride: true, override, scope: "user" };
      }
    } catch (err) {
      logger.error("Failed to parse user category override", {
        orgId,
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 2. Check organization-level override
  const orgRaw = await redis.get(orgKey(orgId));
  if (orgRaw) {
    try {
      const override: CategoryOverride = JSON.parse(orgRaw);

      // Check expiration if expiresAt is set
      if (override.expiresAt && Date.now() / 1000 > override.expiresAt) {
        await redis.del(orgKey(orgId));
        logger.debug("Organization override expired, removed", { orgId });
      } else {
        // If the override has a pattern, check if the request matches
        if (override.pattern) {
          try {
            const regex = new RegExp(override.pattern, "i");
            if (regex.test(userRequest)) {
              logger.debug("Organization pattern override matched", {
                orgId,
                pattern: override.pattern,
                category: override.category,
              });
              return { hasOverride: true, override, scope: "pattern" };
            }
            // Pattern didn't match, fall through to no override
            logger.debug("Organization pattern override did not match request", {
              orgId,
              pattern: override.pattern,
            });
          } catch (regexErr) {
            logger.error("Invalid regex pattern in category override", {
              orgId,
              pattern: override.pattern,
              error:
                regexErr instanceof Error
                  ? regexErr.message
                  : String(regexErr),
            });
          }
        } else {
          // No pattern - org override applies unconditionally
          logger.debug("Organization category override matched", {
            orgId,
            category: override.category,
          });
          return { hasOverride: true, override, scope: "organization" };
        }
      }
    } catch (err) {
      logger.error("Failed to parse organization category override", {
        orgId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 3. No override found
  return { hasOverride: false, scope: "none" };
}
