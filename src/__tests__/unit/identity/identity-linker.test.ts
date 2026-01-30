/**
 * IdentityLinker Tests
 *
 * Tests for link/unlink operations with audit trail
 */

jest.mock("../../../db/client", () => ({
  db: {
    $transaction: jest.fn(),
    externalIdentity: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    identityLinkAudit: {
      create: jest.fn(),
    },
    identityLinkSuggestion: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
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

import { IdentityLinker } from "../../../services/identity/identity-linker";
import { db } from "../../../db/client";
import type { LinkOperationInput, UnlinkOperationInput } from "../../../services/identity/types";

describe("IdentityLinker", () => {
  let linker: IdentityLinker;

  beforeEach(() => {
    jest.clearAllMocks();
    linker = new IdentityLinker();

    // Default transaction mock - executes callback immediately
    (db.$transaction as jest.Mock).mockImplementation(async (callback) => {
      return callback(db);
    });
  });

  describe("linkIdentity", () => {
    const linkInput: LinkOperationInput = {
      externalIdentityId: "ext-1",
      userId: "user-1",
      method: "manual",
      performedBy: "admin-1",
      reason: "Manual link",
    };

    it("should link identity and create audit log", async () => {
      const existingIdentity = {
        id: "ext-1",
        organizationId: "org-1",
        userId: null,
        linkStatus: "unlinked",
      };

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(existingIdentity);
      (db.externalIdentity.update as jest.Mock).mockResolvedValue({
        ...existingIdentity,
        userId: "user-1",
        linkStatus: "linked",
      });

      await linker.linkIdentity(linkInput);

      expect(db.externalIdentity.update).toHaveBeenCalledWith({
        where: { id: "ext-1" },
        data: {
          userId: "user-1",
          linkStatus: "linked",
          linkMethod: "manual",
          linkConfidence: 1.0,
          linkedAt: expect.any(Date),
          linkedBy: "admin-1",
        },
      });

      expect(db.identityLinkAudit.create).toHaveBeenCalledWith({
        data: {
          organizationId: "org-1",
          externalIdentityId: "ext-1",
          action: "linked",
          userId: "user-1",
          previousUserId: null,
          linkMethod: "manual",
          confidenceScore: 1.0,
          performedBy: "admin-1",
          reason: "Manual link",
          ipAddress: undefined,
          userAgent: undefined,
        },
      });
    });

    it("should mark matched suggestion as accepted", async () => {
      const existingIdentity = {
        id: "ext-1",
        organizationId: "org-1",
        userId: null,
        linkStatus: "suggested",
      };

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(existingIdentity);
      (db.externalIdentity.update as jest.Mock).mockResolvedValue(existingIdentity);

      await linker.linkIdentity(linkInput);

      expect(db.identityLinkSuggestion.updateMany).toHaveBeenCalledWith({
        where: {
          externalIdentityId: "ext-1",
          suggestedUserId: "user-1",
          status: "pending",
        },
        data: {
          status: "accepted",
          reviewedBy: "admin-1",
          reviewedAt: expect.any(Date),
        },
      });
    });

    it("should mark other suggestions as superseded", async () => {
      const existingIdentity = {
        id: "ext-1",
        organizationId: "org-1",
        userId: null,
        linkStatus: "suggested",
      };

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(existingIdentity);
      (db.externalIdentity.update as jest.Mock).mockResolvedValue(existingIdentity);

      await linker.linkIdentity(linkInput);

      expect(db.identityLinkSuggestion.updateMany).toHaveBeenCalledWith({
        where: {
          externalIdentityId: "ext-1",
          status: "pending",
          suggestedUserId: { not: "user-1" },
        },
        data: {
          status: "superseded",
          reviewedBy: "admin-1",
          reviewedAt: expect.any(Date),
          rejectionReason: "Identity linked to different user",
        },
      });
    });

    it("should set correct confidence for auto_email", async () => {
      const existingIdentity = {
        id: "ext-1",
        organizationId: "org-1",
        userId: null,
      };

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(existingIdentity);
      (db.externalIdentity.update as jest.Mock).mockResolvedValue(existingIdentity);

      await linker.linkIdentity({ ...linkInput, method: "auto_email" });

      expect(db.externalIdentity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            linkConfidence: 0.98,
            linkMethod: "auto_email",
          }),
        }),
      );
    });

    it("should set correct confidence for auto_fuzzy", async () => {
      const existingIdentity = {
        id: "ext-1",
        organizationId: "org-1",
        userId: null,
      };

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(existingIdentity);
      (db.externalIdentity.update as jest.Mock).mockResolvedValue(existingIdentity);

      await linker.linkIdentity({ ...linkInput, method: "auto_fuzzy" });

      expect(db.externalIdentity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            linkConfidence: 0.9,
            linkMethod: "auto_fuzzy",
          }),
        }),
      );
    });

    it("should throw error if identity not found", async () => {
      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(linker.linkIdentity(linkInput)).rejects.toThrow(
        "External identity not found: ext-1",
      );
    });

    it("should include IP and user agent in audit log", async () => {
      const existingIdentity = {
        id: "ext-1",
        organizationId: "org-1",
        userId: null,
      };

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(existingIdentity);
      (db.externalIdentity.update as jest.Mock).mockResolvedValue(existingIdentity);

      await linker.linkIdentity({
        ...linkInput,
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
      });

      expect(db.identityLinkAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ipAddress: "192.168.1.1",
            userAgent: "Mozilla/5.0",
          }),
        }),
      );
    });
  });

  describe("unlinkIdentity", () => {
    const unlinkInput: UnlinkOperationInput = {
      externalIdentityId: "ext-1",
      performedBy: "admin-1",
      reason: "Manual unlink",
    };

    it("should unlink identity and create audit log", async () => {
      const linkedIdentity = {
        id: "ext-1",
        organizationId: "org-1",
        userId: "user-1",
        linkStatus: "linked",
      };

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(linkedIdentity);
      (db.externalIdentity.update as jest.Mock).mockResolvedValue({
        ...linkedIdentity,
        userId: null,
        linkStatus: "unlinked",
      });

      await linker.unlinkIdentity(unlinkInput);

      expect(db.externalIdentity.update).toHaveBeenCalledWith({
        where: { id: "ext-1" },
        data: {
          userId: null,
          linkStatus: "unlinked",
          linkMethod: null,
          linkConfidence: null,
          linkedAt: null,
          linkedBy: null,
        },
      });

      expect(db.identityLinkAudit.create).toHaveBeenCalledWith({
        data: {
          organizationId: "org-1",
          externalIdentityId: "ext-1",
          action: "unlinked",
          userId: null,
          previousUserId: "user-1",
          performedBy: "admin-1",
          reason: "Manual unlink",
          ipAddress: undefined,
          userAgent: undefined,
        },
      });
    });

    it("should throw error if identity not found", async () => {
      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(linker.unlinkIdentity(unlinkInput)).rejects.toThrow(
        "External identity not found: ext-1",
      );
    });

    it("should throw error if identity not linked", async () => {
      const unlinkedIdentity = {
        id: "ext-1",
        organizationId: "org-1",
        userId: null,
        linkStatus: "unlinked",
      };

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(unlinkedIdentity);

      await expect(linker.unlinkIdentity(unlinkInput)).rejects.toThrow(
        "Identity is not linked",
      );
    });
  });

  describe("processSuggestionDecision", () => {
    it("should accept suggestion and link identity", async () => {
      const suggestion = {
        id: "sugg-1",
        externalIdentityId: "ext-1",
        suggestedUserId: "user-1",
        status: "pending",
        organizationId: "org-1",
        externalIdentity: { id: "ext-1", organizationId: "org-1" },
      };

      (db.identityLinkSuggestion.findUnique as jest.Mock).mockResolvedValue(suggestion);
      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue({
        id: "ext-1",
        organizationId: "org-1",
        userId: null,
      });
      (db.externalIdentity.update as jest.Mock).mockResolvedValue({});

      await linker.processSuggestionDecision({
        suggestionId: "sugg-1",
        accepted: true,
        reviewedBy: "admin-1",
        reason: "Looks good",
      });

      expect(db.externalIdentity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user-1",
            linkStatus: "linked",
            linkMethod: "manual",
          }),
        }),
      );
    });

    it("should reject suggestion without linking", async () => {
      const suggestion = {
        id: "sugg-1",
        externalIdentityId: "ext-1",
        suggestedUserId: "user-1",
        status: "pending",
        organizationId: "org-1",
      };

      (db.identityLinkSuggestion.findUnique as jest.Mock).mockResolvedValue(suggestion);
      (db.identityLinkSuggestion.update as jest.Mock).mockResolvedValue({});

      await linker.processSuggestionDecision({
        suggestionId: "sugg-1",
        accepted: false,
        reviewedBy: "admin-1",
        reason: "Not a match",
      });

      expect(db.identityLinkSuggestion.update).toHaveBeenCalledWith({
        where: { id: "sugg-1" },
        data: {
          status: "rejected",
          reviewedBy: "admin-1",
          reviewedAt: expect.any(Date),
          rejectionReason: "Not a match",
        },
      });

      expect(db.identityLinkAudit.create).toHaveBeenCalledWith({
        data: {
          organizationId: "org-1",
          externalIdentityId: "ext-1",
          action: "rejected",
          userId: "user-1",
          performedBy: "admin-1",
          reason: "Not a match",
        },
      });
    });

    it("should throw error if suggestion not found", async () => {
      (db.identityLinkSuggestion.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        linker.processSuggestionDecision({
          suggestionId: "sugg-1",
          accepted: true,
          reviewedBy: "admin-1",
        }),
      ).rejects.toThrow("Suggestion not found: sugg-1");
    });

    it("should throw error if suggestion already processed", async () => {
      const suggestion = {
        id: "sugg-1",
        status: "accepted",
      };

      (db.identityLinkSuggestion.findUnique as jest.Mock).mockResolvedValue(suggestion);

      await expect(
        linker.processSuggestionDecision({
          suggestionId: "sugg-1",
          accepted: true,
          reviewedBy: "admin-1",
        }),
      ).rejects.toThrow("Suggestion already processed: accepted");
    });
  });

  describe("relinkIdentity", () => {
    it("should unlink then link to new user", async () => {
      const currentIdentity = {
        id: "ext-1",
        organizationId: "org-1",
        userId: "user-1",
        linkStatus: "linked",
      };

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(currentIdentity);
      (db.externalIdentity.update as jest.Mock).mockResolvedValue({});

      await linker.relinkIdentity("ext-1", "user-2", "admin-1", "Correcting link");

      // Should have called update twice: unlink then link
      expect(db.externalIdentity.update).toHaveBeenCalledTimes(2);

      // First call: unlink
      expect(db.externalIdentity.update).toHaveBeenNthCalledWith(1, {
        where: { id: "ext-1" },
        data: expect.objectContaining({
          userId: null,
          linkStatus: "unlinked",
        }),
      });

      // Second call: link to new user
      expect(db.externalIdentity.update).toHaveBeenNthCalledWith(2, {
        where: { id: "ext-1" },
        data: expect.objectContaining({
          userId: "user-2",
          linkStatus: "linked",
          linkMethod: "admin",
        }),
      });
    });

    it("should link directly if not currently linked", async () => {
      const unlinkedIdentity = {
        id: "ext-1",
        organizationId: "org-1",
        userId: null,
        linkStatus: "unlinked",
      };

      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(unlinkedIdentity);
      (db.externalIdentity.update as jest.Mock).mockResolvedValue({});

      await linker.relinkIdentity("ext-1", "user-1", "admin-1", "Initial link");

      // Should only call update once for linking
      expect(db.externalIdentity.update).toHaveBeenCalledTimes(1);
      expect(db.externalIdentity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user-1",
            linkMethod: "admin",
          }),
        }),
      );
    });

    it("should throw error if identity not found", async () => {
      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        linker.relinkIdentity("ext-1", "user-2", "admin-1", "Correcting"),
      ).rejects.toThrow("External identity not found: ext-1");
    });
  });

  describe("getConfidenceForMethod", () => {
    it("should return 0.98 for auto_email", async () => {
      const identity = { id: "ext-1", organizationId: "org-1", userId: null };
      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(identity);
      (db.externalIdentity.update as jest.Mock).mockResolvedValue({});

      await linker.linkIdentity({
        externalIdentityId: "ext-1",
        userId: "user-1",
        method: "auto_email",
        performedBy: "system",
      });

      expect(db.identityLinkAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            confidenceScore: 0.98,
          }),
        }),
      );
    });

    it("should return 0.9 for auto_fuzzy", async () => {
      const identity = { id: "ext-1", organizationId: "org-1", userId: null };
      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(identity);
      (db.externalIdentity.update as jest.Mock).mockResolvedValue({});

      await linker.linkIdentity({
        externalIdentityId: "ext-1",
        userId: "user-1",
        method: "auto_fuzzy",
        performedBy: "system",
      });

      expect(db.identityLinkAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            confidenceScore: 0.9,
          }),
        }),
      );
    });

    it("should return 1.0 for manual", async () => {
      const identity = { id: "ext-1", organizationId: "org-1", userId: null };
      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(identity);
      (db.externalIdentity.update as jest.Mock).mockResolvedValue({});

      await linker.linkIdentity({
        externalIdentityId: "ext-1",
        userId: "user-1",
        method: "manual",
        performedBy: "admin-1",
      });

      expect(db.identityLinkAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            confidenceScore: 1.0,
          }),
        }),
      );
    });

    it("should return 1.0 for admin", async () => {
      const identity = { id: "ext-1", organizationId: "org-1", userId: null };
      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(identity);
      (db.externalIdentity.update as jest.Mock).mockResolvedValue({});

      await linker.linkIdentity({
        externalIdentityId: "ext-1",
        userId: "user-1",
        method: "admin",
        performedBy: "admin-1",
      });

      expect(db.identityLinkAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            confidenceScore: 1.0,
          }),
        }),
      );
    });

    it("should return 0.95 for migration", async () => {
      const identity = { id: "ext-1", organizationId: "org-1", userId: null };
      (db.externalIdentity.findUnique as jest.Mock).mockResolvedValue(identity);
      (db.externalIdentity.update as jest.Mock).mockResolvedValue({});

      await linker.linkIdentity({
        externalIdentityId: "ext-1",
        userId: "user-1",
        method: "migration",
        performedBy: "system",
      });

      expect(db.identityLinkAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            confidenceScore: 0.95,
          }),
        }),
      );
    });
  });
});
