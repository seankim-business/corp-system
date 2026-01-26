import bcrypt from "bcrypt";
import { AuthService } from "../../auth/auth.service";
import { db } from "../../db/client";

jest.mock("../../db/client", () => ({
  db: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    membership: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    workspaceDomain: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("bcrypt", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe("AuthService", () => {
  const authService = new AuthService();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_EXPIRES_IN = "7d";
    process.env.JWT_REFRESH_EXPIRES_IN = "30d";
  });

  describe("createSessionToken / verifySessionToken", () => {
    it("should sign and verify session token", () => {
      const token = authService.createSessionToken({
        userId: "user-1",
        organizationId: "org-1",
        role: "member",
      });

      const payload = authService.verifySessionToken(token);

      expect(payload.userId).toBe("user-1");
      expect(payload.organizationId).toBe("org-1");
      expect(payload.role).toBe("member");
    });
  });

  describe("loginWithEmail", () => {
    it("should throw when user is missing", async () => {
      (db.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(authService.loginWithEmail("a@b.com", "pw")).rejects.toThrow(
        "Invalid credentials",
      );
    });

    it("should throw when passwordHash missing", async () => {
      (db.user.findUnique as jest.Mock).mockResolvedValue({
        id: "u1",
        email: "a@b.com",
        passwordHash: null,
      });

      await expect(authService.loginWithEmail("a@b.com", "pw")).rejects.toThrow(
        "Invalid credentials",
      );
    });

    it("should throw when password invalid", async () => {
      (db.user.findUnique as jest.Mock).mockResolvedValue({
        id: "u1",
        email: "a@b.com",
        passwordHash: "hash",
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(authService.loginWithEmail("a@b.com", "pw")).rejects.toThrow(
        "Invalid credentials",
      );
    });

    it("should return user, org, membership and tokens on success", async () => {
      (db.user.findUnique as jest.Mock).mockResolvedValue({
        id: "u1",
        email: "a@b.com",
        passwordHash: "hash",
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (db.membership.findFirst as jest.Mock).mockResolvedValue({
        id: "m1",
        organizationId: "org-1",
        userId: "u1",
        role: "member",
        organization: { id: "org-1", slug: "acme", name: "Acme" },
      });

      const result = await authService.loginWithEmail("a@b.com", "pw");

      expect(result.user.id).toBe("u1");
      expect(result.organization.id).toBe("org-1");
      expect(result.membership.id).toBe("m1");
      expect(typeof result.sessionToken).toBe("string");
      expect(typeof result.refreshToken).toBe("string");
    });
  });

  describe("registerWithEmail", () => {
    it("should throw when email already registered", async () => {
      (db.user.findUnique as jest.Mock).mockResolvedValue({ id: "u1" });

      await expect(
        authService.registerWithEmail({
          email: "a@b.com",
          password: "password123",
          organizationName: "Acme",
          organizationSlug: "acme",
        }),
      ).rejects.toThrow("Email already registered");
    });

    it("should create org, user and membership on success", async () => {
      (db.user.findUnique as jest.Mock).mockResolvedValue(null);
      (db.organization.findUnique as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue("hash");
      (db.organization.create as jest.Mock).mockResolvedValue({
        id: "org-1",
        slug: "acme",
        name: "Acme",
      });
      (db.user.create as jest.Mock).mockResolvedValue({
        id: "u1",
        email: "a@b.com",
        passwordHash: "hash",
      });
      (db.membership.create as jest.Mock).mockResolvedValue({
        id: "m1",
        organizationId: "org-1",
        userId: "u1",
        role: "owner",
      });

      const result = await authService.registerWithEmail({
        email: "a@b.com",
        password: "password123",
        displayName: "Alice",
        organizationName: "Acme",
        organizationSlug: "acme",
      });

      expect(result.organization.id).toBe("org-1");
      expect(result.user.id).toBe("u1");
      expect(result.membership.role).toBe("owner");
      expect(typeof result.sessionToken).toBe("string");
      expect(typeof result.refreshToken).toBe("string");
    });
  });
});
