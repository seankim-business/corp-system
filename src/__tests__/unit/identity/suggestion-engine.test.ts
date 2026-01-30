/**
 * SuggestionEngine Tests
 *
 * Tests for identity link suggestion management
 */

jest.mock("../../../db/client", () => ({
  db: {
    $transaction: jest.fn(),
    identityLinkSuggestion: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    identitySettings: {
      findUnique: jest.fn(),
    },
    identityLinkAudit: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
  },
}));

jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { SuggestionEngine } from "../../../services/identity/suggestion-engine";
import { db } from "../../../db/client";
import type { LinkCandidate } from "../../../services/identity/types";

describe("SuggestionEngine", () => {
  let engine: SuggestionEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new SuggestionEngine();

    // Default transaction mock
    (db.$transaction as jest.Mock).mockImplementation(async (callback) => {
      return callback(db);
    });
  });

  describe("createSuggestions", () => {
    const candidates: LinkCandidate[] = [
      {
        userId: "user-1",
        email: "john@acme.com",
        displayName: "John Smith",
        matchResult: {
          score: 0.9,
          method: "jaro_winkler",
          confidence: 0.9,
          details: { algorithm: "dice" },
        },
      },
      {
        userId: "user-2",
        email: "jon@acme.com",
        displayName: "Jon Smith",
        matchResult: {
          score: 0.88,
          method: "jaro_winkler",
          confidence: 0.88,
        },
      },
    ];

    it("should create suggestions for candidates", async () => {
      (db.identitySettings.findUnique as jest.Mock).mockResolvedValue({
        suggestionExpiryDays: 30,
      });

      await engine.createSuggestions("ext-1", "org-1", candidates);

      expect(db.identityLinkSuggestion.upsert).toHaveBeenCalledTimes(2);

      expect(db.identityLinkSuggestion.upsert).toHaveBeenNthCalledWith(1, {
        where: {
          externalIdentityId_suggestedUserId: {
            externalIdentityId: "ext-1",
            suggestedUserId: "user-1",
          },
        },
        create: {
          organizationId: "org-1",
          externalIdentityId: "ext-1",
          suggestedUserId: "user-1",
          matchMethod: "jaro_winkler",
          confidenceScore: 0.9,
          matchDetails: { algorithm: "dice" },
          status: "pending",
          expiresAt: expect.any(Date),
        },
        update: {
          matchMethod: "jaro_winkler",
          confidenceScore: 0.9,
          matchDetails: { algorithm: "dice" },
          expiresAt: expect.any(Date),
        },
      });
    });

    it("should use default expiry days if settings not found", async () => {
      (db.identitySettings.findUnique as jest.Mock).mockResolvedValue(null);

      await engine.createSuggestions("ext-1", "org-1", candidates);

      const upsertCall = (db.identityLinkSuggestion.upsert as jest.Mock).mock.calls[0][0];
      const expiresAt = upsertCall.create.expiresAt as Date;
      const now = new Date();
      const diffDays = Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      expect(diffDays).toBe(30); // Default expiry
    });

    it("should respect custom expiry days from settings", async () => {
      (db.identitySettings.findUnique as jest.Mock).mockResolvedValue({
        suggestionExpiryDays: 60,
      });

      await engine.createSuggestions("ext-1", "org-1", candidates);

      const upsertCall = (db.identityLinkSuggestion.upsert as jest.Mock).mock.calls[0][0];
      const expiresAt = upsertCall.create.expiresAt as Date;
      const now = new Date();
      const diffDays = Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      expect(diffDays).toBe(60);
    });

    it("should create audit log for suggestion creation", async () => {
      (db.identitySettings.findUnique as jest.Mock).mockResolvedValue(null);

      await engine.createSuggestions("ext-1", "org-1", candidates);

      expect(db.identityLinkAudit.create).toHaveBeenCalledWith({
        data: {
          organizationId: "org-1",
          externalIdentityId: "ext-1",
          action: "suggestion_created",
          performedBy: null, // System action
          metadata: {
            candidateCount: 2,
            topConfidence: 0.9,
            topMethod: "jaro_winkler",
          },
        },
      });
    });

    it("should handle empty candidate list", async () => {
      await engine.createSuggestions("ext-1", "org-1", []);

      expect(db.identityLinkSuggestion.upsert).not.toHaveBeenCalled();
      expect(db.identityLinkAudit.create).not.toHaveBeenCalled();
    });

    it("should handle upsert errors gracefully", async () => {
      (db.identitySettings.findUnique as jest.Mock).mockResolvedValue(null);
      (db.identityLinkSuggestion.upsert as jest.Mock)
        .mockResolvedValueOnce({}) // First succeeds
        .mockRejectedValueOnce(new Error("Duplicate key")); // Second fails

      // Should not throw, but continue
      await expect(
        engine.createSuggestions("ext-1", "org-1", candidates),
      ).resolves.not.toThrow();

      expect(db.identityLinkSuggestion.upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe("getSuggestionsForUser", () => {
    it("should get pending suggestions for user", async () => {
      const suggestions = [
        {
          id: "sugg-1",
          externalIdentityId: "ext-1",
          suggestedUserId: "user-1",
          confidenceScore: 0.9,
          status: "pending",
          externalIdentity: { id: "ext-1" },
        },
      ];

      (db.identityLinkSuggestion.findMany as jest.Mock).mockResolvedValue(suggestions);

      const result = await engine.getSuggestionsForUser("org-1", "user-1");

      expect(result).toEqual(suggestions);
      expect(db.identityLinkSuggestion.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: "org-1",
          suggestedUserId: "user-1",
          status: "pending",
          expiresAt: { gt: expect.any(Date) },
        },
        include: {
          externalIdentity: true,
        },
        orderBy: { confidenceScore: "desc" },
      });
    });

    it("should filter out expired suggestions", async () => {
      (db.identityLinkSuggestion.findMany as jest.Mock).mockResolvedValue([]);

      await engine.getSuggestionsForUser("org-1", "user-1");

      const call = (db.identityLinkSuggestion.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.expiresAt.gt).toBeInstanceOf(Date);
    });
  });

  describe("getPendingSuggestions", () => {
    it("should get all pending suggestions for org", async () => {
      const suggestions = [
        {
          id: "sugg-1",
          confidenceScore: 0.95,
          createdAt: new Date(),
        },
        {
          id: "sugg-2",
          confidenceScore: 0.88,
          createdAt: new Date(),
        },
      ];

      (db.identityLinkSuggestion.findMany as jest.Mock).mockResolvedValue(suggestions);

      const result = await engine.getPendingSuggestions("org-1");

      expect(result).toEqual(suggestions);
      expect(db.identityLinkSuggestion.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: "org-1",
          status: "pending",
          expiresAt: { gt: expect.any(Date) },
        },
        include: {
          externalIdentity: true,
          suggestedUser: {
            select: { id: true, email: true, displayName: true, avatarUrl: true },
          },
        },
        orderBy: [{ confidenceScore: "desc" }, { createdAt: "desc" }],
      });
    });
  });

  describe("getSuggestionById", () => {
    it("should get suggestion by ID", async () => {
      const suggestion = {
        id: "sugg-1",
        externalIdentityId: "ext-1",
        suggestedUserId: "user-1",
      };

      (db.identityLinkSuggestion.findUnique as jest.Mock).mockResolvedValue(suggestion);

      const result = await engine.getSuggestionById("sugg-1");

      expect(result).toEqual(suggestion);
      expect(db.identityLinkSuggestion.findUnique).toHaveBeenCalledWith({
        where: { id: "sugg-1" },
        include: {
          externalIdentity: true,
          suggestedUser: {
            select: { id: true, email: true, displayName: true, avatarUrl: true },
          },
        },
      });
    });
  });

  describe("expireSuggestions", () => {
    it("should expire old pending suggestions", async () => {
      const toExpire = [
        { id: "sugg-1", organizationId: "org-1", externalIdentityId: "ext-1" },
        { id: "sugg-2", organizationId: "org-1", externalIdentityId: "ext-2" },
      ];

      (db.identityLinkSuggestion.findMany as jest.Mock).mockResolvedValue(toExpire);
      (db.identityLinkSuggestion.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

      const expired = await engine.expireSuggestions();

      expect(expired).toBe(2);

      expect(db.identityLinkSuggestion.updateMany).toHaveBeenCalledWith({
        where: {
          status: "pending",
          expiresAt: { lte: expect.any(Date) },
        },
        data: {
          status: "expired",
        },
      });

      expect(db.identityLinkAudit.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            organizationId: "org-1",
            externalIdentityId: "ext-1",
            action: "suggestion_created",
            performedBy: null,
            metadata: expect.objectContaining({ expired: true }),
          }),
        ]),
      });
    });

    it("should return 0 if no suggestions to expire", async () => {
      (db.identityLinkSuggestion.findMany as jest.Mock).mockResolvedValue([]);

      const expired = await engine.expireSuggestions();

      expect(expired).toBe(0);
      expect(db.identityLinkSuggestion.updateMany).not.toHaveBeenCalled();
      expect(db.identityLinkAudit.createMany).not.toHaveBeenCalled();
    });

    it("should only expire pending suggestions past expiry date", async () => {
      (db.identityLinkSuggestion.findMany as jest.Mock).mockResolvedValue([]);

      await engine.expireSuggestions();

      expect(db.identityLinkSuggestion.findMany).toHaveBeenCalledWith({
        where: {
          status: "pending",
          expiresAt: { lte: expect.any(Date) },
        },
        select: {
          id: true,
          organizationId: true,
          externalIdentityId: true,
        },
      });
    });
  });

  describe("getStats", () => {
    it("should return suggestion statistics", async () => {
      (db.identityLinkSuggestion.count as jest.Mock)
        .mockResolvedValueOnce(10) // pending
        .mockResolvedValueOnce(25) // accepted
        .mockResolvedValueOnce(15) // rejected
        .mockResolvedValueOnce(5); // expired

      const stats = await engine.getStats("org-1");

      expect(stats).toEqual({
        pending: 10,
        accepted: 25,
        rejected: 15,
        expired: 5,
        total: 55,
      });
    });

    it("should handle zero suggestions", async () => {
      (db.identityLinkSuggestion.count as jest.Mock).mockResolvedValue(0);

      const stats = await engine.getStats("org-1");

      expect(stats).toEqual({
        pending: 0,
        accepted: 0,
        rejected: 0,
        expired: 0,
        total: 0,
      });
    });
  });

  describe("cleanupOldSuggestions", () => {
    it("should delete old processed suggestions", async () => {
      (db.identityLinkSuggestion.deleteMany as jest.Mock).mockResolvedValue({ count: 42 });

      const deleted = await engine.cleanupOldSuggestions(90);

      expect(deleted).toBe(42);

      const call = (db.identityLinkSuggestion.deleteMany as jest.Mock).mock.calls[0][0];
      expect(call.where.status.in).toEqual(["accepted", "rejected", "expired", "superseded"]);
      expect(call.where.updatedAt.lt).toBeInstanceOf(Date);

      // Check that cutoff is approximately 90 days ago
      const cutoff = call.where.updatedAt.lt as Date;
      const now = new Date();
      const diffDays = Math.round((now.getTime() - cutoff.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(90);
    });

    it("should use default retention of 90 days", async () => {
      (db.identityLinkSuggestion.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

      await engine.cleanupOldSuggestions();

      const call = (db.identityLinkSuggestion.deleteMany as jest.Mock).mock.calls[0][0];
      const cutoff = call.where.updatedAt.lt as Date;
      const now = new Date();
      const diffDays = Math.round((now.getTime() - cutoff.getTime()) / (1000 * 60 * 60 * 24));

      expect(diffDays).toBe(90);
    });

    it("should return 0 if no suggestions deleted", async () => {
      (db.identityLinkSuggestion.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

      const deleted = await engine.cleanupOldSuggestions(90);

      expect(deleted).toBe(0);
    });

    it("should not delete pending suggestions", async () => {
      (db.identityLinkSuggestion.deleteMany as jest.Mock).mockResolvedValue({ count: 10 });

      await engine.cleanupOldSuggestions(90);

      const call = (db.identityLinkSuggestion.deleteMany as jest.Mock).mock.calls[0][0];
      expect(call.where.status.in).not.toContain("pending");
    });
  });

  describe("suggestion expiry calculation", () => {
    it("should calculate correct expiry date", async () => {
      (db.identitySettings.findUnique as jest.Mock).mockResolvedValue({
        suggestionExpiryDays: 45,
      });

      const candidates: LinkCandidate[] = [
        {
          userId: "user-1",
          email: "john@acme.com",
          matchResult: {
            score: 0.9,
            method: "jaro_winkler",
            confidence: 0.9,
          },
        },
      ];

      await engine.createSuggestions("ext-1", "org-1", candidates);

      const upsertCall = (db.identityLinkSuggestion.upsert as jest.Mock).mock.calls[0][0];
      const expiresAt = upsertCall.create.expiresAt as Date;
      const now = new Date();

      const diffMs = expiresAt.getTime() - now.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      expect(diffDays).toBe(45);
    });
  });

  describe("audit logging", () => {
    it("should log suggestion creation with metadata", async () => {
      (db.identitySettings.findUnique as jest.Mock).mockResolvedValue(null);

      const candidates: LinkCandidate[] = [
        {
          userId: "user-1",
          email: "john@acme.com",
          matchResult: {
            score: 0.95,
            method: "normalized",
            confidence: 0.95,
          },
        },
      ];

      await engine.createSuggestions("ext-1", "org-1", candidates);

      expect(db.identityLinkAudit.create).toHaveBeenCalledWith({
        data: {
          organizationId: "org-1",
          externalIdentityId: "ext-1",
          action: "suggestion_created",
          performedBy: null,
          metadata: {
            candidateCount: 1,
            topConfidence: 0.95,
            topMethod: "normalized",
          },
        },
      });
    });

    it("should use null performedBy for system actions", async () => {
      (db.identitySettings.findUnique as jest.Mock).mockResolvedValue(null);

      const candidates: LinkCandidate[] = [
        {
          userId: "user-1",
          email: "john@acme.com",
          matchResult: {
            score: 0.9,
            method: "jaro_winkler",
            confidence: 0.9,
          },
        },
      ];

      await engine.createSuggestions("ext-1", "org-1", candidates);

      const auditCall = (db.identityLinkAudit.create as jest.Mock).mock.calls[0][0];
      expect(auditCall.data.performedBy).toBeNull();
    });
  });
});
