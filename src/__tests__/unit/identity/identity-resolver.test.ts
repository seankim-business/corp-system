/**
 * IdentityResolver Tests
 *
 * Tests for main identity resolution service
 */

jest.mock("../../../db/client", () => ({
  db: {
    externalIdentity: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    membership: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    identitySettings: {
      findUnique: jest.fn(),
    },
    identityLinkSuggestion: {
      count: jest.fn(),
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

import { IdentityResolver } from "../../../services/identity/identity-resolver";
import { FuzzyMatcher } from "../../../services/identity/fuzzy-matcher";
import { IdentityLinker } from "../../../services/identity/identity-linker";
import { SuggestionEngine } from "../../../services/identity/suggestion-engine";
import { db } from "../../../db/client";
import type { ExternalIdentityProfile, IdentityResolutionOptions } from "../../../services/identity/types";

describe("IdentityResolver", () => {
  let resolver: IdentityResolver;
  let mockMatcher: jest.Mocked<FuzzyMatcher>;
  let mockLinker: jest.Mocked<IdentityLinker>;
  let mockSuggestions: jest.Mocked<SuggestionEngine>;

  const mockProfile: ExternalIdentityProfile = {
    provider: "slack",
    providerUserId: "U123",
    providerTeamId: "T456",
    email: "john@acme.com",
    displayName: "John Smith",
    realName: "John Smith",
    avatarUrl: "https://example.com/avatar.jpg",
  };

  const mockOptions: IdentityResolutionOptions = {
    organizationId: "org-1",
    performedBy: "user-1",
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mocked dependencies
    mockMatcher = {
      match: jest.fn(),
      matchBatch: jest.fn(),
      isSameCorporateDomain: jest.fn(),
      getEmailDomain: jest.fn(),
    } as any;

    mockLinker = {
      linkIdentity: jest.fn(),
      unlinkIdentity: jest.fn(),
      processSuggestionDecision: jest.fn(),
      relinkIdentity: jest.fn(),
    } as any;

    mockSuggestions = {
      createSuggestions: jest.fn(),
      getSuggestionsForUser: jest.fn(),
      getPendingSuggestions: jest.fn(),
      getSuggestionById: jest.fn(),
      expireSuggestions: jest.fn(),
      getStats: jest.fn(),
      cleanupOldSuggestions: jest.fn(),
    } as any;

    resolver = new IdentityResolver(mockMatcher, mockLinker, mockSuggestions);

    // Default mock for identitySettings
    (db.identitySettings.findUnique as jest.Mock).mockResolvedValue(null);
  });

  describe("resolveIdentity - already linked", () => {
    it("should return early if identity already linked", async () => {
      const existingIdentity = {
        id: "ext-1",
        userId: "user-1",
        linkStatus: "linked",
        organizationId: "org-1",
      };

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(existingIdentity);
      (db.externalIdentity.update as jest.Mock).mockResolvedValue(existingIdentity);

      const result = await resolver.resolveIdentity(mockProfile, mockOptions);

      expect(result.action).toBe("already_linked");
      expect(result.externalIdentityId).toBe("ext-1");
      expect(result.linkedUserId).toBe("user-1");
      expect(mockLinker.linkIdentity).not.toHaveBeenCalled();
    });
  });

  describe("resolveIdentity - auto-link by email", () => {
    it("should auto-link on exact email match", async () => {
      const existingIdentity = {
        id: "ext-1",
        userId: null,
        linkStatus: "unlinked",
        organizationId: "org-1",
      };

      const matchingUser = {
        id: "user-1",
        email: "john@acme.com",
        displayName: "John Smith",
      };

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(existingIdentity);
      (db.externalIdentity.update as jest.Mock).mockResolvedValue(existingIdentity);
      (db.membership.findFirst as jest.Mock).mockResolvedValue({ user: matchingUser });
      (mockLinker.linkIdentity as jest.Mock).mockResolvedValue(undefined);

      const result = await resolver.resolveIdentity(mockProfile, mockOptions);

      expect(result.action).toBe("auto_linked");
      expect(result.linkedUserId).toBe("user-1");
      expect(result.confidence).toBe(0.98);
      expect(result.method).toBe("auto_email");

      expect(mockLinker.linkIdentity).toHaveBeenCalledWith({
        externalIdentityId: "ext-1",
        userId: "user-1",
        method: "auto_email",
        performedBy: "user-1",
      });
    });

    it("should skip auto-link if email not provided", async () => {
      const profileNoEmail = { ...mockProfile, email: undefined };

      const existingIdentity = {
        id: "ext-1",
        userId: null,
        linkStatus: "unlinked",
        organizationId: "org-1",
      };

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(existingIdentity);
      (db.externalIdentity.update as jest.Mock).mockResolvedValue(existingIdentity);
      (db.membership.findMany as jest.Mock).mockResolvedValue([]);

      const result = await resolver.resolveIdentity(profileNoEmail, mockOptions);

      expect(result.action).toBe("no_match");
      expect(mockLinker.linkIdentity).not.toHaveBeenCalled();
    });

    it("should skip auto-link if skipAutoLink option set", async () => {
      const existingIdentity = {
        id: "ext-1",
        userId: null,
        linkStatus: "unlinked",
        organizationId: "org-1",
      };

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(existingIdentity);
      (db.externalIdentity.update as jest.Mock).mockResolvedValue(existingIdentity);
      (db.membership.findFirst as jest.Mock).mockResolvedValue({
        user: { id: "user-1", email: "john@acme.com" },
      });
      (db.membership.findMany as jest.Mock).mockResolvedValue([]);

      await resolver.resolveIdentity(mockProfile, {
        ...mockOptions,
        skipAutoLink: true,
      });

      expect(mockLinker.linkIdentity).not.toHaveBeenCalled();
    });
  });

  describe("resolveIdentity - auto-link by fuzzy name", () => {
    it("should auto-link on single high-confidence match", async () => {
      const existingIdentity = {
        id: "ext-1",
        userId: null,
        linkStatus: "unlinked",
        organizationId: "org-1",
      };

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(existingIdentity);
      (db.externalIdentity.update as jest.Mock).mockResolvedValue(existingIdentity);
      (db.membership.findFirst as jest.Mock).mockResolvedValue(null); // No email match
      (db.membership.findMany as jest.Mock).mockResolvedValue([
        {
          user: { id: "user-1", email: "john@acme.com", displayName: "John Smith" },
        },
      ]);

      mockMatcher.match.mockReturnValue({
        score: 0.96,
        method: "jaro_winkler",
        confidence: 0.96,
      });

      mockMatcher.isSameCorporateDomain.mockReturnValue(false);

      const result = await resolver.resolveIdentity(mockProfile, mockOptions);

      expect(result.action).toBe("auto_linked");
      expect(result.linkedUserId).toBe("user-1");
      expect(result.confidence).toBe(0.96);
      expect(result.method).toBe("auto_fuzzy");

      expect(mockLinker.linkIdentity).toHaveBeenCalledWith({
        externalIdentityId: "ext-1",
        userId: "user-1",
        method: "auto_fuzzy",
        performedBy: "user-1",
      });
    });

    it("should not auto-link with multiple high-confidence matches", async () => {
      const existingIdentity = {
        id: "ext-1",
        userId: null,
        linkStatus: "unlinked",
        organizationId: "org-1",
      };

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(existingIdentity);
      (db.externalIdentity.update as jest.Mock)
        .mockResolvedValueOnce(existingIdentity)
        .mockResolvedValueOnce({ ...existingIdentity, linkStatus: "suggested" });
      (db.membership.findFirst as jest.Mock).mockResolvedValue(null);
      (db.membership.findMany as jest.Mock).mockResolvedValue([
        { user: { id: "user-1", email: "john1@acme.com", displayName: "John Smith" } },
        { user: { id: "user-2", email: "john2@acme.com", displayName: "John Smith" } },
      ]);

      mockMatcher.match.mockReturnValue({
        score: 0.96,
        method: "jaro_winkler",
        confidence: 0.96,
      });

      mockMatcher.isSameCorporateDomain.mockReturnValue(false);

      const result = await resolver.resolveIdentity(mockProfile, mockOptions);

      expect(result.action).toBe("suggested");
      expect(mockLinker.linkIdentity).not.toHaveBeenCalled();
      expect(mockSuggestions.createSuggestions).toHaveBeenCalled();
    });
  });

  describe("resolveIdentity - suggestions", () => {
    it("should create suggestions for moderate matches", async () => {
      const existingIdentity = {
        id: "ext-1",
        userId: null,
        linkStatus: "unlinked",
        organizationId: "org-1",
      };

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(existingIdentity);
      (db.externalIdentity.update as jest.Mock)
        .mockResolvedValueOnce(existingIdentity)
        .mockResolvedValueOnce({ ...existingIdentity, linkStatus: "suggested" });
      (db.membership.findFirst as jest.Mock).mockResolvedValue(null);
      (db.membership.findMany as jest.Mock).mockResolvedValue([
        { user: { id: "user-1", email: "john@acme.com", displayName: "Jonathan Smith" } },
      ]);

      mockMatcher.match.mockReturnValue({
        score: 0.88,
        method: "jaro_winkler",
        confidence: 0.88,
      });

      mockMatcher.isSameCorporateDomain.mockReturnValue(false);

      const result = await resolver.resolveIdentity(mockProfile, mockOptions);

      expect(result.action).toBe("suggested");
      expect(result.suggestions).toBeDefined();
      expect(mockSuggestions.createSuggestions).toHaveBeenCalledWith(
        "ext-1",
        "org-1",
        expect.arrayContaining([
          expect.objectContaining({
            userId: "user-1",
            matchResult: expect.objectContaining({ confidence: 0.88 }),
          }),
        ]),
      );
    });

    it("should limit suggestions to max 5", async () => {
      const existingIdentity = {
        id: "ext-1",
        userId: null,
        linkStatus: "unlinked",
        organizationId: "org-1",
      };

      const manyUsers = Array.from({ length: 10 }, (_, i) => ({
        user: { id: `user-${i}`, email: `user${i}@acme.com`, displayName: "John Smith" },
      }));

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(existingIdentity);
      (db.externalIdentity.update as jest.Mock)
        .mockResolvedValueOnce(existingIdentity)
        .mockResolvedValueOnce({ ...existingIdentity, linkStatus: "suggested" });
      (db.membership.findFirst as jest.Mock).mockResolvedValue(null);
      (db.membership.findMany as jest.Mock).mockResolvedValue(manyUsers);

      mockMatcher.match.mockReturnValue({
        score: 0.88,
        method: "jaro_winkler",
        confidence: 0.88,
      });

      mockMatcher.isSameCorporateDomain.mockReturnValue(false);

      await resolver.resolveIdentity(mockProfile, mockOptions);

      const createSuggestionsCall = (mockSuggestions.createSuggestions as jest.Mock).mock.calls[0];
      const suggestions = createSuggestionsCall[2];

      expect(suggestions.length).toBeLessThanOrEqual(5);
    });
  });

  describe("resolveIdentity - no match", () => {
    it("should return no_match when no candidates found", async () => {
      const existingIdentity = {
        id: "ext-1",
        userId: null,
        linkStatus: "unlinked",
        organizationId: "org-1",
      };

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(existingIdentity);
      (db.externalIdentity.update as jest.Mock).mockResolvedValue(existingIdentity);
      (db.membership.findFirst as jest.Mock).mockResolvedValue(null);
      (db.membership.findMany as jest.Mock).mockResolvedValue([]);

      const result = await resolver.resolveIdentity(mockProfile, mockOptions);

      expect(result.action).toBe("no_match");
      expect(result.externalIdentityId).toBe("ext-1");
      expect(mockLinker.linkIdentity).not.toHaveBeenCalled();
    });

    it("should return no_match when all matches below threshold", async () => {
      const existingIdentity = {
        id: "ext-1",
        userId: null,
        linkStatus: "unlinked",
        organizationId: "org-1",
      };

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(existingIdentity);
      (db.externalIdentity.update as jest.Mock).mockResolvedValue(existingIdentity);
      (db.membership.findFirst as jest.Mock).mockResolvedValue(null);
      (db.membership.findMany as jest.Mock).mockResolvedValue([
        { user: { id: "user-1", email: "jane@acme.com", displayName: "Jane Doe" } },
      ]);

      mockMatcher.match.mockReturnValue({
        score: 0.5,
        method: "jaro_winkler",
        confidence: 0, // Below threshold
      });

      mockMatcher.isSameCorporateDomain.mockReturnValue(false);

      const result = await resolver.resolveIdentity(mockProfile, mockOptions);

      expect(result.action).toBe("no_match");
    });
  });

  describe("resolveIdentity - bot accounts", () => {
    it("should skip auto-link for bot accounts", async () => {
      const botProfile: ExternalIdentityProfile = {
        ...mockProfile,
        metadata: { isBot: true },
      };

      const existingIdentity = {
        id: "ext-1",
        userId: null,
        linkStatus: "unlinked",
        organizationId: "org-1",
      };

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(existingIdentity);
      (db.externalIdentity.update as jest.Mock).mockResolvedValue({
        ...existingIdentity,
        metadata: { isBot: true },
      });

      const result = await resolver.resolveIdentity(botProfile, mockOptions);

      expect(result.action).toBe("no_match");
      expect(mockLinker.linkIdentity).not.toHaveBeenCalled();
    });

    it("should detect bot by type field", async () => {
      const botProfile: ExternalIdentityProfile = {
        ...mockProfile,
        metadata: { type: "bot" },
      };

      const existingIdentity = {
        id: "ext-1",
        userId: null,
        linkStatus: "unlinked",
        organizationId: "org-1",
      };

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(existingIdentity);
      (db.externalIdentity.update as jest.Mock).mockResolvedValue(existingIdentity);

      const result = await resolver.resolveIdentity(botProfile, mockOptions);

      expect(result.action).toBe("no_match");
    });
  });

  describe("resolveIdentity - org settings", () => {
    it("should respect custom autoLinkThreshold", async () => {
      const settings = {
        organizationId: "org-1",
        autoLinkOnEmail: true,
        autoLinkThreshold: 0.99, // Higher than default
        suggestionThreshold: 0.85,
        providerPriority: ["slack"],
        allowUserSelfLink: true,
        allowUserSelfUnlink: true,
        requireAdminApproval: false,
        suggestionExpiryDays: 30,
        auditRetentionDays: 2555,
      };

      (db.identitySettings.findUnique as jest.Mock).mockResolvedValue(settings);

      const existingIdentity = {
        id: "ext-1",
        userId: null,
        linkStatus: "unlinked",
        organizationId: "org-1",
      };

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(existingIdentity);
      (db.externalIdentity.update as jest.Mock)
        .mockResolvedValueOnce(existingIdentity)
        .mockResolvedValueOnce({ ...existingIdentity, linkStatus: "suggested" });
      (db.membership.findFirst as jest.Mock).mockResolvedValue(null);
      (db.membership.findMany as jest.Mock).mockResolvedValue([
        { user: { id: "user-1", email: "john@acme.com", displayName: "John Smith" } },
      ]);

      mockMatcher.match.mockReturnValue({
        score: 0.96,
        method: "jaro_winkler",
        confidence: 0.96,
      });

      mockMatcher.isSameCorporateDomain.mockReturnValue(false);

      const result = await resolver.resolveIdentity(mockProfile, mockOptions);

      // 0.96 is below custom threshold of 0.99, should create suggestion
      expect(result.action).toBe("suggested");
    });

    it("should respect autoLinkOnEmail setting", async () => {
      const settings = {
        organizationId: "org-1",
        autoLinkOnEmail: false, // Disabled
        autoLinkThreshold: 0.95,
        suggestionThreshold: 0.85,
        providerPriority: ["slack"],
        allowUserSelfLink: true,
        allowUserSelfUnlink: true,
        requireAdminApproval: false,
        suggestionExpiryDays: 30,
        auditRetentionDays: 2555,
      };

      (db.identitySettings.findUnique as jest.Mock).mockResolvedValue(settings);

      const existingIdentity = {
        id: "ext-1",
        userId: null,
        linkStatus: "unlinked",
        organizationId: "org-1",
      };

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(existingIdentity);
      (db.externalIdentity.update as jest.Mock).mockResolvedValue(existingIdentity);
      (db.membership.findFirst as jest.Mock).mockResolvedValue({
        user: { id: "user-1", email: "john@acme.com" },
      });
      (db.membership.findMany as jest.Mock).mockResolvedValue([]);

      await resolver.resolveIdentity(mockProfile, mockOptions);

      // Should not auto-link by email when disabled
      expect(mockLinker.linkIdentity).not.toHaveBeenCalled();
    });
  });

  describe("resolveByProviderUserId", () => {
    it("should find identity by provider user ID", async () => {
      const identity = {
        id: "ext-1",
        provider: "slack",
        providerUserId: "U123",
        user: { id: "user-1", email: "john@acme.com" },
      };

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(identity);

      const result = await resolver.resolveByProviderUserId("org-1", "slack", "U123");

      expect(result).toEqual(identity);
      expect(db.externalIdentity.findUnique).toHaveBeenCalledWith({
        where: {
          organizationId_provider_providerUserId: {
            organizationId: "org-1",
            provider: "slack",
            providerUserId: "U123",
          },
        },
        include: { user: true },
      });
    });
  });

  describe("getIdentitiesForUser", () => {
    it("should get all identities for a user", async () => {
      const identities = [
        { id: "ext-1", provider: "slack", providerUserId: "U123" },
        { id: "ext-2", provider: "google", providerUserId: "G456" },
      ];

      (db.externalIdentity.findMany as jest.Mock).mockResolvedValue(identities);

      const result = await resolver.getIdentitiesForUser("org-1", "user-1");

      expect(result).toEqual(identities);
      expect(db.externalIdentity.findMany).toHaveBeenCalledWith({
        where: { organizationId: "org-1", userId: "user-1" },
        orderBy: { provider: "asc" },
      });
    });
  });

  describe("getUnlinkedIdentities", () => {
    it("should get unlinked identities", async () => {
      const identities = [
        { id: "ext-1", linkStatus: "unlinked", suggestions: [] },
        { id: "ext-2", linkStatus: "suggested", suggestions: [] },
      ];

      (db.externalIdentity.findMany as jest.Mock).mockResolvedValue(identities);

      const result = await resolver.getUnlinkedIdentities("org-1");

      expect(result).toEqual(identities);
    });

    it("should filter by provider when specified", async () => {
      (db.externalIdentity.findMany as jest.Mock).mockResolvedValue([]);

      await resolver.getUnlinkedIdentities("org-1", "slack");

      expect(db.externalIdentity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            provider: "slack",
          }),
        }),
      );
    });
  });

  describe("getStats", () => {
    it("should return identity statistics", async () => {
      (db.externalIdentity.count as jest.Mock)
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(70) // linked
        .mockResolvedValueOnce(20) // unlinked
        .mockResolvedValueOnce(10); // suggested

      (db.externalIdentity.groupBy as jest.Mock).mockResolvedValue([
        { provider: "slack", _count: { provider: 50 } },
        { provider: "google", _count: { provider: 30 } },
      ]);

      (db.identityLinkSuggestion.count as jest.Mock).mockResolvedValue(15);

      const stats = await resolver.getStats("org-1");

      expect(stats).toEqual({
        total: 100,
        linked: 70,
        unlinked: 20,
        suggested: 10,
        byProvider: {
          slack: 50,
          google: 30,
        },
        pendingSuggestions: 15,
      });
    });
  });
});
