/**
 * Agent Credentials API
 * REST endpoints for managing agent credentials and OAuth flows
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { agentCredentialVault } from "../services/agent-credential-vault";
import { agentProfileService } from "../services/agent-profile";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import { logger } from "../utils/logger";

const router = Router();

// ============================================================================
// OAuth Provider Configurations
// ============================================================================

interface OAuthConfig {
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  redirectUri: string;
}

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const AGENT_OAUTH_CALLBACK_URI = `${process.env.API_BASE_URL || "http://localhost:8080"}/api/v1/oauth/agent/callback`;

function getOAuthConfig(provider: string): OAuthConfig | null {
  switch (provider.toLowerCase()) {
    case "github":
      if (!process.env.GITHUB_OAUTH_CLIENT_ID || !process.env.GITHUB_OAUTH_CLIENT_SECRET) {
        return null;
      }
      return {
        authUrl: "https://github.com/login/oauth/authorize",
        tokenUrl: "https://github.com/login/oauth/access_token",
        clientId: process.env.GITHUB_OAUTH_CLIENT_ID,
        clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
        scopes: ["repo", "read:user", "read:org"],
        redirectUri: AGENT_OAUTH_CALLBACK_URI,
      };

    case "slack":
      if (!process.env.SLACK_CLIENT_ID || !process.env.SLACK_CLIENT_SECRET) {
        return null;
      }
      return {
        authUrl: "https://slack.com/oauth/v2/authorize",
        tokenUrl: "https://slack.com/api/oauth.v2.access",
        clientId: process.env.SLACK_CLIENT_ID,
        clientSecret: process.env.SLACK_CLIENT_SECRET,
        scopes: ["channels:read", "chat:write", "users:read"],
        redirectUri: AGENT_OAUTH_CALLBACK_URI,
      };

    case "notion":
      if (!process.env.NOTION_OAUTH_CLIENT_ID || !process.env.NOTION_OAUTH_CLIENT_SECRET) {
        return null;
      }
      return {
        authUrl: "https://api.notion.com/v1/oauth/authorize",
        tokenUrl: "https://api.notion.com/v1/oauth/token",
        clientId: process.env.NOTION_OAUTH_CLIENT_ID,
        clientSecret: process.env.NOTION_OAUTH_CLIENT_SECRET,
        scopes: [],
        redirectUri: AGENT_OAUTH_CALLBACK_URI,
      };

    case "google":
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return null;
      }
      return {
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        scopes: ["openid", "profile", "email"],
        redirectUri: AGENT_OAUTH_CALLBACK_URI,
      };

    default:
      return null;
  }
}

function buildAuthorizeUrl(config: OAuthConfig, state: string): string {
  const url = new URL(config.authUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  if (config.scopes.length > 0) {
    url.searchParams.set("scope", config.scopes.join(" "));
  }

  return url.toString();
}

interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
  expiresAt?: number;
}

async function exchangeCodeForTokens(
  config: OAuthConfig,
  code: string,
  provider: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  // Notion uses Basic auth
  if (provider.toLowerCase() === "notion") {
    const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
    headers.Authorization = `Basic ${basicAuth}`;
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error("OAuth token exchange failed", {
      provider,
      status: response.status,
      error: errorBody,
    });
    throw new Error(`Token exchange failed: ${response.statusText}`);
  }

  const data = await response.json() as any;

  // Normalize response across providers
  const accessToken = data.access_token || data.accessToken;
  const refreshToken = data.refresh_token || data.refreshToken;
  const expiresIn = data.expires_in || data.expiresIn;

  if (!accessToken) {
    throw new Error("No access token in response");
  }

  return {
    accessToken,
    refreshToken,
    expiresIn: expiresIn ? Number(expiresIn) : undefined,
    scope: data.scope,
    expiresAt: expiresIn ? Date.now() + Number(expiresIn) * 1000 : undefined,
  };
}

// ============================================================================
// Validation Schemas
// ============================================================================

const AddCredentialSchema = z.object({
  name: z.string().min(1).max(255),
  provider: z.string().min(1).max(100),
  type: z.enum(["oauth_token", "api_key", "token", "password"]),
  value: z.string().min(1),
  scopes: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional(),
});

const agentIdParamSchema = z.object({
  agentId: z.string().uuid(),
});

const agentAndCredentialParamSchema = z.object({
  agentId: z.string().uuid(),
  credentialId: z.string(),
});

// ============================================================================
// Credential CRUD Routes
// ============================================================================

/**
 * GET /api/v1/agents/:agentId/credentials - List agent credentials (masked)
 */
router.get(
  "/:agentId/credentials",
  requireAuth,
  validate({ params: agentIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const agentId = req.params.agentId as string;
      const { organizationId } = req.user!;

      // Verify agent belongs to org
      const agent = await agentProfileService.getAgent(agentId);
      if (!agent) {
        return res.status(404).json({ success: false, error: "Agent not found" });
      }

      if (agent.organizationId !== organizationId) {
        return res.status(403).json({ success: false, error: "Access denied" });
      }

      const credentials = await agentCredentialVault.listAgentCredentials(agentId);

      return res.json({
        success: true,
        data: credentials,
      });
    } catch (error) {
      logger.error(
        "Failed to list credentials",
        { agentId: req.params.agentId },
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ success: false, error: "Failed to list credentials" });
    }
  },
);

/**
 * POST /api/v1/agents/:agentId/credentials - Add credential manually
 */
router.post(
  "/:agentId/credentials",
  requireAuth,
  validate({ params: agentIdParamSchema, body: AddCredentialSchema }),
  async (req: Request, res: Response) => {
    try {
      const agentId = req.params.agentId as string;
      const { organizationId } = req.user!;
      const data = req.body;

      // Verify agent belongs to org
      const agent = await agentProfileService.getAgent(agentId);
      if (!agent) {
        return res.status(404).json({ success: false, error: "Agent not found" });
      }

      if (agent.organizationId !== organizationId) {
        return res.status(403).json({ success: false, error: "Access denied" });
      }

      const credentialId = await agentCredentialVault.storeCredential(agentId, data.provider, {
        name: data.name,
        type: data.type,
        value: data.value,
        scopes: data.scopes,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      });

      logger.info("Credential added to agent", { agentId, provider: data.provider, credentialId });

      return res.status(201).json({
        success: true,
        data: { id: credentialId },
      });
    } catch (error) {
      logger.error(
        "Failed to add credential",
        { agentId: req.params.agentId },
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ success: false, error: "Failed to add credential" });
    }
  },
);

/**
 * DELETE /api/v1/agents/:agentId/credentials/:credentialId - Remove credential
 */
router.delete(
  "/:agentId/credentials/:credentialId",
  requireAuth,
  validate({ params: agentAndCredentialParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const agentId = req.params.agentId as string;
      const credentialId = req.params.credentialId as string;
      const { organizationId } = req.user!;

      // Verify agent belongs to org
      const agent = await agentProfileService.getAgent(agentId);
      if (!agent) {
        return res.status(404).json({ success: false, error: "Agent not found" });
      }

      if (agent.organizationId !== organizationId) {
        return res.status(403).json({ success: false, error: "Access denied" });
      }

      await agentCredentialVault.deleteCredential(credentialId);

      logger.info("Credential removed from agent", { agentId, credentialId });

      return res.json({ success: true, message: "Credential deleted" });
    } catch (error) {
      logger.error(
        "Failed to delete credential",
        { credentialId: req.params.credentialId },
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ success: false, error: "Failed to delete credential" });
    }
  },
);

/**
 * POST /api/v1/agents/:agentId/credentials/:credentialId/refresh - Refresh OAuth token
 */
router.post(
  "/:agentId/credentials/:credentialId/refresh",
  requireAuth,
  validate({ params: agentAndCredentialParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const agentId = req.params.agentId as string;
      const credentialId = req.params.credentialId as string;
      const { organizationId } = req.user!;

      // Verify agent belongs to org
      const agent = await agentProfileService.getAgent(agentId);
      if (!agent) {
        return res.status(404).json({ success: false, error: "Agent not found" });
      }

      if (agent.organizationId !== organizationId) {
        return res.status(403).json({ success: false, error: "Access denied" });
      }

      // Get the credential
      const credential = await agentCredentialVault.getCredential(credentialId);
      if (!credential) {
        return res.status(404).json({ success: false, error: "Credential not found" });
      }

      // TODO: Implement token refresh based on provider
      // This would use the stored refresh token to get a new access token
      logger.warn("Token refresh not yet implemented", { credentialId, provider: credential.provider });

      return res.json({ success: true, message: "Token refresh not yet implemented" });
    } catch (error) {
      logger.error(
        "Failed to refresh token",
        { credentialId: req.params.credentialId },
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ success: false, error: "Failed to refresh token" });
    }
  },
);

// ============================================================================
// OAuth Flow Routes
// ============================================================================

/**
 * GET /api/v1/agents/:agentId/oauth/:provider/start - Initiate OAuth flow for agent
 */
router.get(
  "/:agentId/oauth/:provider/start",
  requireAuth,
  validate({ params: z.object({ agentId: z.string().uuid(), provider: z.string().min(1) }) }),
  async (req: Request, res: Response) => {
    try {
      const agentId = req.params.agentId as string;
      const provider = req.params.provider as string;
      const { organizationId, id: userId } = req.user!;

      // Verify agent belongs to org
      const agent = await agentProfileService.getAgent(agentId);
      if (!agent) {
        return res.status(404).json({ success: false, error: "Agent not found" });
      }

      if (agent.organizationId !== organizationId) {
        return res.status(403).json({ success: false, error: "Access denied" });
      }

      // Get OAuth config for provider
      const config = getOAuthConfig(provider);
      if (!config) {
        return res.status(400).json({ success: false, error: `Unsupported OAuth provider: ${provider}` });
      }

      // Build state with agentId for callback routing
      const state = await agentCredentialVault.encodeAgentOAuthState({
        organizationId,
        userId,
        agentId,
        provider,
      });

      // Build authorize URL and redirect
      const authorizeUrl = buildAuthorizeUrl(config, state);

      logger.info("Initiating agent OAuth flow", { agentId, provider });

      return res.redirect(authorizeUrl);
    } catch (error) {
      logger.error(
        "Failed to start OAuth flow",
        { agentId: req.params.agentId, provider: req.params.provider },
        error instanceof Error ? error : new Error(String(error)),
      );
      return res.status(500).json({ success: false, error: "Failed to start OAuth flow" });
    }
  },
);

/**
 * GET /api/v1/oauth/agent/callback - Unified OAuth callback for agent credentials
 */
router.get("/oauth/agent/callback", async (req: Request, res: Response) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    logger.warn("OAuth error received", { error: oauthError });
    return res.redirect(`${FRONTEND_URL}/settings/agents?error=${oauthError}`);
  }

  if (!code || !state) {
    return res.redirect(`${FRONTEND_URL}/settings/agents?error=missing_params`);
  }

  try {
    // Decode and validate state
    const stateData = await agentCredentialVault.decodeAgentOAuthState(String(state));
    if (!stateData) {
      logger.warn("Invalid OAuth state");
      return res.redirect(`${FRONTEND_URL}/settings/agents?error=invalid_state`);
    }

    const { organizationId, agentId, provider } = stateData;

    // Get OAuth config
    const config = getOAuthConfig(provider);
    if (!config) {
      return res.redirect(`${FRONTEND_URL}/settings/agents/${agentId}?error=unsupported_provider`);
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(config, String(code), provider);

    // Store credential for the agent
    await agentCredentialVault.storeCredential(agentId, provider, {
      name: `${provider} OAuth Token`,
      type: "oauth_token",
      value: tokens.accessToken,
      scopes: tokens.scope?.split(" ") || [],
      expiresAt: tokens.expiresAt ? new Date(tokens.expiresAt) : undefined,
    });

    // Store refresh token if available
    if (tokens.refreshToken) {
      await agentCredentialVault.storeRefreshToken(agentId, provider, {
        value: tokens.refreshToken,
        expiresAt: null,
      });
    }

    logger.info("Agent OAuth credential stored", { organizationId, agentId, provider });

    return res.redirect(`${FRONTEND_URL}/settings/agents/${agentId}?oauth_success=${provider}`);
  } catch (error) {
    logger.error(
      "Agent OAuth callback failed",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.redirect(`${FRONTEND_URL}/settings/agents?oauth_error=callback_failed`);
  }
});

export default router;
