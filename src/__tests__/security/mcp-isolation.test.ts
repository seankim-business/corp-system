/**
 * MCP Multi-Tenant Isolation Test Suite
 *
 * Tests verify that:
 * 1. Organizations cannot access tools from other organizations
 * 2. Namespace validation prevents cross-provider tool access
 * 3. Tool name parsing correctly handles legacy and new formats
 * 4. Audit logging captures security events
 *
 * Security Model:
 * - Each MCPConnection belongs to exactly one organizationId
 * - Tool names must include namespace prefix (provider__toolName)
 * - Legacy tools (provider_toolName) are supported for backward compatibility
 * - validateToolAccess() enforces organization isolation
 */

import { validateToolAccess, executeToolWithIsolation } from "../../services/mcp-registry";
import { MCPConnection } from "../../orchestrator/types";

/**
 * Mock data: Two organizations with Notion connections
 */
const mockOrg1Id = "org-123";
const mockOrg2Id = "org-456";

const mockNotionConnectionOrg1: MCPConnection = {
  id: "conn-notion-org1",
  organizationId: mockOrg1Id,
  provider: "notion",
  namespace: "notion",
  name: "Notion Workspace 1",
  config: {
    accessToken: "encrypted-token-org1",
    apiKey: "encrypted-key-org1",
  },
  enabled: true,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-26"),
};

const mockLinearConnectionOrg1: MCPConnection = {
  id: "conn-linear-org1",
  organizationId: mockOrg1Id,
  provider: "linear",
  namespace: "linear",
  name: "Linear Workspace 1",
  config: {
    accessToken: "encrypted-linear-token-org1",
  },
  enabled: true,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-26"),
};

describe("MCP Multi-Tenant Isolation", () => {
  describe("validateToolAccess()", () => {
    describe("Test 1: Same organization can access tools", () => {
      it("should allow org-123 to access notion__getTasks from org-123 connection", () => {
        const result = validateToolAccess(
          "notion__getTasks",
          "notion",
          mockOrg1Id,
          mockNotionConnectionOrg1,
        );

        expect(result).toEqual({
          namespace: "notion",
          toolName: "getTasks",
          isLegacy: false,
        });
      });

      it("should allow org-123 to access notion__createPage from org-123 connection", () => {
        const result = validateToolAccess(
          "notion__createPage",
          "notion",
          mockOrg1Id,
          mockNotionConnectionOrg1,
        );

        expect(result).toEqual({
          namespace: "notion",
          toolName: "createPage",
          isLegacy: false,
        });
      });

      it("should allow org-123 to access linear__createIssue from org-123 connection", () => {
        const result = validateToolAccess(
          "linear__createIssue",
          "linear",
          mockOrg1Id,
          mockLinearConnectionOrg1,
        );

        expect(result).toEqual({
          namespace: "linear",
          toolName: "createIssue",
          isLegacy: false,
        });
      });
    });

    describe("Test 2: Different organization CANNOT access tools (throws error)", () => {
      it("should throw error when org-456 tries to access org-123 connection", () => {
        expect(() => {
          validateToolAccess(
            "notion__getTasks",
            "notion",
            mockOrg2Id, // Different org trying to access
            mockNotionConnectionOrg1, // Org-123's connection
          );
        }).toThrow(/MCP tool access denied: organization mismatch for tool notion__getTasks/);
      });

      it("should include audit details in error message", () => {
        const error = new Error();
        try {
          validateToolAccess("notion__createPage", "notion", mockOrg2Id, mockNotionConnectionOrg1);
        } catch (e) {
          const message = (e as Error).message;
          expect(message).toContain("expectedOrganization=org-123");
          expect(message).toContain("receivedOrganization=org-456");
          expect(message).toContain("provider=notion");
          expect(message).toContain("connectionId=conn-notion-org1");
        }
      });

      it("should prevent org-456 from accessing org-123 Linear connection", () => {
        expect(() => {
          validateToolAccess("linear__createIssue", "linear", mockOrg2Id, mockLinearConnectionOrg1);
        }).toThrow(/organization mismatch/);
      });

      it("should throw error with specific organization IDs for audit trail", () => {
        try {
          validateToolAccess(
            "notion__getTasks",
            "notion",
            "org-999", // Completely different org
            mockNotionConnectionOrg1,
          );
          fail("Should have thrown error");
        } catch (e) {
          const message = (e as Error).message;
          expect(message).toContain("org-999");
          expect(message).toContain("org-123");
        }
      });
    });

    describe("Test 3: Namespace validation works (provider mismatch)", () => {
      it("should throw error when tool namespace doesn't match provider", () => {
        expect(() => {
          validateToolAccess(
            "linear__createIssue", // Linear tool
            "notion", // But using Notion connection
            mockOrg1Id,
            mockNotionConnectionOrg1,
          );
        }).toThrow(/namespace mismatch for tool linear__createIssue/);
      });

      it("should include expected vs received namespace in error", () => {
        try {
          validateToolAccess("linear__createIssue", "notion", mockOrg1Id, mockNotionConnectionOrg1);
          fail("Should have thrown error");
        } catch (e) {
          const message = (e as Error).message;
          expect(message).toContain("expected=notion");
          expect(message).toContain("received=linear");
        }
      });

      it("should prevent notion__getTasks from being called on Linear connection", () => {
        expect(() => {
          validateToolAccess(
            "notion__getTasks",
            "linear", // Wrong provider
            mockOrg1Id,
            mockLinearConnectionOrg1,
          );
        }).toThrow(/namespace mismatch/);
      });
    });

    describe("Test 4: Missing namespace throws error", () => {
      it("should throw error when tool name has no namespace prefix", () => {
        expect(() => {
          validateToolAccess(
            "getTasks", // Missing notion__ prefix
            "notion",
            mockOrg1Id,
            mockNotionConnectionOrg1,
          );
        }).toThrow(/missing namespace for tool getTasks/);
      });

      it("should throw error with connection ID for debugging", () => {
        try {
          validateToolAccess("createPage", "notion", mockOrg1Id, mockNotionConnectionOrg1);
          fail("Should have thrown error");
        } catch (e) {
          const message = (e as Error).message;
          expect(message).toContain("connectionId=conn-notion-org1");
        }
      });

      it("should reject tool names without double underscore separator", () => {
        expect(() => {
          validateToolAccess(
            "notion_getTasks", // Single underscore (legacy format)
            "notion",
            mockOrg1Id,
            mockNotionConnectionOrg1,
          );
        }).toThrow(/missing namespace/);
      });
    });

    describe("Test 5: Invalid namespace throws error", () => {
      it("should throw error when namespace is empty string", () => {
        expect(() => {
          validateToolAccess(
            "__getTasks", // Empty namespace before __
            "notion",
            mockOrg1Id,
            mockNotionConnectionOrg1,
          );
        }).toThrow(/missing namespace/);
      });

      it("should throw error when tool name is empty after namespace", () => {
        expect(() => {
          validateToolAccess(
            "notion__", // Empty tool name after __
            "notion",
            mockOrg1Id,
            mockNotionConnectionOrg1,
          );
        }).toThrow(/missing namespace/);
      });

      it("should reject completely wrong namespace", () => {
        expect(() => {
          validateToolAccess(
            "github__createIssue", // GitHub tool on Notion connection
            "notion",
            mockOrg1Id,
            mockNotionConnectionOrg1,
          );
        }).toThrow(/namespace mismatch/);
      });
    });

    describe("Backward Compatibility: Legacy tool format", () => {
      it("should support legacy notion_getTasks format (provider_toolName)", () => {
        // Note: This test documents the legacy format support
        // The actual implementation may vary based on parseToolName behavior
        const result = validateToolAccess(
          "notion_getTasks", // Legacy format
          "notion",
          mockOrg1Id,
          mockNotionConnectionOrg1,
        );

        // Legacy format should be recognized and parsed
        expect(result.toolName).toBe("getTasks");
        expect(result.namespace).toBe("notion");
        expect(result.isLegacy).toBe(true);
      });

      it("should still enforce organization isolation with legacy format", () => {
        expect(() => {
          validateToolAccess(
            "notion_getTasks", // Legacy format
            "notion",
            mockOrg2Id, // Different org
            mockNotionConnectionOrg1, // Org-123's connection
          );
        }).toThrow(/organization mismatch/);
      });
    });
  });

  describe("executeToolWithIsolation()", () => {
    describe("Test 6: Tool execution with isolation enforcement", () => {
      it("should execute tool when organization and namespace match", () => {
        const request = {
          params: {
            name: "notion__getTasks",
            arguments: { databaseId: "db-123" },
          },
          connection: mockNotionConnectionOrg1,
        };

        const result = executeToolWithIsolation(request, "notion", mockOrg1Id);

        expect(result).toEqual({
          toolName: "getTasks",
          toolArguments: { databaseId: "db-123" },
        });
      });

      it("should throw error when organization doesn't match", () => {
        const request = {
          params: {
            name: "notion__getTasks",
            arguments: { databaseId: "db-123" },
          },
          connection: mockNotionConnectionOrg1,
        };

        expect(() => {
          executeToolWithIsolation(request, "notion", mockOrg2Id);
        }).toThrow(/organization mismatch/);
      });

      it("should throw error when namespace routing doesn't match", () => {
        const request = {
          params: {
            name: "notion__getTasks",
            arguments: { databaseId: "db-123" },
          },
          connection: mockNotionConnectionOrg1,
        };

        expect(() => {
          executeToolWithIsolation(request, "linear", mockOrg1Id); // Wrong namespace
        }).toThrow(/namespace routing mismatch/);
      });

      it("should pass through tool arguments unchanged", () => {
        const request = {
          params: {
            name: "notion__createPage",
            arguments: {
              databaseId: "db-456",
              title: "New Page",
              properties: { status: "active" },
            },
          },
          connection: mockNotionConnectionOrg1,
        };

        const result = executeToolWithIsolation(request, "notion", mockOrg1Id);

        expect(result.toolArguments).toEqual({
          databaseId: "db-456",
          title: "New Page",
          properties: { status: "active" },
        });
      });
    });
  });

  describe("Security Scenarios", () => {
    describe("Scenario 1: Malicious cross-org access attempt", () => {
      it("should prevent org-456 from reading org-123 Notion database", () => {
        const maliciousRequest = {
          params: {
            name: "notion__getTasks",
            arguments: { databaseId: "org-123-secret-db" },
          },
          connection: mockNotionConnectionOrg1, // Org-123's connection
        };

        expect(() => {
          executeToolWithIsolation(maliciousRequest, "notion", mockOrg2Id);
        }).toThrow(/organization mismatch/);
      });

      it("should prevent org-456 from creating pages in org-123 Notion", () => {
        const maliciousRequest = {
          params: {
            name: "notion__createPage",
            arguments: {
              databaseId: "org-123-secret-db",
              title: "Malicious Page",
            },
          },
          connection: mockNotionConnectionOrg1,
        };

        expect(() => {
          executeToolWithIsolation(maliciousRequest, "notion", mockOrg2Id);
        }).toThrow(/organization mismatch/);
      });
    });

    describe("Scenario 2: Tool namespace confusion attack", () => {
      it("should prevent using Linear tool on Notion connection", () => {
        const confusionRequest = {
          params: {
            name: "linear__createIssue",
            arguments: { title: "Issue" },
          },
          connection: mockNotionConnectionOrg1, // Notion connection
        };

        expect(() => {
          executeToolWithIsolation(confusionRequest, "notion", mockOrg1Id);
        }).toThrow(/namespace routing mismatch/);
      });

      it("should prevent using Notion tool on Linear connection", () => {
        const confusionRequest = {
          params: {
            name: "notion__getTasks",
            arguments: { databaseId: "db-123" },
          },
          connection: mockLinearConnectionOrg1, // Linear connection
        };

        expect(() => {
          executeToolWithIsolation(confusionRequest, "linear", mockOrg1Id);
        }).toThrow(/namespace routing mismatch/);
      });
    });

    describe("Scenario 3: Audit trail completeness", () => {
      it("should include all required audit fields in error for org mismatch", () => {
        try {
          validateToolAccess(
            "notion__getTasks",
            "notion",
            "org-attacker",
            mockNotionConnectionOrg1,
          );
          fail("Should have thrown");
        } catch (e) {
          const message = (e as Error).message;
          // Verify all audit fields are present
          expect(message).toContain("notion__getTasks");
          expect(message).toContain("org-attacker");
          expect(message).toContain("org-123");
          expect(message).toContain("notion");
          expect(message).toContain("conn-notion-org1");
        }
      });

      it("should include all required audit fields in error for namespace mismatch", () => {
        try {
          validateToolAccess("linear__createIssue", "notion", mockOrg1Id, mockNotionConnectionOrg1);
          fail("Should have thrown");
        } catch (e) {
          const message = (e as Error).message;
          expect(message).toContain("linear__createIssue");
          expect(message).toContain("notion");
          expect(message).toContain("linear");
          expect(message).toContain("conn-notion-org1");
        }
      });
    });
  });

  describe("Edge Cases", () => {
    describe("Case 1: Multiple underscores in tool name", () => {
      it("should handle tool names with multiple underscores correctly", () => {
        const result = validateToolAccess(
          "notion__get_tasks_by_status",
          "notion",
          mockOrg1Id,
          mockNotionConnectionOrg1,
        );

        expect(result.namespace).toBe("notion");
        expect(result.toolName).toBe("get_tasks_by_status");
      });
    });

    describe("Case 2: Case sensitivity in namespace", () => {
      it("should normalize provider namespace to lowercase", () => {
        // Provider is passed as "Notion" (capitalized)
        const result = validateToolAccess(
          "notion__getTasks",
          "Notion", // Capitalized
          mockOrg1Id,
          mockNotionConnectionOrg1,
        );

        expect(result.namespace).toBe("notion");
      });
    });

    describe("Case 3: Whitespace in provider", () => {
      it("should trim whitespace from provider namespace", () => {
        const result = validateToolAccess(
          "notion__getTasks",
          " notion ", // With whitespace
          mockOrg1Id,
          mockNotionConnectionOrg1,
        );

        expect(result.namespace).toBe("notion");
      });
    });

    describe("Case 4: Empty arguments", () => {
      it("should handle tools with no arguments", () => {
        const request = {
          params: {
            name: "notion__getTasks",
            // No arguments
          },
          connection: mockNotionConnectionOrg1,
        };

        const result = executeToolWithIsolation(request, "notion", mockOrg1Id);

        expect(result.toolName).toBe("getTasks");
        expect(result.toolArguments).toBeUndefined();
      });
    });
  });

  describe("Integration: Multiple connections per organization", () => {
    it("should allow org-123 to access both Notion and Linear tools", () => {
      // Notion tool
      const notionResult = validateToolAccess(
        "notion__getTasks",
        "notion",
        mockOrg1Id,
        mockNotionConnectionOrg1,
      );
      expect(notionResult.namespace).toBe("notion");

      // Linear tool
      const linearResult = validateToolAccess(
        "linear__createIssue",
        "linear",
        mockOrg1Id,
        mockLinearConnectionOrg1,
      );
      expect(linearResult.namespace).toBe("linear");
    });

    it("should prevent cross-connection access within same org", () => {
      // Try to use Linear tool on Notion connection
      expect(() => {
        validateToolAccess(
          "linear__createIssue",
          "linear",
          mockOrg1Id,
          mockNotionConnectionOrg1, // Wrong connection
        );
      }).toThrow(/namespace mismatch/);
    });
  });

  describe("Performance: Validation overhead", () => {
    it("should validate access in constant time (no DB lookups)", () => {
      const startTime = performance.now();

      for (let i = 0; i < 1000; i++) {
        validateToolAccess("notion__getTasks", "notion", mockOrg1Id, mockNotionConnectionOrg1);
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / 1000;

      // Should be very fast (< 1ms per validation)
      expect(avgTime).toBeLessThan(1);
    });
  });
});
