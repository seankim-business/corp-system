/**
 * Tests for spawn rate limiter
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { getSpawnRateLimiter, resetRateLimiterInstance } from "../../orchestrator/spawn-rate-limiter";
import { redis } from "../../db/redis";

describe("SpawnRateLimiter", () => {
  const testUserId = "test-user-123";
  const testOrgId = "test-org-456";

  beforeEach(async () => {
    resetRateLimiterInstance();
  });

  afterEach(async () => {
    // Clean up test data
    const limiter = getSpawnRateLimiter();
    await limiter.resetLimits(testUserId, testOrgId);
  });

  describe("checkLimit", () => {
    it("should allow spawns under the limit", async () => {
      const limiter = getSpawnRateLimiter();

      const result = await limiter.checkLimit(testUserId, testOrgId);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
      expect(result.resetAt).toBeInstanceOf(Date);
      expect(result.reason).toBeUndefined();
    });

    it("should enforce per-user rate limit", async () => {
      const limiter = getSpawnRateLimiter({
        perUserLimit: 2,
        perOrgLimit: 100,
        windowSeconds: 60,
      });

      // First spawn - should be allowed
      let result = await limiter.checkLimit(testUserId, testOrgId);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
      await limiter.recordSpawn(testUserId, testOrgId);

      // Second spawn - should be allowed
      result = await limiter.checkLimit(testUserId, testOrgId);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
      await limiter.recordSpawn(testUserId, testOrgId);

      // Third spawn - should be blocked
      result = await limiter.checkLimit(testUserId, testOrgId);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.reason).toContain("user rate limit exceeded");
    });

    it("should enforce per-organization rate limit", async () => {
      const limiter = getSpawnRateLimiter({
        perUserLimit: 100,
        perOrgLimit: 2,
        windowSeconds: 60,
      });

      const userId1 = `${testUserId}-1`;
      const userId2 = `${testUserId}-2`;

      // First user spawns twice
      await limiter.recordSpawn(userId1, testOrgId);
      await limiter.recordSpawn(userId1, testOrgId);

      // Second user should be blocked (org limit reached)
      const result = await limiter.checkLimit(userId2, testOrgId);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("org rate limit exceeded");

      // Clean up
      await limiter.resetLimits(userId1, testOrgId);
      await limiter.resetLimits(userId2, testOrgId);
    });

    it("should return remaining count", async () => {
      const limiter = getSpawnRateLimiter({
        perUserLimit: 5,
        perOrgLimit: 10,
        windowSeconds: 60,
      });

      // No spawns yet
      let result = await limiter.checkLimit(testUserId, testOrgId);
      expect(result.remaining).toBe(5); // User limit is more restrictive

      // After one spawn
      await limiter.recordSpawn(testUserId, testOrgId);
      result = await limiter.checkLimit(testUserId, testOrgId);
      expect(result.remaining).toBe(4);

      // After two spawns
      await limiter.recordSpawn(testUserId, testOrgId);
      result = await limiter.checkLimit(testUserId, testOrgId);
      expect(result.remaining).toBe(3);
    });

    it("should handle concurrent checks correctly", async () => {
      const limiter = getSpawnRateLimiter({
        perUserLimit: 5,
        perOrgLimit: 10,
        windowSeconds: 60,
      });

      // Check multiple times in parallel
      const results = await Promise.all([
        limiter.checkLimit(testUserId, testOrgId),
        limiter.checkLimit(testUserId, testOrgId),
        limiter.checkLimit(testUserId, testOrgId),
      ]);

      // All should be allowed before any recording
      results.forEach((result) => {
        expect(result.allowed).toBe(true);
      });
    });
  });

  describe("recordSpawn", () => {
    it("should increment counter correctly", async () => {
      const limiter = getSpawnRateLimiter({
        perUserLimit: 5,
        perOrgLimit: 10,
        windowSeconds: 60,
      });

      let result = await limiter.checkLimit(testUserId, testOrgId);
      expect(result.remaining).toBe(5);

      await limiter.recordSpawn(testUserId, testOrgId);

      result = await limiter.checkLimit(testUserId, testOrgId);
      expect(result.remaining).toBe(4);
    });

    it("should not throw on recording failure", async () => {
      const limiter = getSpawnRateLimiter();

      // Recording should not throw even if Redis has issues
      await expect(limiter.recordSpawn(testUserId, testOrgId)).resolves.not.toThrow();
    });
  });

  describe("resetLimits", () => {
    it("should reset counters", async () => {
      const limiter = getSpawnRateLimiter({
        perUserLimit: 2,
        perOrgLimit: 10,
        windowSeconds: 60,
      });

      // Hit the limit
      await limiter.recordSpawn(testUserId, testOrgId);
      await limiter.recordSpawn(testUserId, testOrgId);

      let result = await limiter.checkLimit(testUserId, testOrgId);
      expect(result.allowed).toBe(false);

      // Reset
      await limiter.resetLimits(testUserId, testOrgId);

      // Should be allowed again
      result = await limiter.checkLimit(testUserId, testOrgId);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });
  });

  describe("sliding window behavior", () => {
    it("should use sliding window for rate limiting", async () => {
      const limiter = getSpawnRateLimiter({
        perUserLimit: 2,
        perOrgLimit: 10,
        windowSeconds: 1, // 1 second window for faster testing
      });

      // Record two spawns
      await limiter.recordSpawn(testUserId, testOrgId);
      await limiter.recordSpawn(testUserId, testOrgId);

      // Should be blocked
      let result = await limiter.checkLimit(testUserId, testOrgId);
      expect(result.allowed).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should be allowed again
      result = await limiter.checkLimit(testUserId, testOrgId);
      expect(result.allowed).toBe(true);
    });
  });

  describe("fail-open behavior", () => {
    it("should allow requests if rate limit check fails", async () => {
      const limiter = getSpawnRateLimiter();

      // Mock Redis failure by passing invalid IDs
      const result = await limiter.checkLimit("", "");

      // Should fail open (allow the request)
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain("failed");
    });
  });
});
