/**
 * Installation Modes for Marketplace Hub
 *
 * Defines policies and types for controlling how agents/skills are installed
 * from the marketplace.
 */

/**
 * Installation mode determines user interaction level for installations
 * - manual: User must explicitly approve each installation
 * - recommend: Bot suggests installation, waits for user approval
 * - yolo: Bot auto-installs without user intervention (within policy limits)
 */
export type InstallationMode = "manual" | "recommend" | "yolo";

/**
 * Base installation policy configuration
 */
export interface InstallationPolicy {
  /** Installation mode: manual, recommend, or yolo */
  mode: InstallationMode;

  /** Whitelist of allowed sources (marketplace URLs, git repos, etc.) */
  allowedSources?: string[];

  /** Blacklist of blocked sources */
  blockedSources?: string[];

  /** Maximum number of auto-installs allowed per session (only applies to yolo mode) */
  maxAutoInstalls?: number;

  /** Require human review even in YOLO mode (adds confirmation step) */
  requireReview?: boolean;
}

/**
 * Organization-level installation settings
 * Applied to all agents in the organization unless overridden
 */
export interface OrganizationInstallationSettings {
  /** Organization ID */
  organizationId: string;

  /** Default installation policy for the organization */
  defaultPolicy: InstallationPolicy;

  /** Global allowed sources (merged with agent-specific allowlists) */
  globalAllowedSources?: string[];

  /** Global blocked sources (merged with agent-specific blocklists) */
  globalBlockedSources?: string[];

  /** Maximum auto-installs per organization per day */
  dailyAutoInstallLimit?: number;

  /** Require security scan before installation */
  requireSecurityScan?: boolean;

  /** Require code review before installation */
  requireCodeReview?: boolean;

  /** Allow agents to override organization policy */
  allowAgentOverrides?: boolean;
}

/**
 * Per-agent installation policy overrides
 * Allows individual agents to have different policies than org defaults
 */
export interface AgentInstallationPolicy {
  /** Agent ID */
  agentId: string;

  /** Override installation policy (if null, uses org default) */
  policy?: InstallationPolicy;

  /** Agent-specific allowed sources (merged with org allowlist) */
  allowedSources?: string[];

  /** Agent-specific blocked sources (merged with org blocklist) */
  blockedSources?: string[];

  /** Override max auto-installs for this agent */
  maxAutoInstalls?: number;
}

/**
 * Installation decision result
 */
export interface InstallationDecision {
  /** Whether installation is allowed */
  allowed: boolean;

  /** Effective mode after policy evaluation */
  effectiveMode: InstallationMode;

  /** Reason for decision (useful for logging/debugging) */
  reason: string;

  /** Whether user confirmation is required */
  requiresConfirmation: boolean;
}

/**
 * Auto-install tracking data
 */
export interface AutoInstallTracker {
  /** Organization ID */
  organizationId: string;

  /** Session ID */
  sessionId: string;

  /** Number of auto-installs in current session */
  sessionCount: number;

  /** Number of auto-installs today */
  dailyCount: number;

  /** Last auto-install timestamp */
  lastInstallAt?: Date;
}

/**
 * Installation policy checker
 * Validates installation requests against policies and limits
 */
export class InstallationPolicyChecker {
  private autoInstallTracking: Map<string, AutoInstallTracker> = new Map();

  /**
   * Check if installation is allowed under current policy
   *
   * @param policy Installation policy to check against
   * @param source Source of the installation (URL, repo, etc.)
   * @param _mode Requested installation mode (reserved for future use)
   * @returns Installation decision
   */
  canInstall(
    policy: InstallationPolicy,
    source: string,
    _mode?: InstallationMode
  ): InstallationDecision {
    // Check blocklist first (blocklist takes precedence)
    if (policy.blockedSources?.some(blocked => this.matchesSource(source, blocked))) {
      return {
        allowed: false,
        effectiveMode: "manual",
        reason: "Source is blocked by policy",
        requiresConfirmation: true,
      };
    }

    // Check allowlist if defined
    if (policy.allowedSources && policy.allowedSources.length > 0) {
      const isAllowed = policy.allowedSources.some(allowed =>
        this.matchesSource(source, allowed)
      );
      if (!isAllowed) {
        return {
          allowed: false,
          effectiveMode: "manual",
          reason: "Source is not in allowed sources list",
          requiresConfirmation: true,
        };
      }
    }

    // Check mode compatibility
    if (policy.mode === "manual") {
      return {
        allowed: true,
        effectiveMode: "manual",
        reason: "Manual mode requires explicit user approval",
        requiresConfirmation: true,
      };
    }

    if (policy.mode === "recommend") {
      return {
        allowed: true,
        effectiveMode: "recommend",
        reason: "Recommend mode - bot will suggest installation",
        requiresConfirmation: true,
      };
    }

    // YOLO mode
    const requiresReview = policy.requireReview === true;
    return {
      allowed: true,
      effectiveMode: "yolo",
      reason: requiresReview
        ? "YOLO mode with review required"
        : "YOLO mode - auto-install enabled",
      requiresConfirmation: requiresReview,
    };
  }

  /**
   * Get effective policy by merging org settings and agent overrides
   *
   * @param orgSettings Organization installation settings
   * @param agentPolicy Optional agent-specific policy overrides
   * @returns Merged effective policy
   */
  getEffectivePolicy(
    orgSettings: OrganizationInstallationSettings,
    agentPolicy?: AgentInstallationPolicy
  ): InstallationPolicy {
    // If agent overrides not allowed, return org default
    if (!orgSettings.allowAgentOverrides && agentPolicy?.policy) {
      return orgSettings.defaultPolicy;
    }

    // Start with org default policy
    const effectivePolicy: InstallationPolicy = {
      ...orgSettings.defaultPolicy,
    };

    // Apply agent overrides if provided
    if (agentPolicy) {
      if (agentPolicy.policy) {
        effectivePolicy.mode = agentPolicy.policy.mode;
        effectivePolicy.requireReview = agentPolicy.policy.requireReview;
      }

      if (agentPolicy.maxAutoInstalls !== undefined) {
        effectivePolicy.maxAutoInstalls = agentPolicy.maxAutoInstalls;
      }

      // Merge allowed sources (org + agent)
      const allowedSources = new Set<string>([
        ...(orgSettings.globalAllowedSources || []),
        ...(orgSettings.defaultPolicy.allowedSources || []),
        ...(agentPolicy.policy?.allowedSources || []),
        ...(agentPolicy.allowedSources || []),
      ]);
      effectivePolicy.allowedSources = Array.from(allowedSources);

      // Merge blocked sources (org + agent)
      const blockedSources = new Set<string>([
        ...(orgSettings.globalBlockedSources || []),
        ...(orgSettings.defaultPolicy.blockedSources || []),
        ...(agentPolicy.policy?.blockedSources || []),
        ...(agentPolicy.blockedSources || []),
      ]);
      effectivePolicy.blockedSources = Array.from(blockedSources);
    } else {
      // No agent policy, merge org global sources
      const allowedSources = new Set<string>([
        ...(orgSettings.globalAllowedSources || []),
        ...(orgSettings.defaultPolicy.allowedSources || []),
      ]);
      effectivePolicy.allowedSources = Array.from(allowedSources);

      const blockedSources = new Set<string>([
        ...(orgSettings.globalBlockedSources || []),
        ...(orgSettings.defaultPolicy.blockedSources || []),
      ]);
      effectivePolicy.blockedSources = Array.from(blockedSources);
    }

    return effectivePolicy;
  }

  /**
   * Check if auto-install limit has been reached
   *
   * @param organizationId Organization ID
   * @param sessionId Session ID
   * @param policy Installation policy with limits
   * @returns True if limit reached, false otherwise
   */
  checkAutoInstallLimit(
    organizationId: string,
    sessionId: string,
    policy: InstallationPolicy
  ): boolean {
    const trackingKey = `${organizationId}:${sessionId}`;
    const tracker = this.autoInstallTracking.get(trackingKey);

    if (!tracker) {
      return false; // No installs yet, limit not reached
    }

    // Check session limit
    if (policy.maxAutoInstalls !== undefined) {
      if (tracker.sessionCount >= policy.maxAutoInstalls) {
        return true;
      }
    }

    return false;
  }

  /**
   * Record an auto-install
   *
   * @param organizationId Organization ID
   * @param sessionId Session ID
   */
  recordAutoInstall(organizationId: string, sessionId: string): void {
    const trackingKey = `${organizationId}:${sessionId}`;
    const tracker = this.autoInstallTracking.get(trackingKey);

    const now = new Date();

    if (!tracker) {
      this.autoInstallTracking.set(trackingKey, {
        organizationId,
        sessionId,
        sessionCount: 1,
        dailyCount: 1,
        lastInstallAt: now,
      });
    } else {
      // Reset daily count if it's a new day
      const lastInstall = tracker.lastInstallAt;
      const isNewDay =
        !lastInstall ||
        now.toDateString() !== lastInstall.toDateString();

      tracker.sessionCount += 1;
      tracker.dailyCount = isNewDay ? 1 : tracker.dailyCount + 1;
      tracker.lastInstallAt = now;
    }
  }

  /**
   * Get current auto-install counts
   *
   * @param organizationId Organization ID
   * @param sessionId Session ID
   * @returns Auto-install tracker or undefined if none exists
   */
  getAutoInstallCounts(
    organizationId: string,
    sessionId: string
  ): AutoInstallTracker | undefined {
    const trackingKey = `${organizationId}:${sessionId}`;
    return this.autoInstallTracking.get(trackingKey);
  }

  /**
   * Reset auto-install tracking for a session
   *
   * @param organizationId Organization ID
   * @param sessionId Session ID
   */
  resetSessionTracking(organizationId: string, sessionId: string): void {
    const trackingKey = `${organizationId}:${sessionId}`;
    this.autoInstallTracking.delete(trackingKey);
  }

  /**
   * Check if source matches pattern (supports wildcards)
   *
   * @param source Source to check
   * @param pattern Pattern to match against (supports * wildcard)
   * @returns True if matches, false otherwise
   */
  private matchesSource(source: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // Escape regex special chars
      .replace(/\*/g, ".*"); // Convert * to .*

    const regex = new RegExp(`^${regexPattern}$`, "i");
    return regex.test(source);
  }
}

/**
 * Get default installation policy
 *
 * @returns Default installation policy (manual mode, no restrictions)
 */
export function getDefaultPolicy(): InstallationPolicy {
  return {
    mode: "manual",
    requireReview: false,
  };
}

/**
 * Get default organization settings
 *
 * @param organizationId Organization ID
 * @returns Default organization installation settings
 */
export function getDefaultOrganizationSettings(
  organizationId: string
): OrganizationInstallationSettings {
  return {
    organizationId,
    defaultPolicy: getDefaultPolicy(),
    allowAgentOverrides: true,
    requireSecurityScan: false,
    requireCodeReview: false,
  };
}
