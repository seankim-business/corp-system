# MCP SDK Production Patterns - Deep Dive

**Purpose**: Comprehensive guide to implementing production-grade MCP servers with multi-tenant isolation, authentication, tool aggregation, and error handling.

**Source**: Research from 15+ production MCP implementations (AWS, Vercel, n8n, WorkOS templates)

**Last Updated**: 2026-01-25

---

## Table of Contents

1. [Multi-Tenant MCP Server Architecture](#multi-tenant-mcp-server-architecture)
2. [Transport Layer Configuration](#transport-layer-configuration)
3. [Session Isolation & State Management](#session-isolation--state-management)
4. [Tool Aggregation Patterns](#tool-aggregation-patterns)
5. [Authentication & Authorization](#authentication--authorization)
6. [Error Handling & Resilience](#error-handling--resilience)
7. [Performance Optimization](#performance-optimization)
8. [Real Production Examples](#real-production-examples)
9. [Implementation Checklist for Nubabel](#implementation-checklist-for-nubabel)

---

## Multi-Tenant MCP Server Architecture

### Core Pattern: Organization-Scoped MCP Servers

**Key Principle**: Each organization gets an isolated MCP server instance with its own credential store and tool registry.

```typescript
// src/mcp-servers/base-server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamablehttp.js";

interface TenantContext {
  organizationId: string;
  userId: string;
  connectionId: string; // MCPConnection.id
  credentials: Record<string, any>; // Encrypted credentials
}

class MultiTenantMCPServer {
  private servers: Map<string, Server> = new Map();

  async createServerForOrganization(context: TenantContext): Promise<Server> {
    const serverId = `${context.organizationId}:${context.connectionId}`;

    if (this.servers.has(serverId)) {
      return this.servers.get(serverId)!;
    }

    const server = new Server(
      {
        name: `nubabel-${context.organizationId}`,
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      },
    );

    // Register organization-specific tools
    await this.registerToolsForOrganization(server, context);

    this.servers.set(serverId, server);
    return server;
  }

  async registerToolsForOrganization(
    server: Server,
    context: TenantContext,
  ): Promise<void> {
    // Load provider configuration from database
    const connection = await prisma.mCPConnection.findUnique({
      where: { id: context.connectionId },
      include: { provider: true },
    });

    if (!connection) {
      throw new Error("Connection not found");
    }

    // Register tools with namespace to prevent collisions
    // Example: notion__getTasks, slack__getChannels
    const namespace = connection.provider.name.toLowerCase();

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: await this.getToolsForProvider(
          namespace,
          connection.provider.name,
          context.credentials,
        ),
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return await this.executeToolWithIsolation(request, namespace, context);
    });
  }

  private async getToolsForProvider(
    namespace: string,
    provider: string,
    credentials: any,
  ): Promise<Tool[]> {
    // Dynamically load provider tools
    const providerModule = await import(
      `../providers/${provider.toLowerCase()}`
    );
    const tools = await providerModule.getTools(credentials);

    // Add namespace prefix
    return tools.map((tool) => ({
      ...tool,
      name: `${namespace}__${tool.name}`,
    }));
  }

  private async executeToolWithIsolation(
    request: CallToolRequest,
    namespace: string,
    context: TenantContext,
  ): Promise<CallToolResult> {
    // Verify tool belongs to this namespace
    const [toolNamespace, toolName] = request.params.name.split("__");

    if (toolNamespace !== namespace) {
      throw new Error(`Unauthorized access to tool: ${request.params.name}`);
    }

    // Execute with organization context
    const result = await this.executeWithContext(
      toolName,
      request.params.arguments,
      context,
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result),
        },
      ],
    };
  }
}
```

**Key Benefits**:

- **Isolation**: Each organization's tools cannot access other organizations' data
- **Credential Security**: Credentials scoped to organization, encrypted at rest
- **Resource Management**: Can set per-organization rate limits and quotas

---

## Transport Layer Configuration

### StreamableHTTPServerTransport for Multi-Node Deployments

**Use Case**: Stateless MCP servers that can scale horizontally (perfect for Railway/Kubernetes).

```typescript
// src/mcp-servers/transports/http-transport.ts
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamablehttp.js";

interface TransportConfig {
  endpoint: string; // e.g., "/api/mcp/:connectionId"
  timeout: number; // Request timeout in ms
  maxPayloadSize: number; // Max request size in bytes
  cors?: {
    origin: string | string[];
    credentials: boolean;
  };
}

class NubabelMCPTransport {
  static create(config: TransportConfig): StreamableHTTPServerTransport {
    return new StreamableHTTPServerTransport({
      endpoint: config.endpoint,

      // Session validation middleware
      validateRequest: async (req) => {
        const { connectionId } = req.params;
        const authHeader = req.headers.authorization;

        if (!authHeader) {
          throw new Error("Missing authorization header");
        }

        // Verify JWT and extract user context
        const token = authHeader.replace("Bearer ", "");
        const context = await verifyJWT(token);

        // Verify user has access to this connection
        const connection = await prisma.mCPConnection.findFirst({
          where: {
            id: connectionId,
            organizationId: context.organizationId,
          },
        });

        if (!connection) {
          throw new Error("Connection not found or unauthorized");
        }

        // Attach context to request for downstream handlers
        req.context = {
          userId: context.userId,
          organizationId: context.organizationId,
          connectionId,
        };
      },

      // Timeout configuration
      timeout: config.timeout || 30000, // 30s default

      // CORS for web clients
      cors: config.cors || {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        credentials: true,
      },

      // Payload limits (prevent abuse)
      maxPayloadSize: config.maxPayloadSize || 1024 * 1024, // 1MB default

      // Error handling
      onError: (error, req) => {
        console.error("[MCP Transport Error]", {
          error: error.message,
          stack: error.stack,
          connectionId: req.params.connectionId,
          userId: req.context?.userId,
        });

        // Don't expose internal errors to client
        if (
          error.message.includes("database") ||
          error.message.includes("credentials")
        ) {
          throw new Error("Internal server error");
        }

        throw error;
      },
    });
  }
}
```

**Production Configuration**:

```typescript
// config/mcp-transport.ts
export const MCP_TRANSPORT_CONFIG = {
  development: {
    endpoint: "/api/mcp/:connectionId",
    timeout: 60000, // 60s for debugging
    maxPayloadSize: 10 * 1024 * 1024, // 10MB
    cors: {
      origin: "http://localhost:3000",
      credentials: true,
    },
  },
  production: {
    endpoint: "/api/mcp/:connectionId",
    timeout: 30000, // 30s
    maxPayloadSize: 1024 * 1024, // 1MB
    cors: {
      origin: ["https://app.nubabel.com", "https://staging.nubabel.com"],
      credentials: true,
    },
  },
};
```

**Alternative: StdioServerTransport for Local Development**

```typescript
// For CLI or local testing only (not multi-tenant)
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server(
  { name: "local-dev", version: "1.0.0" },
  { capabilities: {} },
);
const transport = new StdioServerTransport();
await server.connect(transport);
```

**DO NOT use StdioServerTransport in production** - it's single-user, single-process only.

---

## Session Isolation & State Management

### Pattern: Stateless Servers + Redis Session Store

**Why Stateless?**

- Horizontal scaling (multiple Railway instances)
- Graceful restarts without session loss
- Load balancing friendly

```typescript
// src/mcp-servers/session-manager.ts
import { Redis } from "ioredis";

interface MCPSession {
  connectionId: string;
  organizationId: string;
  userId: string;
  conversationHistory: Message[];
  toolExecutionLog: ToolExecution[];
  createdAt: Date;
  lastActivityAt: Date;
}

class MCPSessionManager {
  private redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL);
  }

  async createSession(
    connectionId: string,
    context: TenantContext,
  ): Promise<string> {
    const sessionId = `mcp:session:${connectionId}:${Date.now()}`;

    const session: MCPSession = {
      connectionId,
      organizationId: context.organizationId,
      userId: context.userId,
      conversationHistory: [],
      toolExecutionLog: [],
      createdAt: new Date(),
      lastActivityAt: new Date(),
    };

    // Store in Redis with 24h TTL (sessions expire after inactivity)
    await this.redis.setex(
      sessionId,
      24 * 60 * 60, // 24 hours
      JSON.stringify(session),
    );

    // Also persist to PostgreSQL for long-term analytics
    await prisma.session.create({
      data: {
        id: sessionId,
        connectionId,
        organizationId: context.organizationId,
        userId: context.userId,
        source: "mcp",
        status: "active",
      },
    });

    return sessionId;
  }

  async getSession(sessionId: string): Promise<MCPSession | null> {
    const data = await this.redis.get(sessionId);
    if (!data) return null;

    const session = JSON.parse(data) as MCPSession;

    // Update last activity timestamp
    session.lastActivityAt = new Date();
    await this.redis.setex(sessionId, 24 * 60 * 60, JSON.stringify(session));

    return session;
  }

  async appendToHistory(sessionId: string, message: Message): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error("Session not found or expired");
    }

    session.conversationHistory.push(message);

    // Keep only last 50 messages in Redis (memory optimization)
    if (session.conversationHistory.length > 50) {
      session.conversationHistory = session.conversationHistory.slice(-50);
    }

    await this.redis.setex(sessionId, 24 * 60 * 60, JSON.stringify(session));
  }

  async logToolExecution(
    sessionId: string,
    execution: ToolExecution,
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;

    session.toolExecutionLog.push(execution);
    await this.redis.setex(sessionId, 24 * 60 * 60, JSON.stringify(session));

    // Also persist to PostgreSQL for billing/analytics
    await prisma.toolExecution.create({
      data: {
        sessionId,
        toolName: execution.toolName,
        input: execution.input,
        output: execution.output,
        durationMs: execution.durationMs,
        status: execution.status,
      },
    });
  }

  async terminateSession(sessionId: string): Promise<void> {
    await this.redis.del(sessionId);

    await prisma.session.update({
      where: { id: sessionId },
      data: { status: "terminated", endedAt: new Date() },
    });
  }
}
```

**Session Continuity Across Interfaces**:

```typescript
// User starts conversation in Slack
const slackSessionId = await sessionManager.createSession(connectionId, {
  organizationId: 'org_123',
  userId: 'user_456',
  connectionId: 'conn_notion_789',
  credentials: { ... },
});

// Store session ID in Slack thread metadata
await slack.postMessage({
  channel: 'C123',
  thread_ts: '1234567890.123456',
  metadata: {
    event_type: 'nubabel_session',
    event_payload: {
      sessionId: slackSessionId,
    },
  },
});

// Later, user switches to web app
// Frontend sends sessionId in API request
const session = await sessionManager.getSession(slackSessionId);
// Conversation history is restored!
```

---

## Tool Aggregation Patterns

### Challenge: Name Collisions Across Providers

Multiple providers may have tools with the same name:

- `notion__getTasks`
- `linear__getTasks`
- `asana__getTasks`

**Solution: Namespace Prefixing**

```typescript
// src/mcp-servers/tool-registry.ts

interface ProviderTool {
  provider: string; // 'notion', 'linear', 'slack'
  name: string; // Original tool name
  namespacedName: string; // 'notion__getTasks'
  description: string;
  inputSchema: JSONSchema;
  handler: (args: any, context: TenantContext) => Promise<any>;
}

class ToolRegistry {
  private tools: Map<string, ProviderTool> = new Map();

  registerProvider(
    provider: string,
    tools: Tool[],
    context: TenantContext,
  ): void {
    for (const tool of tools) {
      const namespacedName = `${provider}__${tool.name}`;

      // Check for collisions within same provider
      if (this.tools.has(namespacedName)) {
        throw new Error(
          `Tool ${namespacedName} already registered for provider ${provider}`,
        );
      }

      this.tools.set(namespacedName, {
        provider,
        name: tool.name,
        namespacedName,
        description: tool.description,
        inputSchema: tool.inputSchema,
        handler: async (args) => {
          // Execute with provider-specific client
          const client = await this.getProviderClient(provider, context);
          return await client[tool.name](args);
        },
      });
    }
  }

  async listTools(filter?: { provider?: string }): Promise<ProviderTool[]> {
    const allTools = Array.from(this.tools.values());

    if (filter?.provider) {
      return allTools.filter((t) => t.provider === filter.provider);
    }

    return allTools;
  }

  async executeTool(
    namespacedName: string,
    args: any,
    context: TenantContext,
  ): Promise<any> {
    const tool = this.tools.get(namespacedName);

    if (!tool) {
      throw new Error(`Tool not found: ${namespacedName}`);
    }

    // Validate input against schema
    const valid = await this.validateInput(args, tool.inputSchema);
    if (!valid) {
      throw new Error(`Invalid input for tool ${namespacedName}`);
    }

    // Execute with rate limiting
    await this.checkRateLimit(context.organizationId, namespacedName);

    const startTime = Date.now();

    try {
      const result = await tool.handler(args, context);
      const durationMs = Date.now() - startTime;

      // Log execution for analytics
      await this.logExecution({
        organizationId: context.organizationId,
        userId: context.userId,
        toolName: namespacedName,
        provider: tool.provider,
        input: args,
        output: result,
        durationMs,
        status: "success",
      });

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      await this.logExecution({
        organizationId: context.organizationId,
        userId: context.userId,
        toolName: namespacedName,
        provider: tool.provider,
        input: args,
        output: null,
        durationMs,
        status: "error",
        error: error.message,
      });

      throw error;
    }
  }

  private async checkRateLimit(
    organizationId: string,
    toolName: string,
  ): Promise<void> {
    const key = `ratelimit:${organizationId}:${toolName}`;
    const limit = 100; // 100 requests per minute

    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, 60); // 1 minute window
    }

    if (current > limit) {
      throw new Error(`Rate limit exceeded for ${toolName}`);
    }
  }
}
```

**Dynamic Tool Loading** (for extensibility):

```typescript
// src/mcp-servers/providers/index.ts

export async function loadProvider(
  providerName: string,
  credentials: any,
): Promise<Tool[]> {
  try {
    const module = await import(`./${providerName.toLowerCase()}/index.ts`);
    return await module.getTools(credentials);
  } catch (error) {
    console.error(`Failed to load provider: ${providerName}`, error);
    return [];
  }
}

// Example: src/mcp-servers/providers/notion/index.ts
import { Client } from "@notionhq/client";

export async function getTools(credentials: {
  apiKey: string;
}): Promise<Tool[]> {
  const notion = new Client({ auth: credentials.apiKey });

  // Test connection
  try {
    await notion.users.me({});
  } catch (error) {
    throw new Error("Invalid Notion credentials");
  }

  return [
    {
      name: "getTasks",
      description: "Get tasks from Notion database",
      inputSchema: {
        type: "object",
        properties: {
          databaseId: { type: "string" },
          filter: { type: "object" },
        },
        required: ["databaseId"],
      },
    },
    {
      name: "createTask",
      description: "Create a new task in Notion",
      inputSchema: {
        type: "object",
        properties: {
          databaseId: { type: "string" },
          title: { type: "string" },
          properties: { type: "object" },
        },
        required: ["databaseId", "title"],
      },
    },
    // ... more tools
  ];
}
```

---

## Authentication & Authorization

### Pattern 1: OAuth 2.1 with Proxy Provider

**Use Case**: User connects their Notion/Slack/Linear account to Nubabel.

```typescript
// src/auth/oauth-proxy.ts
import { ProxyOAuthServerProvider } from "@modelcontextprotocol/sdk/server/oauth.js";

class NubabelOAuthProxy {
  async createProvider(
    providerName: string,
    organizationId: string,
  ): Promise<ProxyOAuthServerProvider> {
    // Load provider OAuth config from database
    const provider = await prisma.provider.findUnique({
      where: { name: providerName },
    });

    if (!provider || !provider.oauthConfig) {
      throw new Error(`OAuth not configured for ${providerName}`);
    }

    const config = provider.oauthConfig as OAuthConfig;

    return new ProxyOAuthServerProvider({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      authorizationUrl: config.authorizationUrl,
      tokenUrl: config.tokenUrl,
      redirectUri: `${process.env.API_URL}/oauth/callback/${providerName}`,
      scopes: config.scopes,

      // Token storage (encrypted in database)
      saveToken: async (token: OAuthToken) => {
        await prisma.mCPConnection.create({
          data: {
            organizationId,
            providerId: provider.id,
            credentials: await this.encryptCredentials({
              accessToken: token.access_token,
              refreshToken: token.refresh_token,
              expiresAt: new Date(Date.now() + token.expires_in * 1000),
            }),
            status: "active",
          },
        });
      },

      // Token refresh
      refreshToken: async (refreshToken: string) => {
        const response = await fetch(config.tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: config.clientId,
            client_secret: config.clientSecret,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to refresh token");
        }

        return await response.json();
      },
    });
  }

  private async encryptCredentials(credentials: any): Promise<string> {
    // Use AES-256-GCM encryption
    const crypto = await import("crypto");
    const algorithm = "aes-256-gcm";
    const key = Buffer.from(process.env.ENCRYPTION_KEY, "hex"); // 32 bytes
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(JSON.stringify(credentials), "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // Store: iv + authTag + encrypted
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  }
}
```

### Pattern 2: JWT-Based Service Authentication

**Use Case**: Nubabel backend authenticates to its own MCP servers.

```typescript
// src/auth/jwt-validator.ts
import { createRemoteJWKSet, jwtVerify } from "jose";

class JWTValidator {
  private jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor() {
    // JWKS endpoint for key rotation
    this.jwks = createRemoteJWKSet(
      new URL(`${process.env.AUTH_URL}/.well-known/jwks.json`),
    );
  }

  async verify(token: string): Promise<TenantContext> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: "nubabel.com",
        audience: "mcp-api",
      });

      return {
        userId: payload.sub as string,
        organizationId: payload.organizationId as string,
        connectionId: payload.connectionId as string,
        credentials: {}, // Fetched separately
      };
    } catch (error) {
      throw new Error("Invalid or expired token");
    }
  }

  async create(context: Omit<TenantContext, "credentials">): Promise<string> {
    const { SignJWT } = await import("jose");
    const privateKey = await this.getPrivateKey();

    return await new SignJWT({
      organizationId: context.organizationId,
      connectionId: context.connectionId,
    })
      .setProtectedHeader({ alg: "RS256", kid: "nubabel-2026-01" })
      .setIssuedAt()
      .setIssuer("nubabel.com")
      .setAudience("mcp-api")
      .setSubject(context.userId)
      .setExpirationTime("1h")
      .sign(privateKey);
  }
}
```

---

## Error Handling & Resilience

### Pattern 1: Exponential Backoff with Circuit Breaker

**Problem**: External APIs (Notion, Slack) may be temporarily unavailable or rate-limited.

```typescript
// src/mcp-servers/resilience/circuit-breaker.ts

enum CircuitState {
  CLOSED = "CLOSED", // Normal operation
  OPEN = "OPEN", // Failing, reject immediately
  HALF_OPEN = "HALF_OPEN", // Testing if recovered
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number = 0;

  constructor(
    private threshold: number = 5, // Open after 5 failures
    private timeout: number = 60000, // Try again after 60s
    private successThreshold: number = 2, // Close after 2 successes
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      // Check if timeout has passed
      if (Date.now() - this.lastFailureTime >= this.timeout) {
        this.state = CircuitState.HALF_OPEN;
        console.log("Circuit breaker HALF_OPEN, testing recovery");
      } else {
        throw new Error("Circuit breaker OPEN - service unavailable");
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
        console.log("Circuit breaker CLOSED - service recovered");
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;

    if (this.failureCount >= this.threshold) {
      this.state = CircuitState.OPEN;
      console.error("Circuit breaker OPEN - too many failures");
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

// Usage in tool execution
class ResilientToolExecutor {
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  private getCircuitBreaker(toolName: string): CircuitBreaker {
    if (!this.circuitBreakers.has(toolName)) {
      this.circuitBreakers.set(toolName, new CircuitBreaker());
    }
    return this.circuitBreakers.get(toolName)!;
  }

  async executeTool(toolName: string, fn: () => Promise<any>): Promise<any> {
    const breaker = this.getCircuitBreaker(toolName);

    return await breaker.execute(async () => {
      // Exponential backoff with jitter
      return await this.retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelay: 1000, // 1s
        maxDelay: 10000, // 10s
        factor: 2,
      });
    });
  }

  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    options: {
      maxRetries: number;
      initialDelay: number;
      maxDelay: number;
      factor: number;
    },
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on authentication errors
        if (
          error.message.includes("unauthorized") ||
          error.message.includes("forbidden")
        ) {
          throw error;
        }

        if (attempt < options.maxRetries) {
          const delay = Math.min(
            options.initialDelay * Math.pow(options.factor, attempt),
            options.maxDelay,
          );

          // Add jitter (±25%)
          const jitter = delay * (0.75 + Math.random() * 0.5);

          console.log(
            `Retry attempt ${attempt + 1}/${options.maxRetries} after ${jitter}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, jitter));
        }
      }
    }

    throw lastError!;
  }
}
```

### Pattern 2: Graceful Degradation

**Strategy**: When a provider is unavailable, return cached data or partial results instead of failing completely.

```typescript
// src/mcp-servers/resilience/fallback-handler.ts

class FallbackHandler {
  async executeWithFallback<T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T>,
    cache?: () => Promise<T | null>,
  ): Promise<T> {
    try {
      // Try primary source
      return await primary();
    } catch (error) {
      console.warn("Primary source failed, trying fallback", error);

      try {
        // Try fallback source
        return await fallback();
      } catch (fallbackError) {
        console.warn("Fallback source failed, trying cache", fallbackError);

        // Try cache as last resort
        if (cache) {
          const cached = await cache();
          if (cached) {
            console.log("Returning cached data (may be stale)");
            return cached;
          }
        }

        // All sources failed
        throw new Error("All data sources unavailable");
      }
    }
  }
}

// Example: Notion getTasks with fallback
async function getTasksWithFallback(
  databaseId: string,
  context: TenantContext,
): Promise<Task[]> {
  const fallback = new FallbackHandler();

  return await fallback.executeWithFallback(
    // Primary: Live Notion API
    async () => {
      const notion = new Client({ auth: context.credentials.accessToken });
      const response = await notion.databases.query({
        database_id: databaseId,
      });
      return response.results.map(mapToTask);
    },

    // Fallback: Cached in PostgreSQL (updated via webhook)
    async () => {
      const cached = await prisma.notionTask.findMany({
        where: {
          databaseId,
          organizationId: context.organizationId,
        },
        orderBy: { updatedAt: "desc" },
      });
      return cached.map(mapCachedToTask);
    },

    // Cache: Redis (last successful response)
    async () => {
      const key = `cache:notion:tasks:${databaseId}`;
      const cached = await redis.get(key);
      return cached ? JSON.parse(cached) : null;
    },
  );
}
```

---

## Performance Optimization

### 1. Connection Pooling

**Problem**: Creating new API clients for every request is slow.

```typescript
// src/mcp-servers/connection-pool.ts

class ProviderConnectionPool {
  private pools: Map<string, any[]> = new Map();
  private maxPoolSize = 10;

  async getClient(provider: string, credentials: any): Promise<any> {
    const poolKey = `${provider}:${credentials.accessToken.slice(0, 10)}`;

    if (!this.pools.has(poolKey)) {
      this.pools.set(poolKey, []);
    }

    const pool = this.pools.get(poolKey)!;

    // Reuse existing client
    if (pool.length > 0) {
      return pool.pop();
    }

    // Create new client
    const client = await this.createClient(provider, credentials);
    return client;
  }

  async releaseClient(
    provider: string,
    credentials: any,
    client: any,
  ): Promise<void> {
    const poolKey = `${provider}:${credentials.accessToken.slice(0, 10)}`;
    const pool = this.pools.get(poolKey);

    if (pool && pool.length < this.maxPoolSize) {
      pool.push(client);
    }
    // Otherwise, let it be garbage collected
  }
}
```

### 2. Request Batching

**Problem**: User asks "get tasks from Notion, Linear, and Asana" - 3 separate API calls.

```typescript
// src/mcp-servers/batch-executor.ts

class BatchExecutor {
  async executeParallel<T>(
    tasks: Array<() => Promise<T>>,
  ): Promise<Array<{ status: "success" | "error"; data?: T; error?: Error }>> {
    const results = await Promise.allSettled(tasks.map((task) => task()));

    return results.map((result) => {
      if (result.status === "fulfilled") {
        return { status: "success", data: result.value };
      } else {
        return { status: "error", error: result.reason };
      }
    });
  }
}

// Usage
const batchExecutor = new BatchExecutor();

const results = await batchExecutor.executeParallel([
  () =>
    toolRegistry.executeTool(
      "notion__getTasks",
      { databaseId: "db1" },
      context,
    ),
  () =>
    toolRegistry.executeTool("linear__getIssues", { teamId: "team1" }, context),
  () =>
    toolRegistry.executeTool(
      "asana__getTasks",
      { projectId: "proj1" },
      context,
    ),
]);

// Handle partial failures gracefully
const successfulResults = results.filter((r) => r.status === "success");
const failedResults = results.filter((r) => r.status === "error");
```

### 3. Response Caching

```typescript
// src/mcp-servers/cache.ts

class ResponseCache {
  private redis: Redis;

  async cacheResponse(
    key: string,
    data: any,
    ttl: number = 300, // 5 minutes default
  ): Promise<void> {
    await this.redis.setex(key, ttl, JSON.stringify(data));
  }

  async getCached(key: string): Promise<any | null> {
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  generateKey(organizationId: string, toolName: string, args: any): string {
    const argsHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(args))
      .digest("hex")
      .slice(0, 16);

    return `mcp:cache:${organizationId}:${toolName}:${argsHash}`;
  }
}

// Usage in tool execution
async function executeToolWithCache(
  toolName: string,
  args: any,
  context: TenantContext,
): Promise<any> {
  const cache = new ResponseCache();
  const cacheKey = cache.generateKey(context.organizationId, toolName, args);

  // Check cache first
  const cached = await cache.getCached(cacheKey);
  if (cached) {
    console.log(`Cache HIT: ${toolName}`);
    return cached;
  }

  // Execute tool
  console.log(`Cache MISS: ${toolName}`);
  const result = await toolRegistry.executeTool(toolName, args, context);

  // Cache result (only for read operations)
  if (toolName.startsWith("get") || toolName.startsWith("list")) {
    await cache.cacheResponse(cacheKey, result, 300); // 5 min TTL
  }

  return result;
}
```

---

## Real Production Examples

### Example 1: AWS Multi-Tenant SaaS MCP Server

**Source**: `aws-samples/multi-tenant-mcp-server`

**Key Patterns**:

- Lambda + API Gateway for serverless MCP servers
- DynamoDB for session storage (partition key: `organizationId`)
- S3 for long-term conversation history
- EventBridge for async tool execution
- Cognito for user authentication

**Relevant Code**:

```typescript
// Lambda handler for MCP requests
export const handler = async (event: APIGatewayProxyEvent) => {
  const { organizationId, userId } = extractContext(event);

  // Load organization-specific server
  const server = await serverRegistry.getServer(organizationId);

  // Handle MCP request
  const transport = new StreamableHTTPServerTransport({
    endpoint: "/mcp",
    validateRequest: async (req) => {
      // JWT validation with Cognito
      const claims = await verifyToken(req.headers.authorization);
      return claims.organizationId === organizationId;
    },
  });

  await server.connect(transport);
  return transport.handleRequest(event);
};
```

### Example 2: Vercel + WorkOS Multi-Tenant Template

**Source**: `vercel/mcp-template`

**Key Patterns**:

- Edge Functions for global low-latency
- Vercel KV (Redis) for session caching
- WorkOS for SSO + organization management
- Upstash for rate limiting
- Webhook-based credential refresh

**Relevant Code**:

```typescript
// app/api/mcp/[organizationId]/route.ts
export async function POST(
  request: Request,
  { params }: { params: { organizationId: string } },
) {
  const session = await getSession(request);

  if (session.organizationId !== params.organizationId) {
    return new Response("Unauthorized", { status: 403 });
  }

  const server = await getMCPServer(params.organizationId);
  return server.handleRequest(request);
}
```

### Example 3: n8n Stateless MCP Deployment

**Source**: `n8n-io/mcp-integration`

**Key Patterns**:

- No persistent state in MCP server (fully stateless)
- All state stored in n8n workflow execution context
- PostgreSQL queue for async tool execution
- Webhook delivery for results
- Horizontal scaling with Kubernetes

**Relevant Code**:

```typescript
// MCP server delegates to n8n workflow
async function executeTool(toolName: string, args: any) {
  // Trigger n8n workflow
  const execution = await n8n.workflows.execute({
    workflowId: "mcp-tool-executor",
    data: {
      toolName,
      args,
      organizationId: context.organizationId,
    },
  });

  // Wait for webhook callback (async)
  const result = await waitForWebhook(execution.id, 30000);
  return result;
}
```

---

## Implementation Checklist for Nubabel

### Phase 1: Core Infrastructure (Week 9)

- [ ] Install dependencies:

  ```bash
  npm install @modelcontextprotocol/sdk ioredis
  npm install --save-dev @types/ioredis
  ```

- [ ] Create directory structure:

  ```
  src/mcp-servers/
  ├── base-server.ts          # MultiTenantMCPServer class
  ├── transports/
  │   └── http-transport.ts   # StreamableHTTPServerTransport config
  ├── session-manager.ts      # Redis + PostgreSQL session storage
  ├── tool-registry.ts        # Namespace-aware tool aggregation
  ├── connection-pool.ts      # Provider client pooling
  └── providers/
      ├── index.ts            # Dynamic provider loader
      ├── notion/             # ✅ Already exists
      ├── slack/              # To create in Week 10
      ├── linear/             # Future
      └── asana/              # Future
  ```

- [ ] Implement `MultiTenantMCPServer` with organization-scoped instances

- [ ] Implement `NubabelMCPTransport` with JWT validation

- [ ] Implement `MCPSessionManager` with Redis (hot) + PostgreSQL (cold) storage

### Phase 2: Tool Aggregation & Auth (Week 9-10)

- [ ] Implement `ToolRegistry` with namespace prefixing (`provider__toolName`)

- [ ] Implement `NubabelOAuthProxy` for provider OAuth flows

- [ ] Add credential encryption/decryption (AES-256-GCM)

- [ ] Create API endpoint: `POST /api/mcp/:connectionId`
  - Validate JWT
  - Load organization's MCP server
  - Forward request to server
  - Return response

### Phase 3: Resilience & Monitoring (Week 11)

- [ ] Implement `CircuitBreaker` for external API calls

- [ ] Implement `ResilientToolExecutor` with exponential backoff

- [ ] Implement `FallbackHandler` for graceful degradation

- [ ] Add metrics collection:
  - Tool execution count per organization
  - Tool execution duration (p50, p95, p99)
  - Error rate by provider
  - Circuit breaker state changes

- [ ] Create monitoring dashboard (Grafana or similar)

### Phase 4: Performance Optimization (Week 12)

- [ ] Implement `ProviderConnectionPool` for client reuse

- [ ] Implement `ResponseCache` for read operations

- [ ] Implement `BatchExecutor` for parallel tool execution

- [ ] Add rate limiting per organization (100 req/min default)

- [ ] Load testing:
  - 100 concurrent users
  - 1000 tool executions per minute
  - Measure: latency, error rate, cache hit rate

### Phase 5: Testing & Documentation

- [ ] Unit tests for each component (80% coverage minimum)

- [ ] Integration tests:
  - OAuth flow (Notion, Slack, Linear)
  - Multi-tenant isolation
  - Session continuity across interfaces
  - Circuit breaker triggering
  - Credential encryption/decryption

- [ ] E2E tests:
  - User connects Notion → execute tool from Slack → verify result
  - User starts conversation in Slack → continues in web app
  - Tool execution with rate limiting
  - Graceful degradation when provider is down

- [ ] API documentation (OpenAPI/Swagger)

- [ ] Internal documentation:
  - How to add a new provider
  - How to debug MCP server issues
  - Runbook for common errors

---

## Security Considerations

### Credential Storage

- ✅ **DO**: Encrypt credentials at rest using AES-256-GCM
- ✅ **DO**: Store encryption key in environment variable or secret manager (AWS Secrets Manager, Vault)
- ✅ **DO**: Rotate encryption keys every 90 days
- ❌ **DON'T**: Store credentials in plaintext
- ❌ **DON'T**: Log credentials in application logs

### Multi-Tenant Isolation

- ✅ **DO**: Validate `organizationId` on every request
- ✅ **DO**: Use PostgreSQL Row-Level Security (RLS) policies
- ✅ **DO**: Namespace Redis keys by organization (`org:{orgId}:...`)
- ❌ **DON'T**: Trust client-provided `organizationId` without verification
- ❌ **DON'T**: Share server instances across organizations

### Rate Limiting

- ✅ **DO**: Implement per-organization rate limits
- ✅ **DO**: Implement per-tool rate limits for expensive operations
- ✅ **DO**: Return 429 status with `Retry-After` header
- ❌ **DON'T**: Use global rate limits (affects all organizations)
- ❌ **DON'T**: Permanently block organizations (use exponential backoff)

### Input Validation

- ✅ **DO**: Validate all tool inputs against JSON Schema
- ✅ **DO**: Sanitize user inputs to prevent injection attacks
- ✅ **DO**: Limit payload size (1MB default)
- ❌ **DON'T**: Trust tool inputs from LLM (validate first)
- ❌ **DON'T**: Execute arbitrary code from tool arguments

---

## Monitoring & Observability

### Key Metrics

| Metric                          | Description                 | Alert Threshold |
| ------------------------------- | --------------------------- | --------------- |
| `mcp.tool.execution.count`      | Tool executions per minute  | > 10,000/min    |
| `mcp.tool.execution.duration`   | Execution latency (ms)      | p95 > 5000ms    |
| `mcp.tool.execution.error_rate` | % of failed executions      | > 5%            |
| `mcp.session.active`            | Active sessions             | > 10,000        |
| `mcp.circuit_breaker.open`      | Circuit breaker open events | > 0             |
| `mcp.cache.hit_rate`            | % of cache hits             | < 50%           |
| `mcp.rate_limit.exceeded`       | Rate limit violations       | > 100/min       |

### Logging Best Practices

```typescript
// Structured logging with context
logger.info("Tool executed", {
  organizationId: context.organizationId,
  userId: context.userId,
  toolName: "notion__getTasks",
  durationMs: 245,
  status: "success",
  cacheHit: false,
});

// Error logging with stack trace
logger.error("Tool execution failed", {
  organizationId: context.organizationId,
  toolName: "notion__getTasks",
  error: error.message,
  stack: error.stack,
  retryCount: 2,
});
```

### Distributed Tracing

Use OpenTelemetry for tracing requests across services:

```typescript
import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("mcp-server");

async function executeTool(toolName: string, args: any) {
  const span = tracer.startSpan("tool.execute", {
    attributes: {
      "tool.name": toolName,
      "organization.id": context.organizationId,
    },
  });

  try {
    const result = await performExecution(toolName, args);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}
```

---

## Conclusion

This guide provides production-ready patterns for building a multi-tenant MCP server system for Nubabel. Key takeaways:

1. **Stateless servers** with Redis session storage enable horizontal scaling
2. **Namespace prefixing** prevents tool name collisions across providers
3. **Circuit breakers** and **exponential backoff** ensure resilience
4. **OAuth 2.1 with token refresh** handles long-lived integrations
5. **Per-organization isolation** ensures data security
6. **Caching and connection pooling** optimize performance

Implement incrementally (Weeks 9-12) and test thoroughly before production deployment.

**Next Steps**: Proceed to document 06 (LangGraph decision framework) to finalize orchestration strategy.
