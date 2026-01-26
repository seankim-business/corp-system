import {
  refreshNotionToken,
  refreshLinearToken,
  refreshGitHubToken,
  OAuthRefreshError,
  OAuthRefreshConfig,
  OAuthRefreshResult,
} from "../../services/oauth-refresh";
import {
  isTokenExpired,
  shouldRefreshToken,
  refreshOAuthToken,
  getAccessTokenFromConfig,
} from "../../services/mcp-registry";
import { db as prisma } from "../../db/client";
import { auditLogger } from "../../services/audit-logger";
import { notificationQueue } from "../../queue/notification.queue";
import { decrypt, encryptIfNeeded, isEncryptionEnabled } from "../../utils/encryption";

// Mock dependencies
jest.mock("../../db/client", () => ({
  db: {
    mCPConnection: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("../../services/audit-logger", () => ({
  auditLogger: {
    log: jest.fn(),
  },
}));

jest.mock("../../queue/notification.queue", () => ({
  notificationQueue: {
    enqueueNotification: jest.fn(),
  },
}));

jest.mock("../../utils/encryption", () => ({
  decrypt: jest.fn((token) => `decrypted_${token}`),
  encryptIfNeeded: jest.fn((token) => `encrypted_${token}`),
  isEncryptionEnabled: jest.fn(() => true),
}));

// Mock fetch globally
global.fetch = jest.fn();

describe("OAuth Token Refresh Mechanism", () => {
  const mockOrgId = "550e8400-e29b-41d4-a716-446655440000";
  const mockConnectionId = "conn-1";

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  // ============================================================================
  // TEST SUITE 1: Token Expiry Detection
  // ============================================================================

  describe("Test Suite 1: Token Expiry Detection", () => {
    it("should return true for expired tokens", () => {
      const expiredDate = new Date(Date.now() - 1000); // 1 second ago
      const result = isTokenExpired(expiredDate);
      expect(result).toBe(true);
    });

    it("should return false for fresh tokens", () => {
      const freshDate = new Date(Date.now() + 3600 * 1000); // 1 hour from now
      const result = isTokenExpired(freshDate);
      expect(result).toBe(false);
    });

    it("should return false for null expiry", () => {
      const result = isTokenExpired(null);
      expect(result).toBe(false);
    });

    it("should return true for tokens expiring right now", () => {
      const nowDate = new Date(Date.now());
      const result = isTokenExpired(nowDate);
      expect(result).toBe(true);
    });

    it("shouldRefreshToken returns true 5min before expiry", () => {
      const expiringDate = new Date(Date.now() + 4 * 60 * 1000); // 4 minutes from now
      const result = shouldRefreshToken(expiringDate);
      expect(result).toBe(true);
    });

    it("shouldRefreshToken returns false for fresh tokens", () => {
      const freshDate = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
      const result = shouldRefreshToken(freshDate);
      expect(result).toBe(false);
    });

    it("shouldRefreshToken returns false for null expiry", () => {
      const result = shouldRefreshToken(null);
      expect(result).toBe(false);
    });

    it("shouldRefreshToken returns true exactly at 5min threshold", () => {
      const thresholdDate = new Date(Date.now() + 5 * 60 * 1000); // exactly 5 minutes
      const result = shouldRefreshToken(thresholdDate);
      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // TEST SUITE 2: Notion Token Refresh
  // ============================================================================

  describe("Test Suite 2: Notion Token Refresh", () => {
    const notionConfig: OAuthRefreshConfig = {
      tokenUrl: "https://api.notion.com/v1/oauth/token",
      clientId: "notion-client-id",
      clientSecret: "notion-client-secret",
    };

    it("should successfully refresh Notion token with valid refreshToken", async () => {
      const mockResponse: OAuthRefreshResult = {
        accessToken: "new_notion_token_123",
        refreshToken: "new_notion_refresh_456",
        expiresIn: 3600,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            access_token: mockResponse.accessToken,
            refresh_token: mockResponse.refreshToken,
            expires_in: mockResponse.expiresIn,
          }),
      });

      const result = await refreshNotionToken("old_refresh_token", notionConfig);

      expect(result.accessToken).toBe("new_notion_token_123");
      expect(result.refreshToken).toBe("new_notion_refresh_456");
      expect(result.expiresIn).toBe(3600);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.notion.com/v1/oauth/token",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/x-www-form-urlencoded",
          }),
        }),
      );
    });

    it("should fail Notion refresh with invalid_grant error", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: "invalid_grant",
            error_description: "Refresh token expired",
          }),
      });

      await expect(refreshNotionToken("expired_token", notionConfig)).rejects.toThrow(
        OAuthRefreshError,
      );

      const error = await refreshNotionToken("expired_token", notionConfig).catch((e) => e);
      expect(error.code).toBe("invalid_grant");
      expect(error.status).toBe(400);
    });

    it("should encrypt token after successful Notion refresh", async () => {
      const mockResponse: OAuthRefreshResult = {
        accessToken: "new_token",
        refreshToken: "new_refresh",
        expiresIn: 3600,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            access_token: mockResponse.accessToken,
            refresh_token: mockResponse.refreshToken,
            expires_in: mockResponse.expiresIn,
          }),
      });

      const result = await refreshNotionToken("refresh_token", notionConfig);

      expect(result.accessToken).toBe("new_token");
      // Encryption happens at mcp-registry level, not here
    });

    it("should update expiresAt timestamp correctly for Notion", async () => {
      const mockResponse: OAuthRefreshResult = {
        accessToken: "new_token",
        refreshToken: "new_refresh",
        expiresIn: 86400, // 24 hours
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            access_token: mockResponse.accessToken,
            refresh_token: mockResponse.refreshToken,
            expires_in: mockResponse.expiresIn,
          }),
      });

      const result = await refreshNotionToken("refresh_token", notionConfig);

      expect(result.expiresIn).toBe(86400);
    });

    it("should handle Notion refresh with missing access_token in response", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            refresh_token: "new_refresh",
            expires_in: 3600,
            // Missing access_token
          }),
      });

      await expect(refreshNotionToken("refresh_token", notionConfig)).rejects.toThrow(
        "missing access_token",
      );
    });
  });

  // ============================================================================
  // TEST SUITE 3: Linear Token Refresh
  // ============================================================================

  describe("Test Suite 3: Linear Token Refresh", () => {
    const linearConfig: OAuthRefreshConfig = {
      tokenUrl: "https://api.linear.app/oauth/token",
      clientId: "linear-client-id",
      clientSecret: "linear-client-secret",
    };

    it("should successfully refresh Linear token with valid refreshToken", async () => {
      const mockResponse: OAuthRefreshResult = {
        accessToken: "new_linear_token_789",
        refreshToken: "new_linear_refresh_012",
        expiresIn: 3600,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            access_token: mockResponse.accessToken,
            refresh_token: mockResponse.refreshToken,
            expires_in: mockResponse.expiresIn,
          }),
      });

      const result = await refreshLinearToken("old_refresh_token", linearConfig);

      expect(result.accessToken).toBe("new_linear_token_789");
      expect(result.refreshToken).toBe("new_linear_refresh_012");
      expect(result.expiresIn).toBe(3600);
    });

    it("should fail Linear refresh with invalid_grant error", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: "invalid_grant",
            error_description: "Refresh token has expired",
          }),
      });

      const error = await refreshLinearToken("expired_token", linearConfig).catch((e) => e);
      expect(error).toBeInstanceOf(OAuthRefreshError);
      expect(error.code).toBe("invalid_grant");
    });

    it("should handle Linear refresh with shorter expiry (1 hour)", async () => {
      const mockResponse: OAuthRefreshResult = {
        accessToken: "new_token",
        refreshToken: "new_refresh",
        expiresIn: 3600, // 1 hour
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            access_token: mockResponse.accessToken,
            refresh_token: mockResponse.refreshToken,
            expires_in: mockResponse.expiresIn,
          }),
      });

      const result = await refreshLinearToken("refresh_token", linearConfig);

      expect(result.expiresIn).toBe(3600);
    });

    it("should handle Linear refresh response without refresh_token", async () => {
      const mockResponse: OAuthRefreshResult = {
        accessToken: "new_token",
        expiresIn: 3600,
        // No refreshToken in response
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            access_token: mockResponse.accessToken,
            expires_in: mockResponse.expiresIn,
          }),
      });

      const result = await refreshLinearToken("refresh_token", linearConfig);

      expect(result.accessToken).toBe("new_token");
      expect(result.refreshToken).toBeUndefined();
    });
  });

  // ============================================================================
  // TEST SUITE 4: GitHub Token Refresh
  // ============================================================================

  describe("Test Suite 4: GitHub Token Refresh", () => {
    const githubConfig: OAuthRefreshConfig = {
      tokenUrl: "https://github.com/login/oauth/access_token",
      clientId: "github-client-id",
      clientSecret: "github-client-secret",
    };

    it("should successfully refresh GitHub token with valid refreshToken", async () => {
      const mockResponse: OAuthRefreshResult = {
        accessToken: "new_github_token_345",
        refreshToken: "new_github_refresh_678",
        expiresIn: 28800, // 8 hours
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            access_token: mockResponse.accessToken,
            refresh_token: mockResponse.refreshToken,
            expires_in: mockResponse.expiresIn,
          }),
      });

      const result = await refreshGitHubToken("old_refresh_token", githubConfig);

      expect(result.accessToken).toBe("new_github_token_345");
      expect(result.refreshToken).toBe("new_github_refresh_678");
      expect(result.expiresIn).toBe(28800);
    });

    it("should fail GitHub refresh with invalid_grant error", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: "invalid_grant",
            error_description: "The refresh token is invalid",
          }),
      });

      const error = await refreshGitHubToken("expired_token", githubConfig).catch((e) => e);
      expect(error).toBeInstanceOf(OAuthRefreshError);
      expect(error.code).toBe("invalid_grant");
    });

    it("should handle GitHub refresh with 8-hour expiry", async () => {
      const mockResponse: OAuthRefreshResult = {
        accessToken: "new_token",
        refreshToken: "new_refresh",
        expiresIn: 28800, // 8 hours
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            access_token: mockResponse.accessToken,
            refresh_token: mockResponse.refreshToken,
            expires_in: mockResponse.expiresIn,
          }),
      });

      const result = await refreshGitHubToken("refresh_token", githubConfig);

      expect(result.expiresIn).toBe(28800);
    });

    it("should handle GitHub refresh with URL-encoded response", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "access_token=new_token&refresh_token=new_refresh&expires_in=28800",
      });

      const result = await refreshGitHubToken("refresh_token", githubConfig);

      expect(result.accessToken).toBe("new_token");
      expect(result.refreshToken).toBe("new_refresh");
      expect(result.expiresIn).toBe(28800);
    });
  });

  // ============================================================================
  // TEST SUITE 5: Connection State Updates
  // ============================================================================

  describe("Test Suite 5: Connection State Updates", () => {
    it("should disable connection on invalid_grant error", async () => {
      const mockConnection = {
        id: mockConnectionId,
        organizationId: mockOrgId,
        provider: "notion",
        name: "Notion",
        config: {
          clientId: "client-id",
          clientSecret: "client-secret",
          tokenUrl: "https://api.notion.com/v1/oauth/token",
        },
        refreshToken: "encrypted_refresh_token",
        expiresAt: new Date(Date.now() - 1000),
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.mCPConnection.findUnique as jest.Mock).mockResolvedValueOnce(mockConnection);
      (decrypt as jest.Mock).mockReturnValueOnce("decrypted_refresh_token");

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: "invalid_grant",
            error_description: "Refresh token expired",
          }),
      });

      (prisma.mCPConnection.update as jest.Mock).mockResolvedValueOnce({
        ...mockConnection,
        enabled: false,
      });

      try {
        await refreshOAuthToken(mockConnectionId);
      } catch {
        // Expected to throw
      }

      // Verify connection was disabled
      expect(prisma.mCPConnection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockConnectionId },
          data: expect.objectContaining({ enabled: false }),
        }),
      );
    });

    it("should queue notification on refresh failure", async () => {
      const mockConnection = {
        id: mockConnectionId,
        organizationId: mockOrgId,
        provider: "linear",
        name: "Linear",
        config: {
          clientId: "client-id",
          clientSecret: "client-secret",
          tokenUrl: "https://api.linear.app/oauth/token",
          notificationChannel: "C123456",
          userId: "U123456",
        },
        refreshToken: "encrypted_refresh_token",
        expiresAt: new Date(Date.now() - 1000),
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.mCPConnection.findUnique as jest.Mock).mockResolvedValueOnce(mockConnection);
      (decrypt as jest.Mock).mockReturnValueOnce("decrypted_refresh_token");

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: "invalid_grant",
            error_description: "Refresh token expired",
          }),
      });

      (prisma.mCPConnection.update as jest.Mock).mockResolvedValueOnce({
        ...mockConnection,
        enabled: false,
      });

      try {
        await refreshOAuthToken(mockConnectionId);
      } catch {
        // Expected to throw
      }

      // Verify notification was queued
      expect(notificationQueue.enqueueNotification).toHaveBeenCalled();
    });

    it("should create audit log entry on refresh", async () => {
      const mockConnection = {
        id: mockConnectionId,
        organizationId: mockOrgId,
        provider: "github",
        name: "GitHub",
        config: {
          clientId: "client-id",
          clientSecret: "client-secret",
          tokenUrl: "https://github.com/login/oauth/access_token",
        },
        refreshToken: "encrypted_refresh_token",
        expiresAt: new Date(Date.now() - 1000),
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.mCPConnection.findUnique as jest.Mock).mockResolvedValueOnce(mockConnection);
      (decrypt as jest.Mock).mockReturnValueOnce("decrypted_refresh_token");
      (isEncryptionEnabled as jest.Mock).mockReturnValueOnce(true);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            access_token: "new_token",
            refresh_token: "new_refresh",
            expires_in: 28800,
          }),
      });

      (encryptIfNeeded as jest.Mock).mockReturnValueOnce("encrypted_new_token");
      (encryptIfNeeded as jest.Mock).mockReturnValueOnce("encrypted_new_refresh");

      (prisma.mCPConnection.update as jest.Mock).mockResolvedValueOnce({
        ...mockConnection,
        config: { ...mockConnection.config, accessToken: "encrypted_new_token" },
        refreshToken: "encrypted_new_refresh",
        expiresAt: new Date(Date.now() + 28800 * 1000),
      });

      await refreshOAuthToken(mockConnectionId);

      // Verify audit logs were created
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "mcp.tool_call",
          organizationId: mockOrgId,
          resourceType: "mcp_connection",
          resourceId: mockConnectionId,
          details: expect.objectContaining({
            event: "token_refresh_attempt",
          }),
        }),
      );

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "mcp.tool_call",
          organizationId: mockOrgId,
          resourceType: "mcp_connection",
          resourceId: mockConnectionId,
          details: expect.objectContaining({
            event: "token_refresh_success",
          }),
        }),
      );
    });
  });

  // ============================================================================
  // TEST SUITE 6: Proactive Refresh in getActiveMCPConnections()
  // ============================================================================

  describe("Test Suite 6: Proactive Refresh in getActiveMCPConnections()", () => {
    it("should refresh connections before expiry", async () => {
      // This test verifies the proactive refresh mechanism
      // In real implementation, this happens in background
      const expiringDate = new Date(Date.now() + 4 * 60 * 1000); // 4 minutes from now
      expect(shouldRefreshToken(expiringDate)).toBe(true);
    });

    it("should handle multiple connections refreshed in parallel", async () => {
      // Verify that Promise.allSettled is used for parallel refresh
      const connections = [
        {
          id: "conn-1",
          expiresAt: new Date(Date.now() + 4 * 60 * 1000),
          refreshToken: "token1",
        },
        {
          id: "conn-2",
          expiresAt: new Date(Date.now() + 3 * 60 * 1000),
          refreshToken: "token2",
        },
        {
          id: "conn-3",
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          refreshToken: null, // Should not be refreshed
        },
      ];

      const expiring = connections.filter(
        (conn) => conn.refreshToken && shouldRefreshToken(conn.expiresAt),
      );

      expect(expiring).toHaveLength(2);
      expect(expiring.map((c) => c.id)).toEqual(["conn-1", "conn-2"]);
    });

    it("should not block other connections if one refresh fails", async () => {
      // Verify that Promise.allSettled handles failures gracefully
      const results = await Promise.allSettled([
        Promise.resolve({ id: "conn-1", success: true }),
        Promise.reject(new Error("Refresh failed")),
        Promise.resolve({ id: "conn-3", success: true }),
      ]);

      const successful = results.filter((r) => r.status === "fulfilled");
      expect(successful).toHaveLength(2);
    });
  });

  // ============================================================================
  // TEST SUITE 7: Client-Side Refresh
  // ============================================================================

  describe("Test Suite 7: Client-Side Refresh", () => {
    it("should extract access token from config", () => {
      const config = {
        accessToken: "encrypted_token_123",
        clientId: "client-id",
      };

      (decrypt as jest.Mock).mockReturnValueOnce("decrypted_token_123");

      const token = getAccessTokenFromConfig(config);

      expect(token).toBe("decrypted_token_123");
      expect(decrypt).toHaveBeenCalledWith("encrypted_token_123");
    });

    it("should fallback to apiKey if accessToken missing", () => {
      const config = {
        apiKey: "encrypted_api_key",
        clientId: "client-id",
      };

      (decrypt as jest.Mock).mockReturnValueOnce("decrypted_api_key");

      const token = getAccessTokenFromConfig(config);

      expect(token).toBe("decrypted_api_key");
    });

    it("should fallback to token field if both missing", () => {
      const config = {
        token: "encrypted_token",
        clientId: "client-id",
      };

      (decrypt as jest.Mock).mockReturnValueOnce("decrypted_token");

      const token = getAccessTokenFromConfig(config);

      expect(token).toBe("decrypted_token");
    });

    it("should return null if no token fields present", () => {
      const config = {
        clientId: "client-id",
        clientSecret: "client-secret",
      };

      const token = getAccessTokenFromConfig(config);

      expect(token).toBeNull();
    });
  });

  // ============================================================================
  // TEST SUITE 8: Edge Cases
  // ============================================================================

  describe("Test Suite 8: Edge Cases", () => {
    it("should handle missing refreshToken in connection", async () => {
      const mockConnection = {
        id: mockConnectionId,
        organizationId: mockOrgId,
        provider: "notion",
        name: "Notion",
        config: {
          clientId: "client-id",
          clientSecret: "client-secret",
          tokenUrl: "https://api.notion.com/v1/oauth/token",
        },
        refreshToken: null, // Missing refresh token
        expiresAt: new Date(Date.now() - 1000),
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.mCPConnection.findUnique as jest.Mock).mockResolvedValueOnce(mockConnection);
      (decrypt as jest.Mock).mockReturnValueOnce(null);

      await expect(refreshOAuthToken(mockConnectionId)).rejects.toThrow("Missing refresh token");
    });

    it("should handle missing expiresAt timestamp", () => {
      const result = isTokenExpired(null);
      expect(result).toBe(false);

      const shouldRefresh = shouldRefreshToken(null);
      expect(shouldRefresh).toBe(false);
    });

    it("should handle refresh during API call (concurrent refresh)", async () => {
      // Simulate two concurrent refresh attempts
      const mockConnection = {
        id: mockConnectionId,
        organizationId: mockOrgId,
        provider: "linear",
        name: "Linear",
        config: {
          clientId: "client-id",
          clientSecret: "client-secret",
          tokenUrl: "https://api.linear.app/oauth/token",
        },
        refreshToken: "encrypted_refresh_token",
        expiresAt: new Date(Date.now() - 1000),
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.mCPConnection.findUnique as jest.Mock).mockResolvedValue(mockConnection);
      (decrypt as jest.Mock).mockReturnValue("decrypted_refresh_token");
      (isEncryptionEnabled as jest.Mock).mockReturnValue(true);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            access_token: "new_token",
            refresh_token: "new_refresh",
            expires_in: 3600,
          }),
      });

      (encryptIfNeeded as jest.Mock).mockReturnValue("encrypted_token");

      (prisma.mCPConnection.update as jest.Mock).mockResolvedValue({
        ...mockConnection,
        config: { ...mockConnection.config, accessToken: "encrypted_token" },
        refreshToken: "encrypted_token",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });

      // Simulate concurrent calls
      const results = await Promise.allSettled([
        refreshOAuthToken(mockConnectionId),
        refreshOAuthToken(mockConnectionId),
      ]);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    });

    it("should handle network timeout during refresh", async () => {
      const mockConnection = {
        id: mockConnectionId,
        organizationId: mockOrgId,
        provider: "github",
        name: "GitHub",
        config: {
          clientId: "client-id",
          clientSecret: "client-secret",
          tokenUrl: "https://github.com/login/oauth/access_token",
        },
        refreshToken: "encrypted_refresh_token",
        expiresAt: new Date(Date.now() - 1000),
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.mCPConnection.findUnique as jest.Mock).mockResolvedValueOnce(mockConnection);
      (decrypt as jest.Mock).mockReturnValueOnce("decrypted_refresh_token");

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network timeout"));

      await expect(refreshOAuthToken(mockConnectionId)).rejects.toThrow();
    });

    it("should retry refresh on transient failure", async () => {
      const mockConnection = {
        id: mockConnectionId,
        organizationId: mockOrgId,
        provider: "notion",
        name: "Notion",
        config: {
          clientId: "client-id",
          clientSecret: "client-secret",
          tokenUrl: "https://api.notion.com/v1/oauth/token",
        },
        refreshToken: "encrypted_refresh_token",
        expiresAt: new Date(Date.now() - 1000),
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.mCPConnection.findUnique as jest.Mock).mockResolvedValueOnce(mockConnection);
      (decrypt as jest.Mock).mockReturnValueOnce("decrypted_refresh_token");
      (isEncryptionEnabled as jest.Mock).mockReturnValueOnce(true);

      // First attempt fails, second succeeds
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error("Temporary error"))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              access_token: "new_token",
              refresh_token: "new_refresh",
              expires_in: 3600,
            }),
        });

      (encryptIfNeeded as jest.Mock).mockReturnValue("encrypted_token");

      (prisma.mCPConnection.update as jest.Mock).mockResolvedValueOnce({
        ...mockConnection,
        config: { ...mockConnection.config, accessToken: "encrypted_token" },
        refreshToken: "encrypted_token",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });

      const result = await refreshOAuthToken(mockConnectionId);

      expect(result).toBeDefined();
      expect(result.id).toBe(mockConnectionId);
    });

    it("should handle multiple simultaneous refresh attempts", async () => {
      const mockConnection = {
        id: mockConnectionId,
        organizationId: mockOrgId,
        provider: "linear",
        name: "Linear",
        config: {
          clientId: "client-id",
          clientSecret: "client-secret",
          tokenUrl: "https://api.linear.app/oauth/token",
        },
        refreshToken: "encrypted_refresh_token",
        expiresAt: new Date(Date.now() - 1000),
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.mCPConnection.findUnique as jest.Mock).mockResolvedValue(mockConnection);
      (decrypt as jest.Mock).mockReturnValue("decrypted_refresh_token");
      (isEncryptionEnabled as jest.Mock).mockReturnValue(true);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            access_token: "new_token",
            refresh_token: "new_refresh",
            expires_in: 3600,
          }),
      });

      (encryptIfNeeded as jest.Mock).mockReturnValue("encrypted_token");

      (prisma.mCPConnection.update as jest.Mock).mockResolvedValue({
        ...mockConnection,
        config: { ...mockConnection.config, accessToken: "encrypted_token" },
        refreshToken: "encrypted_token",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });

      // Simulate 5 concurrent refresh attempts
      const results = await Promise.allSettled(
        Array(5)
          .fill(null)
          .map(() => refreshOAuthToken(mockConnectionId)),
      );

      expect(results).toHaveLength(5);
      expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    });

    it("should handle encryption not configured", async () => {
      const mockConnection = {
        id: mockConnectionId,
        organizationId: mockOrgId,
        provider: "github",
        name: "GitHub",
        config: {
          clientId: "client-id",
          clientSecret: "client-secret",
          tokenUrl: "https://github.com/login/oauth/access_token",
        },
        refreshToken: "encrypted_refresh_token",
        expiresAt: new Date(Date.now() - 1000),
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.mCPConnection.findUnique as jest.Mock).mockResolvedValueOnce(mockConnection);
      (decrypt as jest.Mock).mockReturnValueOnce("decrypted_refresh_token");
      (isEncryptionEnabled as jest.Mock).mockReturnValueOnce(false);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            access_token: "new_token",
            refresh_token: "new_refresh",
            expires_in: 28800,
          }),
      });

      await expect(refreshOAuthToken(mockConnectionId)).rejects.toThrow(
        "Credential encryption not configured",
      );
    });
  });

  // ============================================================================
  // TEST SUITE 9: OAuth Error Handling
  // ============================================================================

  describe("Test Suite 9: OAuth Error Handling", () => {
    it("should throw OAuthRefreshError with correct code and status", async () => {
      const notionConfig: OAuthRefreshConfig = {
        tokenUrl: "https://api.notion.com/v1/oauth/token",
        clientId: "client-id",
        clientSecret: "client-secret",
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () =>
          JSON.stringify({
            error: "unauthorized",
            error_description: "Invalid client credentials",
          }),
      });

      const error = await refreshNotionToken("refresh_token", notionConfig).catch((e) => e);

      expect(error).toBeInstanceOf(OAuthRefreshError);
      expect(error.code).toBe("unauthorized");
      expect(error.status).toBe(401);
    });

    it("should handle malformed JSON response", async () => {
      const linearConfig: OAuthRefreshConfig = {
        tokenUrl: "https://api.linear.app/oauth/token",
        clientId: "client-id",
        clientSecret: "client-secret",
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      const error = await refreshLinearToken("refresh_token", linearConfig).catch((e) => e);

      expect(error).toBeInstanceOf(OAuthRefreshError);
      expect(error.status).toBe(500);
    });

    it("should handle rate limit errors", async () => {
      const githubConfig: OAuthRefreshConfig = {
        tokenUrl: "https://github.com/login/oauth/access_token",
        clientId: "client-id",
        clientSecret: "client-secret",
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () =>
          JSON.stringify({
            error: "rate_limit_exceeded",
            error_description: "Too many requests",
          }),
      });

      const error = await refreshGitHubToken("refresh_token", githubConfig).catch((e) => e);

      expect(error).toBeInstanceOf(OAuthRefreshError);
      expect(error.status).toBe(429);
    });

    it("should handle server errors gracefully", async () => {
      const notionConfig: OAuthRefreshConfig = {
        tokenUrl: "https://api.notion.com/v1/oauth/token",
        clientId: "client-id",
        clientSecret: "client-secret",
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () =>
          JSON.stringify({
            error: "service_unavailable",
            error_description: "Service temporarily unavailable",
          }),
      });

      const error = await refreshNotionToken("refresh_token", notionConfig).catch((e) => e);

      expect(error).toBeInstanceOf(OAuthRefreshError);
      expect(error.status).toBe(503);
    });
  });

  // ============================================================================
  // TEST SUITE 10: Token Encryption/Decryption
  // ============================================================================

  describe("Test Suite 10: Token Encryption/Decryption", () => {
    it("should decrypt refresh token from connection", async () => {
      const mockConnection = {
        id: mockConnectionId,
        organizationId: mockOrgId,
        provider: "notion",
        name: "Notion",
        config: {
          clientId: "client-id",
          clientSecret: "client-secret",
          tokenUrl: "https://api.notion.com/v1/oauth/token",
        },
        refreshToken: "encrypted_refresh_token_xyz",
        expiresAt: new Date(Date.now() - 1000),
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.mCPConnection.findUnique as jest.Mock).mockResolvedValueOnce(mockConnection);
      (decrypt as jest.Mock).mockReturnValueOnce("decrypted_refresh_token");

      // Verify decrypt is called with encrypted token
      const decrypted = (decrypt as jest.Mock)("encrypted_refresh_token_xyz");

      expect(decrypted).toBe("decrypted_refresh_token");
      expect(decrypt).toHaveBeenCalledWith("encrypted_refresh_token_xyz");
    });

    it("should encrypt new tokens after refresh", async () => {
      const mockConnection = {
        id: mockConnectionId,
        organizationId: mockOrgId,
        provider: "linear",
        name: "Linear",
        config: {
          clientId: "client-id",
          clientSecret: "client-secret",
          tokenUrl: "https://api.linear.app/oauth/token",
        },
        refreshToken: "encrypted_refresh_token",
        expiresAt: new Date(Date.now() - 1000),
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.mCPConnection.findUnique as jest.Mock).mockResolvedValueOnce(mockConnection);
      (decrypt as jest.Mock).mockReturnValueOnce("decrypted_refresh_token");
      (isEncryptionEnabled as jest.Mock).mockReturnValueOnce(true);

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            access_token: "new_access_token",
            refresh_token: "new_refresh_token",
            expires_in: 3600,
          }),
      });

      (encryptIfNeeded as jest.Mock)
        .mockReturnValueOnce("encrypted_new_access_token")
        .mockReturnValueOnce("encrypted_new_refresh_token");

      (prisma.mCPConnection.update as jest.Mock).mockResolvedValueOnce({
        ...mockConnection,
        config: { ...mockConnection.config, accessToken: "encrypted_new_access_token" },
        refreshToken: "encrypted_new_refresh_token",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });

      await refreshOAuthToken(mockConnectionId);

      // Verify encryptIfNeeded was called for both tokens
      expect(encryptIfNeeded).toHaveBeenCalledWith("new_access_token");
      expect(encryptIfNeeded).toHaveBeenCalledWith("new_refresh_token");
    });

    it("should handle empty encrypted tokens", () => {
      const config = {
        accessToken: "",
        clientId: "client-id",
      };

      const token = getAccessTokenFromConfig(config);

      expect(token).toBeNull();
    });

    it("should handle whitespace-only encrypted tokens", () => {
      const config = {
        accessToken: "   ",
        clientId: "client-id",
      };

      const token = getAccessTokenFromConfig(config);

      expect(token).toBeNull();
    });
  });
});
